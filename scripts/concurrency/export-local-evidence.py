"""Local file export only. Creation never attests decryption or retention."""
import argparse
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import selectors
import signal
import stat
import subprocess
import sys
import tarfile
import threading
import time

MANIFEST_LIMIT = 8 * 1024**2
PLAINTEXT_LIMIT = 2 * 1024**3
CIPHER_LIMIT = 100 * 1024**2
DEADLINE_SECONDS = 120
ARCHIVE_MANIFEST = "_colorplay/export-manifest.json"
HEX64 = re.compile(r"[a-f0-9]{64}\Z")
RECIPIENT = re.compile(r"age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}\Z")


class ExportFailure(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def require(condition, code="EXPORT_SOURCE_INVALID"):
    if not condition:
        raise ExportFailure(code)


def fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_mode,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def owned(info, directory=False):
    require(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) ==
            (0o700 if directory else 0o600))
    require(stat.S_ISDIR(info.st_mode) if directory else
            stat.S_ISREG(info.st_mode) and info.st_nlink == 1)


def owned_directory(path):
    path = Path(path)
    require(path.is_absolute() and os.path.realpath(path) == str(path))
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        owned(os.fstat(fd), True)
        return fd
    except BaseException:
        os.close(fd)
        raise


def relative_path(path):
    require(isinstance(path, str) and 0 < len(path.encode()) <= 4096,
            "EXPORT_MANIFEST_INVALID")
    require(not any(ord(c) < 32 or ord(c) == 127 for c in path) and "\\" not in path,
            "EXPORT_MANIFEST_INVALID")
    p = PurePosixPath(path)
    require(not p.is_absolute() and str(p) == path and
            all(x not in (".", "..") for x in p.parts) and bool(p.parts) and
            p.parts[0] != "_colorplay", "EXPORT_MANIFEST_INVALID")
    return p.parts


def open_relative(root_fd, parts):
    parent = os.dup(root_fd)
    try:
        for name in parts[:-1]:
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=parent)
            os.close(parent)
            parent = child
            owned(os.fstat(parent), True)
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                     dir_fd=parent)
        try:
            owned(os.fstat(fd))
            return fd
        except BaseException:
            os.close(fd)
            raise
    finally:
        os.close(parent)


def digest_file(fd, check):
    os.lseek(fd, 0, os.SEEK_SET)
    digest, count = hashlib.sha256(), 0
    while True:
        check()
        chunk = os.read(fd, 65536)
        if not chunk:
            return digest.hexdigest(), count
        digest.update(chunk)
        count += len(chunk)


def read_manifest(path, approval, check):
    require(isinstance(approval, str) and HEX64.fullmatch(approval),
            "EXPORT_APPROVAL_INVALID")
    parent = owned_directory(Path(path).parent)
    fd = None
    try:
        fd = open_relative(parent, [Path(path).name])
        before = fingerprint(os.fstat(fd))
        require(before[5] <= MANIFEST_LIMIT, "EXPORT_MANIFEST_INVALID")
        raw = bytearray()
        while True:
            check()
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            raw.extend(chunk)
            require(len(raw) <= MANIFEST_LIMIT, "EXPORT_MANIFEST_INVALID")
        require(fingerprint(os.fstat(fd)) == before)
        require(fingerprint(os.stat(Path(path).name, dir_fd=parent,
                                    follow_symlinks=False)) == before)
        require(hashlib.sha256(raw).hexdigest() == approval,
                "EXPORT_APPROVAL_INVALID")
        return bytes(raw)
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "EXPORT_MANIFEST_INVALID")
        result[key] = value
    return result


def parse_manifest(raw):
    manifest = json.loads(raw, object_pairs_hook=unique_object)
    require(type(manifest) is dict and set(manifest) == {
        "schemaVersion", "environment", "sourceRevision", "executionProfileSha256",
        "jobSha256", "recipient", "files"}, "EXPORT_MANIFEST_INVALID")
    require(type(manifest["schemaVersion"]) is int and manifest["schemaVersion"] == 1
            and manifest["environment"] == "local", "EXPORT_MANIFEST_INVALID")
    require(isinstance(manifest["sourceRevision"], str) and
            re.fullmatch(r"[a-f0-9]{40}", manifest["sourceRevision"]),
            "EXPORT_MANIFEST_INVALID")
    for name in ("executionProfileSha256", "jobSha256"):
        require(isinstance(manifest[name], str) and HEX64.fullmatch(manifest[name]),
                "EXPORT_MANIFEST_INVALID")
    require(isinstance(manifest["recipient"], str) and
            RECIPIENT.fullmatch(manifest["recipient"]), "EXPORT_MANIFEST_INVALID")
    require(type(manifest["files"]) is list and len(manifest["files"]) <= 20000,
            "EXPORT_MANIFEST_INVALID")
    seen, total = set(), len(raw)
    for entry in manifest["files"]:
        require(type(entry) is dict and set(entry) == {"path", "bytes", "sha256"},
                "EXPORT_MANIFEST_INVALID")
        relative_path(entry["path"])
        require(entry["path"] not in seen, "EXPORT_MANIFEST_INVALID")
        seen.add(entry["path"])
        require(type(entry["bytes"]) is int and entry["bytes"] >= 0 and
                isinstance(entry["sha256"], str) and HEX64.fullmatch(entry["sha256"]),
                "EXPORT_MANIFEST_INVALID")
        total += entry["bytes"]
        require(total <= PLAINTEXT_LIMIT, "EXPORT_PLAINTEXT_LIMIT")
    return manifest


