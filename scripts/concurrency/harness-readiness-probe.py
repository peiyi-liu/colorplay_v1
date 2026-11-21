#!/usr/bin/env python3
"""Read-only readiness facts, never capacity or execution authority."""
import hashlib
import json
import math
import os
import platform
import re
import stat
import http.client
import socket
import sys
import time


class ProbeError(Exception):
    pass


def read_bounded(path, maximum=65536):
    """Open every component without following a symlink; bound actual bytes."""
    parts = path.split('/')
    if parts[0] != '' or any(p in ('.', '..') for p in parts):
        raise ProbeError('PATH')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts[1:-1]:
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nxt
        file_fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        try:
            if not stat.S_ISREG(os.fstat(file_fd).st_mode):
                raise ProbeError('REGULAR')
            chunks = bytearray()
            while len(chunks) <= maximum:
                piece = os.read(file_fd, min(8192, maximum + 1 - len(chunks)))
                if not piece:
                    break
                chunks.extend(piece)
            if len(chunks) > maximum:
                raise ProbeError('OVERSIZE')
            return bytes(chunks).decode('utf-8', errors='strict')
        finally:
            os.close(file_fd)
    finally:
        os.close(fd)


def identity(text):
    end = text.rfind(')')
    values = text[end + 2:].split()
    if end < 1 or len(values) < 20 or not values[19].isdigit():
        raise ProbeError('IDENTITY')
    return values[19]


def amount(text):
    value = text.strip()
    if value == 'max':
        return None
    if not re.fullmatch(r'[0-9]{1,20}', value):
        raise ProbeError('LIMIT')
    return int(value)


class Native:
    read = staticmethod(read_bounded)
    now = staticmethod(time.monotonic)

    def basics(self):
        return {'system': platform.system(), 'machine': platform.machine(),
                'euid': os.geteuid(), 'cpus': os.cpu_count(),
                'affinity': len(os.sched_getaffinity(0)), 'pid': os.getpid()}

    def filesystem(self):
        value = os.statvfs('/workspace')
        return {'totalBytes': value.f_blocks * value.f_frsize,
                'availableBytes': value.f_bavail * value.f_frsize}

    def writable(self, path):
        return os.access(path, os.W_OK)

    def docker(self):
        binary = None
        for candidate in ('/usr/bin/docker', '/usr/local/bin/docker'):
            try:
                info = os.lstat(candidate)
                if stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022:
                    binary = candidate
                    break
            except FileNotFoundError:
                pass
        if binary is None:
            return {'binary': 'MISSING', 'daemon': 'UNKNOWN', 'version': None}
        # Fixed local daemon GET only; bound bytes before JSON parsing, never exec.
        connection = http.client.HTTPConnection('localhost', timeout=2)
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(2)
        try:
            sock.connect('/var/run/docker.sock')
            connection.sock = sock
            connection.request('GET', '/version', headers={'Connection': 'close'})
            response = connection.getresponse()
            raw = response.read(4097)
            if response.status == 200 and len(raw) <= 4096:
                decoded = json.loads(raw)
                version = decoded.get('Version') if isinstance(decoded, dict) else None
                if isinstance(version, str) and len(version) <= 128 and re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:[-+.][A-Za-z0-9.-]+)?', version):
                    return {'binary': 'OBSERVED', 'daemon': 'OBSERVED', 'version': version}
        except (OSError, ValueError, http.client.HTTPException):
            pass
        finally:
            connection.close()
            sock.close()
        return {'binary': 'OBSERVED', 'daemon': 'UNKNOWN', 'version': None}



