"""Actual pull transport and private evidence; synthetic Docker ports, no registry."""
import contextlib
import copy
import gzip
import io
import importlib.util
import tarfile
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).parent))
from test_linux_local_bootstrap import Fixture, B, C, M
RATE=b'Error response from daemon: toomanyrequests: Rate exceeded\n'


class PullTests(unittest.TestCase):
    @contextlib.contextmanager
    def harness(self,results,durations=None):
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());requests=f.parent/'requests';requests.mkdir(mode=0o700)
            path=requests/'bootstrap-input.json';C.write_once(path,f.path.read_bytes())
            native=M.NativeIO();native.source=f.source;native._pull_pins=copy.deepcopy(f.pins)
            with patch.object(sys,'platform','linux'):native._authorize_diagnostics(path,C.digest(path.read_bytes()))
            clock={'now':100.0};calls=[];waits=[]
            def process(args,source,**options):
                self.assertEqual(args,[*B.DOCKER,'pull','--platform','linux/amd64',f.pins[0]['pinnedReference']])
                self.assertEqual(source,f.source);self.assertFalse(options['checked']);self.assertTrue(options['capture_stderr'])
                calls.append(options['timeout']);index=len(calls)-1
                clock['now']+=(durations or [0]*len(results))[index]
                result=results[index]
                if isinstance(result,BaseException):raise result
                return result
            def wait(delay):waits.append(delay);clock['now']+=delay
            with patch.object(M,'bounded',side_effect=process),patch.object(M.time,'monotonic',side_effect=lambda:clock['now']),patch.object(M.time,'sleep',side_effect=wait):
                yield f,native,requests,clock,calls,waits

    def test_three_rates_exhaust_and_keep_first_terminal_slot(self):
        with self.harness([(1,b'progress',RATE)]*3) as (f,native,root,clock,calls,waits):
            with self.assertRaisesRegex(C.BootstrapError,'BOOTSTRAP_COMMAND_FAILED'):native.pull_approved_image(f.pins[0],0)
            self.assertEqual(calls,[180,175,165]);self.assertEqual(waits,[5,10])
            self.assertEqual((root/'bootstrap-command-stderr.bin').read_bytes(),RATE)
            self.assertTrue(native._raw_attempted)
            for number in [1,2]:
                self.assertEqual((root/f'bootstrap-pull-0-attempt-{number}-stderr.bin').read_bytes(),RATE)
                value=C.decode((root/f'bootstrap-pull-0-attempt-{number}.json').read_bytes())
                self.assertEqual(value['outcome'],'TRANSIENT_RATE');self.assertEqual(value['physicalClosure'],'VERIFIED')
                self.assertEqual(value['bootstrapRequestSha256'],C.digest(f.path.read_bytes()))
            self.assertEqual(len(list(root.glob('bootstrap-pull-*.json'))),3)
            for path in root.iterdir():self.assertEqual(path.stat().st_mode&0o777,0o600)
            self.assertNotIn('progress',json.dumps(native.command_diagnostic))

    def test_different_terminal_after_two_rates_and_later_cli_error_are_not_swallowed(self):
        with self.harness([(1,b'',RATE),(1,b'',RATE),(7,b'last out',b'SYNTHETIC_TERMINAL')]) as (f,native,root,clock,calls,waits):
            with self.assertRaises(C.BootstrapError):native.pull_approved_image(f.pins[0],0)
            self.assertEqual((root/'bootstrap-command-stderr.bin').read_bytes(),b'SYNTHETIC_TERMINAL')
            self.assertEqual(len(calls),3)
        with self.harness([(1,b'',RATE),(0,b'ok',b'')]) as (f,native,root,clock,calls,waits):
            self.assertEqual(native.pull_approved_image(f.pins[0],0),b'ok');self.assertFalse(native._raw_attempted)
            with patch.object(M,'bounded',return_value=(9,b'cli out',b'SYNTHETIC_CLI_TERMINAL')):
                for _ in range(2):
                    with self.assertRaises(C.BootstrapError):native.run([f.tools['supabase']['path'],'start'])
            self.assertEqual((root/'bootstrap-command-stderr.bin').read_bytes(),b'SYNTHETIC_CLI_TERMINAL')
            self.assertTrue((root/'bootstrap-pull-0-attempt-1-stderr.bin').exists())
            self.assertNotIn('SYNTHETIC_CLI_TERMINAL',json.dumps(native.command_diagnostic))

    def test_similar_messages_other_exit_codes_and_unknown_close_do_not_retry(self):
        rows=[(1,b'',RATE+b'other'),(1,b'',RATE.lower()),(1,b'',RATE.rstrip()),(2,b'',RATE),
              (1,b'',b'Error response from daemon: toomanyrequests: Data limit exceeded\n'),
              (1,b'',b'permission denied'),C.BootstrapError('BOOTSTRAP_COMMAND_TIMEOUT'),
              C.BootstrapError('CLOSE_UNKNOWN'),InterruptedError()]
        for row in rows:
            with self.subTest(rowType=type(row).__name__),self.harness([row]) as (f,native,root,clock,calls,waits):
                with self.assertRaises(Exception):native.pull_approved_image(f.pins[0],0)
                self.assertEqual(len(calls),1);self.assertEqual(waits,[])
                metadata=C.decode((root/'bootstrap-pull-0-attempt-1.json').read_bytes())
                if isinstance(row,BaseException):
                    self.assertEqual(metadata['physicalClosure'],'UNKNOWN');self.assertIsNone(metadata['stderrBytes'])

    def test_shared_deadline_covers_commands_wait_and_late_physical_close(self):
        for results,durations in [([(1,b'',RATE)],[175]), ([(0,b'',b'')],[180]),
                                  ([(1,b'',RATE),(1,b'',RATE)],[1,164])]:
            with self.subTest(durations=durations),self.harness(results,durations) as (f,native,root,clock,calls,waits):
                with self.assertRaisesRegex(C.BootstrapError,'BOOTSTRAP_COMMAND_TIMEOUT'):native.pull_approved_image(f.pins[0],0)
                self.assertLessEqual(len(calls),2)
        with self.harness([(1,b'',RATE),(0,b'',b'')],[1,1]) as (f,native,root,clock,calls,waits):
            native.pull_approved_image(f.pins[0],0);self.assertEqual(calls,[180,174]);self.assertEqual(waits,[5])

    def test_cancel_during_wait_and_late_writer_never_start_another_pull(self):
        for kind in ['cancel','late_write']:
            with self.subTest(kind=kind),self.harness([(1,b'',RATE)]) as (f,native,root,clock,calls,waits):
                write=C.write_once
                def delayed(path,value):
                    result=write(path,value)
                    if path.name=='bootstrap-pull-0-attempt-1.json':clock['now']+=180
                    return result
                with patch.object(M.time,'sleep',side_effect=InterruptedError()) if kind=='cancel' else patch.object(C,'write_once',side_effect=delayed):
                    with self.assertRaises(Exception):native.pull_approved_image(f.pins[0],0)
                self.assertEqual(len(calls),1)

    def test_scope_pin_index_replay_writer_collision_and_history_cap_fail_closed(self):
        for kind in ['scope','index','boolean','pin','foreign','collision','writer','cap']:
            with self.subTest(kind=kind),self.harness([(1,b'',RATE)]) as (f,native,root,clock,calls,waits):
                pin=copy.deepcopy(f.pins[0]);index=0
                if kind=='scope':native._raw_root=None
                elif kind=='index':index=1
                elif kind=='boolean':index=False
                elif kind=='pin':pin['configDigest']='sha256:'+'f'*64
                elif kind=='foreign':
                    pin['pinnedReference']='https://outside.invalid/image';native._pull_pins[0]=pin
                elif kind=='collision':C.write_once(root/'bootstrap-pull-0-attempt-1-stdout.bin',b'FIRST')
                elif kind=='cap':native._pull_history_bytes=2097152
                write=C.write_once
                def failed(path,value):
                    if path.name=='bootstrap-pull-0-attempt-1-stderr.bin':raise OSError('SYNTHETIC_WRITER_SECRET')
                    return write(path,value)
                with patch.object(C,'write_once',side_effect=failed) if kind=='writer' else contextlib.nullcontext():
                    with self.assertRaises(Exception):native.pull_approved_image(pin,index)
                self.assertEqual(waits,[]);self.assertLessEqual(len(calls),1)
                if kind=='collision':self.assertEqual((root/'bootstrap-pull-0-attempt-1-stdout.bin').read_bytes(),b'FIRST')
                if kind in ['writer','cap','collision']:self.assertEqual((root/'bootstrap-command-stderr.bin').read_bytes(),RATE)
        with self.harness([(0,b'',b'')]) as (f,native,root,clock,calls,waits):
            native.pull_approved_image(f.pins[0],0)
            with self.assertRaises(C.BootstrapError):native.pull_approved_image(f.pins[0],0)
            self.assertEqual(len(calls),1)

    def test_actual_bounded_external_process_returns_closed_before_retry(self):
        with self.harness([(0,b'',b'')]) as (f,native,root,clock,calls,waits):
            original=M.bounded;real=__import__('test_prebusiness_diagnostic_export').M.bounded;attempts=[]
            def external(args,source,**options):
                attempts.append(args)
                code=1 if len(attempts)==1 else 0
                command=[sys.executable,'-I','-B','-c','import sys;sys.stderr.buffer.write('+repr(RATE if code else b'')+');sys.exit('+str(code)+')']
                return real(command,source,**options)
            with patch.object(M,'bounded',side_effect=external):native.pull_approved_image(f.pins[0],0)
            self.assertEqual(len(attempts),2);self.assertFalse(native._raw_attempted)

    def test_prebusiness_and_normal_export_include_every_attempt_file(self):
        from test_prebusiness_diagnostic_export import PrebusinessTests,wired,S,R,EXPORT
        helper=PrebusinessTests();export=helper.export_fixture();self.addCleanup(helper.doCleanups)
        for mode in ['prebusiness','normal']:
            with self.subTest(mode=mode),self.harness([(1,b'PRIVATE_PROGRESS',RATE),(0,b'',b'')]) as (f,native,root,clock,calls,waits):
                native.pull_approved_image(f.pins[0],0)
                expected={p.name:p.read_bytes() for p in root.glob('bootstrap-pull-*')}
                recipient=f.source/'scripts/concurrency/local-export-recipient.json'
                recipient.write_text(json.dumps({'schemaVersion':1,'recipient':export.manifest['recipient'],'privateIdentityUploaded':False}));recipient.chmod(0o600)
                summary={'failedStage':'bootstrap','functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'}
                if mode=='prebusiness':
                    with wired(f,export.adapter()),contextlib.redirect_stdout(io.StringIO()):
                        value=S.export_prebusiness_diagnostic('a'*40,root/'bootstrap-input.json',C.digest((root/'bootstrap-input.json').read_bytes()),summary)
                    prefix='requests/'
                else:
                    snapshots=f.parent/'snapshots';snapshots.mkdir(mode=0o700)
                    snapshot=snapshots/('b'*32);snapshot.mkdir(mode=0o700)
                    C.write_once(f.parent/'tools/installation-receipt.json',{})
                    def encrypted(name,argv,expected,**options):
                        self.assertEqual(name,'encrypt-evidence')
                        def arg(key):return argv[argv.index('--'+key)+1]
                        return EXPORT.export_evidence(arg('source-root'),arg('manifest'),arg('approve'),arg('output'),adapter=export.adapter())
                    with patch.object(S,'SOURCE',f.source),patch.object(S,'PARENT',f.parent),patch.object(S,'TOOLS',f.parent/'tools'),patch.object(S,'stage',side_effect=encrypted):
                        R.attach_controls(snapshot,summary);value=S.export_snapshot(snapshot,'a'*40,'e'*64,'d'*64)
                    prefix='root-control/requests/'
                self.assertEqual(value['retention'],'UNVERIFIED')
                with tarfile.open(fileobj=io.BytesIO(gzip.decompress((f.parent/'exports/evidence.age').read_bytes()))) as archive:
                    for name,raw in expected.items():self.assertEqual(archive.extractfile(prefix+name).read(),raw)

    def test_actual_start_recovers_only_exact_rate_without_retrying_cli(self):
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());f.runtime.mkdir(mode=0o700)
            keys=f.runtime/'local-project/supabase';keys.mkdir(parents=True,mode=0o700)
            C.write_once(keys/'signing-keys.json',[f.key])
            requests=f.parent/'requests';requests.mkdir(mode=0o700)
            path=requests/'bootstrap-input.json';C.write_once(path,f.path.read_bytes())
            native=M.NativeIO();native.source=f.source;native._pull_pins=f.pins
            native.bootstrap_observer=None  # External fake: no native observer authority.
            with patch.object(sys,'platform','linux'):native._authorize_diagnostics(path,C.digest(path.read_bytes()))
            calls=[]
            def process(args,source,**options):
                calls.append(args)
                return (1,b'',RATE) if len(calls)==1 else (0,b'',b'')
            def dispatch(args,**options):
                if args[:4]==[*B.DOCKER,'pull']:return M.NativeIO.run(native,args,**options)
                return f.run(args,**options)
            native.run=dispatch
            with patch.object(M,'bounded',side_effect=process),patch.object(M.time,'sleep'):
                try:B.start(native,f.runtime,f.runtime,f.tools,f.pins,'s'*64,f.key);outcome='PASSED'
                except C.BootstrapError as error:outcome=str(error)
            self.assertEqual(outcome,'PASSED')
            self.assertEqual(len(calls),9)
            self.assertEqual(sum(args[:2]==[f.tools['supabase']['path'],'start'] for args,_ in f.commands),1)


if __name__=='__main__':unittest.main()
