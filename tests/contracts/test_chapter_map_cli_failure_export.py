import base64
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts/concurrency/export_chapter_map_cli_failure.py'
spec = importlib.util.spec_from_file_location('cli_failure_export', SCRIPT)
D = importlib.util.module_from_spec(spec)
if SCRIPT.exists():spec.loader.exec_module(D)
SOURCE = 'a' * 40
CIPHER = b'age-encryption.org/v1\nSYNTHETIC_CIPHER_NOT_REAL_CRYPTO'


def environment(parent):
    return {'GITHUB_REPOSITORY': 'peiyi-liu/colorplay_v1', 'GITHUB_REF': D.BRANCH,
            'GITHUB_WORKFLOW_REF': D.REPOSITORY + '/' + D.WORKFLOW + '@' + D.BRANCH,
            'GITHUB_JOB': 'chapter-map-diagnostic', 'GITHUB_RUN_ATTEMPT': '1',
            'GITHUB_RUN_ID': '12345', 'GITHUB_SHA': SOURCE, 'RUNNER_TEMP': str(parent)}


class Ports:
    def __init__(self, result=(1, b'SYNTHETIC_SECRET_STDOUT', b'SYNTHETIC_SECRET_STDERR')):
        self.result = result
        self.calls = []
        self.after = b''
        self.git_calls = 0
        self.envelope = None
        self.age_code = 0
        self.node = b'v24.13.1\n'
        self.before = b''

    def __call__(self, args, source, **options):
        self.calls.append((args, source, options))
        if args == ['/usr/bin/git', 'rev-parse', 'HEAD']:return 0, SOURCE.encode(), b''
        if args == ['/usr/bin/git', 'status', '--porcelain']:
            self.git_calls += 1
            return 0, self.before if self.git_calls == 1 else self.after, b''
        if args == ['/fixed/node', '--version']:return 0, self.node, b''
        if args == ['/fixed/pnpm', 'exec', 'supabase', '--version']:
            if isinstance(self.result, Exception):raise self.result
            return self.result
        if args == ['/usr/bin/age', '--encrypt', '--recipient', D.RECIPIENT]:
            self.envelope = json.loads(options['data'])
            return self.age_code, CIPHER, b'SYNTHETIC_AGE_SECRET'
        raise AssertionError('Unexpected command')