def collect(provider):
    result = {'schemaVersion': 1, 'purpose': 'READINESS_ONLY',
              'readiness': 'UNKNOWN', 'executionAuthority': 'NONE',
              'collection': 'UNAVAILABLE', 'facts': None, 'reason': 'UNKNOWN'}
    try:
        started = provider.now()
        basic = provider.basics()
        pid = basic.pop('pid')
        if type(pid) is not int or pid < 1:
            raise ProbeError('IDENTITY')
        prefix = '/proc/' + str(pid)
        before = identity(provider.read(prefix + '/stat'))
        os_release = provider.read('/usr/lib/os-release', 4096)
        ubuntu = re.search(r'^ID="?ubuntu"?$', os_release, re.M) is not None
        version = re.search(r'^VERSION_ID="?24\.04"?$', os_release, re.M) is not None
        memory = provider.read('/proc/meminfo', 65536)
        match = re.search(r'^MemTotal:\s+([0-9]+) kB$', memory, re.M)
        if match is None:
            raise ProbeError('MEMORY')
        mem_bytes = int(match[1]) * 1024
        boot = provider.read('/proc/sys/kernel/random/boot_id', 64).strip()
        if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', boot):
            raise ProbeError('BOOT')
        pss = provider.read(prefix + '/smaps_rollup', 65536)
        pss_match = re.findall(r'^Pss:\s+([0-9]+) kB$', pss, re.M)
        if len(pss_match) != 1:
            raise ProbeError('PSS')
        group = provider.read(prefix + '/cgroup', 4096).strip()
        if not re.fullmatch(r'0::/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]*', group):
            raise ProbeError('CGROUP')
        relative = group[4:]
        components = relative.split('/') if relative else []
        if any(p in ('.', '..') for p in components) or len(components) > 16:
            raise ProbeError('CGROUP')
        controllers = provider.read('/sys/fs/cgroup/cgroup.controllers', 4096).split()
        if not controllers or any(not re.fullmatch(r'[a-z_]{1,32}', c) for c in controllers):
            raise ProbeError('CGROUP')
        chain = []
        for index in range(len(components) + 1):
            path = '/sys/fs/cgroup' + ('/' + '/'.join(components[:index]) if index else '')
            limits = {}
            missing = []
            for key in ('cpu.max', 'memory.max', 'memory.swap.max'):
                try:
                    limits[key] = provider.read(path + '/' + key, 64)
                except FileNotFoundError:
                    if index != 0:
                        raise
                    missing.append(key)
            cpu = limits['cpu.max'].split() if 'cpu.max' in limits else None
            if cpu is not None and (len(cpu) != 2 or amount(cpu[1]) in (None, 0)):
                raise ProbeError('LIMIT')
            chain.append({'cpuQuota': amount(cpu[0]) if cpu else None,
                          'cpuPeriod': amount(cpu[1]) if cpu else None,
                          'memoryMax': amount(limits['memory.max']) if 'memory.max' in limits else None,
                          'swapMax': amount(limits['memory.swap.max']) if 'memory.swap.max' in limits else None,
                          'limitState': 'NOT_APPLICABLE' if missing else 'OBSERVED',
                          'missingRootLimits': missing,
                          'writeAccessObservable': provider.writable(path)})
        filesystem = provider.filesystem()
        docker = provider.docker()
        if identity(provider.read(prefix + '/stat')) != before:
            raise ProbeError('IDENTITY_DRIFT')
        ended = provider.now()
        if not all(math.isfinite(t) for t in (started, ended)) or not 0 <= ended - started <= 10:
            raise ProbeError('CLOCK')
        result.update(collection='OBSERVED', reason='READ_ONLY_NOT_ATTESTED', facts={
            **basic, 'ubuntu2404': ubuntu and version, 'memTotalBytes': mem_bytes,
            'bootSha256': hashlib.sha256(boot.encode()).hexdigest(),
            'ownStartTicks': before, 'ownPssBytes': int(pss_match[0]) * 1024,
            'controllers': sorted(set(controllers)), 'cgroupChain': chain,
            'filesystem': filesystem, 'docker': docker,
            'target': {'logicalCpu': 16, 'advertisedMemoryGiB': 32},
            'targetCpuMatches': basic['cpus'] == basic['affinity'] == 16,
            'targetOsUidMatches': ubuntu and version and basic['system'] == 'Linux'
                                  and basic['machine'] == 'x86_64' and basic['euid'] == 0,
            'memoryTierAttested': False, 'delegationAttested': False,
            'dockerStartupAttested': False, 'elapsedMs': (ended - started) * 1000})
    except (ProbeError, OSError, ValueError, KeyError, TypeError, UnicodeError) as error:
        allowed = {'PATH', 'REGULAR', 'OVERSIZE', 'IDENTITY', 'LIMIT', 'MEMORY',
                   'BOOT', 'PSS', 'CGROUP', 'IDENTITY_DRIFT', 'CLOCK'}
        result['reason'] = str(error) if type(error) is ProbeError and str(error) in allowed else 'READ_UNAVAILABLE'
    return result


def main():
    if len(sys.argv) != 1:
        raise SystemExit(2)
    print(json.dumps(collect(Native()), separators=(',', ':'), sort_keys=True))


if __name__ == '__main__':
    main()
