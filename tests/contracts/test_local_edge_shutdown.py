"""Actual root literal selector; synthetic kernel/Docker/process transport only."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path[:0]=[str(Path(__file__).resolve().parents[2]/'scripts/concurrency'),str(Path(__file__).parent)]
import local_edge_shutdown as E
from test_snapshot_local_evidence import Fixture, C

NAMESPACE={'__name__':'_synthetic_root_selector'}
exec(compile(E.ROOT_PROGRAM,'<fixed-root-edge-program>','exec'),NAMESPACE)


def configured_fixture(root):
    f=Fixture(root);edge=next(r for r in f.plan['containers'] if r['role']=='edge_runtime')
    edge['imageId']=E.IMAGE
    next(r for r in f.context['containers'] if r['role']=='edge_runtime')['imageId']=E.IMAGE
    next(r for r in f.backend_rows if r['Id']==edge['id'])['Image']=E.IMAGE
    context_raw=C.canonical(f.context);(f.runtime/'execution-context.json').write_bytes(context_raw)
    f.plan['executionContextSha256']=E.digest(context_raw)
    f.plan_path.write_bytes(C.canonical(f.plan));plan_raw=f.plan_path.read_bytes()
    return f,plan_raw,context_raw


class Kernel:
    def __init__(self,plan,context):
        self.plan,self.context=plan,context;self.edge=next(r for r in plan['containers'] if r['role']=='edge_runtime')
        self.now=0;self.events=[];self.dead=set();self.child_ids=[101];self.inspect_calls=0;self.process_calls={}
        group=context['backendCgroupRelativePath']+'/docker-'+self.edge['id']+'.scope'
        common={'uid':[0]*4,'gid':[0]*4,'pidns':10,'userns':20,'cgroup':group,'exeDevice':1,'exeSize':E.EXE_BYTES,'exeMtimeNs':1,'exeCtimeNs':1}
        self.processes={100:{**copy.deepcopy(common),'pid':100,'ppid':99,'startTicks':111,'nspid':[100,1],'exe':'/usr/bin/dash','exeInode':1},
                        101:{**copy.deepcopy(common),'pid':101,'ppid':100,'startTicks':112,'nspid':[101,2],'exe':'/usr/local/bin/edge-runtime','exeInode':2}}
        self.item={'id':self.edge['id'],'name':E.NAME,'image':E.IMAGE,'pid':100,'running':True,'restarting':False,'dead':False,'restart':'no','autoRemove':False,'init':None,'initState':'NULL','paused':False,'oom':False,'error':False,'retry':0,'restartCount':0}
        self.binary_result={'bytes':E.EXE_BYTES,'sha256':E.EXE_SHA,'device':1,'inode':2}
        self.before_second_process=None;self.after_binary=None;self.after_send=None;self.send_error=None;self.close_error=False
    def clock(self):return self.now
    def authorize(self,end):self.events.append(('authorize',end))
    def boot(self):return self.plan['preview']['hostBootIdSha256']
    def user_namespace(self):return 20
    def inspect(self,identifier):
        assert identifier==self.edge['id'];self.inspect_calls+=1;return copy.deepcopy(self.item)
    def process(self,pid):
        self.process_calls[pid]=self.process_calls.get(pid,0)+1
        if self.process_calls[pid]==2 and self.before_second_process:self.before_second_process(pid)
        return copy.deepcopy(self.processes[pid])
    def children(self,pid):assert pid==100;return list(self.child_ids)
    def binary(self,pid,expected_bytes=None):
        if pid==100:return self.init_binary
        assert pid==101
        if self.after_binary:self.after_binary()
        return self.binary_result
    def open_pidfd(self,pid):self.events.append(('open',pid));return pid+1000
    def alive(self,fd):return fd not in self.dead
    def send(self,fd,signal_name='SIGTERM'):
        self.sent_signal=signal_name
        self.events.append(('send',fd))
        if self.send_error:raise self.send_error
        if self.after_send:self.after_send()
    def close(self,fd):
        self.events.append(('close',fd))
        if self.close_error:raise OSError('PRIVATE_CLOSE_ERROR')


def request(plan_raw,context_raw):
    return {'schemaVersion':1,'planBytes':plan_raw.decode(),'approvedPlanSha256':E.digest(plan_raw),
            'contextBytes':context_raw.decode(),'deadlineMonotonic':10}


def execute(kernel,request_value):return NAMESPACE['run_request'](request_value,kernel)


def receipt(plan_raw,context_raw,kernel,closed=True):
    def process(args,**options):
        assert args==['/usr/bin/sudo','-n','/usr/bin/python3','-I','-B','-c',E.ROOT_PROGRAM]
        assert options['timeout']<=10 and options['maximum']==32768
        result=execute(kernel,json.loads(options['data']))
        return json.dumps(result).encode(),closed
    return E.perform(plan_raw,E.digest(plan_raw),context_raw,process,lambda:None,clock=kernel.clock,deadline=90)


def inspect_bytes(k,policy='no',running=True):
    return C.canonical([{'Id':k.edge['id'],'Name':k.edge['name'],'Image':k.edge['imageId'],'RestartCount':0,
        'State':{'Pid':100 if running else 0,'Running':running,'Paused':False,'Restarting':False,'Dead':False,'OOMKilled':False,'Error':''},
        'HostConfig':{'RestartPolicy':{'Name':policy,'MaximumRetryCount':0},'AutoRemove':False}}])


def native_fixture(f,raw,ctx):
    from local_snapshot_native import NativeIO
    native=NativeIO();native.source=f.source;native.runtime=f.runtime;native.context=f.context;native.deadline=600
    native.bind_stop_policy(raw,E.digest(raw),ctx)
    f.output.parent.mkdir(mode=0o700,exist_ok=True);f.output.mkdir(mode=0o700);native.bind_stop_output(f.output)
    return native


class EdgeSelectorTests(unittest.TestCase):
    def test_actual_selector_and_wrapper_signal_once_only_after_identity_and_close_all_fds(self):
        with tempfile.TemporaryDirectory() as directory:
            f,raw,ctx=configured_fixture(Path(directory).resolve());kernel=Kernel(f.plan,f.context)
            value=receipt(raw,ctx,kernel)
            self.assertEqual(value['status'],'VERIFIED');self.assertEqual(value['signalState'],'SENT')
            self.assertIsNone(value['proof']['failureStage'])
            self.assertEqual([e for e in kernel.events if e[0]=='send'],[('send',1101)])
            self.assertEqual(kernel.events[-2:],[('close',1101),('close',1100)])
            self.assertTrue(E.eligible15(value,E.bindings(raw,E.digest(raw),ctx),{'signals':['SIGTERM_RECEIVED']}))
            self.assertNotIn('edge-runtime',json.dumps(value));self.assertNotIn('cgroup',json.dumps(value))

    def test_bad_bindings_or_owned_process_identity_never_signal(self):
        changes=[('name',lambda k:k.item.update(name='/foreign')),('image',lambda k:k.item.update(image='sha256:'+'f'*64)),('id',lambda k:k.item.update(id='f'*64)),
            ('restart',lambda k:k.item.update(restart='always')),('autoRemove',lambda k:k.item.update(autoRemove=True)),
            ('namespace',lambda k:k.processes[101].update(pidns=99)),('uid',lambda k:k.processes[101].update(uid=[1001]*4)),
            ('parent',lambda k:k.processes[101].update(ppid=999)),('init-not-one',lambda k:k.processes[100].update(nspid=[100,2])),
            ('cgroup',lambda k:k.processes[101].update(cgroup='/foreign')),
            ('wrong-container-cgroup',lambda k:[p.update(cgroup=k.context['backendCgroupRelativePath']+'/docker-'+('f'*64)+'.scope') for p in k.processes.values()]),
            ('exe',lambda k:k.processes[101].update(exe='/foreign/edge-runtime')),
            ('hash',lambda k:k.binary_result.update(sha256='f'*64)),('size',lambda k:k.binary_result.update(bytes=1)),
            ('zero-child',lambda k:setattr(k,'child_ids',[])),('multiple',lambda k:setattr(k,'child_ids',[101,102])),
            ('dead',lambda k:k.dead.add(1101)),('deadline',lambda k:setattr(k,'after_binary',lambda:setattr(k,'now',11))),
            ('reuse',lambda k:setattr(k,'before_second_process',lambda pid:k.processes[pid].update(startTicks=999)))]
        for name,change in changes:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as directory:
                f,raw,ctx=configured_fixture(Path(directory).resolve());kernel=Kernel(f.plan,f.context);change(kernel)
                result=execute(kernel,request(raw,ctx));self.assertEqual(result['result'],'UNATTESTED')
                self.assertFalse(any(e[0]=='send' for e in kernel.events));self.assertEqual(result['signalState'],'NOT_SENT')
                self.assertIn(result['failureStage'],{'POLICY','BOOT','INSPECT','INIT','SELECT','PIDFD','BINARY','REVALIDATE','SIGNAL','CLOSE'})
                self.assertNotIn('foreign',json.dumps(result))

    def test_raw_approval_context_source_job_nonce_and_boot_mismatch_reject(self):
        for case in ['approval','context','source','job','nonce','boot','extra']:
            with self.subTest(case=case),tempfile.TemporaryDirectory() as directory:
                f,raw,ctx=configured_fixture(Path(directory).resolve());kernel=Kernel(f.plan,f.context);value=request(raw,ctx)
                if case=='approval':value['approvedPlanSha256']='0'*64
                elif case=='context':value['contextBytes']='{}'
                elif case=='extra':value['callerPid']=999
                elif case=='boot':kernel.boot=lambda:'f'*64
                else:
                    plan=json.loads(raw)
                    if case=='source':plan['sourceRevision']='f'*40
                    if case=='job':plan['jobIdentitySha256']='f'*64
                    if case=='nonce':plan['instanceNonce']='c'*32
                    value['planBytes']=C.canonical(plan).decode();value['approvedPlanSha256']=E.digest(value['planBytes'].encode())
                result=execute(kernel,value)
                self.assertEqual(result['result'],'UNATTESTED');self.assertFalse(any(e[0]=='send' for e in kernel.events))

    def test_after_send_deadline_or_close_unknown_keeps_sent_and_blocks_eligibility(self):
        for case in ['late','close','parent-close','cancel']:
            with self.subTest(case=case),tempfile.TemporaryDirectory() as directory:
                f,raw,ctx=configured_fixture(Path(directory).resolve());kernel=Kernel(f.plan,f.context)
                if case=='late':kernel.after_send=lambda:setattr(kernel,'now',11)
                if case=='close':kernel.close_error=True
                if case=='cancel':kernel.after_send=lambda:(_ for _ in ()).throw(TimeoutError('SECRET_CANCEL'))
                with self.assertRaises(E.EdgeShutdownError) as rejected:receipt(raw,ctx,kernel,closed=case!='parent-close')
                value=rejected.exception.evidence
                self.assertEqual(value['signalState'],'SENT' if case!='cancel' else 'UNKNOWN_MAY_HAVE_BEEN_SENT')
                self.assertEqual(value['status'],'UNATTESTED');self.assertNotIn('SECRET',json.dumps(value))
                self.assertFalse(E.eligible15(value,E.bindings(raw,E.digest(raw),ctx),{'signals':['SIGTERM_RECEIVED']}))

    def test_eprem_esrch_and_missing_transport_preserve_honest_signal_uncertainty(self):
        for number in [1,3]:
            with self.subTest(errno=number),tempfile.TemporaryDirectory() as directory:
                f,raw,ctx=configured_fixture(Path(directory).resolve());kernel=Kernel(f.plan,f.context);kernel.send_error=OSError(number,'SECRET')
                result=execute(kernel,request(raw,ctx));self.assertEqual(result['signalState'],'NOT_SENT')
                self.assertEqual(result['result'],'UNATTESTED')
        with tempfile.TemporaryDirectory() as directory:
            f,raw,ctx=configured_fixture(Path(directory).resolve())
            def missing(*args,**options):raise TimeoutError('SECRET_TRANSPORT')
            with self.assertRaises(E.EdgeShutdownError) as rejected:E.perform(raw,E.digest(raw),ctx,missing,lambda:None,clock=lambda:0,deadline=90)
            self.assertEqual(rejected.exception.evidence['signalState'],'UNKNOWN_MAY_HAVE_BEEN_SENT')
            self.assertEqual(rejected.exception.evidence['helperClosed'],'UNKNOWN')

    def test_native_budget_shares_original_ninety_seconds_and_never_calls_docker_on_unknown_close(self):
        from local_snapshot_native import NativeIO, DOCKER
        from unittest.mock import patch
        import local_snapshot_native as N
        for unknown in [False,True]:
            with self.subTest(unknown=unknown),tempfile.TemporaryDirectory() as directory:
                f,raw,ctx=configured_fixture(Path(directory).resolve());kernel=Kernel(f.plan,f.context)
                native=native_fixture(f,raw,ctx)
                now=[0];calls=[]
                def process(args,**options):
                    calls.append((args,options))
                    if args[3]=='inspect':return inspect_bytes(kernel,running=not any(e[0]=='send' for e in kernel.events))
                    if args[0]=='/usr/bin/sudo':
                        value=execute(kernel,json.loads(options['data']));now[0]=2
                        if unknown:native.closure='UNKNOWN'
                        return json.dumps(value).encode()
                    self.assertEqual(kernel.events[-2:],[('close',1101),('close',1100)])
                    self.assertEqual(args,[*DOCKER,'stop','--timeout','-1',kernel.edge['id']])
                    self.assertEqual(options['timeout'],88);return b''
                with patch.object(N.time,'monotonic',side_effect=lambda:now[0]),patch.object(native,'run',side_effect=process):
                    if unknown:
                        with self.assertRaisesRegex(C.SnapshotError,'SNAPSHOT_EDGE_SHUTDOWN_UNVERIFIED'):native.stop(kernel.edge)
                        self.assertEqual(len(calls),2);self.assertEqual(native.edge_shutdown_receipt['signalState'],'SENT')
                    else:
                        native.stop(kernel.edge);self.assertEqual(len(calls),4)
                        with self.assertRaises(C.SnapshotError):native.stop(kernel.edge)
                        self.assertEqual(len(calls),4)
                self.assertEqual(native.deadline,600)

    def test_actual_native_binary_reader_enforces_exact_size_and_closes_short_or_changed_files(self):
        from unittest.mock import patch
        import io,stat,types
        ports=NAMESPACE['NativePorts']()
        class Stream(io.BytesIO):
            def fileno(self):return 42
        stream=Stream(b'short')
        info=types.SimpleNamespace(st_mode=stat.S_IFREG|0o555,st_size=E.EXE_BYTES,st_dev=1,st_ino=2,st_mtime_ns=1,st_ctime_ns=1)
        with patch.object(NAMESPACE['os'],'open',return_value=42) as opened,patch.object(NAMESPACE['os'],'fdopen',return_value=stream),patch.object(NAMESPACE['os'],'fstat',return_value=info):
            with self.assertRaises(ValueError):ports.binary(101)
        opened.assert_called_once_with('/proc/101/exe',NAMESPACE['os'].O_RDONLY)
        self.assertTrue(stream.closed)

    def test_parent_cancel_after_verified_helper_return_unattests_sent_without_docker_stop(self):
        from local_snapshot_native import NativeIO
        from unittest.mock import patch
        import local_snapshot_native as N
        with tempfile.TemporaryDirectory() as directory:
            f,raw,ctx=configured_fixture(Path(directory).resolve());kernel=Kernel(f.plan,f.context)
            native=native_fixture(f,raw,ctx)
            calls=[];returned=[False]
            def check():
                if returned[0]:raise C.SnapshotError('SNAPSHOT_INTERRUPTED')
            def process(args,**options):
                calls.append(args)
                if args[3]=='inspect':return inspect_bytes(kernel)
                value=execute(kernel,json.loads(options['data']));returned[0]=True;return json.dumps(value).encode()
            with patch.object(N.time,'monotonic',return_value=0),patch.object(native,'run',side_effect=process),patch.object(native,'check',side_effect=check),self.assertRaises(C.SnapshotError):native.stop(kernel.edge)
            self.assertEqual(len(calls),2);self.assertEqual(native.edge_shutdown_receipt['signalState'],'SENT')
            self.assertEqual(native.edge_shutdown_receipt['status'],'UNATTESTED')

SERVICE_PINS={
 'db':('sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a','/nix/store/l1g3sy2n4qxsbjjqy4yl1nm4p8wqi7zv-postgresql-and-plugins-17.6/bin/.postgres-wrapped',11284888,'3794a95bd1c4b8224bb7b0af1aa5ff5f0ed16e61dd911fc82a1249739c7f4463',0,0,100,101,804616,'f3547b3d78d08a028a4833ddb83b77cf012838c078bfd2b76355f53d1d8bba62','SIGINT'),
 'kong':('sha256:3cefb958bcd694597b65adc00053a762b1f9a6df3c6031af528d052d75a64e1a','/usr/local/openresty/nginx/sbin/nginx',14996672,'854b17f3b5594f2ef5efcf46f33abd2aa3b06e0b1b8bc8694c97eb92f01f29d6',100,65533,100,65533,841376,'28a60362bdd0a77dcbc5294ef9cdfd256c19c3ee391a24489a42c74be26fde9f','SIGQUIT')}


def service_kernel(f,role):
    k=Kernel(f.plan,f.context);pin=SERVICE_PINS[role];k.edge=next(r for r in f.plan['containers'] if r['role']==role)
    k.edge['imageId']=pin[0]
    next(r for r in f.context['containers'] if r['role']==role)['imageId']=pin[0]
    f.plan['executionContextSha256']=E.digest(C.canonical(f.context))
    for proc in k.processes.values():proc['cgroup']=f.context['backendCgroupRelativePath']+'/docker-'+k.edge['id']+'.scope'
    k.processes[100].update(exe='/bin/busybox',uid=[pin[4]]*4,gid=[pin[5]]*4)
    k.processes[101].update(exe=pin[1],uid=[pin[6]]*4,gid=[pin[7]]*4)
    k.item.update(id=k.edge['id'],name=k.edge['name'],image=pin[0])
    k.binary_result.update(bytes=pin[2],sha256=pin[3]);k.init_binary={'bytes':pin[8],'sha256':pin[9],'device':1,'inode':1}
    return k


class ServiceSelectorTests(unittest.TestCase):
    def test_exact_db_and_kong_main_child_signal_and_different_db_credentials(self):
        for role in SERVICE_PINS:
            with self.subTest(role=role),tempfile.TemporaryDirectory() as directory:
                f,raw,ctx=configured_fixture(Path(directory).resolve());k=service_kernel(f,role)
                raw=C.canonical(f.plan);ctx=C.canonical(f.context);value=request(raw,ctx);value['targetRole']=role
                result=execute(k,value)
                self.assertEqual(result['result'],'SENT',result);self.assertEqual(result['signal'],SERVICE_PINS[role][-1])
                self.assertEqual(k.sent_signal,SERVICE_PINS[role][-1]);self.assertEqual(k.events[-2:],[('close',1101),('close',1100)])


    def test_nonmain_child_is_ignored_but_duplicate_main_bad_uid_or_busybox_hash_is_rejected(self):
        for role in SERVICE_PINS:
            for case in ['extra-nonmain','two-main','uid','init-gid','shell-hash','main-hash']:
                with self.subTest(role=role,case=case),tempfile.TemporaryDirectory() as directory:
                    f,raw,ctx=configured_fixture(Path(directory).resolve());k=service_kernel(f,role)
                    if case in ['extra-nonmain','two-main']:
                        k.child_ids.append(102);k.processes[102]={**k.processes[101],'pid':102,'nspid':[102,3]}
                        if case=='extra-nonmain':k.processes[102]['exe']='/synthetic/other-process'
                    if case=='uid':k.processes[101]['uid']=[1001]*4
                    if case=='init-gid':k.processes[100]['gid']=[101]*4
                    if case=='shell-hash':k.init_binary['sha256']='f'*64
                    if case=='main-hash':k.binary_result['sha256']='f'*64
                    value=request(C.canonical(f.plan),C.canonical(f.context));value['targetRole']=role
                    result=execute(k,value)
                    self.assertEqual(result['result'],'SENT' if case=='extra-nonmain' else 'UNATTESTED')
                    self.assertEqual(len([e for e in k.events if e[0]=='send']),1 if case=='extra-nonmain' else 0)


    def test_role_is_closed_and_init_true_never_substitutes_for_shell_verification(self):
        for role in ['storage','DB','',True]:
            with self.subTest(role=role),tempfile.TemporaryDirectory() as directory:
                f,raw,ctx=configured_fixture(Path(directory).resolve());k=Kernel(f.plan,f.context)
                value=request(raw,ctx);value['targetRole']=role;result=execute(k,value)
                self.assertEqual(result['result'],'UNATTESTED');self.assertEqual(k.events,[])
        with tempfile.TemporaryDirectory() as directory:
            f,raw,ctx=configured_fixture(Path(directory).resolve());k=Kernel(f.plan,f.context);k.item['init']=True
            result=execute(k,request(raw,ctx));self.assertEqual(result['result'],'UNATTESTED')
            self.assertFalse(any(e[0]=='send' for e in k.events))


class RestartFlowTests(unittest.TestCase):
    def test_unbound_snapshot_output_refuses_restart_mutation_and_docker_stop(self):
        from local_snapshot_native import NativeIO
        from unittest.mock import patch
        import time
        with tempfile.TemporaryDirectory() as directory:
            f,raw,ctx=configured_fixture(Path(directory).resolve());k=service_kernel(f,'db')
            raw=C.canonical(f.plan);ctx=C.canonical(f.context)
            native=NativeIO();native.source=f.source;native.runtime=f.runtime;native.context=f.context;native.deadline=time.monotonic()+600
            native.bind_stop_policy(raw,E.digest(raw),ctx)
            with patch.object(native,'docker') as docker,self.assertRaises(C.SnapshotError):native.stop(k.edge)
            docker.assert_not_called();self.assertFalse(f.output.exists())


class PlainInspectTests(unittest.TestCase):
    def test_actual_inspect_consumes_plain_array_and_classifies_optional_init(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        for state in ['ABSENT','NULL','FALSE']:
            with self.subTest(state=state),tempfile.TemporaryDirectory() as directory:
                f,raw,ctx=configured_fixture(Path(directory).resolve());row=next(r for r in f.plan['containers'] if r['role']=='edge_runtime')
                item={'Id':row['id'],'Name':E.NAME,'Image':E.IMAGE,'RestartCount':0,
                      'State':{'Pid':100,'Running':True,'Paused':False,'Restarting':False,'Dead':False,'OOMKilled':False,'Error':''},
                      'HostConfig':{'RestartPolicy':{'Name':'no','MaximumRetryCount':0},'AutoRemove':False}}
                if state!='ABSENT':item['HostConfig']['Init']=None if state=='NULL' else False
                ports=NAMESPACE['NativePorts']()
                with patch.object(NAMESPACE['subprocess'],'run',return_value=SimpleNamespace(returncode=0,stdout=C.canonical([item]),stderr=b'')) as run:
                    result=ports.inspect(row['id'])
                self.assertEqual(result['initState'],state);self.assertEqual(result['id'],row['id'])
                argv=run.call_args.args[0];self.assertEqual(argv,['/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect',row['id']])
                self.assertTrue(ports.inspect_diagnostic['fieldsPresent']);self.assertTrue(ports.inspect_diagnostic['fieldTypesValid'])
                self.assertEqual(ports.inspect_diagnostic['stage'],'MATCH');self.assertNotIn('HostConfig',json.dumps(ports.inspect_diagnostic))

    def test_plain_inspect_bad_shapes_optional_fields_bounds_and_privacy_fail_closed(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            f,_,_=configured_fixture(Path(directory).resolve());k=Kernel(f.plan,f.context);base=json.loads(inspect_bytes(k))
            cases=['true','number','string','wrong-id','wrong-image','wrong-name','multiple','object','type','duplicate','oversize','cli-error','bad-json','missing']
            for case in cases:
                with self.subTest(case=case):
                    value=copy.deepcopy(base);code=0
                    if case in ['true','number','string']:value[0]['HostConfig']['Init']={'true':True,'number':0,'string':'SYNTHETIC_SECRET'}[case]
                    if case in ['wrong-id','wrong-image','wrong-name']:value[0][{'wrong-id':'Id','wrong-image':'Image','wrong-name':'Name'}[case]]='SYNTHETIC_SECRET'
                    if case=='multiple':value.append(copy.deepcopy(value[0]))
                    if case=='object':value=value[0]
                    if case=='type':value[0]['State']['Pid']=True
                    if case=='missing':del value[0]['State']['Pid']
                    raw=C.canonical(value)
                    if case=='duplicate':raw=raw.replace(b'"Pid":100',b'"Pid":100,"Pid":100')
                    if case=='oversize':raw=b' '*262145
                    if case=='bad-json':raw=b'SYNTHETIC_SECRET'
                    if case=='cli-error':code=1
                    port=NAMESPACE['NativePorts']()
                    with patch.object(NAMESPACE['subprocess'],'run',return_value=SimpleNamespace(returncode=code,stdout=raw,stderr=b'SYNTHETIC_SECRET')):
                        with self.assertRaises((ValueError,KeyError)):port.inspect(k.edge['id'])
                    if case=='missing':self.assertFalse(port.inspect_diagnostic['fieldsPresent'])
                    if case=='type':self.assertTrue(port.inspect_diagnostic['fieldsPresent']);self.assertFalse(port.inspect_diagnostic['fieldTypesValid'])
                    self.assertTrue(E.safe_inspect_diagnostic(port.inspect_diagnostic));self.assertNotIn('SYNTHETIC_SECRET',json.dumps(port.inspect_diagnostic))

if __name__=='__main__':unittest.main()
