import ast
from pathlib import Path
import tempfile
import unittest
import test_chapter_map_diagnostic as fixture

FLAG = '--config.verify-deps-before-run=false'


class HermeticLauncherTests(unittest.TestCase):
    def test_actual_boundary_rejects_preexisting_plain_version_without_dispatch(self):
        with tempfile.TemporaryDirectory() as folder:
            run, first, calls, io = fixture.FixedCommandStreamTests().boundary(Path(folder), (0, b'2.109.1', b''))
            with self.assertRaises(ValueError):run(['/fixed/pnpm', 'exec', 'supabase', '--version'])
            self.assertEqual(calls, [])

    def test_all_five_fixed_commands_and_no_config_escape(self):
        prefix = ['/fixed/pnpm', FLAG, 'exec', 'supabase']
        cases = [('SUPABASE_VERSION', ['--version']), ('SUPABASE_START', ['start', '--workdir', '/fixed/project', '--exclude', 'FIXED']), ('SUPABASE_DB_RESET', ['db', 'reset', '--local', '--workdir', '/fixed/project']), ('SUPABASE_STATUS', ['status', '--workdir', '/fixed/project', '-o', 'json']), ('SUPABASE_STOP', ['stop', '--workdir', '/fixed/project'])]
        for operation, tail in cases:
            args = prefix + tail
            self.assertEqual(fixture.D.fixed_pnpm_operation(args, prefix[0], Path('/fixed/project'), 'FIXED'), operation)
            for flag in (None, '--config.verify-deps-before-run=true', '--config.verify-deps-before-run=install', '--config.offline=true'):
                wrong = [prefix[0], *([flag] if flag else []), *args[2:]]
                self.assertEqual(fixture.D.fixed_pnpm_operation(wrong, prefix[0], Path('/fixed/project'), 'FIXED'), 'UNKNOWN')
            self.assertEqual(fixture.D.fixed_pnpm_operation(args + ['--debug'], prefix[0], Path('/fixed/project'), 'FIXED'), 'UNKNOWN')

    def test_actual_boundary_forwards_one_hermetic_command_with_original_budget(self):
        with tempfile.TemporaryDirectory() as folder:
            run, first, calls, io = fixture.FixedCommandStreamTests().boundary(Path(folder), (0, b'2.109.1', b''))
            args = ['/fixed/pnpm', FLAG, 'exec', 'supabase', '--version'];env = {'PATH': '/fixed:/usr/bin:/bin'}
            self.assertEqual(run(args, timeout=60, maximum=4 * fixture.D.LIMIT, env=env), b'2.109.1')
            self.assertEqual(len(calls), 1);self.assertEqual(calls[0][0][0], args)
            self.assertEqual(calls[0][1], {'timeout': 60, 'maximum': 4 * fixture.D.LIMIT, 'env': env, 'checked': False, 'capture_stderr': True})
            self.assertIsNone(first());self.assertEqual(list(Path(folder).iterdir()), [])

    def test_real_driver_all_five_call_sites_forward_fixed_flag(self):
        tree = ast.parse(Path(fixture.D.__file__).read_bytes())
        actual = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'actual_experiment')
        calls = [n for n in ast.walk(actual) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'command' and n.args and isinstance(n.args[0], ast.List) and n.args[0].elts and isinstance(n.args[0].elts[0], ast.Name) and n.args[0].elts[0].id == 'pnpm']
        self.assertEqual(len(calls), 5)
        received = []
        def command(args, **options):received.append((args, options));return b'SYNTHETIC'
        scope = {'pnpm': '/fixed/pnpm', 'project': Path('/fixed/project'), 'B': type('Config', (), {'EXCLUDED': 'FIXED'}), 'extra': {'SAFE_CONTEXT': 'fixed'}, 'command': command}
        for call in calls:eval(compile(ast.Expression(call), '<actual-driver-command>', 'eval'), scope)
        self.assertEqual({fixture.D.fixed_pnpm_operation(args, '/fixed/pnpm', Path('/fixed/project'), 'FIXED') for args, _ in received}, {'SUPABASE_VERSION', 'SUPABASE_START', 'SUPABASE_DB_RESET', 'SUPABASE_STATUS', 'SUPABASE_STOP'})
        self.assertEqual(len(received), 5)


if __name__ == '__main__':
    unittest.main()