class ExportTests(unittest.TestCase):
    def setup_case(self, result=(1, b'SYNTHETIC_SECRET_STDOUT', b'SYNTHETIC_SECRET_STDERR')):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        parent = Path(temporary.name).resolve()
        return environment(parent), Ports(result), parent / D.FOLDER

    def capture(self, env, ports):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = D.capture(env, ports, '/fixed/node', '/fixed/pnpm')
        self.assertNotIn('SYNTHETIC_SECRET', output.getvalue())
        self.assertNotIn('SYNTHETIC_AGE_SECRET', output.getvalue())
        return result, output.getvalue()

    def test_new_capture_api_exists_without_executing_main(self):
        self.assertTrue(SCRIPT.exists(), 'new CLI-only export API not implemented')
        self.assertTrue(callable(D.capture))

    def test_nonzero_capture_binds_envelope_and_receipt_without_public_raw(self):
        env, ports, private = self.setup_case()
        result, console = self.capture(env, ports)
        self.assertEqual(result, 1)
        public = private / 'public'
        receipt = json.loads((public / 'receipt.json').read_bytes())
        self.assertEqual(set(p.name for p in public.iterdir()), {'receipt.json', 'command-output.age'})
        for key, value in ports.envelope['manifest'].items():self.assertEqual(receipt[key], value)
        self.assertEqual(set(receipt) - set(ports.envelope['manifest']), {'cipherBytes', 'cipherSha256'})
        self.assertEqual(base64.b64decode(ports.envelope['stdoutBase64']), ports.result[1])
        self.assertEqual(base64.b64decode(ports.envelope['stderrBase64']), ports.result[2])
        self.assertEqual(receipt['stdoutSha256'], hashlib.sha256(ports.result[1]).hexdigest())
        self.assertEqual(receipt['stderrSha256'], hashlib.sha256(ports.result[2]).hexdigest())
        self.assertEqual(json.loads(console), receipt)
        self.assertTrue(receipt['captureComplete']);self.assertTrue(receipt['controlChildExitObserved'])
        self.assertFalse(receipt['backendStartedByTool']);self.assertTrue(receipt['terminationUnknown'])
        self.assertNotIn('resourcesClosed', receipt)
        self.assertTrue(D.validate_artifact(env))
        self.assertLessEqual(sum(p.stat().st_size for p in public.iterdir()), 262144)
        for folder in (private, public):self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
        for file in (private / 'stdout-private.bin', private / 'stderr-private.bin', public / 'receipt.json', public / 'command-output.age'):
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):D.write_once(file, b'NO_OVERWRITE')

    def test_fixed_single_command_and_original_environment_forwarding(self):
        env, ports, private = self.setup_case()
        self.capture(env, ports)
        calls = [call for call in ports.calls if call[0][0] == '/fixed/pnpm']
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], ['/fixed/pnpm', 'exec', 'supabase', '--version'])
        self.assertEqual(calls[0][1], ROOT)
        self.assertEqual(calls[0][2], {'data': None, 'env': {'PATH': '/fixed:/usr/bin:/bin'}, 'timeout': 60, 'maximum': 4194304, 'checked': False, 'capture_stderr': True})
        age = [call for call in ports.calls if call[0][0] == '/usr/bin/age']
        self.assertEqual(len(age), 1)
        self.assertEqual(age[0][2]['timeout'], 30);self.assertEqual(age[0][2]['maximum'], 262144)
        self.assertEqual(ports.git_calls, 2)
        self.assertFalse(any('docker' in part or part in ('--run', 'start', 'reset', 'install') for call in ports.calls for part in call[0]))

    def test_success_does_not_seal_or_store_raw_or_claim_native_pass(self):
        env, ports, private = self.setup_case((0, b'2.109.1\n', b''))
        result, console = self.capture(env, ports)
        self.assertEqual(result, 0);self.assertEqual(json.loads(console)['kind'], 'CLI_VERSION_COMMAND_SUCCEEDED')
        self.assertTrue(json.loads(console)['gitCleanAfter'])
        self.assertEqual(list(private.iterdir()), []);self.assertIsNone(ports.envelope)
        self.assertFalse(D.validate_artifact(env))

    def test_timeout_and_output_limit_never_create_complete_evidence(self):
        for reason in ('BOOTSTRAP_COMMAND_TIMEOUT', 'BOOTSTRAP_OUTPUT_LIMIT'):
            env, ports, private = self.setup_case(ValueError(reason))
            result, console = self.capture(env, ports)
            self.assertEqual(result, 1);self.assertEqual(json.loads(console)['kind'], 'CLI_CAPTURE_UNAVAILABLE')
            self.assertIsNone(json.loads(console)['exitCode']);self.assertIsNone(json.loads(console)['stdoutBytes'])
            self.assertTrue(json.loads(console)['terminationUnknown'])
            self.assertEqual(list(private.iterdir()), []);self.assertIsNone(ports.envelope)
            self.assertFalse(D.validate_artifact(env))
            self.assertEqual(ports.git_calls, 2)

    def test_size_limit_and_age_failure_never_publish(self):
        for result, age_code in (((1, b'x' * 65537, b''), 0), ((1, b'error', b''), 1)):
            env, ports, private = self.setup_case(result);ports.age_code = age_code
            with self.assertRaises(ValueError):self.capture(env, ports)
            self.assertFalse((private / 'public').exists())
            self.assertFalse(D.validate_artifact(env))

    def test_git_mutation_is_reported_as_fact_not_pass(self):
        env, ports, private = self.setup_case();ports.after = b' M package.json\n'
        result, _ = self.capture(env, ports)
        self.assertEqual(result, 1)
        receipt = json.loads((private / 'public/receipt.json').read_bytes())
        self.assertIs(receipt['gitCleanAfter'], False);self.assertEqual(receipt['executionAuthority'], 'NONE')

    def test_successful_cli_with_dirty_git_still_does_not_pass(self):
        env, ports, private = self.setup_case((0, b'2.109.1\n', b''));ports.after = b' M package.json\n'
        result, console = self.capture(env, ports)
        self.assertEqual(result, 1);self.assertFalse(json.loads(console)['gitCleanAfter'])
        self.assertEqual(list(private.iterdir()), [])

    def test_dirty_start_and_wrong_node_do_not_run_pnpm(self):
        for change in ('dirty', 'node'):
            env, ports, private = self.setup_case()
            if change == 'dirty':ports.before = b'?? unknown\n'
            else:ports.node = b'v24.18.0\n'
            with self.assertRaises(ValueError):self.capture(env, ports)
            self.assertFalse(any(call[0][0] == '/fixed/pnpm' for call in ports.calls))

    def test_context_rejects_foreign_partial_replay_and_source(self):
        env, ports, private = self.setup_case()
        for key, value in (('GITHUB_REPOSITORY', 'foreign/repo'), ('GITHUB_REF', 'refs/heads/staging'), ('GITHUB_JOB', 'capacity-linux'), ('GITHUB_WORKFLOW_REF', 'foreign'), ('GITHUB_RUN_ATTEMPT', '2'), ('GITHUB_SHA', 'bad'), ('GITHUB_RUN_ID', '1e10')):
            with self.assertRaises(ValueError):D.context({**env, key: value})
        with self.assertRaises(ValueError):D.context({})

    def test_closed_receipt_rejects_extra_secret_wrong_hash_source_recipient(self):
        env, ports, private = self.setup_case();self.capture(env, ports)
        receipt = json.loads((private / 'public/receipt.json').read_bytes());binding = D.context(env)
        patches = ({'secret': 'SYNTHETIC_SECRET'}, {'sourceRevision': 'b' * 40}, {'runId': 9}, {'attempt': 2}, {'recipientSha256': '0' * 64}, {'cipherSha256': '0' * 64}, {'stdoutBytes': 65537}, {'stdoutBytes': True}, {'stdoutSha256': 'bad'}, {'exitCode': 0}, {'captureComplete': False}, {'terminationUnknown': False}, {'backendStartedByTool': True}, {'executionAuthority': 'VERIFIED'}, {'cipherBytes': len(CIPHER) + 1})
        for patch in patches:
            with self.subTest(patch=list(patch)), self.assertRaises(ValueError):D.validate_receipt({**receipt, **patch}, binding, CIPHER)
        for raw in ('{"same":1,"same":2}', '{"safe":NaN}'):
            with self.assertRaises(ValueError):D.decode(raw)
        with self.assertRaises(ValueError):D.validate_receipt(receipt, binding, b'WRONG_CIPHER')

    def test_validate_reads_only_fixed_private_leaves_and_rejects_tamper(self):
        env, ports, private = self.setup_case();self.capture(env, ports)
        folder = private / 'public';receipt = folder / 'receipt.json';raw = receipt.read_bytes()
        with self.assertRaises(ValueError):D.read_fixed(folder, '../stdout-private.bin', 65536)
        receipt.chmod(0o644)
        with self.assertRaises(ValueError):D.validate_artifact(env)
        receipt.chmod(0o600);receipt.unlink();receipt.symlink_to(private / 'stdout-private.bin')
        with self.assertRaises(OSError):D.validate_artifact(env)
        receipt.unlink();D.write_once(receipt, raw)
        os.link(receipt, folder / 'linked-copy')
        with self.assertRaises(ValueError):D.validate_artifact(env)
        (folder / 'linked-copy').unlink()
        (folder / 'command-output.age').write_bytes(b'age-encryption.org/v1\nTAMPERED')
        with self.assertRaises(ValueError):D.validate_artifact(env)

    def test_workflow_full_local_fixed_upload_paths_and_failure_stays_failure(self):
        workflow = (ROOT / '.github/workflows/local-chapter-map-diagnostic.yml').read_text()
        self.assertIn('diagnose-chapter-map-read.py --run', workflow)
        self.assertIn('diagnose-chapter-map-read.py --validate', workflow)
        self.assertIn('safe-result.json', workflow)
        for value in ('export_chapter_map_cli_failure.py --capture', 'export_chapter_map_cli_failure.py --validate', 'sudo apt-get', 'continue-on-error:', 'secrets.', 'workflow_dispatch:'):
            self.assertNotIn(value, workflow)
        self.assertIn('steps.projection.outputs.safe_artifact', workflow)
        self.assertIn('chapter-map-diagnostic/safe-result.json', workflow)
        self.assertNotIn('command-output.age', workflow);self.assertNotIn('failure_artifact', workflow)
        self.assertIn('retention-days: 1', workflow);self.assertIn('overwrite: false', workflow)


if __name__ == '__main__':
    unittest.main()
