"""Real temporary filesystem, synthetic external process/kernel ports only."""
import base64
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest

DIRECTORY = Path(__file__).resolve().parents[2] / 'scripts/concurrency'
sys.path.insert(0, str(DIRECTORY))
import linux_bootstrap_contracts as C
import linux_bootstrap_backend as B
SPEC = importlib.util.spec_from_file_location('bootstrap', DIRECTORY / 'linux-local-bootstrap.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def encoded(value):
    return json.dumps(value, sort_keys=True).encode()


def token(secret, role):
    def part(value):
        return base64.urlsafe_b64encode(encoded(value)).rstrip(b'=')
    prefix = part({'alg': 'HS256'}) + b'.' + part({'role': role})
    signature = hmac.new(secret.encode(), prefix, hashlib.sha256).digest()
    return (prefix + b'.' + base64.urlsafe_b64encode(signature).rstrip(b'=')).decode()


class Fixture:
    def __init__(self, root):
        self.source = root / 'colorplay-live-recovery'
        self.source.mkdir(mode=0o700)
        self.parent = root / 'live-recovery-runtime'
        self.parent.mkdir(mode=0o700)
        self.runtime = self.parent / 'whole-site-261115'
        tools = self.parent / 'tools'
        tools.mkdir(mode=0o700)
        self.tools = {}
        for name, filename, version in [('node', 'node', '24.18.0'), ('supabase', 'supabase', '2.109.1'), ('supabaseGo', 'supabase-go', '2.109.1')]:
            path = tools / filename
            path.write_bytes(('synthetic-' + name).encode())
            path.chmod(0o700)
            self.tools[name] = {'path': str(path), 'version': version, 'sha256': C.digest(path.read_bytes())}
        toolraw = encoded({'schemaVersion': 2, **self.tools})
        C.write_once(tools / 'toolchain.json', toolraw)
        self.pins = []
        for index, role in enumerate(sorted(C.ROLES)):
            self.pins.append({'role': role, 'platform': 'linux/amd64',
                'configDigest': 'sha256:' + str(index + 1) * 64,
                'pinnedReference': 'public.ecr.aws/supabase/' + role.replace('_', '-') + '@sha256:' + 'a' * 64,
                'amd64ManifestSha256': 'sha256:' + 'a' * 64,
                'tag': 'public.ecr.aws/supabase/' + role.replace('_', '-') + ':v1'})
        self.package = self.source / 'scripts/concurrency/linux-operator'
        self.package.mkdir(parents=True, mode=0o700)
        bodies = {'collect_readiness.py': b'# synthetic external kernel port\n', 'linux_proc.py': b'# parser fixture\n',
                  'test_fixture.py': b'# never installed\n',
                  'linux-image-pins.json': encoded({'schemaVersion': 1, 'kind': 'ROOT_PUBLIC_LINUX_IMAGE_PINS', 'images': self.pins})}
        manifest = {'schemaVersion': 1, 'package': 'COLORPLAY_LOCAL_LINUX_ROOT_OPERATOR_DRAFT',
            'executionAuthority': 'NONE_UNTIL_ROOT_JOB_APPROVAL', 'nativeLinuxValidated': False,
            'noCredentials': True, 'runtimeDirectory': 'live-recovery-runtime/whole-site-261115',
            'sourceDirectory': 'colorplay-live-recovery',
            'sourceRevisionBinding': 'ROOT_APPROVED_GITHUB_JOB_AND_CLEAN_HEAD', 'files': {}}
        for name, body in bodies.items():
            (self.package / name).write_bytes(body)
            role = 'PUBLIC_IMAGE_PINS' if name.endswith('.json') else 'TEST' if name.startswith('test_') else 'OPERATOR'
            manifest['files'][name] = {'role': role, 'bytes': len(body), 'sha256': C.digest(body)}
        (self.package / 'README.md').write_text('Public fixture only\n')
        package_raw = encoded(manifest)
        (self.package / 'package-manifest.json').write_bytes(package_raw)
        self.tracked = ['supabase/migrations/%014d.sql' % x for x in range(121)]
        self.tracked += ['supabase/config.toml', 'supabase/templates/email-otp.html', 'supabase/functions/auth-login/index.ts'] + ['supabase/' + p for p in B.SEEDS]
        for name in self.tracked:
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('-- source fixture\n')
        self.config = (DIRECTORY.parents[1] / 'supabase/config.toml').read_text()
        (self.source / 'supabase/config.toml').write_text(self.config)
        self.request = {'schemaVersion': 1, 'confirmation': 'LOCAL_LINUX_FREE_BOOTSTRAP_ONCE',
            'sourceRevision': 'a' * 40, 'repository': C.REPOSITORY,
            'job': {'runId': '12345', 'runAttempt': 1, 'jobName': 'capacity-linux'},
            'instanceNonce': 'b' * 32, 'operatorPackageManifestSha256': C.digest(package_raw),
            'toolchainSha256': C.digest(toolraw)}
        self.path = self.parent / 'request.json'
        C.write_once(self.path, self.request)
        self.environment = {'GITHUB_REPOSITORY': C.REPOSITORY, 'GITHUB_RUN_ID': '12345',
            'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_JOB': 'capacity-linux'}
        self.platform = 'linux'
        self.commands, self.writes, self.reads = [], [], []
        self.files = {'/etc/docker/daemon.json': b'{"log-level":"warn"}'}
        self.fail = None
        self.started, self.existing, self.missing_kill = False, False, False
        self.bad_status, self.bad_jwks, self.bad_baseline, self.bad_port = False, False, False, False
        self.key = {'kty': 'EC', 'crv': 'P-256', 'alg': 'ES256', 'use': 'sig',
                    'kid': 'synthetic-new', 'x': 'synthetic-x', 'y': 'synthetic-y', 'd': 'synthetic-private'}
        self.facts = {'platform': 'linux', 'architecture': 'x86_64', 'distribution': 'ubuntu-24.04',
            'logicalCpu': 4, 'affinity': [0, 1, 2, 3], 'memTotalBytes': 15 * 1024**3,
            'freeDiskBytes': 11 * 1024**3, 'cgroupV2': True, 'pidfd': True, 'pss': True, 'psi': True}

    def execute(self):
        return M.bootstrap(self.path, C.digest(self.path.read_bytes()), self)

    def run(self, args, **options):
        self.commands.append((args, options))
        if self.fail and self.fail(args):
            raise RuntimeError('PRIVATE_PROVIDER_MARKER')
        if args[0] == '/usr/bin/git':
            if args[1:3] == ['rev-parse', 'HEAD']:
                return b'a' * 40
            if args[1] == 'status':
                return b''
            return ('\0'.join(self.tracked) + '\0').encode()
        if args == [self.tools['node']['path'], '--version']:
            return b'v24.18.0'
        if args == [self.tools['supabase']['path'], '--version']:
            return b'2.109.1'
        if args == [self.tools['supabaseGo']['path'], '--version']:
            return b'2.109.1'
        if args == [self.tools['supabase']['path'], 'start', '--help']:
            return b'Start the Supabase local development stack'
        if args[0] == self.tools['node']['path']:
            return encoded([self.key])
        if args[0] == '/usr/bin/sudo':
            if '/usr/bin/mkdir' in args:
                self.files[args[-1] + '/cgroup.procs'] = b''
                if not self.missing_kill:
                    self.files[args[-1] + '/cgroup.kill'] = b''
            return b''
        if args[0] == self.tools['supabase']['path']:
            if args[1] == 'start':
                self.started = True
                self.secret = options['env']['SUPABASE_AUTH_JWT_SECRET']
                return b''
            return encoded({'API_URL': 'http://127.0.0.1:58321',
                'DB_URL': 'postgresql://postgres:synthetic-password@127.0.0.1:58322/postgres',
                'JWT_SECRET': self.secret, 'ANON_KEY': token(self.secret, 'anon'),
                'SERVICE_ROLE_KEY': token('wrong' if self.bad_status else self.secret, 'service_role')})
        self.assert_docker(args)
        operation = args[3:]
        if operation[0] == 'ps':
            return ('\n'.join(self.ids()) if self.started else 'f' * 64 if self.existing else '').encode()
        if operation[:2] == ['volume', 'ls']:
            return b'owned-volume' if self.started else b''
        if operation[:2] == ['volume', 'inspect']:
            return encoded([{'Name': 'owned-volume', 'Labels': {'com.supabase.cli.project': C.PROJECT}}])
        if operation[0] == 'info':
            return encoded({'driver': 'systemd', 'version': '2'})
        if operation[:2] == ['image', 'inspect']:
            pin = next(p for p in self.pins if p['pinnedReference'] == operation[2])
            return encoded([{'Id': pin['configDigest'], 'Architecture': 'amd64', 'Os': 'linux'}])
        if operation[0] in {'pull', 'tag'}:
            return b''
        if operation[0] == 'inspect':
            if '--format' in operation:
                return encoded({'id': 'f' * 64, 'name': 'prior-resource', 'labels': {}, 'image': 'old'})
            return encoded(self.rows())
        if operation[0] == 'exec':
            query = options['data']
            assert query.startswith(b'begin read only;') and query.endswith(b'rollback;')
            assert b'PGPASSWORD' not in query and options['env']['PGPASSWORD'] == 'synthetic-password'
            return encoded({'systemIdentifier': '123456789', 'migrations': 120 if self.bad_baseline else 121,
                'publicTables': 71, 'publicWithoutRls': 0, 'auth': 0, 'profiles': 0, 'classrooms': 0,
                'xp': 0, 'wallet': 0, 'mediaRuns': 0, 'mediaAssets': 0,
                'questions': 259, 'publishedQuestions': 258, 'reviewCards': 9, 'hints': 17,
                'blooks': 20, 'quizTemplates': 26})
        raise AssertionError('UNEXPECTED_SYNTHETIC_COMMAND')

    def assert_docker(self, args):
        assert args[:3] == ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']

    def ids(self):
        return [str(x + 1) * 64 for x in range(8)]

    def rows(self):
        result = []
        for index, pin in enumerate(self.pins):
            ports = {}
            if pin['role'] in {'db', 'kong', 'inbucket'}:
                host = {'db': '58322', 'kong': '58321', 'inbucket': '58324'}[pin['role']]
                ports['1/tcp'] = [{'HostIp': '0.0.0.0' if self.bad_port else '127.0.0.1', 'HostPort': host}]
            result.append({'Id': self.ids()[index], 'Name': '/supabase_' + pin['role'] + '_' + C.PROJECT,
                'State': {'Running': True, 'Pid': index + 100}, 'Config': {'Labels': {'com.supabase.cli.project': C.PROJECT}},
                'Image': pin['configDigest'], 'NetworkSettings': {'Ports': ports}})
        return result

    def system_exists(self, path):
        return path in self.files

    def system_read(self, path):
        self.reads.append(path)
        if path.startswith('/proc/'):
            return b'0::/colorplaybackendbbbbbbbbbbbb.slice/docker-synthetic.scope'
        if path.endswith('/cpu.max'):
            return b'400000 100000'
        if path.endswith('/memory.max'):
            return str(6 * 1024**3).encode()
        if path.endswith('/memory.swap.max'):
            return b'0'
        return self.files[path]

    def system_write(self, path, data, **options):
        if options.get('exclusive'):
            assert path not in self.files
        if options.get('expected'):
            assert options['expected'] == C.digest(self.files[path])
        self.files[path] = data
        self.writes.append(path)

    def system_identity(self, path):
        return {'device': 1, 'inode': 2, 'uid': os.getuid(), 'pathSha256': C.digest(path.encode())}

    def hardware(self, _package):
        return self.facts

    def jwks(self, _anon):
        return {'keys': [{k: v for k, v in self.key.items() if k != 'd'}]} if not self.bad_jwks else {'keys': []}


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.fixture = Fixture(Path(self.temporary.name).resolve())

    def test_independent_approval_is_checked(self):
        f = self.fixture
        with self.assertRaises(C.BootstrapError):
            C.parse_request(f.path.read_bytes(), '0' * 64, f.environment)

    def test_complete_native_command_plan_has_real_file_proofs_and_no_business_authority(self):
        f = self.fixture
        result = f.execute()
        self.assertEqual(result, {'result': 'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE',
            'executionAuthority': 'NONE', 'sourceRevision': 'a' * 40, 'services': 8, 'retention': 'UNVERIFIED'})
        self.assertEqual((f.source / 'supabase/config.toml').read_text(), f.config)
        self.assertFalse((f.runtime / 'test_fixture.py').exists())
        self.assertFalse((f.runtime / 'reviewed-candidate.json').exists())
        self.assertFalse((f.runtime / 'execution-profile.json').exists())
        config = B.tomllib.loads((f.runtime / 'local-project/supabase/config.toml').read_text())
        self.assertEqual(config['auth']['additional_redirect_urls'], ['http://127.0.0.1:58373/**'])
        self.assertEqual(config['auth']['site_url'], 'http://127.0.0.1:58373')
        self.assertEqual(config['project_id'], C.PROJECT)
        self.assertEqual(config['api']['port'], 58321)
        self.assertEqual(config['local_smtp']['port'], 58324)
        ownership = C.decode((f.runtime / 'ownership.json').read_bytes())
        self.assertEqual(len(ownership['containers']), 8)
        self.assertEqual(ownership['configurationSha256'], C.digest((f.runtime / 'local-project/supabase/config.toml').read_bytes()))
        for path in f.runtime.rglob('*'):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o700 if path.is_dir() else 0o600)
        starts = [(a, o) for a, o in f.commands if a[0] == f.tools['supabase']['path'] and a[1] == 'start' and '--help' not in a]
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0][1]['timeout'], 600)
        self.assertEqual(starts[0][0][-1], 'postgres-meta,studio,imgproxy,logflare,vector,supavisor')
        self.assertEqual(starts[0][1]['env']['SUPABASE_AUTH_JWT_SECRET'], starts[0][1]['env']['SUPABASE_JWT_SECRET'])
        self.assertNotIn(starts[0][1]['env']['SUPABASE_JWT_SECRET'], json.dumps(result))
        self.assertFalse(any('prune' in a or 'stop' in a or 'rm' in a for a, _ in f.commands))
        self.assertNotIn('/sys/fs/cgroup/cgroup.kill', f.reads)

    def test_failures_before_admission_do_not_mutate(self):
        f = self.fixture
        f.environment['VITE_SUPABASE_URL'] = 'PRIVATE_PROVIDER_MARKER'
        self.assertEqual(f.execute()['code'], 'BOOTSTRAP_AMBIENT_TARGET_REJECTED')
        self.assertEqual(f.commands, [])
        self.assertEqual(f.writes, [])
        self.assertFalse(f.runtime.exists())

    def test_existing_containers_or_volumes_stop_before_any_mutation(self):
        f = self.fixture
        f.existing = True
        self.assertEqual(f.execute()['code'], 'BOOTSTRAP_RESOURCES_EXIST')
        self.assertEqual(f.writes, [])
        self.assertFalse(f.runtime.exists())

    def test_existing_runtime_package_tamper_and_toolchain_tamper_never_mutate(self):
        for target in ['runtime', 'package', 'toolchain']:
            with self.subTest(target=target), tempfile.TemporaryDirectory() as temporary:
                f = Fixture(Path(temporary).resolve())
                if target == 'runtime':
                    f.runtime.mkdir(mode=0o700)
                elif target == 'package':
                    (f.package / 'linux_proc.py').write_text('UNAPPROVED_BYTES')
                else:
                    (f.parent / 'tools/node').write_text('UNAPPROVED_BINARY')
                self.assertEqual(f.execute()['result'], 'FAILED')
                self.assertEqual(f.writes, [])
                self.assertFalse((f.runtime / 'bootstrap-admission.json').exists())

    def test_source_change_after_start_preserves_resources_but_never_ready(self):
        f = self.fixture
        original_jwks = f.jwks
        def changing_jwks(anon):
            (f.source / f.tracked[0]).write_text('changed-after-start')
            return original_jwks(anon)
        f.jwks = changing_jwks
        self.assertEqual(f.execute()['code'], 'BOOTSTRAP_SOURCE_CHANGED')
        self.assertTrue((f.runtime / 'failure-resource-inventory.json').exists())
        self.assertFalse((f.runtime / 'bootstrap-result.json').exists())

    def test_existing_cgroup_stops_before_runtime_or_system_mutation(self):
        f = self.fixture
        f.files['/sys/fs/cgroup/colorplaybackendbbbbbbbbbbbb.slice'] = b''
        self.assertEqual(f.execute()['code'], 'BOOTSTRAP_CGROUP_EXISTS')
        self.assertEqual(f.writes, [])
        self.assertFalse(f.runtime.exists())

    def test_missing_new_leaf_kill_is_failed_not_hierarchy_root_workaround(self):
        f = self.fixture
        f.missing_kill = True
        result = f.execute()
        self.assertEqual(result['code'], 'BOOTSTRAP_CGROUP_KILL_UNAVAILABLE')
        self.assertEqual(result['retention'], 'UNVERIFIED')
        self.assertFalse(f.started)

    def test_cli_start_failure_is_never_retried_and_upstream_removal_is_unknown(self):
        f = self.fixture
        f.fail = lambda a: a[0] == f.tools['supabase']['path'] and a[1] == 'start' and '--help' not in a
        result = f.execute()
        self.assertEqual(result['result'], 'FAILED')
        self.assertTrue(result['upstreamAutoRemovalPossible'])
        self.assertTrue(result['newVolumesMayHaveBeenRemoved'])
        self.assertEqual(result['retention'], 'UNVERIFIED')
        self.assertNotIn('PRIVATE_PROVIDER_MARKER', json.dumps(result))
        self.assertEqual(sum(a[0] == f.tools['supabase']['path'] and a[1] == 'start' and '--help' not in a for a, _ in f.commands), 1)
        self.assertTrue((f.runtime / 'failure-resource-inventory.json').exists())
        self.assertFalse((f.runtime / 'bootstrap-result.json').exists())
        self.assertFalse(any('prune' in a or 'stop' in a for a, _ in f.commands))

    def test_pull_failure_does_not_claim_cli_start_was_attempted(self):
        f = self.fixture
        f.fail = lambda a: a[0] == '/usr/bin/docker' and a[3] == 'pull'
        result = f.execute()
        self.assertFalse(result['upstreamAutoRemovalPossible'])
        self.assertFalse((f.runtime / 'cli-start-intent.json').exists())

    def test_wrong_hmac_jwks_ports_or_baseline_cannot_be_ready(self):
        for flag in ['bad_status', 'bad_jwks', 'bad_port', 'bad_baseline']:
            with self.subTest(flag=flag), tempfile.TemporaryDirectory() as temporary:
                f = Fixture(Path(temporary).resolve())
                setattr(f, flag, True)
                result = f.execute()
                self.assertEqual(result['result'], 'FAILED')
                self.assertEqual(result['retention'], 'UNVERIFIED')
                self.assertFalse(result['upstreamAutoRemovalPossible'])
                self.assertFalse((f.runtime / 'bootstrap-result.json').exists())
                self.assertTrue((f.runtime / 'failure-resource-inventory.json').exists())

    def test_file_contract_rejects_symlink_hardlink_and_world_readable_request(self):
        f = self.fixture
        f.path.chmod(0o644)
        self.assertEqual(f.execute()['result'], 'FAILED')
        f.path.chmod(0o600)
        link = f.parent / 'link.json'
        link.symlink_to(f.path)
        with self.assertRaises(C.BootstrapError):
            C.read_file(link, private=True)
        link.unlink()
        os.link(f.path, link)
        with self.assertRaises(C.BootstrapError):
            C.read_file(f.path, private=True)
        self.assertEqual(f.writes, [])

    def test_receipt_writer_never_overwrites_and_second_bootstrap_never_starts(self):
        f = self.fixture
        first = f.execute()
        original = (f.runtime / 'bootstrap-result.json').read_bytes()
        self.assertEqual(first['services'], 8)
        with self.assertRaises(FileExistsError):
            C.write_once(f.runtime / 'bootstrap-result.json', {'result': 'forbidden'})
        self.assertEqual(f.execute()['code'], 'BOOTSTRAP_RUNTIME_EXISTS')
        self.assertEqual((f.runtime / 'bootstrap-result.json').read_bytes(), original)
        self.assertEqual(sum(a[0] == f.tools['supabase']['path'] and a[1] == 'start' and '--help' not in a for a, _ in f.commands), 1)

    def test_backend_shared_limits_and_privileged_commands_stay_fixed(self):
        f = self.fixture
        self.assertEqual(f.execute()['services'], 8)
        config = C.decode(f.files['/etc/docker/daemon.json'])
        self.assertEqual(config['cgroup-parent'], 'colorplaybackendbbbbbbbbbbbb.slice')
        self.assertEqual(config['ip'], '127.0.0.1')
        self.assertEqual(config['default-network-opts']['bridge']['com.docker.network.bridge.host_binding_ipv4'], '127.0.0.1')
        self.assertEqual(config['log-level'], 'warn')
        unit = f.files['/run/systemd/system/colorplaybackendbbbbbbbbbbbb.slice']
        self.assertIn(b'CPUQuota=400%\nMemoryMax=6442450944\nMemorySwapMax=0\n', unit)
        self.assertTrue(any('--validate' in a for a, _ in f.commands))
        self.assertFalse(any('--ignore-health-check' in a or '--no-backup' in a for a, _ in f.commands))

    def test_request_strict_job_hash_and_hardware_negative_controls(self):
        f = self.fixture
        raw = f.path.read_bytes()
        for key, value in [('GITHUB_RUN_ID', 'other'), ('GITHUB_RUN_ATTEMPT', '2')]:
            with self.subTest(key=key), self.assertRaises(C.BootstrapError):
                C.parse_request(raw, C.digest(raw), {**f.environment, key: value})
        changed = {**f.request, 'arbitraryCommand': 'forbidden'}
        with self.assertRaises(C.BootstrapError):
            C.parse_request(encoded(changed), C.digest(encoded(changed)), f.environment)
        for key, value in [('logicalCpu', 8), ('memTotalBytes', 64 * 1024**3), ('pidfd', False)]:
            with self.subTest(key=key), self.assertRaises(C.BootstrapError):
                C.hardware({**f.facts, key: value})

    def test_bounded_process_ports_success_failure_output_limit_and_timeout(self):
        self.assertEqual(M.bounded([sys.executable, '-B', '-c', 'print("ok")'], self.fixture.source), b'ok\n')
        for code, maximum, timeout in [('raise RuntimeError("PRIVATE_PROVIDER_MARKER")', 100, 3),
                ('print("x"*1000)', 10, 3), ('import time;time.sleep(5)', 100, 1.2)]:
            with self.subTest(code=code), self.assertRaises(C.BootstrapError) as error:
                M.bounded([sys.executable, '-B', '-c', code], self.fixture.source, maximum=maximum, timeout=timeout)
            self.assertNotIn('PRIVATE_PROVIDER_MARKER', str(error.exception))

    def test_cli_import_and_native_darwin_rejection_have_no_process_calls(self):
        f = self.fixture
        f.platform = 'darwin'
        self.assertEqual(f.execute()['code'], 'BOOTSTRAP_LINUX_REQUIRED')
        self.assertEqual(f.commands, [])
        self.assertEqual(f.writes, [])


if __name__ == '__main__':
    unittest.main()
