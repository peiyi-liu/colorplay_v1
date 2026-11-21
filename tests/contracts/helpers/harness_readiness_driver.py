"""Synthetic only; never reads actual proc or invokes Docker/provider APIs."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/concurrency' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


P = load('probe', 'harness-readiness-probe.py')
B = load('builder', 'harness-readiness-plan.py')


class Fake:
    def __init__(self):
        self.base = {'system': 'Linux', 'machine': 'x86_64', 'euid': 0,
                     'cpus': 16, 'affinity': 16, 'pid': 123}
        self.values = {
            '/usr/lib/os-release': 'ID=ubuntu\nVERSION_ID="24.04"\n',
            '/proc/meminfo': 'MemTotal: 33554432 kB\n',
            '/proc/sys/kernel/random/boot_id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\n',
            '/proc/123/stat': '123 (own name) ' + ' '.join(['S'] + ['0'] * 18 + ['456']),
            '/proc/123/smaps_rollup': 'Pss: 24 kB\n',
            '/proc/123/cgroup': '0::/owned\n',
            '/sys/fs/cgroup/cgroup.controllers': 'cpu memory pids\n'}
        for suffix in ('', '/owned'):
            for key, value in {'cpu.max': 'max 100000', 'memory.max': 'max',
                               'memory.swap.max': '0'}.items():
                self.values['/sys/fs/cgroup' + suffix + '/' + key] = value
        self.clock = iter([1.0, 1.1])
        self.docker_value = {'binary': 'OBSERVED', 'daemon': 'OBSERVED', 'version': '28.0.1'}
        self.reads = []
        self.drift = False

    def basics(self):
        return copy.deepcopy(self.base)

    def now(self):
        return next(self.clock)

    def read(self, path, maximum=65536):
        self.reads.append(path)
        if path not in self.values:
            raise FileNotFoundError(path)
        if self.drift and path.endswith('/stat') and self.reads.count(path) == 2:
            return self.values[path].replace('456', '457')
        return self.values[path]

    def writable(self, _path):
        return False

    def filesystem(self):
        return {'totalBytes': 1000000000, 'availableBytes': 900000000}

    def docker(self):
        return copy.deepcopy(self.docker_value)


class Tests(unittest.TestCase):
    def test_fake_16_32_never_capacity(self):
        value = P.collect(Fake())
        self.assertEqual(value['collection'], 'OBSERVED')
        self.assertEqual(value['facts']['memTotalBytes'], 32 * 1024**3)
        self.assertTrue(value['facts']['targetCpuMatches'])
        self.assertTrue(value['facts']['targetOsUidMatches'])
        self.assertEqual((value['readiness'], value['executionAuthority']), ('UNKNOWN', 'NONE'))
        self.assertFalse(value['facts']['delegationAttested'])

    def test_wrong_cpu_memory_os_uid_are_not_hidden(self):
        for key, bad in [('cpus', 4), ('affinity', 4), ('system', 'Darwin'),
                         ('machine', 'arm64'), ('euid', 1000)]:
            fake = Fake(); fake.base[key] = bad
            facts = P.collect(fake)['facts']
            self.assertFalse(facts['targetCpuMatches'] and facts['targetOsUidMatches'])
        fake = Fake(); fake.values['/proc/meminfo'] = 'MemTotal: 1048576 kB\n'
        result = P.collect(fake)
        self.assertEqual(result['facts']['memTotalBytes'], 1024**3)
        self.assertFalse(result['facts']['memoryTierAttested'])
        self.assertEqual(result['readiness'], 'UNKNOWN')

    def test_ubuntu_canonical_release_target(self):
        fake = Fake()
        self.assertEqual(P.collect(fake)['collection'], 'OBSERVED')
        self.assertNotIn('/etc/os-release', fake.reads)

    def test_root_missing_limits_not_applicable_child_missing_rejected(self):
        fake = Fake()
        for key in ('cpu.max', 'memory.max', 'memory.swap.max'):
            del fake.values['/sys/fs/cgroup/' + key]
        result = P.collect(fake)
        self.assertEqual(result['collection'], 'OBSERVED')
        self.assertEqual(result['facts']['cgroupChain'][0]['limitState'], 'NOT_APPLICABLE')
        fake.clock = iter([1.0, 1.1])
        del fake.values['/sys/fs/cgroup/owned/cpu.max']
        self.assertEqual(P.collect(fake)['collection'], 'UNAVAILABLE')

    def test_docker_missing_or_daemon_unknown_never_pass(self):
        for status in ('MISSING', 'OBSERVED'):
            fake = Fake(); fake.docker_value = {'binary': status, 'daemon': 'UNKNOWN', 'version': None}
            result = P.collect(fake)
            self.assertEqual(result['readiness'], 'UNKNOWN')
            self.assertEqual(result['facts']['docker']['daemon'], 'UNKNOWN')

    def test_missing_cgroup_and_unknown_error_are_closed(self):
        fake = Fake(); del fake.values['/sys/fs/cgroup/cgroup.controllers']
        result = P.collect(fake)
        self.assertEqual(result['collection'], 'UNAVAILABLE')
        self.assertEqual(result['reason'], 'READ_UNAVAILABLE')
        self.assertNotIn('cgroup.controllers', json.dumps(result))

    def test_clock_and_identity_fail_closed(self):
        for times in ([2.0, 1.0], [1.0, float('nan')], [1.0, 12.0]):
            fake = Fake(); fake.clock = iter(times)
            self.assertEqual(P.collect(fake)['reason'], 'CLOCK')
        fake = Fake(); fake.drift = True
        self.assertEqual(P.collect(fake)['reason'], 'IDENTITY_DRIFT')

    def test_cgroup_traversal_rejected(self):
        fake = Fake(); fake.values['/proc/123/cgroup'] = '0::/owned/../foreign'
        self.assertEqual(P.collect(fake)['reason'], 'CGROUP')

    def test_bounded_read_real_tempfs_no_proc(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve(); path = root / 'regular'
            path.write_bytes(b'12345')
            self.assertEqual(P.read_bounded(str(path), 5), '12345')
            with self.assertRaises(P.ProbeError):
                P.read_bounded(str(path), 4)
            link = root / 'link'; link.symlink_to(path)
            with self.assertRaises(OSError):
                P.read_bounded(str(link))
            folder = root / 'linked-dir'; folder.symlink_to(root, target_is_directory=True)
            with self.assertRaises(OSError):
                P.read_bounded(str(folder / 'regular'))

    def test_actual_native_docker_fixed_bounded_version_and_close(self):
        for raw, expected in [(b'{"Version":"28.0.1"}', 'OBSERVED'),
                              (b'x' * 4097, 'UNKNOWN'), (b'[]', 'UNKNOWN'),
                              (b'{"Version":"private unexpected string"}', 'UNKNOWN')]:
            calls = []
            response = SimpleNamespace(status=200, read=lambda limit: (calls.append(('read', limit)), raw)[1])
            connection = SimpleNamespace(request=lambda *a, **k: calls.append(('request', a)),
                                         getresponse=lambda: response,
                                         close=lambda: calls.append('connectionClosed'))
            sock = SimpleNamespace(settimeout=lambda value: calls.append(('timeout', value)),
                                   connect=lambda value: calls.append(('connect', value)),
                                   close=lambda: calls.append('socketClosed'))
            info = SimpleNamespace(st_mode=0o100755, st_uid=0)
            with patch.object(P.os, 'lstat', return_value=info), \
                 patch.object(P.http.client, 'HTTPConnection', return_value=connection), \
                 patch.object(P.socket, 'socket', return_value=sock):
                result = P.Native().docker()
            self.assertEqual(result['daemon'], expected)
            self.assertIn(('request', ('GET', '/version')), calls)
            self.assertIn(('read', 4097), calls)
            self.assertIn('connectionClosed', calls)
            self.assertIn('socketClosed', calls)

    def test_builder_pin_private_exclusive_and_no_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve(); binary = root / 'doctl'; binary.write_bytes(b'official-fixture')
            probe = root / 'probe'; probe.write_bytes(b'print("fixture")\n')
            B.DOCTL, B.PROBE = binary, probe
            B.DOCTL_SHA = hashlib.sha256(binary.read_bytes()).hexdigest()
            output = root / 'new'
            value = B.build(output)
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in output.iterdir()))
            self.assertEqual(value['probeSha256'], hashlib.sha256(probe.read_bytes()).hexdigest())
            spec = json.loads((output / 'sandbox.json').read_text())
            self.assertEqual(spec['harness'], 'none')
            self.assertEqual(spec['idle_timeout'], '5m')
            self.assertEqual(spec['egress'], [])
            self.assertFalse(spec['keep_warm'])
            self.assertFalse({'env', 'secrets', 'repos', 'model'} & spec.keys())
            self.assertEqual(value['estimatedTotalUsd'], 0.10)
            self.assertFalse(value['providerHardCap'])
            with self.assertRaises(FileExistsError):
                B.build(output)
            binary.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'DOCTL_HASH'):
                B.build(root / 'other')
            self.assertFalse((root / 'other').exists())


if __name__ == '__main__':
    unittest.main()