class CipherPump:
    """One thread: drain stdout while nonblocking writes feed age stdin."""
    def __init__(self, child, fd, check):
        self.child, self.fd, self.check = child, fd, check
        self.selector = selectors.DefaultSelector()
        self.count, self.eof = 0, False
        self.digest = hashlib.sha256()
        os.set_blocking(child.stdin.fileno(), False)
        os.set_blocking(child.stdout.fileno(), False)
        self.selector.register(child.stdout, selectors.EVENT_READ, "output")

    def drain(self):
        try:
            chunk = os.read(self.child.stdout.fileno(), 65536)
        except BlockingIOError:
            return
        if not chunk:
            self.selector.unregister(self.child.stdout)
            self.eof = True
            return
        require(self.count + len(chunk) <= CIPHER_LIMIT, "EXPORT_CIPHER_LIMIT")
        data = memoryview(chunk)
        while data:
            self.check()
            written = os.write(self.fd, data)
            require(written > 0, "EXPORT_IO_FAILED")
            data = data[written:]
        self.count += len(chunk)
        self.digest.update(chunk)

    def write(self, data):
        view = memoryview(data)
        self.selector.register(self.child.stdin, selectors.EVENT_WRITE, "input")
        try:
            while view:
                self.check()
                for key, _ in self.selector.select(0.05):
                    if key.data == "output":
                        self.drain()
                    else:
                        try:
                            count = os.write(self.child.stdin.fileno(), view)
                            require(count > 0, "EXPORT_AGE_FAILED")
                            view = view[count:]
                        except BlockingIOError:
                            pass
                require(not view or self.child.poll() is None, "EXPORT_AGE_FAILED")
        finally:
            self.selector.unregister(self.child.stdin)
        return len(data)

    def flush(self):
        return None

    def finish(self):
        self.child.stdin.close()
        while not self.eof or self.child.poll() is None:
            self.check()
            for _key, _mask in self.selector.select(0.05):
                self.drain()
        require(self.child.returncode == 0 and self.count > 0, "EXPORT_AGE_FAILED")


class PlaintextWriter:
    def __init__(self, stream, check):
        self.stream, self.check, self.count = stream, check, 0

    def write(self, data):
        self.check()
        require(self.count + len(data) <= PLAINTEXT_LIMIT, "EXPORT_PLAINTEXT_LIMIT")
        self.stream.write(data)
        self.count += len(data)
        return len(data)


class SourceReader:
    def __init__(self, fd, check):
        self.fd, self.check = fd, check
        self.digest, self.count = hashlib.sha256(), 0

    def read(self, size):
        self.check()
        data = os.read(self.fd, size)
        self.digest.update(data)
        self.count += len(data)
        return data


def member(name, size):
    item = tarfile.TarInfo(name)
    item.size, item.mode, item.mtime = size, 0o600, 0
    item.uid = item.gid = 0
    item.uname = item.gname = ""
    return item


def add_source(archive, root_fd, entry, check):
    parts = relative_path(entry["path"])
    fd = open_relative(root_fd, parts)
    try:
        before = fingerprint(os.fstat(fd))
        require(before[5] == entry["bytes"])
        require(digest_file(fd, check) == (entry["sha256"], entry["bytes"]))
        require(fingerprint(os.fstat(fd)) == before, "EXPORT_CHANGED")
        os.lseek(fd, 0, os.SEEK_SET)
        reader = SourceReader(fd, check)
        archive.addfile(member(entry["path"], entry["bytes"]), reader)
        require((reader.digest.hexdigest(), reader.count) ==
                (entry["sha256"], entry["bytes"]), "EXPORT_CHANGED")
        require(fingerprint(os.fstat(fd)) == before, "EXPORT_CHANGED")
        reopened = open_relative(root_fd, parts)
        try:
            require(fingerprint(os.fstat(reopened)) == before, "EXPORT_CHANGED")
        finally:
            os.close(reopened)
    finally:
        os.close(fd)


def native_age(command):
    return subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, start_new_session=True,
                            env={"PATH": "/usr/bin:/bin"}, bufsize=0)


