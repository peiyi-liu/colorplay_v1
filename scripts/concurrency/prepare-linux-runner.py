"""Root-only installation on one fresh GitHub Ubuntu runner; no hosted secrets."""
import base64
import hashlib
import io
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import stat
import sys
import tarfile
import urllib.request
import urllib.error

SOURCE = Path(__file__).resolve().parents[2]
PARENT = SOURCE.parent / 'live-recovery-runtime'
TOOLS = PARENT / 'tools'
NODE_SHA = '55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742'
SUPABASE_SHA = '36d87b7fe6b4bcfe89ac47a4354e526cff22480224de426d7b370f6934556976'
SUPABASE_VENDOR = {'bytes':73663269,'sha256':SUPABASE_SHA,'members':{
    'supabase':{'bytes':109918528,'sha256':'e9c1c33233b4341a0475f9acb2ecac35c41f6c9aa6cfdcd4f54b3761cc789c20'},
    'supabase-go':{'bytes':100909240,'sha256':'d10d8059b90d9fd68a69cb808b88dd3fe9f57ec458ffefc79a83083b3e810616'}}}
PNPM_SHA512 = 'XN6SW08HX3Jetx+64YpC/+eEUkeJ8ZthxzHLhyHsKKruFg4BqNWvT+2ypCzb8wDv4j2zVrDUoXtNY+EfirfJVg=='
STAGE = 'admission'
ENV = {'PATH': '/usr/bin:/bin', 'HOME': str(Path.home()), 'PYTHONDONTWRITEBYTECODE': '1', 'SUPABASE_TELEMETRY_DISABLED': '1', 'CI': 'true'}


def require(ok, code='LINUX_TOOLCHAIN_ADMISSION_FAILED'):
    if not ok:
        raise ValueError(code)


