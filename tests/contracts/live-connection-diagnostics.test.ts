import type { Page, Request, Response } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import {
  createLiveConnectionDiagnostics,
  observeLiveSnapshots,
  liveDiagnosticStageTimings,
} from '../e2e/helpers/live-connection-diagnostics';

const SECRET = 'sensitive-token-email-topic-marker';
const frame = (array: boolean, event: string, payload: unknown, ref = '1') =>
  JSON.stringify(
    array
      ? [null, ref, `realtime:live-session:${SECRET}`, event, payload]
      : { event, payload, ref, topic: `realtime:live-session:${SECRET}` },
  );

describe('safe Live connection diagnostics', () => {
  it.each([false, true])('classifies Phoenix frames (array=%s)', (array) => {
    let now = 100;
    const diagnostics = createLiveConnectionDiagnostics(() => now);
    const generation = diagnostics.beginGeneration(2);
    diagnostics.frame(
      generation,
      'sent',
      frame(array, 'phx_join', { access_token: SECRET }),
    );
    now = 125;
    diagnostics.frame(
      generation,
      'received',
      frame(array, 'phx_reply', { status: 'ok', response: { secret: SECRET } }),
    );
    expect(diagnostics.events()).toEqual([
      { actorIndex: 2, elapsedMs: 0, outcome: 'ok', stage: 'channel_join' },
      { actorIndex: 2, elapsedMs: 25, outcome: 'ok', stage: 'channel_ack' },
    ]);
  });

  it.each([
    ['Token has expired', 'auth'],
    ['Unauthorized', 'permission'],
    ['Too many requests', 'rate_limit'],
    ['too_many_connections', 'connection_limit'],
    ['too_many_joins', 'join_limit'],
    ['transport', 'transport'],
    ['timeout', 'timeout'],
    [SECRET, 'unknown'],
  ])('allowlists the reason %s', (reason, expected) => {
    const diagnostics = createLiveConnectionDiagnostics(() => 0);
    const generation = diagnostics.beginGeneration(1);
    diagnostics.frame(generation, 'sent', frame(false, 'phx_join', {}));
    diagnostics.frame(
      generation,
      'received',
      frame(false, 'phx_reply', {
        status: 'error',
        response: { reason, token: SECRET },
      }),
    );
    expect(diagnostics.events().at(-1)).toMatchObject({
      outcome: 'error',
      reason: expected,
      stage: 'channel_ack',
    });
    expect(JSON.stringify(diagnostics.events())).not.toContain(SECRET);
  });

  it('ignores unmatched replies and stale generations, including reused refs', () => {
    const diagnostics = createLiveConnectionDiagnostics(() => 0);
    const old = diagnostics.beginGeneration(1);
    diagnostics.frame(old, 'sent', frame(false, 'phx_join', {}));
    const current = diagnostics.beginGeneration(1);
    diagnostics.frame(current, 'sent', frame(false, 'phx_join', {}));
    diagnostics.frame(
      old,
      'received',
      frame(false, 'phx_reply', { status: 'ok' }),
    );
    diagnostics.record(old, 'ui_ready', 'ok');
    diagnostics.frame(
      current,
      'received',
      frame(false, 'phx_reply', { status: 'ok' }, 'other'),
    );
    expect(
      diagnostics.events().filter(({ stage }) => stage === 'channel_ack'),
    ).toEqual([]);
    diagnostics.frame(
      current,
      'received',
      frame(false, 'phx_reply', { status: 'ok' }),
    );
    expect(
      diagnostics.events().filter(({ stage }) => stage === 'channel_ack'),
    ).toHaveLength(1);
  });

  it('keeps UI ready independent of ack and leaves unobserved stages absent', () => {
    const diagnostics = createLiveConnectionDiagnostics(() => 0);
    const generation = diagnostics.beginGeneration(1);
    expect(diagnostics.events()).toEqual([]);
    diagnostics.frame(generation, 'sent', frame(false, 'phx_join', {}));
    diagnostics.frame(
      generation,
      'received',
      frame(false, 'phx_reply', { status: 'ok' }),
    );
    expect(diagnostics.events().some(({ stage }) => stage === 'ui_ready')).toBe(
      false,
    );
    diagnostics.record(generation, 'ui_ready', 'timeout', 'timeout');
    expect(diagnostics.events().at(-1)).toMatchObject({
      stage: 'ui_ready',
      outcome: 'timeout',
    });
  });

  it('never emits negative or nonfinite elapsed values and returns independent copies', () => {
    let now = 100;
    const diagnostics = createLiveConnectionDiagnostics(() => now);
    const generation = diagnostics.beginGeneration(1);
    for (const value of [-100, NaN, Infinity, 120]) {
      now = value;
      diagnostics.record(generation, 'snapshot', 'ok');
    }
    const events = diagnostics.events();
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every(
        ({ elapsedMs }) => Number.isFinite(elapsedMs) && elapsedMs >= 0,
      ),
    ).toBe(true);
    events.length = 0;
    expect(diagnostics.events().length).toBeGreaterThan(0);
  });

  it('bounds events and rejects malformed, irrelevant, or unsolicited frames', () => {
    const diagnostics = createLiveConnectionDiagnostics(() => 0);
    const generation = diagnostics.beginGeneration(1);
    for (const raw of [
      'bad json',
      'null',
      '[]',
      frame(false, 'broadcast', { token: SECRET }),
      frame(false, 'phx_reply', { status: 'ok' }),
    ]) {
      diagnostics.frame(generation, 'received', raw);
    }
    expect(diagnostics.events()).toEqual([]);
    for (let index = 0; index < 1000; index += 1)
      diagnostics.record(generation, 'closed', 'error', SECRET);
    expect(diagnostics.events().length).toBeLessThanOrEqual(128);
    expect(JSON.stringify(diagnostics.events())).not.toContain(SECRET);
  });
});

