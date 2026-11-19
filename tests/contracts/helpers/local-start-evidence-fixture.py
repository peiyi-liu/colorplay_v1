import base64, contextlib, hashlib, importlib.util, io, json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[3]
CANARY = 'synthetic-' + 'sensitive-start-canary'

def caller():
    with tempfile.TemporaryDirectory(prefix='colorplay-start-evidence-') as temporary:
        root = Path(temporary)
        (root/'scripts/supabase').mkdir(parents=True)
        (root/'scripts/concurrency').mkdir()
        for relative in ['scripts/test-db.sh', 'scripts/supabase/load-local-environment.sh',
                         'scripts/supabase/start-local-with-evidence.py',
                         'scripts/concurrency/local-export-recipient.json']:
            source = REPO/relative
            if source.exists(): shutil.copyfile(source, root/relative)
        binary = root/'bin'; binary.mkdir()
        (root/'github-output').write_text('')
        calls = root/'calls'
        pnpm = binary/'pnpm'
        pnpm.write_text('#!/bin/sh\nprintf "start\\n" >> "'+str(calls)+'"\nprintf "'+CANARY+'\\n" >&2\nexit 7\n')
        pnpm.chmod(0o700)
        git = binary/'git'; git.write_text('#!/bin/sh\nprintf "'+('a'*40)+'\\n"\n'); git.chmod(0o700)
        env = {**os.environ, 'PATH':str(binary)+os.pathsep+os.environ['PATH'],
               'GITHUB_RUN_ID':'123', 'GITHUB_RUN_ATTEMPT':'1', 'GITHUB_JOB':'local-database',
               'GITHUB_SHA':'b'*40, 'LOCAL_START_SOURCE_HEAD':'c'*40,
               'GITHUB_OUTPUT':str(root/'github-output')}
        result = subprocess.run(['bash', 'scripts/test-db.sh'], cwd=root, env=env, capture_output=True)
        cipher = root/'artifacts/ci-local-start/start-failure.age'
        return {'exitCode':result.returncode, 'startCalls':len(calls.read_text().splitlines()),
                'cipherExists':cipher.is_file(), 'rawPublic':CANARY.encode() in result.stdout+result.stderr}

class WrapperTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='colorplay-start-contract-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.binary = self.root/'bin'; self.binary.mkdir()
        self.calls = self.root/'calls'
        self.out = self.root/'artifacts/ci-local-start/start-failure.age'
        self.github_output = self.root/'github-output'; self.github_output.write_text('')
        spec = importlib.util.spec_from_file_location('start_contract', REPO/'scripts/supabase/start-local-with-evidence.py')
        self.module = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.module)
        self.recipient = self.module.RECIPIENT_FILE
        self.patch('ROOT', self.root); self.patch('OUTPUT', self.out)
        self.patch('RECIPIENT_FILE', self.recipient)
        self.environment = {'PATH':str(self.binary)+os.pathsep+os.environ['PATH'],
                            'GITHUB_RUN_ID':'123', 'GITHUB_RUN_ATTEMPT':'1',
                            'GITHUB_JOB':'local-database', 'GITHUB_SHA':'b'*40,
                            'LOCAL_START_SOURCE_HEAD':'c'*40, 'GITHUB_OUTPUT':str(self.github_output)}
        p = patch.dict(os.environ, self.environment); p.start(); self.addCleanup(p.stop)
        git = self.binary/'git'; git.write_text('#!/bin/sh\nprintf "'+('a'*40)+'\\n"\n'); git.chmod(0o700)
        self.pnpm('print('+repr(CANARY)+'); raise SystemExit(7)')

    def patch(self, name, value):
        p = patch.object(self.module, name, value); p.start(); self.addCleanup(p.stop)

    def pnpm(self, body):
        script = '#!'+sys.executable+'\nimport json,os,signal,sys\n'
        script += 'with open('+repr(str(self.calls))+',"a") as f: f.write(json.dumps({"argv":sys.argv[1:],"cwd":os.getcwd(),"marker":os.environ.get("PRESERVE_MARKER")})+"\\n")\n'
        script += body+'\n'
        target = self.binary/'pnpm'; target.write_text(script); target.chmod(0o700)

    def run_wrapper(self):
        public = io.StringIO()
        with contextlib.redirect_stdout(public): code = self.module.run_start()
        self.assertNotIn(CANARY, public.getvalue())
        self.assertNotIn('captureBase64', public.getvalue())
        return code, json.loads(public.getvalue())

    def fake_encrypt(self, plain, cipher, recipient):
        self.assertEqual(recipient, self.module._recipient())
        self.assertEqual(plain.stat().st_mode & 0o777, 0o600)
        self.assertEqual(plain.parent.stat().st_mode & 0o777, 0o700)
        self.envelope = json.loads(plain.read_bytes())
        self.plain_directory = plain.parent
        cipher.write_bytes(b'SYNTHETIC_CIPHER_NOT_CRYPTO_PROOF')

    def test_success_is_silent_preserves_argv_cwd_env_and_does_not_require_age(self):
        self.pnpm('print('+repr(CANARY)+'); print('+repr(CANARY)+',file=sys.stderr)')
        with patch.dict(os.environ, {'PRESERVE_MARKER':'fixed-synthetic'}), patch.object(self.module, '_encrypt', side_effect=AssertionError('must not encrypt')) as encrypt:
            code, public = self.run_wrapper()
        self.assertEqual(code, 0); encrypt.assert_not_called(); self.assertFalse(self.out.exists())
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertEqual(calls, [{'argv':['exec','supabase','start'], 'cwd':str(Path.cwd()), 'marker':'fixed-synthetic'}])
        self.assertEqual(public, {'status':'LOCAL_START_SUCCEEDED','exitCode':0})

    def test_nonzero_keeps_one_start_exit_context_modes_and_private_cleanup(self):
        with patch.object(self.module, '_encrypt', side_effect=self.fake_encrypt):
            code, public = self.run_wrapper()
        self.assertEqual(code, 7); self.assertEqual(public['status'], 'ENCRYPTED')
        self.assertEqual(len(self.calls.read_text().splitlines()), 1)
        self.assertEqual(self.envelope['context']['checkoutSha'], 'a'*40)
        self.assertEqual(self.envelope['context']['eventSha'], 'b'*40)
        self.assertEqual(self.envelope['context']['sourceHeadSha'], 'c'*40)
        self.assertEqual(self.envelope['context']['numericJobId'], 'UNOBSERVED')
        self.assertFalse(self.plain_directory.exists()); self.assertEqual(self.out.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.github_output.read_text(), 'local_start_cipher=true\n')
        self.assertEqual(public['descendantClosure'], 'UNOBSERVED')
        self.assertNotIn('resourcesClosed', public)

    def test_signal_is_original_shell_status(self):
        self.pnpm('os.kill(os.getpid(), signal.SIGTERM)')
        with patch.object(self.module, '_encrypt', side_effect=self.fake_encrypt): code, _ = self.run_wrapper()
        self.assertEqual(code, 143); self.assertEqual(self.envelope['exitCode'], 143)

    def test_command_missing_is_127_and_permission_is_126_without_raw_error(self):
        for failure, expected in [(FileNotFoundError(CANARY),127),(PermissionError(CANARY),126)]:
            if self.out.exists(): self.out.unlink()
            with patch.object(self.module.subprocess, 'Popen', side_effect=failure) as launch, patch.object(self.module, '_context', return_value={'checkoutSha':'a'*40}), patch.object(self.module, '_encrypt', side_effect=self.fake_encrypt):
                code, public = self.run_wrapper()
            self.assertEqual(code, expected); self.assertFalse(public['childStarted'])
            launch.assert_called_once_with(['pnpm','exec','supabase','start'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def test_oversize_both_pipes_drain_fully_but_capture_is_at_most_eight_mib(self):
        self.pnpm('for fd,letter in [(1,b"A"),(2,b"B")]:\n for _ in range(96): os.write(fd,letter*65536)\nraise SystemExit(9)')
        with patch.object(self.module, '_encrypt', side_effect=self.fake_encrypt): code, _ = self.run_wrapper()
        self.assertEqual(code, 9)
        streams = self.envelope['streams']
        self.assertEqual(sum(row['capturedBytes'] for row in streams.values()), 8*1024*1024)
        for name, letter in [('stdout',b'A'),('stderr',b'B')]:
            self.assertEqual(streams[name]['bytes'], 6*1024*1024)
            self.assertEqual(streams[name]['sha256'], hashlib.sha256(letter*(6*1024*1024)).hexdigest())
            self.assertEqual(len(base64.b64decode(streams[name]['captureBase64'])), streams[name]['capturedBytes'])
            self.assertEqual(streams[name]['truncated'], streams[name]['capturedBytes'] < streams[name]['bytes'])
        self.assertTrue(self.envelope['captureComplete'])

    def test_encryption_or_private_store_failure_never_changes_failed_exit(self):
        for name in ('encrypt','temporary'):
            if name == 'encrypt': p = patch.object(self.module, '_encrypt', side_effect=OSError(CANARY))
            else: p = patch.object(self.module.tempfile, 'TemporaryDirectory', side_effect=PermissionError(CANARY))
            with p: code, public = self.run_wrapper()
            self.assertEqual(code, 7); self.assertEqual(public['status'], 'UNAVAILABLE')
            self.assertFalse(self.out.exists()); self.assertEqual(self.github_output.read_text(), '')
        self.assertEqual(len(self.calls.read_text().splitlines()), 2)

    def test_unknown_context_does_not_serialize_environment_or_claim_evidence(self):
        for key in ('GITHUB_JOB','GITHUB_RUN_ID','LOCAL_START_SOURCE_HEAD'):
            with patch.dict(os.environ, {key:CANARY}): code, public = self.run_wrapper()
            self.assertEqual(code, 7); self.assertEqual(public['status'], 'UNAVAILABLE'); self.assertFalse(self.out.exists())

    def test_stale_cipher_never_sets_upload_readiness_or_gets_overwritten(self):
        self.out.parent.mkdir(parents=True, mode=0o700)
        self.out.write_bytes(b'PREEXISTING_FIXED_TEST_BYTES')
        with patch.object(self.module, '_encrypt', side_effect=self.fake_encrypt): code, public = self.run_wrapper()
        self.assertEqual(code, 7); self.assertEqual(public['status'], 'UNAVAILABLE')
        self.assertEqual(self.out.read_bytes(), b'PREEXISTING_FIXED_TEST_BYTES')
        self.assertEqual(self.github_output.read_text(), '')

    def test_main_rejects_recipient_override_before_start(self):
        result = subprocess.run([sys.executable, '-B', str(REPO/'scripts/supabase/start-local-with-evidence.py'), '--recipient', 'invalid'], capture_output=True)
        self.assertEqual(result.returncode, 2); self.assertNotIn(CANARY.encode(), result.stdout+result.stderr)
        self.assertFalse(self.calls.exists())

    def test_real_age_roundtrip_and_tamper_reject_using_only_owned_test_keys(self):
        self.pnpm('os.write(1,'+repr(b'\xff\x00'+CANARY.encode())+'); os.write(2,b"\\x80stderr"); raise SystemExit(7)')
        identity = self.root/'test-identity'; wrong = self.root/'wrong-test-identity'
        for destination in (identity,wrong):
            subprocess.run(['age-keygen','-o',str(destination)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            destination.chmod(0o600)
        recipient = subprocess.check_output(['age-keygen','-y',str(identity)]).decode().strip()
        encrypt = self.module._encrypt
        def actual_crypto(plain, cipher, configured):
            self.assertEqual(configured, self.module._recipient())
            self.plain_directory = plain.parent
            encrypt(plain, cipher, recipient)
        with patch.object(self.module, '_encrypt', side_effect=actual_crypto): code, public = self.run_wrapper()
        self.assertEqual(code, 7); self.assertEqual(public['status'], 'ENCRYPTED')
        decrypted = subprocess.check_output(['age','--decrypt','--identity',str(identity),str(self.out)])
        envelope = json.loads(decrypted)
        raw = base64.b64decode(envelope['streams']['stdout']['captureBase64'])
        self.assertTrue(CANARY.encode() in raw)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), envelope['streams']['stdout']['sha256'])
        stderr = base64.b64decode(envelope['streams']['stderr']['captureBase64'])
        self.assertEqual(stderr, b'\x80stderr')
        self.assertEqual(hashlib.sha256(stderr).hexdigest(), envelope['streams']['stderr']['sha256'])
        self.assertFalse(self.plain_directory.exists())
        rejected = subprocess.run(['age','--decrypt','--identity',str(wrong),str(self.out)], capture_output=True)
        self.assertNotEqual(rejected.returncode, 0); self.assertEqual(rejected.stdout, b'')
        damaged = bytearray(self.out.read_bytes()); damaged[-1] ^= 1
        tampered = self.root/'tampered.age'; tampered.write_bytes(damaged)
        rejected = subprocess.run(['age','--decrypt','--identity',str(identity),str(tampered)], capture_output=True)
        self.assertNotEqual(rejected.returncode, 0)


if __name__ == '__main__':
    if sys.argv[1:] == ['suite']:
        unittest.main(argv=[sys.argv[0]], verbosity=1)
    elif len(sys.argv) == 3 and sys.argv[1] == 'case':
        name = sys.argv[2]
        assert name in WrapperTests.__dict__ and name.startswith('test_')
        unittest.main(argv=[sys.argv[0], 'WrapperTests.'+name], verbosity=1)
    else:
        print(json.dumps(caller()))
