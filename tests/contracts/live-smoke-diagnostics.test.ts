import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
const wire = vi.hoisted(() => ({
  run: undefined as ((input: unknown) => Promise<void>) | undefined,
  timeout: 0,
  error: Error('SYNTHETIC_ORIGINAL_ASSERT'),
}));
vi.mock('@playwright/test', () => ({
  test: Object.assign(
    (_name: string, run: (input: unknown) => Promise<void>) => {
      wire.run = run;
    },
    {
      skip: vi.fn(),
      setTimeout: (value: number) => {
        wire.timeout = value;
      },
    },
  ),
  expect: (locator: { counter?: boolean }) => ({
    toBeVisible: () =>
      locator.counter ? Promise.reject(wire.error) : Promise.resolve(),
    toBeEnabled: () => Promise.resolve(),
  }),
}));
vi.mock('../e2e/helpers/auth', () => ({
  signInStudent: () => Promise.resolve(),
  signInTeacher: () => Promise.resolve(),
}));
vi.mock('../e2e/helpers/classrooms', () => ({
  createClassroom: () =>
    Promise.resolve({ classroomId: 'synthetic', joinCode: 'synthetic' }),
  joinClassroomByCode: () => Promise.resolve(),
}));
const locator = (counter = false) => ({
  counter,
  getByLabel: () => locator(),
  getByRole: () => locator(),
  getByText: (text: string) => locator(text === '已加入 1 人'),
  fill: () => Promise.resolve(),
  click: () => Promise.resolve(),
});
vi.mock('../e2e/helpers/live', () => ({
  launchLiveSessionFromTeacherHome: () =>
    Promise.resolve({ presenter: locator(), joinCode: 'synthetic' }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('actual smoke caller keeps its original roster assertion error while closing and emitting one safe diagnostic', async () => {
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  await import('../e2e/live-smoke.spec');
  const trace: string[] = [];
  const page = () =>
    Object.assign(new EventEmitter(), locator(), {
      url: () =>
        'http://127.0.0.1:4173/teacher/live/11000000-0000-4000-8000-000000000001',
      goto: () => Promise.resolve(),
      addInitScript: () => Promise.resolve(),
      evaluate: () =>
        Promise.resolve({
          presenter: true,
          phase: 'lobby',
          header: true,
          count: 0,
          connection: 'connected',
          error: false,
          trace: '[1,0]',
        }),
      close: () => {
        trace.push('student-close');
        return Promise.resolve();
      },
    });
  const teacher = page(),
    student = page();
  const context = {
    newPage: () => Promise.resolve(teacher),
    close: () => {
      trace.push('teacher-close');
      return Promise.resolve();
    },
  };
  if (!wire.run) throw Error('TEST_REGISTRATION_MISSING');
  await expect(
    wire.run({
      baseURL: 'http://127.0.0.1:4173',
      browser: { newContext: () => Promise.resolve(context) },
      browserName: 'chromium',
      page: student,
    }),
  ).rejects.toBe(wire.error);
  expect(
    output.mock.calls.filter(
      ([value]) =>
        typeof value === 'string' &&
        value.startsWith('LIVE_SMOKE_DIAGNOSTICS '),
    ),
  ).toHaveLength(1);
  expect(trace).toContain('teacher-close');
  expect(wire.timeout).toBe(180_000);
});

import type { Page, Request } from '@playwright/test';
import { createLiveSmokeDiagnostics } from '../e2e/helpers/live-smoke-diagnostics';
import {
  publicState,
  projectLiveSmokeUi,
  binaryTopic,
} from '../e2e/helpers/live-smoke-diagnostic-projections';
const APP = 'http://127.0.0.1:4173',
  API = 'http://127.0.0.1:54321';
const ID = '11000000-0000-4000-8000-000000000001';
const SECRET = 'PRIVATE_SENTINEL_NEVER_PERSIST';
const validUi = () => ({
  presenter: true,
  presenterVisible: true,
  phase: 'lobby',
  header: true,
  headerVisible: true,
  countVisible: true,
  count: 0,
  connection: 'connected',
  error: false,
  trace: '[1,0]',
});
const state = (count = 1) => ({
  session_id: ID,
  state: 'lobby',
  state_version: 2,
  current_position: 0,
  is_host: true,
  participant_count: count,
  participants: [{ display_name: SECRET }],
  question: { prompt: SECRET },
  email: SECRET,
});
const scene = async () => {
  let tick = 0;
  const lines: string[] = [];
  const owner = createLiveSmokeDiagnostics(
    APP,
    API,
    (line) => {
      lines.push(line);
    },
    () => ++tick,
  );
  const host = Object.assign(new EventEmitter(), {
    url: () => APP + '/teacher/live/' + ID,
    addInitScript: () => Promise.resolve(),
    evaluate: vi.fn(() => Promise.resolve(validUi())),
  });
  const student = Object.assign(new EventEmitter(), {
    url: () => APP + '/app/live/' + ID,
  });
  await owner.attach('HOST', host as unknown as Page);
  await owner.attach('STUDENT', student as unknown as Page);
  const forbidden = vi.fn(() => {
    throw Error(SECRET);
  });
  const request = (path = 'get_live_session_state') =>
    Object.defineProperties(
      {
        url: () => API + '/rest/v1/rpc/' + path + '?private=' + SECRET,
        method: () => 'POST',
      },
      {
        headers: { get: forbidden },
        postData: { get: forbidden },
        failure: { get: forbidden },
      },
    ) as unknown as Request;
  const response = (req: Request, data: unknown = state(), status = 200) =>
    Object.defineProperties(
      {
        request: () => req,
        status: () => status,
        json: vi.fn(() => Promise.resolve(data)),
      },
      { headers: { get: forbidden }, body: { get: forbidden } },
    );
  const socket = () => {
    const socket = Object.assign(new EventEmitter(), {
      url: () =>
        API.replace('http', 'ws') + '/realtime/v1/websocket?apikey=' + SECRET,
    });
    host.emit('websocket', socket);
    return socket;
  };
  const finish = async (close = () => Promise.resolve(), failed = false) => {
    await owner.finish(close, failed);
    return JSON.parse(
      lines[0]?.slice('LIVE_SMOKE_DIAGNOSTICS '.length) ?? '{}',
    ) as {
      collection: string;
      drained: boolean;
      teacherClosed: string;
      ui: { collection: string; view: { count: number } | null };
      actors: {
        role: string;
        dropped: number;
        events: [number | null, string, string, number | null, unknown][];
        publicState: { participantCount: number } | null;
      }[];
    };
  };
  return {
    owner,
    host,
    student,
    lines,
    request,
    response,
    socket,
    finish,
    forbidden,
  };
};
const frame = (
  event: string,
  topic = 'live-session',
  ref: unknown = '1',
  joinRef: unknown = ref,
  status = 'ok',
  session = ID,
) =>
  JSON.stringify([
    joinRef,
    ref,
    `realtime:${topic}:${session}`,
    event,
    { status },
  ]);
it.each([false, true])(
  'records exact shared and Host-progress ACK from JSON or Buffer bytes (%s)',
  async (buffer) => {
    const f = await scene(),
      ws = f.socket();
    for (const [topic, ref] of [
      ['live-session', '1'],
      ['live-host-progress', '2'],
    ]) {
      const sent = frame('phx_join', topic, ref, null),
        ack = frame('phx_reply', topic, ref);
      ws.emit('framesent', { payload: buffer ? Buffer.from(sent) : sent });
      ws.emit('framereceived', { payload: buffer ? Buffer.from(ack) : ack });
    }
    const value = await f.finish();
    expect(
      value.actors[0]?.events.filter((r) => r[1] === 'ACK_OK').map((r) => r[2]),
    ).toEqual(['SHARED', 'HOST_PROGRESS']);
    expect(JSON.stringify(value)).not.toContain(ID);
    expect(JSON.stringify(value)).not.toContain(SECRET);
  },
);
it.each([
  'partial',
  'mismatch',
  'numeric',
  'duplicate',
  'late',
  'foreign',
  'case-family',
  'closed',
] as const)(
  'does not invent a current dual ACK for %s frames',
  async (mode) => {
    const f = await scene(),
      ws = f.socket();
    ws.emit('framesent', {
      payload: frame('phx_join', 'live-session', '1', null),
    });
    ws.emit('framereceived', {
      payload: frame('phx_reply', 'live-session', '1'),
    });
    if (mode !== 'partial') {
      ws.emit('framesent', {
        payload: frame('phx_join', 'live-host-progress', '2', null),
      });
      if (mode === 'late')
        ws.emit('framesent', {
          payload: frame('phx_join', 'live-session', '3', null),
        });
      if (mode === 'closed') ws.emit('close');
      ws.emit('framereceived', {
        payload: frame(
          'phx_reply',
          mode === 'case-family' ? 'LIVE-SESSION' : 'live-host-progress',
          mode === 'numeric' ? 2 : '2',
          mode === 'mismatch' ? 'wrong' : '2',
          'ok',
          mode === 'foreign' ? '22000000-0000-4000-8000-000000000002' : ID,
        ),
      });
      if (mode === 'duplicate')
        ws.emit('framereceived', {
          payload: frame('phx_reply', 'live-host-progress', '2'),
        });
    }
    const rows = (await f.finish()).actors[0]?.events ?? [];
    expect(
      rows.filter((r) => r[1] === 'ACK_OK' && r[2] === 'HOST_PROGRESS'),
    ).toHaveLength(mode === 'duplicate' ? 1 : 0);
  },
);
it('decodes the installed kind4 binary broadcast as transport observation, never as an ACK', async () => {
  const f = await scene(),
    ws = f.socket(),
    topic = Buffer.from('realtime:live-session:' + ID),
    event = Buffer.from('live_state');
  const bytes = Buffer.concat([
    Buffer.from([4, topic.length, event.length, 0, 1]),
    topic,
    event,
    Buffer.from('{}'),
  ]);
  expect(binaryTopic(bytes, ID)).toBe('SHARED');
  ws.emit('framereceived', { payload: bytes });
  const rows = (await f.finish()).actors[0]?.events ?? [];
  expect(rows.some((r) => r[1] === 'BINARY_BROADCAST')).toBe(true);
  expect(rows.some((r) => r[1] === 'ACK_OK')).toBe(false);
  expect(() => binaryTopic(Buffer.from([4, 255, 255, 0, 1]), ID)).toThrow();
});
it('records public Host response fields versus failure UI without reading private payload or headers', async () => {
  const f = await scene(),
    req = f.request();
  f.host.emit('request', req);
  const res = f.response(req);
  f.host.emit('response', res);
  await Promise.resolve();
  f.owner.mark('ROSTER_ASSERT');
  f.owner.captureFailure();
  const value = await f.finish();
  expect(value.actors[0]?.publicState?.participantCount).toBe(1);
  expect(value.ui.view?.count).toBe(0);
  expect(value.ui.collection).toBe('OBSERVED');
  expect(f.forbidden).not.toHaveBeenCalled();
  expect(JSON.stringify(value)).not.toMatch(
    /PRIVATE_SENTINEL|11000000|https?:\/\//u,
  );
  expect(Reflect.get(res, 'json')).toHaveBeenCalledTimes(1);
});
it.each([403, 503])(
  'records HTTP%s as status, without consuming that response body',
  async (status) => {
    const f = await scene(),
      req = f.request(),
      res = f.response(req, state(), status);
    f.host.emit('request', req);
    f.host.emit('response', res);
    const value = await f.finish();
    expect(
      value.actors[0]?.events.some(
        (r) => r[1] === 'RESPONSE' && r[3] === status,
      ),
    ).toBe(true);
    expect(value.actors[0]?.publicState).toBeNull();
    expect(Reflect.get(res, 'json')).not.toHaveBeenCalled();
  },
);
it('records student status and failed requests synchronously, never owns a student body', async () => {
  const f = await scene(),
    req = f.request(),
    res = f.response(req);
  f.student.emit('request', req);
  f.student.emit('response', res);
  const bad = f.request('join_live_session');
  f.student.emit('request', bad);
  f.student.emit('requestfailed', bad);
  const value = await f.finish();
  expect(value.actors[1]?.events.some((r) => r[1] === 'FAILED')).toBe(true);
  expect(Reflect.get(res, 'json')).not.toHaveBeenCalled();
});
it.each([
  'proxy',
  'getter',
  'function',
  'custom-prototype',
  'foreign',
] as const)(
  'rejects unsafe or foreign state %s with zero sensitive getter calls',
  (mode) => {
    let calls = 0;
    const getter = () => {
      calls++;
      return SECRET;
    };
    let raw: unknown = state();
    if (mode === 'proxy')
      raw = new Proxy(
        {},
        {
          get() {
            calls++;
            return SECRET;
          },
        },
      );
    if (mode === 'getter')
      raw = Object.defineProperty(state(), 'participant_count', {
        get: getter,
      });
    if (mode === 'function')
      raw = Object.defineProperty(() => undefined, 'state', { get: getter });
    if (mode === 'custom-prototype')
      raw = Object.assign(
        Object.create({
          get state() {
            return getter();
          },
        }) as object,
        { session_id: ID },
      );
    if (mode === 'foreign')
      raw = { ...state(), session_id: '22000000-0000-4000-8000-000000000002' };
    expect(() => publicState(raw, ID)).toThrow();
    expect(() => projectLiveSmokeUi(raw)).toThrow();
    expect(calls).toBe(0);
  },
);
it.each(['next-turn', 'deadline'] as const)(
  'owns response body and failure UI before close (%s), writes once and removes listeners',
  async (mode) => {
    vi.useFakeTimers();
    const f = await scene();
    let body: (value: unknown) => void = () => undefined,
      ui: (value: ReturnType<typeof validUi>) => void = () => undefined,
      failUi: (error: Error) => void = () => undefined;
    const req = f.request();
    f.host.emit('request', req);
    const pendingBody = new Promise<unknown>((resolve) => {
      body = resolve;
    });
    f.host.emit('response', f.response(req, pendingBody));
    f.host.evaluate.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          ui = resolve;
          failUi = reject;
        }),
    );
    let uiCompleted = false;
    f.owner.captureFailure();
    f.owner.stopAdmission();
    const late = f.request();
    f.host.emit('request', late);
    if (mode === 'next-turn')
      setTimeout(() => {
        uiCompleted = true;
        ui(validUi());
      }, 0);
    let closed = false;
    const closing = f.finish(() => {
      closed = true;
      body(state());
      if (!uiCompleted) failUi(Error('SYNTHETIC_PAGE_CLOSED'));
      return Promise.resolve();
    });
    try {
      if (mode === 'deadline') {
        await vi.advanceTimersByTimeAsync(199);
        expect(closed).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
      } else await vi.advanceTimersByTimeAsync(0);
      const value = await closing;
      expect(value.ui.collection).toBe(
        mode === 'next-turn' ? 'OBSERVED' : 'UNAVAILABLE',
      );
      expect(closed).toBe(true);
      expect(value.drained).toBe(true);
      expect(
        value.actors[0]?.events.filter((r) => r[1] === 'REQUEST'),
      ).toHaveLength(1);
      expect(f.lines).toHaveLength(1);
      expect(f.host.eventNames()).toHaveLength(0);
      await f.owner.finish(() => {
        throw Error('MUST_NOT_CLOSE_TWICE');
      }, false);
      expect(f.lines).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      body(state());
      ui(validUi());
      await closing;
      vi.useRealTimers();
    }
  },
);
it('preserves original failure when close and writer also fail, but preserves close failure on original success', async () => {
  const f = await scene(),
    original = Error('ORIGINAL_CLOSE'),
    req = f.request();
  let rejectBody: (error: Error) => void = () => undefined;
  f.host.emit('request', req);
  const pendingBody = new Promise<unknown>((_resolve, reject) => {
    rejectBody = reject;
  });
  f.host.emit('response', f.response(req, pendingBody));
  let settled = false,
    seen: unknown;
  const closing = f.owner
    .finish(() => Promise.reject(original), false)
    .catch((error: unknown) => {
      seen = error;
    })
    .finally(() => {
      settled = true;
    });
  try {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(settled).toBe(true);
    expect(seen).toBe(original);
    const value = JSON.parse(
      f.lines[0]?.slice('LIVE_SMOKE_DIAGNOSTICS '.length) ?? '{}',
    ) as Awaited<ReturnType<typeof f.finish>>;
    expect(value).toMatchObject({
      collection: 'PARTIAL',
      teacherClosed: 'UNKNOWN',
      drained: false,
      pendingAtSeal: 1,
    });
    const prior = f.lines[0];
    rejectBody(Error(SECRET));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(f.lines[0]).toBe(prior);
  } finally {
    rejectBody(Error(SECRET));
    await closing;
  }
  expect(f.lines[0]).toContain('UNKNOWN');
  const owner = createLiveSmokeDiagnostics(APP, API, () => {
    throw Error(SECRET);
  });
  await expect(
    owner.finish(() => Promise.reject(original), true),
  ).resolves.toBeUndefined();
});
it('caps output, seals immutable strings and ignores late callbacks after detaching', async () => {
  const f = await scene();
  const callback = f.host.listeners('request')[0];
  for (let i = 0; i < 150; i++) f.host.emit('request', f.request());
  const value = await f.finish();
  expect(value.collection).toBe('PARTIAL');
  expect(value.actors[0]?.dropped).toBeGreaterThan(0);
  expect(value.actors[0]?.events.length).toBeLessThanOrEqual(64);
  expect(Buffer.byteLength(f.lines[0] ?? '')).toBeLessThan(32768);
  const before = f.lines[0];
  callback?.(f.request());
  f.owner.captureFailure();
  expect(f.lines[0]).toBe(before);
  expect(f.lines).toHaveLength(1);
});

it('missing response remains PARTIAL with no invented public state or header latency', async () => {
  const f = await scene();
  f.host.emit('request', f.request());
  const value = await f.finish();
  expect(value.collection).toBe('PARTIAL');
  expect(value.actors[0]?.publicState).toBeNull();
  expect(value.actors[0]?.events.some((r) => r[1] === 'RESPONSE')).toBe(false);
});
it('M81 trace projection keeps browser order/counters but removes every Page-clock sample', () => {
  const empty = [-1, -1, -1, -1, -1];
  const q = [
    1,
    1,
    1,
    1,
    1,
    ...Array<number>(31).fill(0),
    1,
    0,
    2,
    0,
    777999,
    ...Array.from({ length: 5 }, () => empty).flat(),
    ...Array<number>(8).fill(-1),
    ...empty,
  ];
  const value = projectLiveSmokeUi({ ...validUi(), trace: JSON.stringify(q) });
  expect(value.trace).toMatchObject({
    clock: 'BROWSER_ORDER_ONLY',
    collection: 'OBSERVED',
    last: [[1, 0, 2, 0], ...Array.from({ length: 5 }, () => empty.slice(0, 4))],
  });
  expect(JSON.stringify(value)).not.toContain('777999');
});
