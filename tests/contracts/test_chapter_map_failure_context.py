import ast
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import contextlib
import io
import base64
import hashlib
import os
from test_chapter_map_diagnostic import public_fixture

ROOT = Path(__file__).resolve().parents[2]
def module(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    value = importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value
D = module('failure_driver', 'scripts/concurrency/diagnose-chapter-map-read.py')
E = module('failure_export', 'scripts/concurrency/export_chapter_map_cli_failure.py')


class ContextTests(unittest.TestCase):
    def test_actual_exception_finally_retains_primary_before_cleanup(self):
        tree = ast.parse(Path(D.__file__).read_bytes())
        actual = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'actual_experiment')
        branch = copy.deepcopy(next(n for n in actual.body if isinstance(n, ast.Try)))
        branch.body = ast.parse("raise ValueError('SYNTHETIC_PRIMARY_SECRET')").body
        with tempfile.TemporaryDirectory() as folder:
            report = {'sourceRevision': 'a'*40, 'stage': 'HTTP_39', 'collection': 'OBSERVED', 'resourcesClosed': False, 'controlCommandFailure': False}
            def cleanup(*args, **kwargs):raise ValueError('SYNTHETIC_CLEANUP_SECRET')
            scope = dict(vars(D), io=SimpleNamespace(), report=report, private=Path(folder), started=True, project=Path('/fixed/project'), isolation={'backend': 'owned.slice'}, containers=None, database=None, C=SimpleNamespace(ROLES=set(), PROJECT='fixed'), B=SimpleNamespace(DOCKER=[]), docker=None, pnpm='/fixed/pnpm', extra={}, graceful_close=cleanup, first_control_failure=None, original_run=lambda *a, **k: self.fail('unexpected inspect'))
            scope['failure_context'] = {'sourceRevision': 'a'*40, 'primaryCompleted': False, 'primaryException': None, 'cleanupException': None, 'publicationException': None, 'postFailureInspect': {'collection': 'UNOBSERVED', 'rows': []}}
            exec(compile(ast.fix_missing_locations(ast.Module(body=[branch], type_ignores=[])), '<actual-primary-finally>', 'exec'), scope)
            path = Path(folder) / 'diagnostic-context-private.json'
            self.assertTrue(path.exists(), 'actual primary/finally did not persist failure context')
            value = json.loads(path.read_bytes())
            self.assertEqual(value['primaryException']['stage'], 'HTTP_39')
            self.assertEqual(value['cleanupException']['stage'], 'CLEANUP')
            self.assertFalse(value['primaryCompleted']);self.assertFalse(report['resourcesClosed'])
            self.assertNotIn('SYNTHETIC_PRIMARY_SECRET', path.read_text())
            self.assertNotIn('SYNTHETIC_CLEANUP_SECRET', path.read_text())



ROLES = {'db', 'rest', 'auth', 'kong', 'realtime', 'storage', 'inbucket', 'edge_runtime'}


def owned_rows():
    return [{'Id': format(i, '064x'), 'Name': '/supabase_' + role + '_fixed', 'Config': {'Labels': {'com.supabase.cli.project': 'fixed'}, 'Env': ['SECRET_ENV=DO_NOT_PERSIST'], 'StopSignal': 'SIGINT' if role == 'db' else ''}, 'State': {'Running': True, 'Pid': 1000 + i, 'ExitCode': 0, 'OOMKilled': False}, 'RestartCount': 0} for i, role in enumerate(sorted(ROLES))]