def export_evidence(source_root, manifest_path, approval_sha256, output_path, *,
                    adapter=None, clock=time.monotonic, cancelled=lambda: False):
    started = clock()
    deadline = started + DEADLINE_SECONDS
    fds, child, pump, metadata = [], None, None, None
    code, closed, cleanup = "EXPORT_FAILED", True, True

    def check():
        now = clock()
        require(math.isfinite(now) and now >= started, "EXPORT_CLOCK_INVALID")
        require(not cancelled(), "EXPORT_INTERRUPTED")
        require(now < deadline - 1, "EXPORT_TIMEOUT")

    try:
        check()
        require(adapter is not None or sys.platform == "linux",
                "EXPORT_PLATFORM_UNSUPPORTED")
        raw = read_manifest(manifest_path, approval_sha256, check)
        manifest = parse_manifest(raw)
        root = owned_directory(source_root)
        fds.append(root)
        output = Path(output_path)
        parent = owned_directory(output.parent)
        fds.append(parent)
        try:
            cipher = os.open(output.name, os.O_RDWR | os.O_CREAT | os.O_EXCL |
                             os.O_NOFOLLOW, 0o600, dir_fd=parent)
        except FileExistsError:
            raise ExportFailure("EXPORT_OUTPUT_EXISTS") from None
        fds.append(cipher)
        owned(os.fstat(cipher))
        child = (adapter or native_age)(["/usr/bin/age", "-r", manifest["recipient"]])
        closed = False
        pump = CipherPump(child, cipher, check)
        with gzip.GzipFile(filename="", fileobj=pump, mode="wb", mtime=0) as compressed:
            plain = PlaintextWriter(compressed, check)
            with tarfile.open(fileobj=plain, mode="w|", format=tarfile.PAX_FORMAT) as archive:
                archive.addfile(member(ARCHIVE_MANIFEST, len(raw)), io.BytesIO(raw))
                for entry in manifest["files"]:
                    add_source(archive, root, entry, check)
        pump.finish()
        check()
        os.fsync(cipher)
        owned(os.fstat(cipher))
        require(fingerprint(os.stat(output.name, dir_fd=parent, follow_symlinks=False)) ==
                fingerprint(os.fstat(cipher)), "EXPORT_CHANGED")
        cipher_hash, cipher_bytes = digest_file(cipher, check)
        require(cipher_bytes == pump.count and cipher_hash == pump.digest.hexdigest(),
                "EXPORT_CHANGED")
        metadata = {"environment": "local", "sourceRevision": manifest["sourceRevision"],
                    "executionProfileSha256": manifest["executionProfileSha256"],
                    "jobSha256": manifest["jobSha256"],
                    "approvedManifestSha256": approval_sha256,
                    "cipherSha256": cipher_hash, "cipherBytes": cipher_bytes,
                    "fileCount": len(manifest["files"]), "plaintextBytes": plain.count}
    except ExportFailure as error:
        code = error.code
    except KeyboardInterrupt:
        code = "EXPORT_INTERRUPTED"
    except Exception:
        code = "EXPORT_IO_FAILED"
    finally:
        if child is not None:
            if metadata is None:
                try:
                    if child.poll() is None or (pump and not pump.eof):
                        os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                except Exception:
                    cleanup = False
            for stream in (child.stdin, child.stdout):
                try:
                    if stream:
                        stream.close()
                except Exception:
                    cleanup = False
            try:
                child.wait(timeout=max(0, deadline - clock()))
                closed = True
            except Exception:
                cleanup = False
        if pump:
            try:
                pump.selector.close()
            except Exception:
                cleanup = False
        for fd in reversed(fds):
            try:
                os.close(fd)
            except OSError:
                cleanup = False
    if metadata is not None:
        try:
            if cancelled():
                metadata, code = None, "EXPORT_INTERRUPTED"
            elif not math.isfinite(clock()) or clock() >= deadline:
                metadata, code = None, "EXPORT_TIMEOUT"
        except Exception:
            metadata, code = None, "EXPORT_IO_FAILED"
    if metadata is not None and closed and cleanup:
        return {"result": "CIPHER_ARCHIVE_CREATED", **metadata,
                "ownedProcessClosed": True, "retention": "UNVERIFIED"}
    return {"result": "UNVERIFIED", "code": code if metadata is None else
            "EXPORT_CLEANUP_UNKNOWN", "ownedProcessClosed": closed,
            "retention": "UNVERIFIED"}


class SafeParser(argparse.ArgumentParser):
    def error(self, _message):
        raise ExportFailure("EXPORT_ARGUMENTS_INVALID")


def main(args=None):
    parser = SafeParser(add_help=False)
    for flag in ("source-root", "manifest", "approve", "output"):
        parser.add_argument("--" + flag, required=True)
    stop = threading.Event()
    previous = {}
    try:
        options = parser.parse_args(args)
        for sig in (signal.SIGTERM, signal.SIGINT):
            previous[sig] = signal.signal(sig, lambda _sig, _frame: stop.set())
        result = export_evidence(options.source_root, options.manifest, options.approve,
                                 options.output, cancelled=stop.is_set)
    except Exception:
        result = {"result": "UNVERIFIED", "code": "EXPORT_ARGUMENTS_INVALID",
                  "retention": "UNVERIFIED"}
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    print(json.dumps(result, separators=(",", ":")))
    return 0 if result["result"] == "CIPHER_ARCHIVE_CREATED" else 1


if __name__ == "__main__":
    sys.exit(main())
