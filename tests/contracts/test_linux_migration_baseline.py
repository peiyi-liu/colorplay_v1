"""Current tracked candidate at the actual projection and snapshot boundaries."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2]
DIRECTORY = SOURCE / 'scripts/concurrency'
sys.path.insert(0, str(DIRECTORY))
from test_linux_local_bootstrap import Fixture
import linux_bootstrap_backend as B
import linux_bootstrap_contracts as C
import linux_project_inputs as I
import linux_status_contracts as D

NEW_MIGRATION = 'supabase/migrations/20261121000100_teacher_overview_completion_lookup.sql'
NEW_SHA = '1846a69bdff6183e21675b7c554b8beec7952c4f92bb6f06ccb9611c463cac75'
PRIOR_MIGRATION = 'supabase/migrations/20261119000100_live_host_answer_progress.sql'
PRIOR_SHA = '80b3e9890cd2551aee797ec16d3306072ebb4f75b75695936bb381189c45d592'


def tracked_source():
    raw = subprocess.check_output(['/usr/bin/git', 'ls-files', '-z', '--', 'supabase'], cwd=SOURCE)
    return [name for name in raw.decode().split('\0') if name]


def migrate_names(tracked):
    return [name for name in tracked if name.startswith('supabase/migrations/') and name.endswith('.sql')]


class MigrationBaselineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.fixture = Fixture(Path(self.temporary.name).resolve())
        self.tracked = tracked_source()
        self.assertEqual(len(migrate_names(self.tracked)), 123)
        self.assertIn(NEW_MIGRATION, self.tracked)
        self.assertIn(PRIOR_MIGRATION, self.tracked)
        self.assertEqual(C.digest((SOURCE / PRIOR_MIGRATION).read_bytes()), PRIOR_SHA)
        self.assertEqual(C.digest((SOURCE / NEW_MIGRATION).read_bytes()), NEW_SHA)
        self.fixture.runtime.mkdir(mode=0o700)

    def project(self, tracked):
        self.fixture.tracked = tracked
        proof = I.capture_project_inputs(SOURCE, tracked)
        return B.project(self.fixture, SOURCE, self.fixture.runtime, self.fixture.tools, proof, I.proof_sha256(proof))

    def no_services(self):
        allowed = {'/usr/bin/git', self.fixture.tools['node']['path']}
        self.assertTrue(all(command[0] in allowed for command, _ in self.fixture.commands))
        self.assertFalse(self.fixture.started)
        self.assertEqual(self.fixture.writes, [])
        self.assertEqual(self.fixture.reads, [])

    def test_actual_current_source_projects_all123_without_services(self):
        try:
            project, _, hashes, _, _ = self.project(self.tracked)
        except C.BootstrapError as error:
            self.fail('CURRENT_TRACKED_123_REJECTED:' + str(error))
        self.assertEqual(project, self.fixture.runtime / 'local-project')
        copied = list((project / 'supabase/migrations').glob('*.sql'))
        self.assertEqual(len(copied), 123)
        self.assertEqual(hashes[NEW_MIGRATION], NEW_SHA)
        self.assertEqual(hashes[PRIOR_MIGRATION], PRIOR_SHA)
        self.assertEqual(C.digest((project / PRIOR_MIGRATION).read_bytes()), PRIOR_SHA)
        self.assertEqual(C.digest((project / NEW_MIGRATION).read_bytes()), NEW_SHA)
        I.verify_copied_inputs(project, I.capture_project_inputs(SOURCE, self.tracked))
        self.no_services()

    def test_old122_and_extra124_are_rejected_before_copy_or_services(self):
        for delta in (-1, 1):
            with self.subTest(delta=delta), tempfile.TemporaryDirectory() as directory:
                self.fixture = Fixture(Path(directory).resolve())
                self.fixture.runtime.mkdir(mode=0o700)
                names = [name for name in self.tracked if name != NEW_MIGRATION] if delta < 0 else [*self.tracked, 'supabase/migrations/99999999999999_m119_unapproved.sql']
                self.assertEqual(len(migrate_names(names)), 123 + delta)
                with self.assertRaises(C.BootstrapError) as failure:
                    self.project(names)
                self.assertEqual(str(failure.exception), 'BOOTSTRAP_ADMISSION_INVALID')
                target = self.fixture.runtime / 'local-project'
                self.assertFalse(any(p.is_file() for p in target.rglob('*')))
                self.no_services()

    def test_actual_snapshot_guards_reject_old_or_future_count(self):
        spec = importlib.util.spec_from_file_location('m84_functional_preflight', DIRECTORY / 'linux-operator/functional-preflight.py')
        preflight = importlib.util.module_from_spec(spec)
        operator = str(DIRECTORY / 'linux-operator')
        sys.path.insert(0, operator)
        try:
            spec.loader.exec_module(preflight)
        finally:
            sys.path.remove(operator)
        canonical = dict(D.EXPECTED_BASELINE)
        self.assertEqual(canonical['migrations'], 123)
        for migrations in (120, 121, 122, 123, 124, True):
            with self.subTest(migrations=migrations):
                counts = {**canonical, 'migrations': migrations}
                readback = D.empty_readback()
                readback['database'] = {'state': 'PASS', 'counts': counts}
                self.assertEqual(D.safe_readback(readback) is not None, migrations == 123)
                value = {'systemIdentifier': '123456789', 'baseline': {key: counts[key] for key in ('migrations', 'publicTables', 'publicWithoutRls', *preflight.TABLES)}}
                if migrations == 123:
                    self.assertEqual(preflight.snapshot(value, '123456789')['baseline']['migrations'], 123)
                else:
                    with self.assertRaisesRegex(AssertionError, 'FRESH_BASELINE_INVALID'):
                        preflight.snapshot(value, '123456789')

    def test_actual_capacity_snapshot_uses_the_same_fixed_count(self):
        spec = importlib.util.spec_from_file_location('m84_capacity_root', DIRECTORY / 'linux-operator/capacity-root-readonly.py')
        module = importlib.util.module_from_spec(spec)
        operator = str(DIRECTORY / 'linux-operator')
        sys.path.insert(0, operator)
        try:
            spec.loader.exec_module(module)
        finally:
            sys.path.remove(operator)
        identity = C.PROJECT + ':123456789:postgres'
        scope = {'databaseIdentitySha256': C.digest(identity.encode())}
        for migrations in (120, 121, 122, 123, 124, True):
            with self.subTest(migrations=migrations):
                row = {'systemIdentifier': '123456789', 'checkedAtDatabaseUtc': '2026-11-19T00:00:00Z',
                       'migrations': migrations, 'publicTables': 71, 'publicWithoutRls': 0,
                       **{key: [] for key in ('auth','profiles','classrooms','memberships','xp_transactions','wallet_transactions')}}
                with patch.object(module, 'query', return_value=row) as query:
                    if migrations == 123:
                        self.assertEqual(module.snapshot(scope)['migrations'], 123)
                    else:
                        with self.assertRaisesRegex(AssertionError, 'DATABASE_IDENTITY_INVALID'):
                            module.snapshot(scope)
                    query.assert_called_once()
                    self.assertTrue(query.call_args.args[0].startswith('begin read only;'))
                    self.assertTrue(query.call_args.args[0].endswith('rollback;'))


if __name__ == '__main__':
    unittest.main()