class CleanupEvidenceTests(unittest.TestCase):
    def test_postfailure_owned8_inspect_once_projection_never_closes_resources(self):
        rows = owned_rows();database = next(row['Id'] for row in rows if row['Name'] == '/supabase_db_fixed')
        calls = []
        def read(ids):calls.append(ids);return json.dumps(rows).encode()
        value = D.post_failure_inspect(rows, database, ROLES, 'fixed', read)
        self.assertEqual(len(calls), 1);self.assertEqual(len(calls[0]), 8)
        self.assertEqual(value['collection'], 'OBSERVED');self.assertEqual(len(value['rows']), 8)
        self.assertTrue(all(row['Running'] for row in value['rows']))
        self.assertTrue(all(row['ownerMatches'] for row in value['rows']))
        self.assertNotIn('resourcesClosed', value);self.assertNotIn('SECRET_ENV', str(value))
        self.assertFalse(any('Id' in row or 'Config' in row for row in value['rows']))

    def test_unknown_or_foreign_original_ownership_never_probes(self):
        rows = owned_rows();database = next(row['Id'] for row in rows if row['Name'] == '/supabase_db_fixed')
        foreign = copy.deepcopy(rows);foreign[0]['Config']['Labels']['com.supabase.cli.project'] = 'foreign'
        for original, db in ((None, None), (rows, None), (rows[:7], database), (foreign, database)):
            value = D.post_failure_inspect(original, db, ROLES, 'fixed', lambda ids: self.fail('foreign/unproven probe'))
            self.assertEqual(value, {'collection': 'UNOBSERVED', 'rows': []})

    def test_postfailure_missing_foreign_and_read_error_stay_unavailable(self):
        rows = owned_rows();database = next(row['Id'] for row in rows if row['Name'] == '/supabase_db_fixed')
        foreign = copy.deepcopy(rows);foreign[0]['Name'] = '/FOREIGN'
        for response in (rows[:7], foreign, []):
            value = D.post_failure_inspect(rows, database, ROLES, 'fixed', lambda ids: json.dumps(response).encode())
            self.assertEqual(value['collection'], 'UNAVAILABLE')
        def failed(ids):raise RuntimeError('SYNTHETIC_SECRET_ERROR')
        self.assertEqual(D.post_failure_inspect(rows, database, ROLES, 'fixed', failed), {'collection': 'UNAVAILABLE', 'rows': []})

    def test_actual_finally_probe_bounds_first_control_and_no_closure_upgrade(self):
        tree = ast.parse(Path(D.__file__).read_bytes());actual = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'actual_experiment')
        branch = copy.deepcopy(next(n for n in actual.body if isinstance(n, ast.Try)))
        branch.body = ast.parse("raise ValueError('SYNTHETIC_PRIMARY_SECRET')").body
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            rows = owned_rows();database = next(row['Id'] for row in rows if row['Name'] == '/supabase_db_fixed');calls = []
            def read(args, **options):calls.append((args, options));return json.dumps(rows).encode()
            def cleanup(*args, **kwargs):raise RuntimeError('SYNTHETIC_CLEANUP_SECRET')
            report = {'sourceRevision': 'a'*40, 'stage': 'HTTP_59', 'collection': 'OBSERVED', 'resourcesClosed': False, 'controlCommandFailure': True}
            first = {'kind': 'FIRST_CONTROL_FAILURE', 'operation': 'SUPABASE_START', 'stage': 'BACKEND'}
            diagnostic = {'sourceRevision': 'a'*40, 'primaryCompleted': False, 'primaryException': None, 'cleanupException': None, 'publicationException': None, 'postFailureInspect': {'collection': 'UNOBSERVED', 'rows': []}}
            scope = dict(vars(D), io=SimpleNamespace(), report=report, private=Path(folder), started=True, project=Path('/fixed/project'), isolation={'backend': 'owned.slice'}, containers=rows, database=database, C=SimpleNamespace(ROLES=ROLES, PROJECT='fixed'), B=SimpleNamespace(DOCKER=['fixed-docker']), docker=None, pnpm='/fixed/pnpm', extra={}, path_env={'PATH': '/fixed:/usr/bin:/bin'}, graceful_close=cleanup, first_control_failure=first, original_run=read, failure_context=diagnostic)
            exec(compile(ast.fix_missing_locations(ast.Module(body=[branch], type_ignores=[])), '<actual-primary-finally>', 'exec'), scope)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0], ['fixed-docker', 'inspect', *[r['Id'] for r in rows]])
            self.assertEqual(calls[0][1], {'timeout': 10, 'maximum': D.LIMIT, 'env': {'PATH': '/fixed:/usr/bin:/bin'}})
            self.assertFalse(report['resourcesClosed']);self.assertEqual(report['collection'], 'UNAVAILABLE')
            self.assertEqual(first['operation'], 'SUPABASE_START');self.assertEqual(first['stage'], 'BACKEND')
            self.assertEqual(diagnostic['primaryException']['stage'], 'HTTP_59')
            self.assertEqual(diagnostic['cleanupException']['stage'], 'CLEANUP')

    def test_success_finally_has_no_failure_context_or_postfailure_probe(self):
        tree = ast.parse(Path(D.__file__).read_bytes());actual = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'actual_experiment')
        branch = copy.deepcopy(next(n for n in actual.body if isinstance(n, ast.Try)))
        branch.body = ast.parse("report['collection']='OBSERVED'; failure_context['primaryCompleted']=True").body
        with tempfile.TemporaryDirectory() as folder:
            report = {'stage': 'CLEANUP', 'collection': 'OBSERVED', 'resourcesClosed': False, 'controlCommandFailure': False}
            scope = dict(vars(D), io=SimpleNamespace(), report=report, private=Path(folder), started=True, project=Path('/fixed/project'), isolation={'backend': 'fixed'}, containers=None, database=None, C=SimpleNamespace(ROLES=ROLES, PROJECT='fixed'), B=SimpleNamespace(DOCKER=[]), docker=None, pnpm='/fixed/pnpm', extra={}, graceful_close=lambda *a: {'collection': 'OBSERVED'}, first_control_failure=None, original_run=lambda *a, **k: self.fail('unexpected postfailure read'), failure_context={'primaryCompleted': False}, validate_public=lambda value: b'FIXED_SUCCESS')
            exec(compile(ast.fix_missing_locations(ast.Module(body=[branch], type_ignores=[])), '<actual-success-finally>', 'exec'), scope)
            self.assertFalse((Path(folder) / 'diagnostic-context-private.json').exists())
            self.assertEqual((Path(folder) / 'safe-result.json').read_bytes(), b'FIXED_SUCCESS')
            self.assertTrue(report['resourcesClosed'])