describe('authoritative snapshot observation', () => {
  const state = {
    session_id: '18400000-0000-0000-0000-000000000001',
    state: 'lobby',
    state_version: 1,
    current_position: 0,
    question_count: 3,
    participant_count: 1,
    rules_version: 'test',
    question_display: 'device',
    server_time: '2026-11-12T00:00:00+00:00',
    is_host: false,
    mode: 'individual',
    team_count: null,
  };
  const setup = () => {
    const callbacks = new Map<string, (value: never) => void>();
    const page = {
      on: vi.fn((event: string, callback: (value: never) => void) =>
        callbacks.set(event, callback),
      ),
    } as unknown as Page;
    const diagnostics = createLiveConnectionDiagnostics(() => 0);
    observeLiveSnapshots(page, diagnostics);
    diagnostics.beginGeneration(1);
    return {
      diagnostics,
      emit: (event: string, value: Request | Response) =>
        callbacks.get(event)?.(value as never),
    };
  };
  const request = (pathname = '/rest/v1/rpc/get_live_session_state') =>
    ({
      method: () => 'POST',
      url: () => `https://synthetic.invalid${pathname}`,
    }) as Request;
  const response = (req: Request, body: unknown, status = 200) =>
    ({
      request: () => req,
      ok: () => status === 200,
      status: () => status,
      json: () => Promise.resolve(body),
    }) as Response;

  it('records only schema-valid state RPC responses, never arbitrary 200 or invalid data', async () => {
    const { diagnostics, emit } = setup();
    const arbitrary = request('/rest/v1/rpc/other');
    emit('request', arbitrary);
    emit('response', response(arbitrary, state));
    const invalid = request();
    emit('request', invalid);
    emit('response', response(invalid, { token: SECRET }));
    await vi.waitFor(() => {
      expect(diagnostics.events()).toHaveLength(1);
    });
    expect(diagnostics.events()[0]).toMatchObject({
      stage: 'snapshot',
      outcome: 'error',
    });
    const valid = request();
    emit('request', valid);
    emit('response', response(valid, state));
    await vi.waitFor(() => {
      expect(diagnostics.events()).toHaveLength(2);
    });
    expect(diagnostics.events()[1]).toMatchObject({
      stage: 'snapshot',
      outcome: 'ok',
    });
    expect(JSON.stringify(diagnostics.events())).not.toContain(SECRET);
    expect(JSON.stringify(diagnostics.events())).not.toContain(
      state.session_id,
    );
  });

  it('ignores a previous generation response and classifies HTTP refusal safely', async () => {
    const { diagnostics, emit } = setup();
    const stale = request();
    emit('request', stale);
    diagnostics.beginGeneration(2);
    emit('response', response(stale, state));
    await Promise.resolve();
    expect(diagnostics.events()).toEqual([]);
    const refused = request();
    emit('request', refused);
    emit('response', response(refused, { message: SECRET }, 403));
    expect(diagnostics.events()).toEqual([
      {
        actorIndex: 2,
        elapsedMs: 0,
        stage: 'snapshot',
        outcome: 'error',
        reason: 'permission',
      },
    ]);
  });
});

it('keeps pending and unexecuted stage timings null, separate from UI readiness', () => {
  expect(
    liveDiagnosticStageTimings([
      { actorIndex: 1, stage: 'channel_ack', outcome: 'ok', elapsedMs: 25 },
    ]),
  ).toEqual({
    ws_open: null,
    channel_join: null,
    channel_ack: 25,
    snapshot: null,
    ui_ready: null,
    closed: null,
  });
});

