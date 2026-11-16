"""One approved fresh Linux job. No business tests, reset, or cleanup actions."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
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


def bounded(args, source, data=None, env=None, timeout=30, maximum=2097152, checked=True):
    child = subprocess.Popen(args, cwd=source, env={**ENV, **(env or {})},
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, start_new_session=True, bufsize=0)
    selector, chunks, size = selectors.DefaultSelector(), [], 0
    deadline, eof, pending = time.monotonic() + timeout, False, memoryview(data or b'')
    os.set_blocking(child.stdout.fileno(), False)
    os.set_blocking(child.stdin.fileno(), False)
    selector.register(child.stdout, selectors.EVENT_READ, 'output')
    if pending:
        selector.register(child.stdin, selectors.EVENT_WRITE, 'input')
    else:
        child.stdin.close()
    try:
        while not eof or child.poll() is None:
            C.require(time.monotonic() < deadline - 1, 'BOOTSTRAP_COMMAND_TIMEOUT')
            for key, _ in selector.select(0.05):
                if key.data == 'output':
                    try:
                        chunk = os.read(child.stdout.fileno(), 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        selector.unregister(child.stdout)
                        eof = True
                    else:
                        size += len(chunk)
                        C.require(size <= maximum, 'BOOTSTRAP_OUTPUT_LIMIT')
                        chunks.append(chunk)
                else:
                    try:
                        count = os.write(child.stdin.fileno(), pending)
                        C.require(count > 0)
                        pending = pending[count:]
                    except BlockingIOError:
                        continue
                    if not pending:
                        selector.unregister(child.stdin)
                        child.stdin.close()
        C.require(not pending and (not checked or child.returncode == 0), 'BOOTSTRAP_COMMAND_FAILED')
        raw = b''.join(chunks)
        return raw if checked else (child.returncode, raw)
    finally:
        if child.poll() is None or not eof:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        for stream in (child.stdin, child.stdout):
            stream.close()
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


class NativeIO:
    def __init__(self):
        self.source, self.environment, self.platform = SOURCE, dict(os.environ), sys.platform

    def run(self, args, **options):
        return bounded(args, options.pop('cwd', self.source), **options)

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
    stage, mutated = 'admission', False
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
