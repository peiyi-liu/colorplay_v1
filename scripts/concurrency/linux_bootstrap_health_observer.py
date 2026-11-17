"""Passive bootstrap protocol. All native IO is supplied by the fixed facade."""
import json
import re
import struct
import threading
import time
from linux_bootstrap_contracts import PROJECT, ROLES

EVENT_LIMIT, STATE_LIMIT, LOG_LIMIT, META_LIMIT = 4096, 256, 1048576, 1048576
REASONS = {'SCOPE', 'EVENT_SHAPE', 'ROLE_REUSED', 'IDENTITY', 'CGROUP', 'DISAPPEARED',
           'INSPECT', 'LOG_HTTP', 'LOG_TRANSPORT', 'FRAME', 'PARTIAL_FRAME', 'SYSTEM_FRAME',
           'EVENT_LIMIT', 'STATE_LIMIT', 'LOG_LIMIT', 'META_LIMIT', 'EVENT_TRANSPORT',
           'WRITE', 'DEADLINE', 'UNKNOWN', 'SUBSCRIPTION_HTTP'}
ACTIONS = {'create', 'start', 'die', 'destroy', 'oom', 'restart',
           'health_status: healthy', 'health_status: unhealthy', 'health_status: starting'}


def require(value, code='SCOPE'):
    if not value:
        raise ValueError(code)


class Scope:
    def __init__(self, request, approved, pins, backend):
        require(re.fullmatch('[a-f0-9]{40}', request['sourceRevision']) and
                re.fullmatch('[a-f0-9]{64}', approved) and
                re.fullmatch('[a-f0-9]{32}', request['instanceNonce']))
        require(backend == 'colorplaybackend' + request['instanceNonce'][:12] + '.slice')
        require(len(pins) == 8 and {p['role'] for p in pins} == ROLES)
        for pin in pins:
            require(re.fullmatch('sha256:[a-f0-9]{64}', pin['configDigest']) and
                    re.fullmatch(r'public\.ecr\.aws/supabase/[a-z0-9-]+@sha256:[a-f0-9]{64}', pin['pinnedReference']))
        self.request, self.approved, self.backend = request, approved, backend
        self.pins = {p['role']: dict(p) for p in pins}
        self.names = {'supabase_' + role + '_' + PROJECT: role for role in ROLES}


class Frames:
    """Incremental Docker stdcopy: channels1/2 application,3 daemon/system."""
    def __init__(self, consume):
        self.buffer, self.consume = bytearray(), consume

    def feed(self, data):
        self.buffer.extend(data)
        require(len(data) <= 65544 and len(self.buffer) <= 131088, 'FRAME')
        while len(self.buffer) >= 8:
            channel = self.buffer[0]
            size = struct.unpack('>I', self.buffer[4:8])[0]
            require(channel in {1, 2, 3} and self.buffer[1:4] == b'\0\0\0' and size <= 65536, 'FRAME')
            if len(self.buffer) < size + 8:
                return
            body = bytes(self.buffer[8:8 + size])
            del self.buffer[:8 + size]
            self.consume(channel, body)

    def boundary(self):
        return not self.buffer