class DriverFailureExportTests(unittest.TestCase):
    def case(self, optional=False):
        temporary = tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        parent = Path(temporary.name).resolve();folder = parent / E.DRIVER_FOLDER;folder.mkdir(mode=0o700)
        env = {'RUNNER_TEMP': str(parent), 'GITHUB_REPOSITORY': E.REPOSITORY, 'GITHUB_REF': E.BRANCH, 'GITHUB_JOB': 'chapter-map-diagnostic', 'GITHUB_WORKFLOW_REF': E.REPOSITORY + '/' + E.WORKFLOW + '@' + E.BRANCH, 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_RUN_ID': '123', 'GITHUB_SHA': 'a'*40}
        outcome = {**public_fixture(), 'sourceRevision': 'a'*40, 'resourcesClosed': False}
        diagnostic = {'sourceRevision': 'a'*40, 'stage': 'BACKEND', 'primaryCompleted': False, 'primaryException': None, 'cleanupException': None, 'publicationException': None, 'postFailureInspect': {'collection': 'UNOBSERVED', 'rows': []}}
        E.write_once(folder / 'outcome-private.json', json.dumps(outcome).encode())
        E.write_once(folder / 'diagnostic-context-private.json', json.dumps(diagnostic).encode())
        if optional:
            E.write_once(folder / 'control-failure-private.json', b'{"SYNTHETIC_SECRET":true}')
            E.write_once(folder / 'first-command-stdout-private.bin', b'SYNTHETIC_RAW_SECRET')
            E.write_once(folder / 'first-command-stderr-private.bin', b'')
        calls = []
        def age(args, source, **options):
            calls.append((args, source, options))
            return 0, b'age-encryption.org/v1\nSYNTHETIC_CIPHER', b'SYNTHETIC_AGE_SECRET'
        return env, folder, calls, age

    def export(self, env, age):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):result = E.export_driver_failure(env, age)
        self.assertNotIn('SYNTHETIC_SECRET', output.getvalue());self.assertNotIn('SYNTHETIC_RAW_SECRET', output.getvalue())
        return result, output.getvalue()

    def test_fixed_required_optional_leaves_encrypt_and_bind_metadata(self):
        for optional, count in ((False, 2), (True, 5)):
            env, folder, calls, age = self.case(optional)
            result, console = self.export(env, age)
            self.assertEqual(result, 0);self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0], ['/usr/bin/age', '--encrypt', '--recipient', E.RECIPIENT])
            self.assertEqual(calls[0][2]['timeout'], 30);self.assertEqual(calls[0][2]['maximum'], 12*1024**2)
            plain = calls[0][2]['data'];envelope = json.loads(plain)
            receipt = json.loads(console);self.assertEqual(receipt['fileCount'], count)
            self.assertEqual(receipt['kind'], 'LOCAL_RPC_DIAGNOSTIC_FAILURE')
            self.assertEqual(receipt['payloadBytes'], len(plain));self.assertEqual(receipt['payloadSha256'], hashlib.sha256(plain).hexdigest())
            for key, value in envelope['manifest'].items():self.assertEqual(receipt[key], value)
            self.assertEqual(set(entry['leaf'] for entry in envelope['files']), set(E.DRIVER_FILES[:count]))
            for entry in envelope['files']:
                raw = base64.b64decode(entry['base64']);self.assertEqual(len(raw), entry['bytes']);self.assertEqual(hashlib.sha256(raw).hexdigest(), entry['sha256'])
                self.assertEqual(raw, (folder / entry['leaf']).read_bytes())
            self.assertTrue(E.validate_driver_failure(env))
            for file in (folder / 'failure-public').iterdir():
                self.assertEqual(file.stat().st_mode & 0o777, 0o600)
                with self.assertRaises(FileExistsError):E.write_once(file, b'NO_OVERWRITE')
            self.assertEqual(E.STREAM_LIMIT, 65536);self.assertEqual(E.ARTIFACT_LIMIT, 262144)

    def test_required_missing_and_foreign_or_extra_context_rejected(self):
        for change in ('missing', 'source', 'extra'):
            env, folder, calls, age = self.case()
            target = folder / 'diagnostic-context-private.json'
            if change == 'missing':target.unlink()
            else:
                value = json.loads(target.read_bytes());value['sourceRevision' if change == 'source' else 'SECRET_EXTRA'] = 'b'*40
                target.write_bytes(json.dumps(value).encode())
            with self.assertRaises((ValueError, OSError)):self.export(env, age)
            self.assertEqual(calls, []);self.assertFalse((folder / 'failure-public').exists())

    def test_optional_illegal_mode_symlink_hardlink_and_size_rejected(self):
        for change in ('mode', 'symlink', 'hardlink', 'size'):
            env, folder, calls, age = self.case(True);target = folder / E.DRIVER_FILES[-1]
            if change == 'mode':target.chmod(0o644)
            elif change == 'symlink':target.unlink();target.symlink_to(folder / E.DRIVER_FILES[0])
            elif change == 'hardlink':os.link(target, folder / 'linked-copy')
            else:
                with target.open('wb') as stream:stream.truncate(E.DRIVER_FILE_LIMIT + 1)
            with self.assertRaises((ValueError, OSError)):self.export(env, age)
            self.assertEqual(calls, [])
        env, folder, calls, age = self.case()
        with self.assertRaises(ValueError):E.read_driver_leaf(folder, '../fixture-private.json')

    def test_receipt_extra_hash_context_recipient_and_cipher_cap_rejected(self):
        env, folder, calls, age = self.case();self.export(env, age)
        public = folder / 'failure-public';receipt = json.loads((public / 'receipt.json').read_bytes());cipher = (public / 'diagnostic-output.age').read_bytes()
        for patch in ({'secret': 'SYNTHETIC'}, {'sourceRevision': 'b'*40}, {'recipientSha256': '0'*64}, {'cipherSha256': '0'*64}, {'payloadSha256': 'bad'}, {'fileCount': 1}, {'executionAuthority': 'VERIFIED'}):
            with self.subTest(patch=list(patch)), self.assertRaises(ValueError):E.validate_driver_receipt({**receipt, **patch}, E.context(env), cipher)
        (public / 'diagnostic-output.age').write_bytes(b'age-encryption.org/v1\nTAMPER')
        with self.assertRaises(ValueError):E.validate_driver_failure(env)



