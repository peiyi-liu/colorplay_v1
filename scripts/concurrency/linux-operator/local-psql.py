#!/usr/bin/python3
"""Fixed read-only Docker psql adapter; never accepts a URL, SQL flag, or target."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import urllib.parse

FLAGS = ['--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1']
PROJECT = 'cp-whole-site-261115'

def require(ok):
    if not ok:
        raise ValueError('LOCAL_PSQL_ADMISSION_FAILED')

def approve_command(owner, state, actual, environment, flags):
    require(list(flags) == FLAGS and owner['projectId'] == PROJECT and owner['apiUrl'] == 'http://127.0.0.1:58321')
    rows = [row for row in owner['containers'] if row['role'] == 'db']
    require(len(rows) == 1)
    row = rows[0]
    require(bool(re.fullmatch('[a-f0-9]{64}', row['id'])) and bool(re.fullmatch('sha256:[a-f0-9]{64}', row['imageId'])))
    require(row['name'] == '/supabase_db_' + PROJECT)
    require(actual == {'id': row['id'], 'imageId': row['imageId'], 'name': row['name'], 'project': PROJECT, 'running': True})
    target = urllib.parse.urlsplit(state['DB_URL'])
    require(target.scheme in ('postgres', 'postgresql') and target.hostname == '127.0.0.1' and target.port == 58322 and target.path == '/postgres' and not target.query and not target.fragment and target.username == 'postgres')
    password = urllib.parse.unquote(target.password or '')
    require(len(password) >= 8)
    expected = {'PGHOST': '127.0.0.1', 'PGPORT': '58322', 'PGDATABASE': 'postgres', 'PGUSER': 'postgres', 'PGPASSWORD': password, 'PGSSLMODE': 'disable', 'PGCONNECT_TIMEOUT': '5', 'PGOPTIONS': '-c default_transaction_read_only=on'}
    require({key: value for key, value in environment.items() if key.startswith('PG')} == expected)
    argv = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'exec', '--interactive', '--env', 'PGPASSWORD', '--env', 'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000', '--env', 'PGCONNECT_TIMEOUT=5', row['id'], 'psql', '--host=127.0.0.1', '--port=5432', '--username=postgres', '--dbname=postgres', *FLAGS]
    return argv, {'PATH': '/usr/bin:/bin', 'PGPASSWORD': password}

def private_json(path):
    require(path.resolve() == path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1 and info.st_size <= 262144)
        return json.loads(stream.read(262145))

def main():
    require(sys.platform == 'linux')
    runtime = Path(__file__).resolve().parents[2] / 'whole-site-261115'
    require(Path(__file__).resolve() == runtime.parent / 'host-client/bin/psql')
    owner = private_json(runtime / 'ownership.json')
    state = private_json(runtime / 'status-secret.json')
    rows = [row for row in owner['containers'] if row['role'] == 'db']
    require(len(rows) == 1 and bool(re.fullmatch('[a-f0-9]{64}', rows[0]['id'])))
    shape = '{"id":{{json .Id}},"imageId":{{json .Image}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}}}'
    result = subprocess.run(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'inspect', '--format', shape, rows[0]['id']], capture_output=True, env={'PATH': '/usr/bin:/bin'}, timeout=10)
    require(result.returncode == 0 and len(result.stdout) <= 4096)
    argv, env = approve_command(owner, state, json.loads(result.stdout), os.environ, sys.argv[1:])
    installed = Path(__file__).read_bytes()
    approved = (runtime / 'local-psql.py').read_bytes()
    require(hashlib.sha256(installed).digest() == hashlib.sha256(approved).digest())
    os.execve(argv[0], argv, env)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('LOCAL_PSQL_BLOCKED', file=sys.stderr)
        raise SystemExit(1) from None