class Observer:
    def __init__(self, scope, ports, sink, deadline, now=time.monotonic):
        self.scope, self.ports, self.sink, self.deadline, self.now = scope, ports, sink, deadline, now
        self.lock = threading.RLock()
        self.ids, self.validated, self.attempted, self.rejected = {}, set(), set(), set()
        self.raw_size, self.frames = 0, Frames(self.app)
        self.closing, self.finished = False, False
        self.value = {'schemaVersion': 1, 'executionAuthority': 'NONE', 'clock': 'PYTHON_MONOTONIC',
                      'sourceRevision': scope.request['sourceRevision'], 'bootstrapRequestSha256': scope.approved,
                      'collection': 'OBSERVED', 'coverage': 'UNOBSERVED', 'firstTerminal': None,
                      'cliStartedAtMs': None, 'events': [], 'states': [],
                      'subscription': {'requestSentAtMs': None, 'acceptedAtMs': None, 'httpStatus': None,
                                       'eventCount': 0, 'eof': False},
                      'logs': {'attempted': False, 'httpStatus': None, 'stdoutFrames': 0, 'stderrFrames': 0,
                               'systemFrames': 0, 'rawBytes': 0, 'transportEof': False, 'frameBoundary': True},
                      'closure': 'UNKNOWN'}

    def fail(self, reason, role=None):
        with self.lock:
            reason = reason if reason in REASONS else 'UNKNOWN'
            self.value['collection'], self.value['coverage'] = 'UNAVAILABLE', 'INCOMPLETE'
            if self.value['firstTerminal'] is None:
                self.value['firstTerminal'] = {'reason': reason, 'role': role if role in ROLES else None,
                                               'atMs': self.now() * 1000}

    def cli_started(self):
        self.value['cliStartedAtMs'] = self.now() * 1000

    def sent(self):
        self.value['subscription']['requestSentAtMs'] = self.now() * 1000

    def accepted(self, status):
        self.value['subscription']['httpStatus'] = status if type(status) is int and 100 <= status <= 599 else None
        if status != 200:
            self.fail('SUBSCRIPTION_HTTP')
            return
        self.value['subscription']['acceptedAtMs'] = self.now() * 1000
        self.value['coverage'] = 'OBSERVED_POSSIBLE_GAP'  # No history/backfill completeness claim.

    def event(self, raw):
        with self.lock:
            try:
                require(not self.closing and not self.finished, 'UNKNOWN')
                require(self.now() < self.deadline, 'DEADLINE')
                require(len(self.value['events']) < EVENT_LIMIT, 'EVENT_LIMIT')
                require(type(raw) is dict and raw.get('Type') == 'container', 'EVENT_SHAPE')
                actor = raw.get('Actor'); require(type(actor) is dict, 'EVENT_SHAPE')
                identity, attrs = actor.get('ID'), actor.get('Attributes')
                require(type(identity) is str and re.fullmatch('[a-f0-9]{64}', identity) and type(attrs) is dict, 'EVENT_SHAPE')
                role = self.scope.names.get(attrs.get('name'))
                require(role in ROLES and attrs.get('com.supabase.cli.project') == PROJECT, 'SCOPE')
                pin = self.scope.pins[role]
                hint = attrs.get('image', raw.get('from'))
                require(hint in {pin['tag'], pin['pinnedReference'], pin['configDigest']}, 'SCOPE')
                action = raw.get('Action'); require(action in ACTIONS, 'EVENT_SHAPE')
                require((role not in self.ids or self.ids[role] == identity) and
                        all(old_role == role or old_id != identity for old_role, old_id in self.ids.items()), 'ROLE_REUSED')
                self.ids[role] = identity
                self.value['events'].append({'role': role, 'action': action, 'atMs': self.now() * 1000})
                self.value['subscription']['eventCount'] += 1
                if identity in self.rejected or action == 'create':
                    return
                if identity not in self.attempted:
                    self.attempted.add(identity)
                    self.state(role, identity, validation=True)
                elif identity in self.validated:
                    self.state(role, identity)
            except Exception as error:
                self.fail(error.args[0] if isinstance(error, ValueError) and error.args else 'EVENT_SHAPE')

    def state(self, role, identity, validation=False):
        try:
            require(len(self.value['states']) < STATE_LIMIT, 'STATE_LIMIT')
            v = self.ports.inspect(identity, self.deadline)
            require(type(v) is dict and set(v) == {'id', 'name', 'project', 'image', 'cgroup', 'pid', 'running',
                    'restarting', 'dead', 'oom', 'exitCode', 'restartCount', 'health', 'tty'}, 'INSPECT')
            require(v['id'] == identity and v['name'] == '/' + next(k for k, r in self.scope.names.items() if r == role)
                    and v['project'] == PROJECT and v['image'] == self.scope.pins[role]['configDigest'], 'IDENTITY')
            require(v['cgroup'] in {'', self.scope.backend} and type(v['pid']) is int and 0 <= v['pid'] < 2**31, 'CGROUP')
            require(all(type(v[k]) is bool for k in ['running', 'restarting', 'dead', 'oom', 'tty']), 'INSPECT')
            require(type(v['exitCode']) is int and 0 <= v['exitCode'] <= 255 and
                    type(v['restartCount']) is int and 0 <= v['restartCount'] < 2**31 and
                    v['health'] in {None, 'starting', 'healthy', 'unhealthy'}, 'INSPECT')
            if v['running']:
                require(v['pid'] > 0, 'CGROUP')
                lines = self.ports.cgroup(v['pid']).strip().splitlines()
                require(len(lines) == 1 and lines[0] in {'0::/' + self.scope.backend + '/docker-' + identity + '.scope',
                        '0::/' + self.scope.backend + '/' + identity}, 'CGROUP')
            elif validation:
                require(v['cgroup'] == self.scope.backend, 'DISAPPEARED')
            self.validated.add(identity)
            self.value['states'].append({k: v[k] for k in ['running', 'restarting', 'dead', 'oom', 'exitCode', 'restartCount', 'health']}
                                        | {'role': role, 'atMs': self.now() * 1000})
            if role == 'edge_runtime' and v['running'] and not self.value['logs']['attempted']:
                self.value['logs']['attempted'] = True
                require(v['tty'] is False, 'FRAME')
                require(not self.closing, 'UNKNOWN')
                self.ports.attach_logs(identity, self)
        except Exception as error:
            self.rejected.add(identity)
            self.fail(error.args[0] if isinstance(error, ValueError) and error.args else 'INSPECT', role)

    def log_status(self, status, mime):
        self.value['logs']['httpStatus'] = status if type(status) is int and 100 <= status <= 599 else None
        if status != 200 or mime not in {'application/vnd.docker.raw-stream', 'application/vnd.docker.multiplexed-stream'}:
            self.fail('LOG_HTTP', 'edge_runtime')
            return False
        return True

    def app(self, channel, body):
        with self.lock:
            name = {1: 'stdout', 2: 'stderr', 3: 'system'}[channel]
            self.value['logs'][name + 'Frames'] += 1
            if channel == 3: self.fail('SYSTEM_FRAME', 'edge_runtime')

    def log_data(self, body):
        if self.finished:
            self.fail('UNKNOWN'); return
        try:
            require(type(body) is bytes and len(body) <= 65544, 'FRAME')
            remaining = LOG_LIMIT - self.raw_size
            captured = body[:remaining]
            if captured: self.sink.raw('mux', captured)
            self.raw_size += len(captured)
            self.value['logs']['rawBytes'] = self.raw_size
            require(len(captured) == len(body), 'LOG_LIMIT')
            self.frames.feed(body)
        except Exception as error:
            self.fail(error.args[0] if isinstance(error, ValueError) and error.args else 'FRAME', 'edge_runtime')
            raise

    def log_end(self, natural):
        self.value['logs'].update(transportEof=natural, frameBoundary=self.frames.boundary())
        if not self.frames.boundary(): self.fail('PARTIAL_FRAME', 'edge_runtime')

    def finish(self):
        self.closing = True
        try: proof = self.ports.close(self.deadline)
        except Exception: proof = False
        try:
            if self.sink.close() is not True: proof = False
        except Exception: proof = False
        self.finished = True
        self.value['closure'] = 'VERIFIED' if proof is True else 'UNKNOWN'
        if proof is not True: self.fail('UNKNOWN')
        self.value['logs']['frameBoundary'] = self.frames.boundary()
        persisted = False
        try:
            raw = json.dumps(self.value, separators=(',', ':'), allow_nan=False).encode()
            require(len(raw) <= META_LIMIT, 'META_LIMIT')
            self.sink.summary(self.value)
            persisted = True
        except Exception as error: self.fail(error.args[0] if isinstance(error, ValueError) and error.args else 'WRITE')
        return {'closure': self.value['closure'], 'persisted': persisted}


class Unobserved:
    def cli_started(self): pass
    def finish(self): return {'closure': 'UNOBSERVED', 'persisted': False}