class PublicationTests(unittest.TestCase):
    def test_actual_publication_failure_keeps_wx_observed_outcome_and_context(self):
        tree = ast.parse(Path(D.__file__).read_bytes());actual = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'actual_experiment')
        branch = copy.deepcopy(next(n for n in actual.body if isinstance(n, ast.Try)))
        branch.body = ast.parse("report['collection']='OBSERVED'; failure_context['primaryCompleted']=True").body
        with tempfile.TemporaryDirectory() as folder:
            private = Path(folder);report = public_fixture();report['sourceRevision'] = 'a'*40
            diagnostic = {'sourceRevision': 'a'*40, 'primaryCompleted': False, 'primaryException': None, 'cleanupException': None, 'publicationException': None, 'postFailureInspect': {'collection': 'UNOBSERVED', 'rows': []}}
            def reject(value):raise ValueError('SYNTHETIC_PUBLICATION_SECRET')
            scope = dict(vars(D), io=SimpleNamespace(), report=report, private=private, started=False, project=None, first_control_failure=None, failure_context=diagnostic, validate_public=reject)
            exec(compile(ast.fix_missing_locations(ast.Module(body=[branch], type_ignores=[])), '<actual-publication-finally>', 'exec'), scope)
            stored = json.loads((private / 'outcome-private.json').read_bytes())
            context = json.loads((private / 'diagnostic-context-private.json').read_bytes())
            self.assertEqual(stored['collection'], 'OBSERVED');self.assertEqual(report['collection'], 'UNAVAILABLE')
            self.assertTrue(context['primaryCompleted']);self.assertIsNone(context['primaryException'])
            self.assertEqual(context['publicationException']['stage'], 'PUBLICATION')
            self.assertNotIn('SYNTHETIC_PUBLICATION_SECRET', str(context))
            self.assertFalse((private / 'safe-result.json').exists())
            E.validate_driver_inputs({'outcome-private.json': (private / 'outcome-private.json').read_bytes(), 'diagnostic-context-private.json': (private / 'diagnostic-context-private.json').read_bytes()}, {'sourceRevision': 'a'*40})

    def test_required_missing_and_aggregate_plaintext_limit_fail_before_age(self):
        case = DriverFailureExportTests()
        try:
            env, folder, calls, age = case.case()
            (folder / 'outcome-private.json').unlink()
            with self.assertRaises(ValueError):E.export_driver_failure(env, age)
            self.assertEqual(calls, [])
            env, folder, calls, age = case.case()
            for name in ('first-command-stdout-private.bin', 'first-command-stderr-private.bin'):
                file = folder / name
                with file.open('xb') as stream:stream.truncate(E.DRIVER_FILE_LIMIT)
                file.chmod(0o600)
            with self.assertRaises(ValueError):E.export_driver_failure(env, age)
            self.assertEqual(calls, [])
        finally:case.doCleanups()

    def test_driver_cipher_total_cap_and_age_failure_no_publication(self):
        case = DriverFailureExportTests()
        try:
            env, folder, calls, age = case.case()
            def failed(*args, **options):return 1, b'', b'SYNTHETIC_SECRET'
            with self.assertRaises(ValueError):E.export_driver_failure(env, failed)
            self.assertFalse((folder / 'failure-public').exists())
            self.assertFalse(E.validate_driver_failure(env))
            E.export_driver_failure(env, age)
            receipt = json.loads((folder / 'failure-public/receipt.json').read_bytes())
            big = b'age-encryption.org/v1\n' + b'x' * E.DRIVER_ARTIFACT_LIMIT
            receipt.update(cipherBytes=len(big), cipherSha256=hashlib.sha256(big).hexdigest())
            with self.assertRaises(ValueError):E.validate_driver_receipt(receipt, E.context(env), big)
        finally:case.doCleanups()



