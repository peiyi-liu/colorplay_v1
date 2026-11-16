"""One approved fresh Linux job. No business tests, reset, or cleanup actions."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import selectors
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import linux_bootstrap_contracts as C
import linux_bootstrap_backend as B

SOURCE = Path(__file__).resolve().parents[2]
ENV = {'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1', 'SUPABASE_TELEMETRY_DISABLED': '1'}


def bounded(args, source, data=None, env=None, timeout=30, maximum=2097152, checked=True, capture_stderr=False):
    child = subprocess.Popen(args, cwd=source, env={**ENV, **(env or {})},
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE if capture_stderr else subprocess.DEVNULL,
                             start_new_session=True, bufsize=0)
    selector, chunks, errors, size = selectors.DefaultSelector(), [], [], 0
    deadline, pending = time.monotonic() + timeout, memoryview(data or b'')
    readers = {child.stdout}
    if capture_stderr:readers.add(child.stderr)
    for stream in readers:
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ, 'stderr' if stream is child.stderr else 'stdout')
    os.set_blocking(child.stdin.fileno(), False)
    if pending:selector.register(child.stdin, selectors.EVENT_WRITE, 'input')
    else:child.stdin.close()
    try:
        while readers or child.poll() is None:
            C.require(time.monotonic() < deadline - 1, 'BOOTSTRAP_COMMAND_TIMEOUT')
            for key, _ in selector.select(0.05):
                if key.data in {'stdout', 'stderr'}:
                    try:chunk = os.read(key.fileobj.fileno(), 65536)
                    except BlockingIOError:continue
                    if not chunk:
                        selector.unregister(key.fileobj);readers.remove(key.fileobj)
                    else:
                        size += len(chunk)
                        C.require(size <= maximum, 'BOOTSTRAP_OUTPUT_LIMIT')
                        (errors if key.data == 'stderr' else chunks).append(chunk)
                else:
                    try:
                        count = os.write(child.stdin.fileno(), pending)
                        C.require(count > 0);pending = pending[count:]
                    except BlockingIOError:continue
                    if not pending:
                        selector.unregister(child.stdin);child.stdin.close()
        C.require(not pending and (not checked or child.returncode == 0), 'BOOTSTRAP_COMMAND_FAILED')
        raw = b''.join(chunks)
        if capture_stderr:return child.returncode, raw, b''.join(errors)
        return raw if checked else (child.returncode, raw)
    finally:
        if child.poll() is None or readers:
            try:os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:pass
        for stream in (child.stdin, child.stdout, child.stderr):
            if stream is not None:stream.close()
        selector.close()
        child.wait(timeout=max(0, deadline - time.monotonic()))


SYSTEM_READ = """import os,sys,stat
p=sys.argv[1]
try: f=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
except FileNotFoundError: sys.exit(0)
s=os.fstat(f)
assert stat.S_ISREG(s.st_mode)
b=os.read(f,1048577);assert len(b)<=1048576
os.close(f);sys.stdout.buffer.write(b)
"""
SYSTEM_WRITE = """import os,sys,json,hashlib
p=sys.argv[1];x=json.loads(sys.stdin.buffer.read());b=bytes.fromhex(x['hex'])
if x['kernel']: f=os.open(p,os.O_WRONLY|os.O_NOFOLLOW)
elif x['exclusive']: f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
else:
 try:
  q=os.open(p,os.O_RDONLY|os.O_NOFOLLOW);old=os.read(q,1048577);os.close(q)
 except FileNotFoundError:old=b''
 assert hashlib.sha256(old).hexdigest()==x['expected']
 f=os.open(p+'.colorplay-new',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(f,'wb')as stream:stream.write(b);stream.flush()
if not x['kernel'] and not x['exclusive']:os.replace(p+'.colorplay-new',p)
"""


def command_operation(args):
    if args[:3] == B.DOCKER:
        operations = {('ps',): 'DOCKER_LIST_CONTAINERS', ('volume', 'ls'): 'DOCKER_LIST_VOLUMES',
            ('volume', 'inspect'): 'DOCKER_INSPECT_VOLUMES', ('inspect',): 'DOCKER_INSPECT_CONTAINERS',
            ('info',): 'DOCKER_INFO', ('pull',): 'DOCKER_IMAGE_PULL', ('tag',): 'DOCKER_IMAGE_TAG',
            ('image', 'inspect'): 'DOCKER_IMAGE_INSPECT', ('exec',): 'DOCKER_EXEC_READONLY'}
        for prefix, name in operations.items():
            if tuple(args[3:3+len(prefix)]) == prefix:return name
    if args[:2] == ['/usr/bin/sudo', '-n']:
        if args[2:5] == ['/usr/bin/python3', '-B', '-c']:
            if args[5:6] == [SYSTEM_READ]:return 'SYSTEM_READ'
            if args[5:6] == [SYSTEM_WRITE]:return 'SYSTEM_WRITE'
        if args[2:4] == ['/usr/bin/systemctl', 'daemon-reload']:return 'SYSTEMD_RELOAD'
        if args[2:4] == ['/usr/bin/systemctl', 'start']:return 'SYSTEMD_START'
        if args[2:] == ['/usr/bin/systemctl', 'restart', 'docker']:return 'SYSTEMD_DOCKER_RESTART'
        if args[2:3] == ['/usr/bin/mkdir']:return 'CGROUP_MKDIR'
        if args[2:3] == ['/usr/bin/chown']:return 'CGROUP_CHOWN'
        if args[2:4] == ['/usr/bin/dockerd', '--validate']:return 'DOCKER_CONFIG_VALIDATE'
    if args[:3] == ['/usr/bin/git', 'rev-parse', 'HEAD']:return 'GIT_HEAD'
    if args[:2] == ['/usr/bin/git', 'status']:return 'GIT_STATUS'
    if args[:2] == ['/usr/bin/git', 'ls-files']:return 'GIT_TRACKED_FILES'
    executable = Path(args[0]).name if args else ''
    if executable == 'node':
        if args[1:] == ['--version']:return 'NODE_VERSION'
        if args[1:2] == ['-e']:return 'NODE_KEY_GENERATION'
    if executable == 'supabase':
        return {'--version':'SUPABASE_VERSION', 'start':'SUPABASE_START', 'status':'SUPABASE_STATUS'}.get(args[1] if len(args)>1 else '', 'UNKNOWN')
    return 'UNKNOWN'


def stderr_classification(raw):
    text = raw[:16384].decode('utf-8', errors='replace').lower()
    patterns = [('UNKNOWN_FLAG', r'unknown flag|unknown shorthand flag|unrecognized (?:option|flag)'),
        ('CONFIG_PARSE', r'(?:failed|unable) to (?:parse|decode|load) config|invalid configuration|toml.*(?:error|invalid)|invalid character.*(?:json|config)'),
        ('PERMISSION', r'permission denied|operation not permitted|a password is required|not in the sudoers'),
        ('HEALTH', r'unhealthy|health.?check.*(?:fail|timeout)|failed.*health.?check'),
        ('IMAGE_PULL', r'pull access denied|manifest unknown|no matching manifest|failed to pull|error pulling'),
        ('PORT', r'address already in use|port is already allocated|bind.*port.*failed'),
        ('CONNECTION', r'connection refused|cannot connect to the docker daemon|failed to connect')]
    return next((name for name, pattern in patterns if re.search(pattern, text)), 'UNKNOWN')


def hardware_diagnostic(facts):
    if not isinstance(facts, dict):return None
    keys = ['distribution', 'logicalCpu', 'memTotalBytes', 'freeDiskBytes', 'cgroupV2', 'pidfd', 'pss', 'psi']
    if not all(key in facts for key in keys) or not isinstance(facts.get('affinity'), list):return None
    value = {key:facts[key] for key in keys};value['affinityCount'] = len(facts['affinity'])
    if value['distribution'] != 'ubuntu-24.04':return None
    if not all(type(value[k]) is int and 0 <= value[k] <= 2**60 for k in ['memTotalBytes','freeDiskBytes']):return None
    if not all(type(value[k]) is int and 0 <= value[k] <= 1024 for k in ['logicalCpu','affinityCount']):return None
    if not all(type(value[k]) is bool for k in ['cgroupV2','pidfd','pss','psi']):return None
    return value


class NativeIO:
    def __init__(self):
        self.source, self.environment, self.platform = SOURCE, dict(os.environ), sys.platform
        self.command_diagnostic = None
        self._raw_root, self._raw_attempted, self._raw_request_sha = None, False, None

    def _authorize_diagnostics(self, request_path, approved):
        if sys.platform != 'linux':return
        folder = self.source.parent / 'live-recovery-runtime/requests'
        C.require(Path(request_path) == folder / 'bootstrap-input.json' and
                  C.digest(C.read_file(Path(request_path), private=True)) == approved,
                  'BOOTSTRAP_DIAGNOSTIC_SCOPE_INVALID')
        C.directory(folder)
        self._raw_root, self._raw_request_sha = folder, approved

    def _save_failed_raw(self, code, out, error):
        if self._raw_root is None or self._raw_attempted:return
        self._raw_attempted = True
        complete = code is not None and isinstance(out,bytes) and isinstance(error,bytes)
        value = {'schemaVersion':1,'bootstrapRequestSha256':self._raw_request_sha,
            'operation':self.command_diagnostic['operation'],'exitCode':code,'complete':False,
            'status':'UNKNOWN','stdoutBytes':None,'stdoutSha256':None,'stderrBytes':None,'stderrSha256':None}
        try:
            if complete:
                C.require(len(out) + len(error) <= 2097152, 'BOOTSTRAP_OUTPUT_LIMIT')
                C.write_once(self._raw_root / 'bootstrap-command-stdout.bin', out)
                C.write_once(self._raw_root / 'bootstrap-command-stderr.bin', error)
                value.update(complete=True,status='SAVED',stdoutBytes=len(out),stdoutSha256=C.digest(out),
                             stderrBytes=len(error),stderrSha256=C.digest(error))
            C.write_once(self._raw_root / 'bootstrap-command-raw.json', value)
        except Exception:
            pass  # Original failure and partial private bytes remain; never overwrite/retry.

    def run(self, args, **options):
        operation = command_operation(args)
        self.command_diagnostic = None
        options.pop('checked', None);options.pop('capture_stderr', None)
        try:
            code, raw, error = bounded(args, options.pop('cwd', self.source), checked=False, capture_stderr=True, **options)
        except Exception:
            self.command_diagnostic = {'operation':operation,'exitCode':None,'stderrBytes':None,
                'stderrSha256':None,'classification':'UNKNOWN'}
            self._save_failed_raw(None, None, None)
            raise
        if code != 0:
            self.command_diagnostic = {'operation':operation,'exitCode':code,'stderrBytes':len(error),
                'stderrSha256':C.digest(error),'classification':stderr_classification(error)}
            self._save_failed_raw(code, raw, error)
        C.require(code == 0, 'BOOTSTRAP_COMMAND_FAILED')
        return raw

    def system_exists(self, path):
        return os.path.lexists(path)

    def system_read(self, path):
        C.require(path == '/etc/docker/daemon.json' or path.startswith(('/sys/fs/cgroup/colorplay', '/proc/')))
        if path.startswith('/proc/'):
            return Path(path).read_bytes()
        return self.run(['/usr/bin/sudo', '-n', '/usr/bin/python3', '-B', '-c', SYSTEM_READ, path])

    def system_write(self, path, data, exclusive=False, kernel=False, expected=None):
        C.require(path == '/etc/docker/daemon.json' or path.startswith(('/run/systemd/system/colorplay', '/sys/fs/cgroup/colorplay')))
        body = json.dumps({'hex': data.hex(), 'exclusive': exclusive, 'kernel': kernel, 'expected': expected}).encode()
        self.run(['/usr/bin/sudo', '-n', '/usr/bin/python3', '-B', '-c', SYSTEM_WRITE, path], data=body)

    def system_identity(self, path):
        target = Path(path)
        C.require(target.resolve() == target and target.is_dir())
        info = target.stat()
        return {'device': info.st_dev, 'inode': info.st_ino, 'uid': info.st_uid,
                'pathSha256': C.digest(str(target).encode())}

    def hardware(self, package):
        C.require(sys.platform == 'linux' and platform.machine() in {'x86_64', 'amd64'},
                  'BOOTSTRAP_HARDWARE_UNSUPPORTED')
        values = {}
        for line in Path('/etc/os-release').read_text().splitlines():
            if '=' in line:
                key, value = line.split('=', 1)
                values[key] = value.strip('"')
        C.require(values.get('ID') == 'ubuntu' and values.get('VERSION_ID') == '24.04')
        C.require(hasattr(os, 'pidfd_open'))
        pidfd = os.pidfd_open(os.getpid())
        os.close(pidfd)
        before = list(sys.path)
        try:
            sys.path.insert(0, str(package))
            spec = importlib.util.spec_from_file_location('bootstrap_readiness', package / 'collect_readiness.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            observed = module.collect()
        finally:
            sys.path[:] = before
        return {'platform': sys.platform, 'architecture': platform.machine(),
                'distribution': 'ubuntu-24.04', 'logicalCpu': observed['hostLogicalCpu'],
                'affinity': observed['cpuAffinity'], 'memTotalBytes': observed['memory']['totalBytes'],
                'freeDiskBytes': shutil.disk_usage(self.source).free, 'cgroupV2': observed['cgroupVersion'] == 2,
                'pidfd': True, 'pss': observed['samplerSelf']['pssBytes'] > 0,
                'psi': bool(observed['memoryPsi']), 'rawFactsSha256': C.digest(json.dumps(observed, sort_keys=True).encode())}

    def jwks(self, anon):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *_args, **_kwargs):
                raise C.BootstrapError('BOOTSTRAP_REDIRECT_REJECTED')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        request = urllib.request.Request('http://127.0.0.1:58321/auth/v1/.well-known/jwks.json', headers={'apikey': anon})
        with opener.open(request, timeout=5) as response:
            C.require(response.status == 200)
            raw = response.read(16385)
        C.require(len(raw) <= 16384)
        return C.decode(raw)


def install(runtime, files):
    for name, raw in files.items():
        C.write_once(runtime / name, raw)


def bootstrap(request_path, approval, ports=None):
    io = ports or NativeIO()
    runtime = io.source.parent / 'live-recovery-runtime' / 'whole-site-261115'
    stage, mutated, facts = 'admission', False, None
    try:
        C.require(io.platform == 'linux', 'BOOTSTRAP_LINUX_REQUIRED')
        C.directory(Path(request_path).parent)
        raw = C.read_file(Path(request_path), 32768, private=True)
        request = C.parse_request(raw, approval, io.environment)
        C.require(io.run(['/usr/bin/git', 'rev-parse', 'HEAD']).decode().strip() == request['sourceRevision'] and
                  io.run(['/usr/bin/git', 'status', '--porcelain']).strip() == b'', 'BOOTSTRAP_SOURCE_NOT_FROZEN')
        C.require(not os.path.lexists(io.source / 'supabase/.temp/project-ref') and
                  not any(p.name != '.env.example' for p in io.source.glob('.env*')) and
                  not any(p.name != '.env.example' for p in (io.source / 'supabase').glob('.env*')),
                  'BOOTSTRAP_AMBIENT_TARGET_REJECTED')
        package, operators = C.operator_package(io.source, request['operatorPackageManifestSha256'])
        parent = runtime.parent
        C.directory(parent)
        tools = C.toolchain(parent, request['toolchainSha256'])
        C.require(io.run([tools['node']['path'], '--version']).decode().strip() == 'v24.18.0' and
                  io.run([tools['supabase']['path'], '--version']).decode().strip() == '2.109.1', 'BOOTSTRAP_TOOLCHAIN_INVALID')
        facts = io.hardware(package)
        C.hardware(facts)
        C.require(not os.path.lexists(runtime), 'BOOTSTRAP_RUNTIME_EXISTS')
        if isinstance(io, NativeIO):io._authorize_diagnostics(request_path, approval)
        before = B.inventory(io)
        C.require(not before['containers'] and not before['volumes'], 'BOOTSTRAP_RESOURCES_EXIST')
        info = C.decode(B.docker(io, 'info', '--format', '{"driver":{{json .CgroupDriver}},"version":{{json .CgroupVersion}}}'))
        C.require(info == {'driver': 'systemd', 'version': '2'}, 'BOOTSTRAP_DOCKER_UNSUPPORTED')
        original = io.system_read('/etc/docker/daemon.json')
        B.require_new_groups(io, request['instanceNonce'])
        runtime.mkdir(mode=0o700)
        mutated = True
        C.write_once(runtime / 'bootstrap-admission.json', {'requestSha256': approval, 'sourceRevision': request['sourceRevision'],
                     'job': request['job'], 'instanceNonce': request['instanceNonce'],
                     'operatorPackageManifestSha256': request['operatorPackageManifestSha256'], 'executionAuthority': 'NONE'})
        C.write_once(runtime / 'daemon-before.json', original)
        C.write_once(runtime / 'kernel-before.json', facts)
        install(runtime, operators)
        stage = 'isolation'
        isolation = B.isolate(io, runtime, request['instanceNonce'], original)
        C.write_once(runtime / 'kernel-isolation-proof.json', isolation)
        C.require(B.inventory(io) == {'containers': [], 'volumes': []}, 'BOOTSTRAP_RESOURCES_CHANGED')
        stage = 'project'
        project_dir, configuration, sources, secret, key = B.project(io, io.source, runtime, tools)
        C.write_once(runtime / 'source-bindings.json', sources)
        pins = B.image_pins(operators['linux-image-pins.json'])
        stage = 'start'
        state = B.start(io, runtime, project_dir, tools, pins, secret)
        stage = 'readback'
        containers = B.containers(io, pins, isolation['backend'])
        public = io.jwks(state['ANON_KEY'])
        C.require(type(public.get('keys')) is list and len(public['keys']) == 1 and
                  all(public['keys'][0].get(name) == key[name] for name in ['kid', 'kty', 'crv', 'x', 'y']) and
                  not {'d', 'k'} & set(public['keys'][0]), 'BOOTSTRAP_JWKS_INVALID')
        database = B.baseline(io, next(c for c in containers if c['role'] == 'db'), state)
        C.require(io.run(['/usr/bin/git', 'rev-parse', 'HEAD']).decode().strip() == request['sourceRevision'] and
                  io.run(['/usr/bin/git', 'status', '--porcelain']).strip() == b'', 'BOOTSTRAP_SOURCE_NOT_FROZEN')
        C.operator_package(io.source, request['operatorPackageManifestSha256'])
        C.toolchain(parent, request['toolchainSha256'])
        C.require(all(C.digest(C.read_file(io.source / name, 16 * 1024**2)) == expected
                      for name, expected in sources.items()), 'BOOTSTRAP_SOURCE_CHANGED')
        C.write_once(runtime / 'database-baseline-proof.json', database)
        C.write_once(runtime / 'ownership.json', {'projectId': C.PROJECT, 'apiUrl': 'http://127.0.0.1:58321',
            'appUrl': 'http://127.0.0.1:58373', 'projectDir': str(project_dir),
            'configurationSha256': C.digest(configuration), 'containers': containers})
        C.write_once(runtime / 'linux-isolation-result.json', {'result': 'LOCAL_LOOPBACK_ISOLATED',
            'beforeConfigSha256': isolation['beforeConfigSha256'], 'afterConfigSha256': isolation['afterConfigSha256'],
            'kernelProofSha256': C.digest(C.read_file(runtime / 'kernel-isolation-proof.json', private=True)),
            'executionAuthority': 'NONE'})
        result = {'result': 'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE', 'executionAuthority': 'NONE',
                  'sourceRevision': request['sourceRevision'], 'services': 8, 'retention': 'UNVERIFIED'}
        C.write_once(runtime / 'bootstrap-result.json', result)
        return result
    except Exception as error:
        started = mutated and (runtime / 'cli-start-intent.json').exists() and not (runtime / 'cli-start-returned.json').exists()
        result = {'result': 'FAILED', 'code': str(error) if isinstance(error, C.BootstrapError) else 'BOOTSTRAP_OPERATION_FAILED',
                  'stage': stage, 'executionAuthority': 'NONE', 'retention': 'UNVERIFIED',
                  'upstreamAutoRemovalPossible': started, 'newVolumesMayHaveBeenRemoved': started}
        if isinstance(io, NativeIO) and io.command_diagnostic is not None:
            result['command'] = dict(io.command_diagnostic)
        hardware = hardware_diagnostic(facts)
        if hardware is not None:result['hardware'] = hardware
        if mutated:
            try:
                C.write_once(runtime / 'failure-resource-inventory.json', B.inventory(io))
                C.write_once(runtime / 'bootstrap-failed.json', result)
            except Exception:
                result['remainingResources'] = 'UNKNOWN'
        return result


class SafeParser(argparse.ArgumentParser):
    def error(self, _message):
        raise C.BootstrapError('BOOTSTRAP_ARGUMENTS_INVALID')


def main(args=None):
    try:
        parser = SafeParser(add_help=False)
        parser.add_argument('--request', required=True)
        parser.add_argument('--approve', required=True)
        values = parser.parse_args(args)
        result = bootstrap(values.request, values.approve)
    except Exception:
        result = {'result': 'FAILED', 'code': 'BOOTSTRAP_ARGUMENTS_INVALID', 'executionAuthority': 'NONE'}
    print(json.dumps(result))
    return 0 if result['result'] == 'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE' else 1


if __name__ == '__main__':
    sys.exit(main())
