"""Synthetic files/processes only: these controls are not encryption proof."""
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest import mock
import contextlib
import copy
import threading

SOURCE = Path(__file__).resolve().parents[2] / "scripts/concurrency/export-local-evidence.py"
SPEC = importlib.util.spec_from_file_location("colorplay_export", SOURCE)
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)

class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / "source"
        self.source.mkdir(mode=0o700)
        self.output = self.root / "evidence.age"
        self.payload = b"SYNTHETIC_PRIVATE_MARKER\x00" * 10
        (self.source / "data.bin").write_bytes(self.payload)
        (self.source / "data.bin").chmod(0o600)
        self.manifest_path = self.source / "approved.json"
        self.manifest = {"schemaVersion": 1, "environment": "local", "sourceRevision": "a" * 40,
                         "executionProfileSha256": "b" * 64, "jobSha256": "c" * 64,
                         "recipient": "age1" + "q" * 58,
                         "files": [{"path": "data.bin", "bytes": len(self.payload),
                                    "sha256": hashlib.sha256(self.payload).hexdigest()}]}
        self.children = []
        self.commands = []
        self.approval = self.write_manifest()

    def tearDown(self):
        for child in self.children:
            if child.poll() is None:
                os.killpg(child.pid, 9)
            child.wait(timeout=2)
            for stream in (child.stdin, child.stdout):
                if stream:
                    stream.close()
        self.temp.cleanup()

    def write_manifest(self):
        raw = json.dumps(self.manifest, ensure_ascii=False).encode()
        self.manifest_path.write_bytes(raw)
        self.manifest_path.chmod(0o600)
        return hashlib.sha256(raw).hexdigest()

    def adapter(self, program="import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())"):
        def start(command):
            self.commands.append(command)
            child = subprocess.Popen([sys.executable, "-c", program], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                     start_new_session=True, bufsize=0)
            self.children.append(child)
            return child
        return start

    def run_export(self, **options):
        return EXPORT.export_evidence(self.source, self.manifest_path, self.approval,
                                      self.output, adapter=options.pop("adapter", self.adapter()), **options)

    def test_synthetic_stream_contains_exact_manifest_and_allowlisted_files(self):
        result = self.run_export()
        self.assertEqual(result["result"], "CIPHER_ARCHIVE_CREATED")
        self.assertEqual(result["retention"], "UNVERIFIED")
        self.assertTrue(result["ownedProcessClosed"])
        self.assertEqual(self.commands, [["/usr/bin/age", "-r", self.manifest["recipient"]]])
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(self.output.read_bytes())), mode="r:") as archive:
            self.assertEqual(archive.getnames(), ["_colorplay/export-manifest.json", "data.bin"])
            self.assertEqual(archive.extractfile("_colorplay/export-manifest.json").read(), self.manifest_path.read_bytes())
            self.assertEqual(archive.extractfile("data.bin").read(), self.payload)
        self.assertEqual(self.children[0].poll(), 0)
        self.assertNotIn("SYNTHETIC_PRIVATE_MARKER", json.dumps(result))

    def assert_unverified(self, result):
        self.assertEqual(result["result"], "UNVERIFIED")
        self.assertEqual(result["retention"], "UNVERIFIED")
        self.assertNotIn("SYNTHETIC_PRIVATE_MARKER", json.dumps(result))
        self.assertTrue(all(child.poll() is not None for child in self.children))

    def test_approval_and_strict_manifest_rejections_before_spawn(self):
        original = copy.deepcopy(self.manifest)
        cases = ["wrong-approval", "hosted", "extra", "missing", "bad-revision", "bad-profile",
                 "private-key", "library-flag", "duplicate", "bool-bytes", "float-bytes", "bad-hash",
                 "too-many", "plaintext-overflow", "manifest-overflow"]
        for case in cases:
            with self.subTest(case=case):
                self.manifest = copy.deepcopy(original)
                if case == "hosted": self.manifest["environment"] = "hosted"
                if case == "extra": self.manifest["arbitrary"] = "SYNTHETIC_PRIVATE_MARKER"
                if case == "missing": del self.manifest["jobSha256"]
                if case == "bad-revision": self.manifest["sourceRevision"] = "main"
                if case == "bad-profile": self.manifest["executionProfileSha256"] = "unknown"
                if case == "private-key": self.manifest["recipient"] = "AGE-SECRET-KEY-SYNTHETIC"
                if case == "library-flag": self.manifest["identity"] = "/private/forbidden-key"
                if case == "duplicate": self.manifest["files"] *= 2
                if case == "bool-bytes": self.manifest["files"][0]["bytes"] = True
                if case == "float-bytes": self.manifest["files"][0]["bytes"] = 1.0
                if case == "bad-hash": self.manifest["files"][0]["sha256"] = "unknown"
                if case == "too-many": self.manifest["files"] *= 20001
                if case == "plaintext-overflow": self.manifest["files"][0]["bytes"] = 2 * 1024**3 + 1
                if case == "manifest-overflow": self.manifest["padding"] = "x" * (8 * 1024**2)
                self.approval = self.write_manifest()
                if case == "wrong-approval": self.approval = "0" * 64
                self.assert_unverified(self.run_export())
                self.assertEqual(self.commands, [])
                self.assertFalse(self.output.exists())

    def test_relative_paths_reserved_namespace_and_duplicates(self):
        for path in ["/data.bin", "", ".", "..", "../data.bin", "a/../data.bin",
                     "a//b", "a/./b", "a\\b", "a\n", "a\0", "_colorplay",
                     "_colorplay/export-manifest.json"]:
            with self.subTest(path=repr(path)):
                self.manifest["files"][0]["path"] = path
                self.approval = self.write_manifest()
                self.assert_unverified(self.run_export())
                self.assertEqual(self.commands, [])

    def test_source_type_permissions_links_missing_size_and_hash(self):
        for index, case in enumerate(["mode", "symlink", "hardlink", "missing", "size", "hash", "fifo"]):
            with self.subTest(case=case):
                path = self.source / "data.bin"
                if path.exists() or path.is_symlink(): path.unlink()
                path.write_bytes(self.payload)
                path.chmod(0o600)
                self.manifest["files"][0].update(bytes=len(self.payload), sha256=hashlib.sha256(self.payload).hexdigest())
                if case == "mode": path.chmod(0o644)
                if case == "symlink":
                    path.unlink()
                    path.symlink_to(self.manifest_path)
                if case == "hardlink": os.link(path, self.source / "second-link")
                if case == "missing": path.unlink()
                if case == "size": self.manifest["files"][0]["bytes"] += 1
                if case == "hash": self.manifest["files"][0]["sha256"] = "0" * 64
                if case == "fifo":
                    path.unlink()
                    os.mkfifo(path, 0o600)
                self.approval = self.write_manifest()
                self.output = self.root / (str(index) + ".age")
                self.assert_unverified(self.run_export())
                self.assertTrue(self.output.exists())

    def test_directory_and_manifest_permissions_and_nonowner(self):
        self.source.chmod(0o755)
        self.assert_unverified(self.run_export())
        self.source.chmod(0o700)
        self.manifest_path.chmod(0o644)
        self.assert_unverified(self.run_export())
        self.manifest_path.chmod(0o600)
        with mock.patch("os.getuid", return_value=os.getuid() + 1):
            self.assert_unverified(self.run_export())
        self.assertEqual(self.commands, [])

    def test_nested_directory_symlinks_and_output_parent(self):
        outside = self.root / "outside"
        outside.mkdir(mode=0o700)
        (outside / "file").write_bytes(self.payload)
        (outside / "file").chmod(0o600)
        (self.source / "nested").symlink_to(outside, target_is_directory=True)
        self.manifest["files"][0]["path"] = "nested/file"
        self.approval = self.write_manifest()
        self.assert_unverified(self.run_export())
        self.output = self.root / "next.age"
        self.manifest["files"][0]["path"] = "data.bin"
        self.approval = self.write_manifest()
        self.root.chmod(0o755)
        self.assert_unverified(self.run_export())
        self.root.chmod(0o700)
        linked = self.root / "linked"
        linked.symlink_to(self.source, target_is_directory=True)
        self.assert_unverified(EXPORT.export_evidence(linked, self.manifest_path, self.approval,
                                                    self.output, adapter=self.adapter()))

    def test_read_time_mutation_never_becomes_created(self):
        payload = os.urandom(1024 * 1024)
        target = self.source / "data.bin"
        target.write_bytes(payload)
        self.manifest["files"][0].update(bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest())
        self.approval = self.write_manifest()
        code = ("import sys;part=sys.stdin.buffer.read(65536);"
                + "f=open(" + repr(str(target)) + ",'r+b');f.seek(-1,2);f.write("
                + repr(bytes([payload[-1] ^ 255])) + ");f.close();"
                + "sys.stdout.buffer.write(part);sys.stdout.buffer.write(sys.stdin.buffer.read())")
        result = self.run_export(adapter=self.adapter(code))
        self.assert_unverified(result)
        self.assertNotEqual(target.read_bytes(), payload)
        self.assertTrue(self.output.exists())

    def test_duplicate_json_keys_do_not_gain_an_approved_schema(self):
        raw = self.manifest_path.read_bytes()[:-1] + b',"environment":"local"}'
        self.manifest_path.write_bytes(raw)
        self.approval = hashlib.sha256(raw).hexdigest()
        self.assert_unverified(self.run_export())
        self.assertEqual(self.commands, [])

    def test_cipher_written_by_age_cannot_change_before_final_readback(self):
        changed = [False]
        def clock():
            if (self.children and self.children[-1].poll() is not None and
                    self.output.exists() and self.output.stat().st_size > 0 and not changed[0]):
                with self.output.open("r+b") as handle:
                    handle.write(b"X")
                changed[0] = True
            return time.monotonic()
        result = self.run_export(clock=clock)
        self.assertTrue(changed[0])
        self.assert_unverified(result)

    def test_existing_output_is_never_overwritten(self):
        original = b"ORIGINAL_CIPHER"
        self.output.write_bytes(original)
        result = self.run_export()
        self.assertEqual(result["code"], "EXPORT_OUTPUT_EXISTS")
        self.assertEqual(self.output.read_bytes(), original)
        self.assertEqual(self.commands, [])

    def test_age_rejection_and_start_failure_are_safe_and_preserve_partial_output(self):
        result = self.run_export(adapter=self.adapter("import sys;sys.stdout.write('PRIVATE_PROVIDER_MARKER');sys.exit(7)"))
        self.assert_unverified(result)
        self.assertNotIn("PRIVATE_PROVIDER_MARKER", json.dumps(result))
        self.assertTrue(self.output.exists())
        self.output = self.root / "start-failure.age"
        def failed(_command): raise RuntimeError("PRIVATE_PROVIDER_MARKER")
        self.assert_unverified(self.run_export(adapter=failed))
        self.assertTrue(self.output.exists())

    def test_cipher_limit_stops_and_reaps_process_without_exceeding_cap(self):
        code = "import sys;sys.stdout.buffer.write(b'x'*(100*1024*1024+1));sys.stdout.buffer.flush()"
        result = self.run_export(adapter=self.adapter(code))
        self.assert_unverified(result)
        self.assertEqual(result["code"], "EXPORT_CIPHER_LIMIT")
        self.assertLessEqual(self.output.stat().st_size, 100 * 1024**2)

    def test_deadline_and_interrupt_terminate_blocked_age(self):
        for case in ["deadline", "interrupt"]:
            with self.subTest(case=case):
                self.output = self.root / (case + ".age")
                spawned = [False]
                start = self.adapter("import time;time.sleep(10)")
                def adapter(command):
                    process = start(command)
                    spawned[0] = True
                    return process
                result = self.run_export(adapter=adapter,
                                         clock=lambda: 119.2 if case == "deadline" and spawned[0] else 0,
                                         cancelled=lambda: case == "interrupt" and spawned[0])
                self.assert_unverified(result)
                self.assertTrue(result["ownedProcessClosed"])
                self.assertEqual(result["code"], "EXPORT_TIMEOUT" if case == "deadline" else "EXPORT_INTERRUPTED")
                self.assertTrue(self.output.exists())

    def test_no_fd_or_thread_growth_and_no_unlisted_payload(self):
        (self.source / "not-approved.txt").write_text("NEVER_ARCHIVE")
        directory = Path("/proc/self/fd") if Path("/proc/self/fd").exists() else Path("/dev/fd")
        before = len(list(directory.iterdir()))
        threads = {thread.ident for thread in threading.enumerate()}
        for index in range(4):
            self.output = self.root / ("closed-" + str(index) + ".age")
            self.assertEqual(self.run_export()["result"], "CIPHER_ARCHIVE_CREATED")
            for child in self.children:
                self.assertTrue(child.stdin.closed and child.stdout.closed)
        self.assertEqual(len(list(directory.iterdir())), before)
        self.assertEqual({thread.ident for thread in threading.enumerate()}, threads)

    def test_native_cli_rejects_darwin_without_spawning_age(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        platform = contextlib.nullcontext() if sys.platform == "darwin" else mock.patch("sys.platform", "darwin")
        with platform, contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = EXPORT.main(["--source-root", str(self.source), "--manifest", str(self.manifest_path),
                                  "--approve", self.approval, "--output", str(self.output)])
        self.assertEqual(result, 1)
        self.assertEqual(json.loads(stdout.getvalue())["code"], "EXPORT_PLATFORM_UNSUPPORTED")
        self.assertFalse(self.output.exists())
        self.assertEqual(stderr.getvalue(), "")
        self.assertEqual(self.children, [])

    def test_cli_does_not_echo_private_arguments_or_accept_identity_flags(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = EXPORT.main(["--identity", "SYNTHETIC_PRIVATE_MARKER"])
        self.assertEqual(result, 1)
        self.assertNotIn("SYNTHETIC_PRIVATE_MARKER", stdout.getvalue() + stderr.getvalue())
        self.assertEqual(json.loads(stdout.getvalue())["result"], "UNVERIFIED")


if __name__ == "__main__":
    unittest.main()