class FailureOnlyChannelR1Tests(unittest.TestCase):
    def test_actual_primary_fail_closed_cleanup_never_publishes_safe_result(self):
        tree = ast.parse(Path(D.__file__).read_bytes());actual = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'actual_experiment')
        branch = copy.deepcopy(next(n for n in actual.body if isinstance(n, ast.Try)))
        branch.body = ast.parse("raise ValueError('SYNTHETIC_PRIMARY_SECRET')").body
        with tempfile.TemporaryDirectory() as folder:
            report = public_fixture();report['sourceRevision'] = 'a'*40
            diagnostic = {'sourceRevision': 'a'*40, 'primaryCompleted': False, 'primaryException': None, 'cleanupException': None, 'publicationException': None, 'postFailureInspect': {'collection': 'UNOBSERVED', 'rows': []}}
            stopped = {'collection': 'OBSERVED', 'services': 8, 'signalClasses': [{'role': role, 'signal': 'DEFAULT_TERM'} for role in sorted(ROLES)]}
            scope = dict(vars(D), io=SimpleNamespace(), report=report, private=Path(folder), started=True, project=Path('/fixed/project'), isolation={'backend': 'fixed'}, containers=None, database=None, C=SimpleNamespace(ROLES=ROLES, PROJECT='fixed'), B=SimpleNamespace(DOCKER=[]), docker=None, pnpm='/fixed/pnpm', extra={}, graceful_close=lambda *a: stopped, first_control_failure=None, original_run=lambda *a, **k: self.fail('unexpected postfailure read'), failure_context=diagnostic)
            exec(compile(ast.fix_missing_locations(ast.Module(body=[branch], type_ignores=[])), '<actual-primary-closed-finally>', 'exec'), scope)
            self.assertTrue(report['resourcesClosed']);self.assertEqual(report['collection'], 'UNAVAILABLE')
            self.assertFalse((Path(folder) / 'safe-result.json').exists())
            self.assertTrue((Path(folder) / 'diagnostic-context-private.json').exists())
            self.assertTrue((Path(folder) / 'outcome-private.json').exists())

    def test_actual_validate_mode_rejects_unavailable_even_when_schema_valid(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            private = Path(folder) / 'chapter-map-diagnostic';private.mkdir(mode=0o700)
            value = public_fixture();D.private_write(private / 'safe-result.json', D.validate_public(value))
            output = Path(folder) / 'github-output'
            env = {'RUNNER_TEMP': folder, 'GITHUB_SHA': value['sourceRevision'], 'GITHUB_REPOSITORY': D.REPOSITORY, 'GITHUB_REF': D.BRANCH, 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_OUTPUT': str(output)}
            with patch.object(D.sys, 'argv', ['driver', '--validate']), patch.dict(D.os.environ, env, clear=True):
                with self.assertRaises(ValueError):D.main()
            self.assertFalse(output.exists())


if __name__ == '__main__':unittest.main()