def write(path, raw, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def record(path, value):
    write(path, (json.dumps(value, sort_keys=True) + '\n').encode())


def command(argv, timeout=300, env=None):
    # Reuse the reviewed M4 bounded subprocess adapter: enforce the byte cap
    # while reading, reserve closing time, and wait for the owned process.
    spec = importlib.util.spec_from_file_location('root_setup_bounded', SOURCE / 'scripts/concurrency/linux-local-bootstrap.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.bounded(argv, SOURCE, timeout=timeout, maximum=8 * 1024**2, env=env or ENV)


def download(url, algorithm, expected):
    require(url.startswith(('https://nodejs.org/dist/v24.18.0/', 'https://github.com/supabase/cli/releases/download/v2.109.1/', 'https://registry.npmjs.org/pnpm/-/')))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(url, headers={'User-Agent': 'ColorPlay-pinned-local-toolchain'})
    with opener.open(request, timeout=60) as response:
        require(response.status == 200)
        raw = response.read(128 * 1024**2 + 1)
    require(0 < len(raw) <= 128 * 1024**2, 'LINUX_TOOLCHAIN_DOWNLOAD_LIMIT')
    actual = hashlib.new(algorithm, raw).digest()
    approved = bytes.fromhex(expected) if algorithm == 'sha256' else base64.b64decode(expected, validate=True)
    require(actual == approved, 'LINUX_TOOLCHAIN_DOWNLOAD_DIGEST_MISMATCH')
    return raw


def single_binary(raw, archive_name, output):
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:*') as archive:
        members = [item for item in archive.getmembers() if item.name == archive_name]
        require(len(members) == 1 and members[0].isfile() and 0 < members[0].size <= 512 * 1024**2)
        data = archive.extractfile(members[0]).read()
        require(len(data) == members[0].size)
    write(output, data, 0o700)


def install_supabase(raw, vendor=None):
    approved = SUPABASE_VENDOR if vendor is None else vendor  # Trusted test port, never a CLI/request field.
    require(len(raw) == approved['bytes'] and hashlib.sha256(raw).hexdigest() == approved['sha256'],
            'LINUX_TOOLCHAIN_DOWNLOAD_DIGEST_MISMATCH')
    require(set(approved['members']) == {'supabase','supabase-go'})
    require(TOOLS.resolve() == TOOLS and TOOLS.stat().st_uid == os.getuid() and
            stat.S_IMODE(TOOLS.stat().st_mode) == 0o700)
    data = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        members = archive.getmembers()
        require(len(members) == 2 and {m.name for m in members} == {'supabase','supabase-go'})
        for member in members:
            pin = approved['members'][member.name]
            require(member.isfile() and 0 < member.size == pin['bytes'] <= 512*1024**2)
            body = archive.extractfile(member).read(member.size + 1)
            require(len(body) == member.size and hashlib.sha256(body).hexdigest() == pin['sha256'],
                    'LINUX_TOOLCHAIN_MEMBER_DIGEST_MISMATCH')
            data[member.name] = body
    require(not any(os.path.lexists(TOOLS / name) for name in data), 'LINUX_TOOLCHAIN_OUTPUT_EXISTS')
    for name, body in data.items():
        target = TOOLS / name
        write(target, body, 0o700)
        info = target.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1 and
                stat.S_IMODE(info.st_mode) == 0o700 and hashlib.sha256(target.read_bytes()).hexdigest() == approved['members'][name]['sha256'])


def probe_supabase(env=None, runner=None):
    run = runner or command
    require(run([str(TOOLS / 'supabase-go'),'--version'],env=env).strip() == b'2.109.1',
            'LINUX_TOOLCHAIN_VERSION_MISMATCH')
    require(bool(run([str(TOOLS / 'supabase'),'start','--help'],env=env).strip()),
            'LINUX_TOOLCHAIN_SHIM_PROBE_FAILED')


def install_pnpm(raw):
    destination = TOOLS / 'pnpm'
    destination.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        members = archive.getmembers()
        require(len(members) <= 2000 and sum(row.size for row in members) <= 64 * 1024**2)
        seen = set()
        for row in members:
            parts = PurePosixPath(row.name).parts
            require(len(parts) >= 1 and parts[0] == 'package' and not row.name.startswith('/') and '..' not in parts)
            require(row.isdir() or row.isfile())
            target = destination.joinpath(*parts[1:])
            require(target not in seen)
            seen.add(target)
            if row.isdir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                body = archive.extractfile(row).read()
                require(len(body) == row.size)
                write(target, body)
    require((destination / 'bin/pnpm.cjs').is_file())


def main():
    global STAGE
    require(sys.platform == 'linux' and platform.machine() in ('x86_64', 'amd64'))
    require(SOURCE.name == 'colorplay-live-recovery' and len(sys.argv) == 2 and re.fullmatch('[a-f0-9]{40}', sys.argv[1]))
    revision = sys.argv[1]
    require(os.environ.get('GITHUB_REPOSITORY') == 'peiyi-liu/colorplay_v1' and os.environ.get('GITHUB_RUN_ATTEMPT') == '1' and os.environ.get('GITHUB_JOB') == 'capacity-linux' and os.environ.get('GITHUB_SHA') == revision)
    require(command(['/usr/bin/git', 'rev-parse', 'HEAD']).decode().strip() == revision and not command(['/usr/bin/git', 'status', '--porcelain']).strip())
    require(not PARENT.exists(), 'LINUX_TOOLCHAIN_PARENT_ALREADY_EXISTS')
    require(not command(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'ps', '-aq']).strip() and not command(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'volume', 'ls', '-q']).strip(), 'LINUX_TOOLCHAIN_RESOURCES_EXIST')
    require(not any(value for key, value in os.environ.items() if (key.startswith(('SUPABASE_', 'VITE_')) and not (key == 'SUPABASE_TELEMETRY_DISABLED' and value == '1')) or key in {'DOCKER_HOST', 'DOCKER_CONTEXT', 'CONTAINER_HOST', 'PYTHONPATH'}), 'LINUX_TOOLCHAIN_AMBIENT_TARGET_REJECTED')
    os.umask(0o077)
    PARENT.mkdir(mode=0o700)
    TOOLS.mkdir(mode=0o700)
    print(json.dumps({'stage': 'PINNED_LOCAL_TOOLCHAIN_INSTALLING', 'capacity': 'NOT_RUN'}), flush=True)
    STAGE = 'node-download'
    single_binary(download('https://nodejs.org/dist/v24.18.0/node-v24.18.0-linux-x64.tar.xz', 'sha256', NODE_SHA), 'node-v24.18.0-linux-x64/bin/node', TOOLS / 'node')
    STAGE = 'supabase-download'
    install_supabase(download('https://github.com/supabase/cli/releases/download/v2.109.1/supabase_linux_amd64.tar.gz', 'sha256', SUPABASE_SHA))
    STAGE = 'pnpm-download'
    install_pnpm(download('https://registry.npmjs.org/pnpm/-/pnpm-11.25.0.tgz', 'sha512', PNPM_SHA512))
    node, pnpm = str(TOOLS / 'node'), str(TOOLS / 'pnpm/bin/pnpm.cjs')
    env = {**ENV, 'PATH': str(TOOLS) + ':/usr/bin:/bin'}
    require(command([node, '--version'], env=env).strip() == b'v24.18.0' and command([str(TOOLS / 'supabase'), '--version'], env=env).strip() == b'2.109.1' and command([node, pnpm, '--version'], env=env).strip() == b'11.25.0', 'LINUX_TOOLCHAIN_VERSION_MISMATCH')
    probe_supabase(env)
    record(TOOLS / 'toolchain.json', {'schemaVersion': 2, 'node': {'path': node, 'version': '24.18.0', 'sha256': hashlib.sha256((TOOLS / 'node').read_bytes()).hexdigest()}, 'supabase': {'path': str(TOOLS / 'supabase'), 'version': '2.109.1', 'sha256': hashlib.sha256((TOOLS / 'supabase').read_bytes()).hexdigest()}, 'supabaseGo': {'path':str(TOOLS / 'supabase-go'),'version':'2.109.1','sha256':hashlib.sha256((TOOLS / 'supabase-go').read_bytes()).hexdigest()}})
    STAGE = 'locked-dependencies'
    command([node, pnpm, '--config.verify-deps-before-run=false', 'install', '--frozen-lockfile'], timeout=600, env=env)
    STAGE = 'chromium-installation'
    command([node, pnpm, '--config.verify-deps-before-run=false', 'exec', 'playwright', 'install', '--with-deps', 'chromium'], timeout=600, env=env)
    STAGE = 'age-installation'
    command(['/usr/bin/sudo', '-n', '/usr/bin/apt-get', 'update'], timeout=180)
    command(['/usr/bin/sudo', '-n', '/usr/bin/apt-get', 'install', '-y', '--no-install-recommends', 'age'], timeout=180)
    require(Path('/usr/bin/age').is_file())
    require(not command(['/usr/bin/git', 'status', '--porcelain']).strip(), 'LINUX_TOOLCHAIN_SOURCE_CHANGED')
    record(TOOLS / 'installation-receipt.json', {'result': 'PINNED_LOCAL_TOOLCHAIN_INSTALLED', 'sourceRevision': revision, 'vendorArchives': {'nodeSha256': NODE_SHA, 'supabaseSha256': SUPABASE_SHA, 'pnpmSha512': PNPM_SHA512}, 'pnpmCliSha256': hashlib.sha256(Path(pnpm).read_bytes()).hexdigest(), 'ageBinarySha256': hashlib.sha256(Path('/usr/bin/age').read_bytes()).hexdigest(), 'capacity': 'NOT_RUN', 'hostedAuthority': 'NONE'})
    print(json.dumps({'result': 'PINNED_LOCAL_TOOLCHAIN_INSTALLED', 'capacity': 'NOT_RUN', 'hostedAuthority': 'NONE'}), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        reason = str(error)
        safe = reason if isinstance(error, ValueError) and re.fullmatch('[A-Z_]{3,100}', reason) else 'TOOLCHAIN_IO_UNAVAILABLE'
        print(json.dumps({'result': 'LOCAL_TOOLCHAIN_SETUP_BLOCKED', 'stage': STAGE, 'failureClass': type(error).__name__, 'safeReason': safe, 'httpStatus': error.code if isinstance(error, urllib.error.HTTPError) else None, 'capacity': 'NOT_RUN', 'rawLogsStored': False}), flush=True)
        raise SystemExit(1) from None
