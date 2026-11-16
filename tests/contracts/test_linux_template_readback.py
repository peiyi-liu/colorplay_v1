"""Real bootstrap/FS, raw HTTP and controlled external process/time boundaries."""
import copy
import contextlib
import gzip
import io
import tarfile
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

DIRECTORY=Path(__file__).resolve().parents[2]/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY));sys.path.insert(0,str(Path(__file__).parent))
import linux_bootstrap_backend as B
import linux_bootstrap_contracts as C
import linux_project_inputs as I
import local_snapshot_contracts as SNAPSHOT
from test_linux_local_bootstrap import Fixture, M
from test_prebusiness_diagnostic_export import wired, E, S


def response(body=b'<p>fixed public template</p>',headers=b''):
    return b'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: '+str(len(body)).encode()+b'\r\n'+headers+b'\r\n'+body


class HttpTests(unittest.TestCase):
    def test_exact_body_requires_single_bounded_static_success_response(self):
        body=b'<p>fixed public template</p>'
        for version in [b'HTTP/1.1',b'HTTP/1.0']:
            raw=response(body).replace(b'HTTP/1.1',version)
            self.assertEqual(B.template_http_body(raw,len(body),C.digest(body)),
                             {'status':200,'bytes':len(body),'sha256':C.digest(body)})

    def test_ambiguous_redirect_encoded_or_malformed_http_is_never_eligible(self):
        body=b'<p>fixed public template</p>';good=response(body)
        bad=[good.replace(b'200 OK',b'403 Forbidden'),good.replace(b'200 OK',b'302 Found'),
             good.replace(b'HTTP/1.1',b'HTTP/2'),good.replace(b'\r\n',b'\n'),
             good.replace(b'Content-Length:',b'Content-Length :'),
             good.replace(b'Content-Length: ',b'Content-Length: 0'),
             good.replace(b'Content-Length: ',b'Content-Length: +'),
             good.replace(b'Content-Length: ',b'Content-Length: -'),
             good.replace(b'Content-Length: 28',b'Content-Length: 29'),
             good[:-1],good+b'extra',b'HTTP/1.1 100 Continue\r\n\r\n'+good,
             good.replace(body,b'<p>default link-only body</p>'),b'x'*4097,
             response(body,b'X-Unknown: value\r\n'),response(body,b' folded header\r\n'),
             response(body,b'Content-Length: 28\r\n'),response(body,b'cOnTeNt-LeNgTh: 28\r\n'),
             response(body,b'Location: http://synthetic.invalid/\r\n'),
             response(body,b'Transfer-Encoding: chunked\r\n'),
             response(body,b'Content-Encoding: gzip\r\n'),
             response(body,b'Connection: keep-alive\r\n'),response(body,b'Date: '+b'x'*2048+b'\r\n'),
             good.replace(b'text/html',b'text/plain'),good.replace(b'text/html',b'text/html\x00')]
        for index,raw in enumerate(bad):
            with self.subTest(index=index),self.assertRaises(C.BootstrapError):
                B.template_http_body(raw,len(body),C.digest(body))


