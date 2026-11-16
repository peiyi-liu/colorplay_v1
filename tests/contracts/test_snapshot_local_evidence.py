"""Public snapshot flow, real private files, synthetic external kernel/process/HTTP."""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import tarfile
import tempfile
import unittest

DIRECTORY=Path(__file__).resolve().parents[2]/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY));sys.path.insert(0,str(Path(__file__).parent))
import local_snapshot_contracts as C
from local_snapshot_native import NativeIO
from test_linux_local_bootstrap import Fixture as BackendFixture
SPEC=importlib.util.spec_from_file_location('snapshot_tool',DIRECTORY/'snapshot-local-evidence.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)


def archive(path,contents,symlink=False):
    stream=io.BytesIO()
    with tarfile.open(fileobj=stream,mode='w:') as tar:
        for name,raw in contents.items():
            entry=tarfile.TarInfo(name);entry.mode=0o600;entry.uid=999;entry.gid=999
            if symlink:entry.type=tarfile.SYMTYPE;entry.linkname='/outside'
            else:entry.size=len(raw)
            tar.addfile(entry,None if symlink else io.BytesIO(raw))
    C.write_once(path,stream.getvalue())


class Fixture(BackendFixture):
    def __init__(self,root):
        super().__init__(root)
        self.runtime.mkdir(mode=0o700)
        self.events=[];self.closure='VERIFIED';self.fail_stage=None
        self.bad_mail=None;self.changed_census=False;self.census_calls=0
        self.oom=False;self.bad_archive=False;self.copy_change=False
        self.backend_rows=self.rows()
        self.volumes=[]
        for row in self.backend_rows:
            role=next(p['role'] for p in self.pins if p['configDigest']==row['Image'])
            row['Config']['StopSignal']='SIGTERM'
            row['State'].update(OOMKilled=False,ExitCode=0,Error='',Restarting=False)
            row['Mounts']=[]
            if role in {'db','storage'}:
                name='supabase_'+role+'_'+C.PROJECT
                source='/var/lib/docker/volumes/'+name+'/_data'
                destination='/var/lib/postgresql/data' if role=='db' else '/mnt'
                row['Mounts']=[{'Type':'volume','Name':name,'Source':source,'Destination':destination,'RW':True,'Driver':'local'}]
                self.volumes.append({'Name':name,'Driver':'local','Mountpoint':source,'Options':None,
                    'Labels':{'com.supabase.cli.project':C.PROJECT}})
        containers=[]
        for row in self.backend_rows:
            role=next(p['role'] for p in self.pins if p['configDigest']==row['Image'])
            containers.append({'role':role,'id':row['Id'],'name':row['Name'],'imageId':row['Image'],'mounts':M.mounts(row)})
        job={'repository':'peiyi-liu/colorplay_v1',**self.request['job']}
        self.context={'schemaVersion':1,'sourceRevision':'a'*40,'projectId':C.PROJECT,'job':job,
            'instanceNonce':'b'*32,'generatorCgroupRelativePath':'/colorplaygeneratorbbbbbbbbbbbb.slice/workload',
            'backendCgroupRelativePath':'/colorplaybackendbbbbbbbbbbbb.slice',
            'containers':[{k:r[k] for k in ['role','id','name','imageId']} for r in containers],
            'binaries':{'node':{'path':self.tools['node']['path'],'sha256':self.tools['node']['sha256'],'device':1,'inode':2},'browser':[]}}
        self.profile={'schemaVersion':1,'kind':'LINUX_FREE_4CPU_16G_V1','host':{'platform':'linux'},
            'identity':{'bootIdSha256':'e'*64,'jobSha256':C.digest(C.canonical(job))},'backend':{'services':8}}
        for name,value in [('execution-context.json',self.context),('execution-profile.json',self.profile),
                           ('bootstrap-input.json',self.request),('status-secret.json',{'DB_URL':'postgresql://postgres:synthetic@127.0.0.1:58322/postgres'})]:
            C.write_once(self.runtime/name,value)
        for name,row in json.loads((self.package/'package-manifest.json').read_text())['files'].items():
            if row['role']!='TEST':C.write_once(self.runtime/name,(self.package/name).read_bytes())
        C.write_once(self.runtime/'runtime-secret.json',{'hmacSecret':'SYNTHETIC_PRIVATE_MARKER'})
        (self.runtime/'journals').mkdir(mode=0o755)
        (self.runtime/'journals/terminal.json').write_text('{"result":"FAIL","preserved":true}\n')
        (self.runtime/'journals/terminal.json').chmod(0o644)
        self.plan={'schemaVersion':1,'confirmation':'LOCAL_LINUX_SNAPSHOT_ONCE','sourceRevision':'a'*40,
            'executionProfileSha256':C.digest((self.runtime/'execution-profile.json').read_bytes()),
            'executionContextSha256':C.digest((self.runtime/'execution-context.json').read_bytes()),
            'jobIdentitySha256':C.digest(C.canonical(job)),'operatorPackageManifestSha256':self.request['operatorPackageManifestSha256'],
            'toolchainSha256':self.request['toolchainSha256'],'bootstrapRequestSha256':C.digest((self.runtime/'bootstrap-input.json').read_bytes()),
            'projectId':C.PROJECT,'instanceNonce':'b'*32,'databases':['_supabase','postgres'],
            'preview':{'pid':4444,'startTicks':12345,'uid':os.getuid(),'executablePath':self.tools['node']['path'],
                'executableSha256':self.tools['node']['sha256'],'hostBootIdSha256':'e'*64},'containers':containers}
        self.plan_path=self.parent/'snapshot-plan.json';C.write_once(self.plan_path,self.plan)
        self.output=self.parent/'snapshots'/('b'*32)
        self.raw=b'From: synthetic@example.invalid\r\nMIME-Version: 1.0\r\nSubject: SYNTHETIC_PRIVATE_MARKER\r\n\r\nbody\r\n'
        self.messages=[{'ID':'mail'+str(i),'Size':len(self.raw),'Read':False,'Tags':['owned'],
            'Created':'2026-11-16T00:00:00Z','Attachments':0,'Subject':'synthetic'} for i in range(60)]

    def execute(self):return M.snapshot(self.plan_path,C.digest(self.plan_path.read_bytes()),self)

    def check(self):pass

    def frozen(self,plan):
        self.events.append('frozen')
        C.require(plan['sourceRevision']=='a'*40,'SNAPSHOT_SOURCE_CHANGED')

    def observe(self,plan,context,profile):
        self.events.append('observe');self.barrier(plan,context)
        C.require(plan['preview']['pid']==4444,'SNAPSHOT_PREVIEW_CHANGED')
        return {'containers':copy.deepcopy(self.backend_rows),'volumes':copy.deepcopy(self.volumes),
            'allContainerIds':self.ids(),'dockerRoot':'/var/lib/docker','boot':'e'*64}

    def barrier(self,_plan,_context):
        self.events.append('barrier')
        if self.fail_stage=='writers':raise C.SnapshotError('SNAPSHOT_WRITERS_NOT_SETTLED')

    def stop_preview(self,_pin):self.events.append('preview_stop')

    def get(self,target):
        self.events.append(target)
        if self.bad_mail=='redirect':raise C.SnapshotError('SNAPSHOT_HTTP_REDIRECT')
        if target.startswith('/api/v1/messages?'):
            start=int(target.split('start=')[1].split('&')[0]);rows=copy.deepcopy(self.messages[start:start+50])
            if self.bad_mail=='missing' and start:rows=[]
            if self.bad_mail=='read' and sum(e.startswith('/api/v1/messages?start=0') for e in self.events)>1:
                if rows:rows[0]['Read']=True
            return C.canonical({'total':60,'unread':60,'count':len(rows),'messages_count':60,'messages_unread':60,
                'start':start,'tags':['owned'],'messages':rows})
        assert target.startswith('/api/v1/message/') and target.endswith('/raw')
        return self.raw+b'changed' if self.bad_mail=='size' else self.raw

    def stop(self,row):
        self.events.append('stop:'+row['role'])
        if self.fail_stage=='stop':raise C.SnapshotError('SNAPSHOT_COMMAND_TIMEOUT')
        for actual in self.backend_rows:
            if actual['Id']==row['id']:
                actual['State'].update(Running=False,Pid=0,OOMKilled=self.oom)

    def inspect(self,rows):return copy.deepcopy([r for r in self.backend_rows if r['Id'] in {a['id'] for a in rows}])

    def database(self,_plan):self.events.append('databases');return ['_supabase','postgres']

    def census(self,databases):
        self.events.append('census');self.census_calls+=1
        return {'clusterRoles':{'count':31,'sha256':'d'*64},**{name:[] for name in databases},
            'postgres':[{'schema':'public','table':'alpha','count':2 if self.changed_census and self.census_calls>1 else 1,'sha256':'e'*64},
                        {'schema':'public','table':'beta','count':0,'sha256':'f'*64}]}

    def dump(self,name,target):
        self.events.append('dump:'+str(name));C.write_once(target,b'PGDMP' if name else b'CREATE ROLE synthetic;')

    def database_files(self,directory):
        self.events.append('db_files')
        archive(directory/'postgresql.tar',{'postgresql/postgresql.conf':b'config'})
        archive(directory/'postgresql-custom.tar',{'postgresql-custom/pgsodium_root.key':b'synthetic-key'})
        C.write_once(directory/'pgsodium_root.key',b'synthetic-key')

    def volume(self,mount,target):
        self.events.append('volume')
        assert all(not r['State']['Running'] for r in self.backend_rows)
        archive(target,{'pg_wal/0001':b'preserved-wal'},self.bad_archive)
        if self.copy_change:
            p=self.runtime/'journals/terminal.json';os.link(p,self.runtime/'journals/unsafe.json')
        return [{'path':'pg_wal/0001','bytes':13,'uid':999,'mode':0o600}]


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.f=Fixture(Path(self.temp.name).resolve())

    def test_no_independent_approval_never_creates_snapshot(self):
        self.assertEqual(M.snapshot(self.f.plan_path,'0'*64,self.f)['result'],'FAILED')
        self.assertEqual(self.f.events,[])

    def test_full_census_all_databases_roles_vault_raw_mail_and_cold_volumes(self):
        f=self.f;result=f.execute()
        self.assertEqual(result['result'],'LOCAL_SNAPSHOT_CREATED',result)
        self.assertEqual(result['executionAuthority'],'NONE');self.assertEqual(result['retention'],'UNVERIFIED')
        self.assertEqual(len(list((f.output/'mailpit').glob('*.eml'))),60)
        self.assertEqual((f.output/'runtime/runtime-secret.json').read_bytes(),(f.runtime/'runtime-secret.json').read_bytes())
        self.assertEqual((f.output/'runtime/journals/terminal.json').read_bytes(),(f.runtime/'journals/terminal.json').read_bytes())
        self.assertFalse((f.output/'runtime/collect_readiness.py').exists())
        self.assertTrue((f.output/'runtime/linux-image-pins.json').exists())
        self.assertIn('dump:_supabase',f.events);self.assertIn('dump:postgres',f.events);self.assertIn('dump:None',f.events)
        self.assertLess(f.events.index('db_files'),f.events.index('stop:db'))
        self.assertLess(f.events.index('stop:db'),f.events.index('volume'))
        self.assertLess(max(i for i,e in enumerate(f.events) if e.endswith('/raw')),min(i for i,e in enumerate(f.events) if e.startswith('stop:')))
        self.assertNotIn('SYNTHETIC_PRIVATE_MARKER',json.dumps(result))
        raw=(f.output/'snapshot-manifest.json').read_bytes()
        self.assertEqual(C.digest(raw),result['snapshotManifestSha256'])
        manifest=C.decode(raw)
        self.assertEqual(manifest['mailpitCaptureMode'],'RFC822_AND_EXPOSED_METADATA')
        for row in manifest['files']:
            body=(f.output/row['path']).read_bytes();self.assertEqual(C.digest(body),row['sha256']);self.assertEqual(len(body),row['bytes'])
        for p in f.output.rglob('*'):self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o700 if p.is_dir() else 0o600)
        self.assertEqual(stat.S_IMODE((f.runtime/'journals/terminal.json').stat().st_mode),0o644)
        with tarfile.open(f.output/'volumes/v0.tar') as tar:
            member=tar.getmember('pg_wal/0001');self.assertEqual(member.uid,999)

    def test_old_output_strict_fields_wrong_job_or_profile_do_not_stop_anything(self):
        f=self.f;f.output.mkdir(parents=True,mode=0o700)
        self.assertEqual(f.execute()['code'],'SNAPSHOT_OUTPUT_EXISTS');self.assertEqual(f.events,[])
        f.output.rmdir()
        f.environment['GITHUB_RUN_ATTEMPT']='2'
        self.assertEqual(f.execute()['code'],'SNAPSHOT_JOB_CHANGED')
        self.assertNotIn('preview_stop',f.events)
        f.environment['GITHUB_RUN_ATTEMPT']='1'
        (f.runtime/'execution-profile.json').write_text('{}')
        self.assertEqual(f.execute()['code'],'SNAPSHOT_PROFILE_CHANGED')
        with self.assertRaises(C.SnapshotError):
            raw=C.canonical({**f.plan,'arbitraryShell':'forbidden'});C.parse_plan(raw,C.digest(raw))

    def test_wrong_mount_container_preview_or_boot_never_creates_output(self):
        for target in ['mount','container','preview','boot']:
            with self.subTest(target=target),tempfile.TemporaryDirectory() as temp:
                f=Fixture(Path(temp).resolve())
                if target=='mount':f.backend_rows[0]['Mounts'].append({'Type':'bind','Source':'/outside','Destination':'/danger','RW':True})
                if target=='container':f.backend_rows[0]['Image']='sha256:'+'f'*64
                if target=='preview':
                    f.plan['preview']['pid']=5555;f.plan_path.write_bytes(C.canonical(f.plan))
                if target=='boot':
                    old=f.observe
                    def changed(*args):
                        value=old(*args);value['boot']='f'*64;return value
                    f.observe=changed
                self.assertEqual(f.execute()['result'],'FAILED')
                self.assertFalse(f.output.exists());self.assertNotIn('preview_stop',f.events)

    def test_writer_not_settled_blocks_before_stop(self):
        f=self.f;f.fail_stage='writers'
        self.assertEqual(f.execute()['code'],'SNAPSHOT_WRITERS_NOT_SETTLED');self.assertFalse(f.output.exists())

    def test_mail_read_drift_missing_page_size_or_redirect_never_stop_backend(self):
        for target in ['read','missing','size','redirect']:
            with self.subTest(target=target),tempfile.TemporaryDirectory() as temp:
                f=Fixture(Path(temp).resolve());f.bad_mail=target
                result=f.execute();self.assertEqual(result['result'],'FAILED')
                self.assertFalse(any(e.startswith('stop:') for e in f.events))
                self.assertTrue((f.output/'snapshot-failed.json').exists())
                self.assertNotIn('SYNTHETIC_PRIVATE_MARKER',json.dumps(result))

    def test_stop_timeout_retains_partial_and_never_forces_or_retries(self):
        f=self.f;f.fail_stage='stop';result=f.execute()
        self.assertEqual(result['code'],'SNAPSHOT_COMMAND_TIMEOUT')
        self.assertEqual(sum(e.startswith('stop:') for e in f.events),1)
        self.assertTrue((f.output/'mailpit/mail0.eml').exists());self.assertNotIn('volume',f.events)
        self.assertFalse((f.output/'snapshot-manifest.json').exists())

    def test_database_change_or_oom_prevents_cold_tar(self):
        for target in ['changed_census','oom']:
            with self.subTest(target=target),tempfile.TemporaryDirectory() as temp:
                f=Fixture(Path(temp).resolve());setattr(f,target,True)
                self.assertEqual(f.execute()['result'],'FAILED');self.assertNotIn('volume',f.events)

    def test_table_permutation_preserves_values_and_can_finish(self):
        f=self.f;original=f.census
        def permuted(databases):
            value=original(databases)
            if f.census_calls>1:value['postgres'].reverse()
            return value
        f.census=permuted
        self.assertEqual(f.execute()['result'],'LOCAL_SNAPSHOT_CREATED')
        delta=C.decode((f.output/'database-census-diff.json').read_bytes())
        self.assertEqual(delta['classification'],'ORDER_ONLY')

    def test_real_drift_preserves_after_and_delta_before_refusing_db_stop(self):
        f=self.f;f.changed_census=True
        self.assertEqual(f.execute()['code'],'SNAPSHOT_DATABASE_CHANGED')
        self.assertTrue((f.output/'database-census-after.json').is_file())
        self.assertTrue((f.output/'database-census-diff.json').is_file())
        self.assertNotIn('stop:db',f.events);self.assertNotIn('volume',f.events)

    def test_unsafe_archive_and_runtime_hardlink_are_never_omitted(self):
        for flag in ['bad_archive','copy_change']:
            with self.subTest(flag=flag),tempfile.TemporaryDirectory() as temp:
                f=Fixture(Path(temp).resolve());setattr(f,flag,True)
                self.assertEqual(f.execute()['result'],'FAILED')
                self.assertFalse((f.output/'snapshot-manifest.json').exists())
                self.assertTrue((f.output/'database/globals.sql').exists())

    def test_runtime_symlink_rejected_and_original_error_is_not_exposed(self):
        f=self.f;(f.runtime/'unsafe').symlink_to(f.plan_path)
        self.assertEqual(f.execute()['result'],'FAILED')
        def denied(_row):raise RuntimeError('SYNTHETIC_PRIVATE_MARKER')
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());f.stop=denied
            result=f.execute();self.assertEqual(result['code'],'SNAPSHOT_OPERATION_FAILED')
            self.assertNotIn('SYNTHETIC_PRIVATE_MARKER',json.dumps(result))

    def test_runtime_copy_detects_mutation_after_open_and_missing_database_key(self):
        f=self.f;calls=0
        def mutate():
            nonlocal calls
            calls+=1
            if calls==2:(f.runtime/'runtime-secret.json').write_text('changed')
        target=f.parent/'copy';target.mkdir(mode=0o700)
        # Each copied file is checked before/after its actual read; a separate final census protects the whole tree.
        C.copy_runtime(f.runtime,target,{},lambda:None)
        before=C.runtime_census(f.runtime,{},lambda:None)
        mutate();mutate()
        self.assertNotEqual(C.runtime_census(f.runtime,{},lambda:None),before)
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());original=f.database_files
            def missing(directory):original(directory);(directory/'pgsodium_root.key').unlink()
            f.database_files=missing
            self.assertEqual(f.execute()['code'],'SNAPSHOT_VAULT_KEY_MISSING')

    def test_whole_flow_detects_source_change_after_file_was_copied(self):
        f=self.f;changed=False
        def check():
            nonlocal changed
            target=f.output/'runtime/runtime-secret.json'
            if not changed and target.is_file() and target.stat().st_size:
                changed=True;(f.runtime/'runtime-secret.json').write_text('changed-after-copy')
        f.check=check
        result=f.execute();self.assertTrue(changed)
        self.assertEqual(result['code'],'SNAPSHOT_RUNTIME_CHANGED')
        self.assertFalse((f.output/'snapshot-manifest.json').exists())

    def test_unknown_database_is_not_skipped_and_missing_volume_label_is_not_required(self):
        f=self.f;f.database=lambda _plan:['_supabase','foreign','postgres']
        self.assertEqual(f.execute()['code'],'SNAPSHOT_DATABASE_SET_CHANGED');self.assertNotIn('volume',f.events)
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve())
            for volume in f.volumes:volume['Labels']=None
            self.assertEqual(f.execute()['result'],'LOCAL_SNAPSHOT_CREATED')

    def test_native_operation_builders_use_fixed_targets_and_stop_without_kill(self):
        f=self.f;native=NativeIO();native.source=f.source;native.runtime=f.runtime;calls=[]
        native.pg_env={'PGPASSWORD':'SYNTHETIC_PRIVATE_MARKER'};native.db='1'*64
        def run(args,**options):
            calls.append((args,options))
            if options.get('output'):C.write_once(options['output'],b'captured')
            return b'[]'
        native.run=run
        native.stop(f.plan['containers'][0]);native.dump('postgres',f.parent/'native.dump');native.dump(None,f.parent/'roles.sql')
        self.assertEqual(calls[0][0][-4:],['stop','--timeout','-1',f.plan['containers'][0]['id']])
        self.assertTrue(any('--format=custom' in a for a,_ in calls));self.assertTrue(any('--globals-only' in a for a,_ in calls))
        self.assertFalse(any('--no-role-passwords' in a or 'prune' in a or 'rm' in a or 'start' in a for a,_ in calls))
        self.assertFalse(any('SYNTHETIC_PRIVATE_MARKER' in a for a,_ in calls))
        self.assertTrue(all(a[:3]==['/usr/bin/docker','--host','unix:///var/run/docker.sock'] for a,_ in calls))

    def test_native_small_subprocesses_are_bounded_and_darwin_default_refuses(self):
        f=self.f;native=NativeIO();native.source=f.source
        self.assertEqual(native.run([sys.executable,'-B','-c','print("safe")']),b'safe\n')
        with self.assertRaises(C.SnapshotError):native.run([sys.executable,'-B','-c','print("x"*1000)'],maximum=10)
        with self.assertRaisesRegex(C.SnapshotError,'SNAPSHOT_COMMAND_FAILED'):
            native.run([sys.executable,'-B','-c','raise RuntimeError("SYNTHETIC_PRIVATE_MARKER")'])
        native.cancelled=True
        with self.assertRaisesRegex(C.SnapshotError,'SNAPSHOT_INTERRUPTED'):
            native.run([sys.executable,'-B','-c','print("must-not-run")'])
        f.platform='darwin';self.assertEqual(f.execute()['code'],'SNAPSHOT_LINUX_REQUIRED');self.assertEqual(f.events,[])

    def test_native_http_builder_has_fixed_origin_no_proxy_redirect_and_no_summary(self):
        f=self.f;native=NativeIO();calls=[]
        def run(args,**options):calls.append((args,options));return b'raw'
        native.run=run
        self.assertEqual(native.get('/api/v1/message/mail1/raw'),b'raw')
        args,options=calls[0]
        self.assertEqual(args[:3],['/usr/bin/python3','-B','-c'])
        self.assertIn('http://127.0.0.1:58324',args[3])
        self.assertIn('ProxyHandler({})',args[3]);self.assertIn('NoRedirect()',args[3])
        self.assertEqual(options['timeout'],15)
        for target in ['/api/v1/message/mail1','/api/v1/message/latest/raw','https://outside.invalid/',
                       '/api/v1/message/mail1/raw?redirect=outside']:
            with self.subTest(target=target),self.assertRaises(C.SnapshotError):native.get(target)
        self.assertEqual(len(calls),1)

    def test_archive_traversal_and_extra_source_files_are_fail_closed(self):
        f=self.f;bad=f.parent/'unsafe.tar'
        archive(bad,{'../outside':b'bytes'})
        with self.assertRaises(C.SnapshotError):M.validate_archive(bad)
        (f.runtime/'unsafe\\path').write_text('must not be omitted')
        self.assertEqual(f.execute()['code'],'SNAPSHOT_PATH_INVALID')


if __name__=='__main__':unittest.main()
