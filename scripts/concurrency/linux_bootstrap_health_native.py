"""Fixed local Docker observation. Importing this module performs no native IO."""
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
import linux_bootstrap_contracts as C
from linux_bootstrap_health_observer import Observer, Scope, require, LOG_LIMIT, ACTIONS

SOCKET = '/var/run/docker.sock'
FORMAT = '{"id":{{json .ID}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"image":{{json .Image}},"cgroup":{{json .HostConfig.CgroupParent}},"pid":{{json .State.Pid}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"dead":{{json .State.Dead}},"oom":{{json .State.OOMKilled}},"exitCode":{{json .State.ExitCode}},"restartCount":{{json .RestartCount}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"tty":{{json .Config.Tty}}}'
MODULES = ['linux_bootstrap_health_native.py', 'linux_bootstrap_health_observer.py']


class Sink:
    def __init__(self, directory):
        C.directory(directory)
        self.directory, self.files, self.total, self.closed = directory, {}, 0, False
        self.lock = threading.RLock()

    def raw(self, channel, body):
        with self.lock:
            require(not self.closed and channel == 'mux' and self.total + len(body) <= LOG_LIMIT, 'WRITE')
            if channel not in self.files:
                path = self.directory / ('bootstrap-health-edge-' + channel + '.bin')
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                self.files[channel] = os.fdopen(fd, 'wb', buffering=0)
            require(self.files[channel].write(body) == len(body), 'WRITE')
            self.total += len(body)

    def close(self):
        with self.lock:
            self.closed = True
            for stream in self.files.values(): stream.close()
            return all(s.closed for s in self.files.values())

    def summary(self, value):
        require(self.close(), 'WRITE')
        C.write_once(self.directory / 'bootstrap-health-diagnostic.json', value)