class ProbeTests(unittest.TestCase):
    def fixture(self):
        folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup)
        f=Fixture(Path(folder.name).resolve())
        f.ids=lambda:[C.digest(('synthetic-container-'+str(index)).encode()) for index in range(8)]
        return f

    def probe_commands(self,f):
        return [(a,o) for a,o in f.commands if '/bin/busybox' in a]

    def rejected(self,f):
        result=f.execute();self.assertEqual(result['result'],'FAILED')
        self.assertFalse((f.runtime/'ownership.json').exists())
        self.assertFalse((f.runtime/'bootstrap-result.json').exists())
        return result

    def test_actual_caller_proves_both_routes_with_uid100_fixed_http_and_private_proof(self):
        f=self.fixture();original=f.source/I.PUBLIC_TEMPLATE
        source=(original.read_bytes(),original.stat().st_mode)
        result=f.execute();self.assertEqual(result['result'],'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE')
        calls=self.probe_commands(f);self.assertEqual(len(calls),3)
        kong=next(r for r in f.rows() if r['Name']=='/supabase_kong_'+C.PROJECT)
        self.assertEqual(calls[0][0],[*B.DOCKER,'exec','--user','100:65533',kong['Id'],'/bin/busybox','--list'])
        self.assertEqual(calls[0][1]['maximum'],16384)
        for (args,options),name in zip(calls[1:],['confirmation','magic_link']):
            self.assertEqual(args,[*B.DOCKER,'exec','-i','--user','100:65533',kong['Id'],'/bin/busybox','nc','-w','2','127.0.0.1','8088'])
            self.assertEqual(options['data'],('GET /email/'+name+'.html HTTP/1.0\r\nHost: 127.0.0.1:8088\r\nConnection: close\r\n\r\n').encode())
            self.assertEqual(options['maximum'],4096)
            self.assertTrue(1<options['timeout']<=2)
        proof_path=f.runtime/'template-readback-proof.json';proof=C.decode(proof_path.read_bytes())
        self.assertEqual(proof['state'],'READBACK_OBSERVED');self.assertTrue(proof['clientsClosed'])
        self.assertEqual(proof['executionAuthority'],'NONE');self.assertEqual(proof['job'],f.request['job'])
        self.assertEqual(proof['bootstrapRequestSha256'],C.digest(f.path.read_bytes()))
        self.assertEqual(proof['instanceNonce'],f.request['instanceNonce'])
        self.assertEqual(proof['sourceRevision'],f.request['sourceRevision'])
        self.assertEqual(proof['templateSha256'],C.digest(source[0]));self.assertEqual(proof_path.stat().st_mode&0o777,0o600)
        serialized=json.dumps(proof)
        for forbidden in [source[0].decode(),'http://','GET ',kong['Id'],'SYNTHETIC_PRIVATE_SECRET']:
            self.assertNotIn(forbidden,serialized)
        self.assertEqual((original.read_bytes(),original.stat().st_mode),source)
        copied=f.runtime/'local-project'/I.PUBLIC_TEMPLATE
        output=f.parent/'snapshot-copy';output.mkdir(mode=0o700)
        records=SNAPSHOT.copy_runtime(f.runtime,output,{},lambda:None)
        record=next(r for r in records if r['path']=='local-project/'+I.PUBLIC_TEMPLATE)
        self.assertEqual(record['mode'],0o444)
        self.assertEqual((output/'local-project'/I.PUBLIC_TEMPLATE).read_bytes(),copied.read_bytes())
        self.assertEqual((output/'local-project'/I.PUBLIC_TEMPLATE).stat().st_mode&0o777,0o600)

    def test_missing_duplicate_or_oversized_applet_list_stops_before_any_http(self):
        for applets in [b'cat\nsh\n',b'nc\nnc\n',b'nc\nPRIVATE SECRET\n',b'nc\n'+b'x'*16384]:
            with self.subTest(applets=len(applets)):
                f=self.fixture();original=f.run
                def run(args,**options):
                    if args[-2:]==['/bin/busybox','--list']:
                        f.commands.append((args,options));return applets
                    return original(args,**options)
                f.run=run;self.rejected(f)
                self.assertEqual(len(self.probe_commands(f)),1)

    def test_first_bad_http_nonzero_cancel_or_unknown_close_never_starts_second_get(self):
        for failure in [b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n',response(b'default link'),
                        C.BootstrapError('BOOTSTRAP_COMMAND_TIMEOUT'),
                        RuntimeError('SYNTHETIC_PRIVATE_SECRET_CLOSE_UNKNOWN'),InterruptedError('cancel')]:
            with self.subTest(failure=type(failure).__name__):
                f=self.fixture();original=f.run
                def run(args,**options):
                    if '/bin/busybox' in args and 'nc' in args:
                        f.commands.append((args,options))
                        if isinstance(failure,Exception):raise failure
                        return failure
                    return original(args,**options)
                f.run=run;result=self.rejected(f)
                self.assertEqual(len(self.probe_commands(f)),2)
                self.assertNotIn('SYNTHETIC_PRIVATE_SECRET',json.dumps(result))

    def test_foreign_container_mount_and_state_or_post_drift_rejects(self):
        def changed(row,case):
            if case=='id':row['Id']='f'*64
            elif case=='image':row['Image']='sha256:'+'f'*64
            elif case=='name':row['Name']='/foreign'
            elif case=='project':row['Config']['Labels']['com.supabase.cli.project']='foreign'
            elif case in {'Running','Restarting','Dead'}:row['State'][case]=case!='Running'
            elif case=='pid':row['State']['Pid']=True
            elif case=='mount_source':row['Mounts'][0]['Source']='/synthetic/foreign'
            elif case=='mount_type':row['Mounts'][0]['Type']='volume'
            elif case=='mount_dest':row['Mounts'][0]['Destination']='/foreign'
            elif case=='mount_rw':row['Mounts'][0]['RW']=False
            elif case=='duplicate':row['Mounts'].append(copy.deepcopy(row['Mounts'][0]))
            else:row['State']['Pid']+=1
        for case in ['id','image','name','project','Running','Restarting','Dead','pid','mount_source',
                     'mount_type','mount_dest','mount_rw','duplicate','post_pid']:
            with self.subTest(case=case):
                f=self.fixture();original=f.run;inspections=[]
                def run(args,**options):
                    raw=original(args,**options)
                    if args[:4]==[*B.DOCKER,'inspect'] and len(args)==5:
                        inspections.append(1);row=C.decode(raw)[0]
                        if case!='post_pid' or len(inspections)==2:changed(row,case)
                        return json.dumps([row]).encode()
                    return raw
                f.run=run;self.rejected(f)
                self.assertEqual(len(self.probe_commands(f)),3 if case=='post_pid' else 0)

    def test_admission_request_job_nonce_and_dependency_proof_cannot_drift(self):
        for key in ['requestSha256','sourceRevision','job','instanceNonce','projectInputsSha256']:
            with self.subTest(key=key):
                f=self.fixture();original=f.run
                def run(args,**options):
                    raw=original(args,**options)
                    if args[:4]==[*B.DOCKER,'ps'] and f.started:
                        p=f.runtime/'bootstrap-admission.json';v=C.decode(p.read_bytes())
                        v[key]={'runId':'foreign'} if key=='job' else 'f'*len(v[key]);p.write_text(json.dumps(v))
                    return raw
                f.run=run;self.rejected(f);self.assertEqual(self.probe_commands(f),[])

    def test_inflight_template_mode_hash_source_or_admission_change_blocks_ready(self):
        for case in ['mode','body','source','admission','late_mode']:
            with self.subTest(case=case):
                f=self.fixture();original=f.run;gets=[]
                def run(args,**options):
                    raw=original(args,**options)
                    if '/bin/busybox' in args and 'nc' in args:
                        gets.append(1)
                        if case!='late_mode' or len(gets)==2:
                            target=f.runtime/'local-project'/I.PUBLIC_TEMPLATE
                            if case in {'mode','late_mode'}:target.chmod(0o644)
                            elif case=='body':
                                target.chmod(0o600);target.write_bytes(b'changed');target.chmod(0o444)
                            elif case=='source':(f.source/I.PUBLIC_TEMPLATE).write_bytes(b'changed')
                            else:
                                target=f.runtime/'bootstrap-admission.json'
                                value=C.decode(target.read_bytes());value['instanceNonce']='f'*32
                                target.write_text(json.dumps(value))
                    return raw
                f.run=run;self.rejected(f)
                self.assertEqual(len(gets),2 if case in {'late_mode','admission'} else 1)

    def test_shared_deadline_rejects_late_http_and_cannot_reset_for_second_request(self):
        f=self.fixture();original=f.run;clock=[1.0]
        def run(args,**options):
            raw=original(args,**options)
            if '/bin/busybox' in args and 'nc' in args:clock[0]+=10
            return raw
        f.run=run
        with patch.object(B.time,'monotonic',side_effect=lambda:clock[0]):self.rejected(f)
        self.assertEqual(len(self.probe_commands(f)),2)

    def test_writer_failure_and_late_write_do_not_promote_ready(self):
        f=self.fixture();original=f.run
        def run(args,**options):
            raw=original(args,**options)
            if '/bin/busybox' in args and 'nc' in args:
                p=f.runtime/'template-readback-proof.json'
                if not p.exists():C.write_once(p,b'original private receipt')
            return raw
        f.run=run;self.rejected(f)
        self.assertEqual((f.runtime/'template-readback-proof.json').read_bytes(),b'original private receipt')
        f=self.fixture();write=B.write_once;clock=[1.0]
        def delayed(path,value):
            result=write(path,value)
            if Path(path).name=='template-readback-proof.json':clock[0]+=10
            return result
        with patch.object(B,'write_once',side_effect=delayed),patch.object(B.time,'monotonic',side_effect=lambda:clock[0]):
            self.rejected(f)
        self.assertEqual(C.decode((f.runtime/'template-readback-proof.json').read_bytes())['state'],'READBACK_OBSERVED')

    def diagnostic_scope(self,f):
        folder=f.parent/'requests';folder.mkdir(mode=0o700)
        C.write_once(folder/'bootstrap-input.json',f.path.read_bytes())
        f._raw_root=folder;f._raw_request_sha=C.digest(f.path.read_bytes())
        return folder

    def test_http403_diagnostic_is_private_safe_and_collected_by_actual_prebusiness_export(self):
        f=self.fixture();folder=self.diagnostic_scope(f);original=f.run
        def run(args,**options):
            if '/bin/busybox' in args and 'nc' in args:
                f.commands.append((args,options))
                return b'HTTP/1.1 403 Forbidden\r\nContent-Length: 24\r\n\r\nSYNTHETIC_PRIVATE_SECRET'
            return original(args,**options)
        f.run=run;self.rejected(f)
        path=folder/'bootstrap-template-readback-diagnostic.json';raw=path.read_bytes();value=C.decode(raw)
        self.assertEqual(value['httpStatus'],403);self.assertEqual(value['state'],'UNVERIFIED')
        self.assertEqual(value['lastStage'],'CONFIRMATION_HTTP');self.assertEqual(value['reason'],'HTTP_REJECTED')
        self.assertEqual(value['executionAuthority'],'NONE');self.assertEqual(value['job'],f.request['job'])
        self.assertEqual(path.stat().st_mode&0o777,0o600)
        for forbidden in [b'SYNTHETIC_PRIVATE_SECRET',b'http://',b'GET ',b'Content-Length']:
            self.assertNotIn(forbidden,raw)
        export=E.ExportTests('test_synthetic_stream_contains_exact_manifest_and_allowlisted_files')
        export.setUp();self.addCleanup(export.tearDown)
        (f.source/'scripts/concurrency/local-export-recipient.json').write_text(json.dumps(
            {'schemaVersion':1,'recipient':export.manifest['recipient'],'privateIdentityUploaded':False}))
        summary={'failedStage':'bootstrap','functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'}
        with wired(f,export.adapter()),contextlib.redirect_stdout(io.StringIO()):
            result=S.export_prebusiness_diagnostic('a'*40,folder/'bootstrap-input.json',f._raw_request_sha,summary)
        self.assertEqual(result['retention'],'UNVERIFIED')
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress((f.parent/'exports/evidence.age').read_bytes()))) as tar:
            self.assertEqual(tar.extractfile('requests/'+path.name).read(),raw)

    def test_diagnostic_writer_failure_never_masks_original_exception_or_retries(self):
        f=self.fixture();self.assertEqual(f.execute()['services'],8);folder=self.diagnostic_scope(f)
        path=folder/'bootstrap-template-readback-diagnostic.json';C.write_once(path,b'original')
        sentinel=RuntimeError('SYNTHETIC_PRIVATE_SECRET');original=f.run
        def run(args,**options):
            if '/bin/busybox' in args and 'nc' in args:raise sentinel
            return original(args,**options)
        f.run=run;inputs=I.capture_project_inputs(f.source,f.tracked)
        ownership=C.decode((f.runtime/'ownership.json').read_bytes())
        with self.assertRaises(RuntimeError) as caught:
            B.template_readback(f,f.runtime,f.runtime/'local-project',inputs,I.proof_sha256(inputs),
                                f.request,C.digest(f.path.read_bytes()),next(r for r in ownership['containers'] if r['role']=='kong'))
        self.assertIs(caught.exception,sentinel);self.assertEqual(path.read_bytes(),b'original')

    def test_two_second_existing_executor_reserves_one_second_for_physical_close(self):
        f=self.fixture();start=time.monotonic()
        with self.assertRaisesRegex(C.BootstrapError,'BOOTSTRAP_COMMAND_TIMEOUT'):
            M.bounded([sys.executable,'-B','-c','import time; print("synthetic",flush=True); time.sleep(1.5)'],
                      f.source,timeout=2,maximum=4096)
        self.assertLess(time.monotonic()-start,2)


if __name__=='__main__':unittest.main()
