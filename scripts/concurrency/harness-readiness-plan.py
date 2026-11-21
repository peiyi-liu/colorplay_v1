#!/usr/bin/env python3
"""Offline files only: this builder never executes a provider or authenticates."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import sys

BASE = '1ebf3525a52690ca04efb5152b62c7c869d4959f'
DOCTL_SHA = '3bbf140e520f6e715506ebf7db4744ef3e6c0dc584d0b75e4593ee9844d19a44'
ROOT = Path(__file__).resolve().parents[2]
DOCTL = ROOT.parent / 'live-recovery-runtime/harness-readiness-tools/doctl'
PROBE = Path(__file__).with_name('harness-readiness-probe.py')
SCOPES = ['agent_harness_session:create', 'agent_harness_session:read',
          'agent_harness_session:manage', 'agent_harness_session:operate']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_bytes(path, maximum):
    path = Path(path).absolute()
    for ancestor in [path, *path.parents]:
        if ancestor.is_symlink():
            raise ValueError('SYMLINK')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid()
                or before.st_nlink != 1 or before.st_size > maximum
                or before.st_mode & 0o022):
            raise ValueError('INPUT_UNSAFE')
        data = bytearray()
        while len(data) <= maximum:
            part = os.read(fd, min(65536, maximum + 1 - len(data)))
            if not part:
                break
            data.extend(part)
        after = os.fstat(fd)
        if (len(data) > maximum or (before.st_ino, before.st_size, before.st_mtime_ns)
                != (after.st_ino, after.st_size, after.st_mtime_ns)):
            raise ValueError('INPUT_CHANGED')
        return bytes(data)
    finally:
        os.close(fd)


def write_private(output, name, data):
    if len(data) > 131072:
        raise ValueError('OUTPUT_SIZE')
    fd = os.open(output / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)


def runbook(name):
    return f'''# Offline readiness: {name}

UNEXECUTED / readiness UNKNOWN / executionAuthority NONE. No cloud resources or token.
Spec is NOT_CLI_VALIDATED: token-free CLI failed before schema parsing; the approved
network-deny sandbox smoke was denied by this host. No placeholder create was run.

Use local umask 077 and a new private0700 result directory for every command.

1. Root first obtains action-time Owner approval for a short-lived private config
   containing ONLY create/read/manage/operate agent_harness_session scopes; exclude
   share. Never pass a real token in argv, env, trace, logs, or the guest. Verify
   exact bundle hashes and name; remote facts are still UNKNOWN. Config path below
   is Root's private credential config, separate from these shareable input files.
2. Root verifies CLI spec acceptance once before approving ONE create. Commands use
   pinned doctl --config PRIVATE_CONFIG --http-retry-max 0 --interactive=false.
   After separate approval: harness-runtime create --spec sandbox.json -o json.
   Bind observed session ID, unique name {name}, harness none and exact size.
   A timeout/ambiguous result means STOP and reconcile that nonce with show/list;
   do not create a second session. A manifest also persists an Agent Config.
3. Only on that observed ID: harness-runtime upload ID --local-file probe.py
   --workspace-path readiness-probe.py; harness-runtime exec ID --timeout 15 -- /bin/sh -c
   'umask 077; python3 /workspace/readiness-probe.py > /workspace/readiness-result.json';
   harness-runtime download ID --workspace-path
   readiness-result.json --save-to PRIVATE_RESULT. The exec command must redirect
   stdout only as shown above; the fixed command is approved by Root at action time; no application/auth/database setup. Local whole-step
   deadline is 300s, exec at most 15s, no retries, no extra exec after pause.
4. Preserve bounded result private0600, then harness-runtime pause ID and show ID
   to observe paused/stopped. Idle five minutes is NOT an absolute lifetime cap.
   Only this newly-created data-empty session may later be removed after Root's
   explicit approval: harness-runtime remove ID. Its Agent Config remains; bind
   its returned ID and separately approve config delete CONFIG_ID. Never remove
   an existing resource. Cleanup failure stops new work and is reported UNKNOWN.

Five minutes compute: $1.008/hour * 5/60 = $0.084, plus $0.016 egress reserve =
$0.10 estimate; not a provider-enforced spending cap. User total cap $5, spent $0
at bundle creation. No subscription/monthly commitment or auto top-off consent.
Read-only access, daemon version and CPU/memory facts cannot attest writable
cgroup delegation, Docker startup, full harness compatibility, or capacity PASS.
Memory is reported as MemTotal bytes; advertised 32GiB is not exact guest MemTotal.

Primary authority: DigitalOcean Harness Runtime run-sandbox, environment-spec,
pricing and doctl create reference. UI scopes were independently observed by Root.
'''


def build(output):
    output = Path(output).absolute()
    if any(p.is_symlink() for p in [output, *output.parents]):
        raise ValueError('SYMLINK')
    probe = checked_bytes(PROBE, 32768)
    binary = checked_bytes(DOCTL, 67108864)
    if digest(binary) != DOCTL_SHA:
        raise ValueError('DOCTL_HASH')
    name = 'cp-readiness-' + secrets.token_hex(8)
    spec = {'name': name, 'harness': 'none', 'size': 'mars-16vcpu-32gb',
            'idle_timeout': '5m', 'keep_warm': False, 'egress': []}
    # mkdir is exclusive: a prior bundle, including partial output, is never reused.
    os.mkdir(output, 0o700)
    os.chmod(output, 0o700)
    files = {'sandbox.json': (json.dumps(spec, indent=2) + '\n').encode(),
             'probe.py': probe, 'RUNBOOK.md': runbook(name).encode()}
    manifest = {'schemaVersion': 1, 'purpose': 'READINESS_ONLY', 'readiness': 'UNKNOWN',
                'executionAuthority': 'NONE', 'sourceBase': BASE,
                'doctlSha256': DOCTL_SHA, 'probeSha256': digest(probe),
                'planSha256': digest(checked_bytes(Path(__file__), 32768)),
                'specValidation': 'NOT_CLI_VALIDATED', 'requiredScopes': SCOPES,
                'excludedScope': 'agent_harness_session:share', 'maximumSeconds': 300,
                'estimatedComputeUsd': 0.084, 'egressReserveUsd': 0.016,
                'estimatedTotalUsd': 0.10, 'providerHardCap': False,
                'files': {n: {'bytes': len(b), 'sha256': digest(b)} for n, b in files.items()}}
    files['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    for filename, data in files.items():
        write_private(output, filename, data)
    return manifest


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: harness-readiness-plan.py NEW_PRIVATE_DIRECTORY')
    print(json.dumps(build(sys.argv[1]), sort_keys=True))
