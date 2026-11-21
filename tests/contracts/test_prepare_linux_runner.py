"""Verify archive admission with real temp files, without downloads or installs."""
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('runner_setup', Path(__file__).resolve().parents[2] / 'scripts/concurrency/prepare-linux-runner.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def archive(rows):
    body = io.BytesIO()
    with tarfile.open(fileobj=body, mode='w:gz') as handle:
        for name, value, kind in rows:
            item = tarfile.TarInfo(name)
            item.type = kind
            if kind == tarfile.REGTYPE:
                item.size = len(value)
                handle.addfile(item, io.BytesIO(value))
            else:
                item.linkname = value.decode()
                handle.addfile(item)
    return body.getvalue()


class ToolchainArchivesTests(unittest.TestCase):
    def test_only_selected_regular_binary_is_installed_with_private_executable_mode(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'node'
            raw = archive([('expected/node', b'executable', tarfile.REGTYPE), ('../unselected', b'unused', tarfile.REGTYPE)])
            module.single_binary(raw, 'expected/node', output)
            self.assertEqual(output.read_bytes(), b'executable')
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            with self.assertRaises(FileExistsError):
                module.single_binary(raw, 'expected/node', output)

    def test_selected_link_or_duplicate_is_rejected(self):
        for rows in [[('expected/node', b'/bin/sh', tarfile.SYMTYPE)], [('expected/node', b'a', tarfile.REGTYPE), ('expected/node', b'b', tarfile.REGTYPE)]]:
            with tempfile.TemporaryDirectory() as folder, self.assertRaises(ValueError):
                module.single_binary(archive(rows), 'expected/node', Path(folder) / 'node')

    def test_pnpm_package_refuses_escape_and_link_without_touching_outside(self):
        for row in [('package/../../escape', b'bad', tarfile.REGTYPE), ('package/link', b'/bin/sh', tarfile.SYMTYPE)]:
            with tempfile.TemporaryDirectory() as folder:
                before = module.TOOLS
                module.TOOLS = Path(folder)
                try:
                    with self.assertRaises(ValueError):
                        module.install_pnpm(archive([row]))
                    self.assertFalse((Path(folder).parent / 'escape').exists())
                finally:
                    module.TOOLS = before