it('passively reuses the original single state body and parse; throwing projection does not create a transport error', async () => {
  const projection =
    await import('../../scripts/concurrency/capacity-live-question-observation');
  const schema =
    await import('../../src/features/live/api/live-repository-schemas');
  const complete = vi.fn(() => {
    throw Error(SECRET);
  });
  const tasks: Promise<unknown>[] = [];
  const begin = vi
    .spyOn(projection, 'beginCapacityLiveStateRead')
    .mockReturnValue({
      complete,
      track: (task) => {
        tasks.push(task);
      },
    });
  const parse = vi.spyOn(schema.stateSchema, 'safeParse');
  const callbacks = new Map<string, (value: never) => void>();
  const page = {
    on: (event: string, callback: (value: never) => void) =>
      callbacks.set(event, callback),
  } as unknown as Page;
  const diagnostic = createLiveConnectionDiagnostics(() => 0);
  observeLiveSnapshots(page, diagnostic);
  diagnostic.beginGeneration(1);
  const req = {
    method: () => 'POST',
    url: () => 'https://synthetic.invalid/rest/v1/rpc/get_live_session_state',
  } as Request;
  const body = {
    session_id: '18400000-0000-0000-0000-000000000001',
    state: 'lobby',
    state_version: 1,
    current_position: 0,
    question_count: 3,
    participant_count: 1,
    rules_version: 'synthetic',
    question_display: 'device',
    server_time: '2026-11-12T00:00:00Z',
    is_host: false,
    mode: 'individual',
    team_count: null,
  };
  const json = vi.fn(() => Promise.resolve(body));
  const response = {
    request: () => req,
    ok: () => true,
    json,
  } as unknown as Response;
  callbacks.get('request')?.(req as never);
  callbacks.get('response')?.(response as never);
  await Promise.allSettled(tasks);
  expect(json).toHaveBeenCalledTimes(1);
  expect(parse).toHaveBeenCalledTimes(1);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(diagnostic.events()).toEqual([
    { actorIndex: 1, stage: 'snapshot', outcome: 'ok', elapsedMs: 0 },
  ]);
  expect(JSON.stringify(diagnostic.events())).not.toContain(SECRET);
  begin.mockRestore();
  parse.mockRestore();
});

it.each(['prototype', 'function', 'array', 'accessor', 'proxy'] as const)(
  'actual question owner rejects %s Node getters without invoking them and accepts null-prototype own public fields',
  async (kind) => {
    const { capacityFixture } = await import('./helpers/whole-site-capacity');
    const { parseCapacityScope } =
      await import('../../scripts/concurrency/capacity-scope');
    const { createCapacityLiveQuestionObservation } =
      await import('../../scripts/concurrency/capacity-live-question-observation');
    const f = await capacityFixture(),
      scope = parseCapacityScope(f.input, f.proof);
    const fields = {
      stateVersion: 1,
      currentPosition: 1,
      questionCount: 20,
      questionDisplay: 'screen_only',
      isHost: false,
    };
    let calls = 0;
    const get = () => {
      calls++;
      return 'question_open';
    };
    const inherited =
      kind === 'prototype'
        ? Object.assign(
            Object.create({
              get state() {
                return get();
              },
            }) as object,
            fields,
          )
        : kind === 'proxy'
          ? new Proxy(fields, {
              get() {
                return get();
              },
            })
          : Object.assign(
              Object.defineProperty(
                kind === 'function'
                  ? () => undefined
                  : kind === 'array'
                    ? []
                    : {},
                'state',
                { get },
              ),
              fields,
            );
    const owner = createCapacityLiveQuestionObservation(
      scope,
      new AbortController().signal,
    );
    owner.watch(
      {} as Page,
      1,
      1,
      inherited as import('../../src/features/live/types').LiveSessionState,
    );
    expect(calls).toBe(0);
    expect(owner.snapshot()).toMatchObject({
      collection: 'UNAVAILABLE',
      rows: [],
    });
    const own = createCapacityLiveQuestionObservation(
      scope,
      new AbortController().signal,
    );
    own.watch(
      {} as Page,
      1,
      1,
      Object.assign(Object.create(null) as object, fields, {
        state: 'question_open',
      }) as import('../../src/features/live/types').LiveSessionState,
    );
    expect(own.snapshot().rows[0]?.node).toMatchObject({
      state: 'question_open',
      stateVersion: 1,
    });
    owner.stopAccepting();
    own.stopAccepting();
    await owner.finish();
    await own.finish();
  },
);