class Stream:
    """Own raw HTTP reader: idle timeout never invalidates an HTTPResponse buffer."""
    def __init__(self, path, deadline, stop, register):
        self.deadline, self.stop, self.buffer = deadline, stop, bytearray()
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            register(self.socket)
            self.socket.settimeout(min(2, max(0.01, deadline - time.monotonic() - 1)))
            info = os.stat(SOCKET, follow_symlinks=False)
            require(stat.S_ISSOCK(info.st_mode) and info.st_uid == 0, 'SCOPE')
            self.socket.connect(SOCKET)
            _pid, uid, _gid = struct.unpack('3i', self.socket.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            require(uid == 0 and os.stat(SOCKET, follow_symlinks=False).st_ino == info.st_ino, 'SCOPE')
            require(path.startswith('/') and '\r' not in path and '\n' not in path, 'SCOPE')
            self.socket.sendall(('GET ' + path + ' HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n').encode('ascii'))
            self.socket.settimeout(0.2)
        except BaseException:
            self.socket.close(); raise

    def receive(self):
        while not self.stop.is_set() and time.monotonic() < self.deadline - 1:
            try: return self.socket.recv(16384)
            except socket.timeout: continue
        raise ValueError('DEADLINE')

    def exact(self, size):
        while len(self.buffer) < size:
            body = self.receive()
            require(body, 'LOG_TRANSPORT')
            self.buffer.extend(body)
        result = bytes(self.buffer[:size]); del self.buffer[:size]
        return result

    def line(self, maximum):
        while b'\r\n' not in self.buffer:
            require(len(self.buffer) <= maximum, 'LOG_TRANSPORT')
            chunk = self.receive(); require(chunk, 'LOG_TRANSPORT'); self.buffer.extend(chunk)
        at = self.buffer.index(b'\r\n'); require(at <= maximum, 'LOG_TRANSPORT')
        value = bytes(self.buffer[:at]); del self.buffer[:at + 2]; return value

    def headers(self):
        first = self.line(8192)
        match = re.fullmatch(rb'HTTP/1\.[01] ([1-5][0-9]{2})[^\r\n]*', first)
        require(match, 'LOG_TRANSPORT'); status = int(match[1]); fields = {}; size = len(first)
        while True:
            line = self.line(8192); size += len(line) + 2; require(size <= 16384, 'LOG_TRANSPORT')
            if not line: break
            name, colon, value = line.partition(b':'); require(colon and re.fullmatch(rb'[A-Za-z0-9-]+', name), 'LOG_TRANSPORT')
            name = name.lower(); require(name not in fields, 'LOG_TRANSPORT'); fields[name] = value.strip().lower()
        transfer, length = fields.get(b'transfer-encoding'), fields.get(b'content-length')
        require(transfer in {None, b'chunked'} and not (transfer and length), 'LOG_TRANSPORT')
        require(length is None or re.fullmatch(b'[0-9]{1,10}', length), 'LOG_TRANSPORT')
        self.chunked, self.remaining = transfer == b'chunked', None if length is None else int(length)
        return status, fields.get(b'content-type', b'').split(b';')[0].decode('ascii')

    def body(self):
        if self.chunked:
            while True:
                size = self.line(128); require(re.fullmatch(b'[0-9A-Fa-f]{1,8}', size), 'LOG_TRANSPORT')
                count = int(size, 16); require(count <= 1048576, 'LOG_TRANSPORT')
                if count == 0:
                    require(self.line(8192) == b'', 'LOG_TRANSPORT'); return
                while count:
                    chunk = self.exact(min(count, 16384)); count -= len(chunk); yield chunk
                require(self.exact(2) == b'\r\n', 'LOG_TRANSPORT')
        else:
            while self.remaining is None or self.remaining > 0:
                if self.buffer:
                    count = len(self.buffer) if self.remaining is None else min(len(self.buffer), self.remaining)
                    chunk = bytes(self.buffer[:count]); del self.buffer[:count]
                else:
                    chunk = self.receive()
                    if not chunk: require(self.remaining in {None, 0}, 'LOG_TRANSPORT'); return
                    if self.remaining is not None: require(len(chunk) <= self.remaining, 'LOG_TRANSPORT')
                if self.remaining is not None: self.remaining -= len(chunk)
                yield chunk


class Native:
    def __init__(self, source, deadline):
        self.source, self.deadline, self.stop = source, deadline, threading.Event()
        self.sockets, self.children, self.threads = [], [], []
        self.lock, self.api = threading.RLock(), None

    def register(self, sock):
        with self.lock:
            require(not self.stop.is_set(), 'DEADLINE'); self.sockets.append(sock)

    def stream(self, path, deadline=None):
        return Stream(path, self.deadline if deadline is None else min(self.deadline, deadline), self.stop, self.register)

    def version(self):
        stream = self.stream('/version', time.monotonic() + 3)
        try:
            status, _ = stream.headers(); require(status == 200, 'EVENT_TRANSPORT'); body = bytearray()
            for chunk in stream.body(): body.extend(chunk); require(len(body) <= 16384, 'EVENT_TRANSPORT')
            version = json.loads(body)['ApiVersion']; require(type(version) is str and re.fullmatch(r'1\.[0-9]{2}', version), 'EVENT_TRANSPORT')
            self.api = '/v' + version
        finally: stream.socket.close()

    def inspect(self, identity, deadline):
        require(re.fullmatch('[a-f0-9]{64}', identity) and not self.stop.is_set(), 'IDENTITY')
        child = subprocess.Popen(['/usr/bin/docker', '--host', 'unix://' + SOCKET, 'inspect', '--format', FORMAT, identity],
                                 cwd=self.source, env={'PATH': '/usr/bin:/bin'}, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
        with self.lock: self.children.append(child)
        chunks, size, end = [], 0, min(deadline - 1, time.monotonic() + 2)
        try:
            os.set_blocking(child.stdout.fileno(), False)
            while not self.stop.is_set() and time.monotonic() < end:
                try: chunk = os.read(child.stdout.fileno(), 16385)
                except BlockingIOError: chunk = None
                if chunk: size += len(chunk); require(size <= 16384, 'INSPECT'); chunks.append(chunk)
                if chunk == b'' and child.poll() is not None: break
                self.stop.wait(0.005)
            require(child.poll() is not None and child.returncode == 0, 'INSPECT')
            return json.loads(b''.join(chunks))
        finally:
            try:
                if child.poll() is None:
                    try: os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError: pass  # Owned child exited after poll.
            finally:
                try: child.stdout.close()
                finally: child.wait(timeout=max(0, deadline - time.monotonic()))

    def cgroup(self, pid):
        require(type(pid) is int and 0 < pid < 2**31, 'CGROUP')
        path = Path('/proc') / str(pid) / 'cgroup'
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            value = os.read(fd, 4097); require(len(value) <= 4096, 'CGROUP'); return value.decode('ascii')
        finally: os.close(fd)

    def launch(self, target):
        with self.lock:
            require(not self.stop.is_set(), 'DEADLINE')
            thread = threading.Thread(target=target, daemon=False)
            self.threads.append(thread); thread.start()

    def subscribe(self, observer):
        self.version()
        filters = json.dumps({'type': ['container'], 'label': ['com.supabase.cli.project=' + C.PROJECT],
                              'event': sorted(ACTIONS)}, separators=(',', ':'))
        stream = self.stream(self.api + '/events?filters=' + urllib.parse.quote(filters, safe=''))
        observer.sent()
        def read():
            pending = bytearray()
            try:
                status, _ = stream.headers(); observer.accepted(status)
                if status != 200: return
                for body in stream.body():
                    pending.extend(body); require(len(pending) <= 65536, 'EVENT_SHAPE')
                    while b'\n' in pending:
                        at = pending.index(10); line = bytes(pending[:at]); del pending[:at + 1]
                        require(line, 'EVENT_SHAPE'); observer.event(json.loads(line))
                    if self.stop.is_set(): return
                observer.value['subscription']['eof'] = True
                observer.fail('EVENT_TRANSPORT')
            except Exception:
                if not self.stop.is_set(): observer.fail('EVENT_TRANSPORT')
            finally: stream.socket.close()
        self.launch(read)

    def attach_logs(self, identity, observer):
        def read():
            stream, natural = None, False
            try:
                stream = self.stream(self.api + '/containers/' + identity + '/logs?stdout=1&stderr=1&follow=1&timestamps=0&tail=all')
                status, mime = stream.headers()
                if not observer.log_status(status, mime): return
                for body in stream.body(): observer.log_data(body)
                natural = True
            except Exception:
                if not self.stop.is_set(): observer.fail('LOG_TRANSPORT', 'edge_runtime')
            finally:
                observer.log_end(natural)
                if stream is not None: stream.socket.close()
        self.launch(read)

    def close(self, deadline):
        self.stop.set()
        with self.lock:
            for sock in self.sockets:
                try: sock.shutdown(socket.SHUT_RDWR)
                except OSError: pass
                sock.close()
        for thread in self.threads: thread.join(max(0, deadline - time.monotonic()))
        return all(not t.is_alive() for t in self.threads) and all(s.fileno() == -1 for s in self.sockets) and all(c.poll() is not None and c.stdout.closed for c in self.children)


def bind(source, request_path, approval, request, before, isolation, runtime, environment):
    require(sys.platform == 'linux', 'SCOPE')
    source = Path(source); expected = source.parent / 'live-recovery-runtime/requests/bootstrap-input.json'
    require(Path(request_path) == expected and before == {'containers': [], 'volumes': []}, 'SCOPE')
    raw = C.read_file(expected, private=True); require(C.parse_request(raw, approval, environment) == request, 'SCOPE')
    admission = C.decode(C.read_file(runtime / 'bootstrap-admission.json', private=True))
    require(admission['requestSha256'] == approval and admission['sourceRevision'] == request['sourceRevision'] and
            admission['job'] == request['job'] and admission['instanceNonce'] == request['instanceNonce'], 'SCOPE')
    require(C.decode(C.read_file(runtime / 'kernel-isolation-proof.json', private=True)) == isolation, 'SCOPE')
    require(isolation['backend'] == 'colorplaybackend' + request['instanceNonce'][:12] + '.slice', 'SCOPE')
    for name in MODULES:
        path = source / 'scripts/concurrency' / name
        expected_bytes = subprocess.check_output(['/usr/bin/git', 'cat-file', 'blob', request['sourceRevision'] + ':scripts/concurrency/' + name], cwd=source, env={'PATH': '/usr/bin:/bin'}, timeout=2)
        require(C.read_file(path, 131072) == expected_bytes, 'SCOPE')
    require(subprocess.check_output(['/usr/bin/git', 'rev-parse', 'HEAD'], cwd=source, env={'PATH': '/usr/bin:/bin'}, timeout=2).decode().strip() == request['sourceRevision'], 'SCOPE')
    require(subprocess.check_output(['/usr/bin/git', 'status', '--porcelain'], cwd=source, env={'PATH': '/usr/bin:/bin'}, timeout=2).strip() == b'', 'SCOPE')
    pins = json.loads(subprocess.check_output(['/usr/bin/git', 'cat-file', 'blob', request['sourceRevision'] + ':scripts/concurrency/linux-operator/linux-image-pins.json'], cwd=source, env={'PATH': '/usr/bin:/bin'}, timeout=2))['images']
    return source, dict(request), approval, isolation['backend'], expected.parent, pins


def start(binding, runtime, pins, deadline):
    source, request, approved, backend, directory, approved_pins = binding
    require(pins == approved_pins and runtime == source.parent / 'live-recovery-runtime/whole-site-261115', 'SCOPE')
    ports, sink = Native(source, deadline), Sink(directory)
    observer = Observer(Scope(request, approved, pins, backend), ports, sink, deadline)
    try: ports.subscribe(observer)
    except Exception: observer.fail('EVENT_TRANSPORT')
    return observer
