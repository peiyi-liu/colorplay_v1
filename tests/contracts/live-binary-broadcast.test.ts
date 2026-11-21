import { EventEmitter } from 'node:events';

import type { Browser } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';

import { createBrowserLiveActor } from '../../scripts/live/capacity-browser-actor';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import { createCapacityReceipt } from '../../scripts/live/capacity-receipt';
import { isLiveBroadcast } from '../../scripts/live/capacity-live-broadcast';
import { CapacityHarnessError } from '../e2e/helpers/staging-capacity';

const topic = 'realtime:live-session:SYNTHETIC_SESSION';
const config = parseCapacityConfig(
  ['--profile', 'browser', '--revision', 'a'.repeat(40)],
  {},
);
const binaryFrame = (
  metadata = '',
  payload = '{"state_version":2}',
  fields: { topic?: string; event?: string; encoding?: number } = {},
) =>
  Buffer.concat([
    Buffer.from([
      4,
      Buffer.byteLength(fields.topic ?? topic),
      Buffer.byteLength(fields.event ?? 'live_state'),
      Buffer.byteLength(metadata),
      fields.encoding ?? 1,
    ]),
    Buffer.from(fields.topic ?? topic),
    Buffer.from(fields.event ?? 'live_state'),
    Buffer.from(metadata),
    Buffer.from(payload),
  ]);
const envelope = {
  topic,
  event: 'broadcast',
  payload: { event: 'live_state', payload: { state_version: 2 } },
};
const textObject = JSON.stringify(envelope);
const textArray = JSON.stringify([
  null,
  null,
  topic,
  'broadcast',
  envelope.payload,
]);
const exactLimit = binaryFrame(
  '',
  JSON.stringify({
    pad: 'x'.repeat(
      65_536 - binaryFrame('', JSON.stringify({ pad: '' })).length,
    ),
  }),
);
const metadataLimit = JSON.stringify({
  pad: 'x'.repeat(255 - Buffer.byteLength(JSON.stringify({ pad: '' }))),
});
const alter = (frame: Buffer, index: number, value: number) => {
  const modified = Buffer.from(frame);
  modified[index] = value;
  return modified;
};
const payloadStart = 5 + Buffer.byteLength(topic) + 10;
const oversizedText = JSON.stringify({
  ...envelope,
  payload: { event: 'live_state', payload: { label: '色'.repeat(22_000) } },
});
const negativeCases: [string, string | Buffer][] = [
  ['empty', Buffer.alloc(0)],
  ['short header', Buffer.from([4, 10])],
  ['push kind3', alter(binaryFrame(), 0, 3)],
  ['unknown kind', alter(binaryFrame(), 0, 5)],
  ['binary user payload encoding0', binaryFrame('', '{}', { encoding: 0 })],
  ['unknown encoding', binaryFrame('', '{}', { encoding: 2 })],
  ['missing topic', alter(binaryFrame(), 1, 0)],
  ['missing event', alter(binaryFrame(), 2, 0)],
  ['truncated topic', Buffer.from([4, 255, 10, 0, 1, 65])],
  ['truncated metadata', alter(binaryFrame(), 3, 255)],
  ['missing payload', binaryFrame().subarray(0, payloadStart)],
  ['malformed JSON payload', binaryFrame('', '{')],
  ['trailing payload', binaryFrame('', '{}{}')],
  ...['null', '[]', '42', 'true', '"text"'].map((payload): [string, Buffer] => [
    'nonobject payload',
    binaryFrame('', payload),
  ]),
  ...['{', 'null', '[]', '42', '"text"'].map((metadata): [string, Buffer] => [
    'invalid metadata',
    binaryFrame(metadata),
  ]),
  ['invalid topic UTF8', alter(binaryFrame(), 5, 255)],
  [
    'invalid event UTF8',
    alter(binaryFrame(), 5 + Buffer.byteLength(topic), 255),
  ],
  [
    'invalid metadata UTF8',
    alter(binaryFrame('{"x":"v"}'), payloadStart + 6, 255),
  ],
  [
    'invalid payload UTF8',
    alter(binaryFrame('', '{"x":"v"}'), payloadStart + 6, 255),
  ],
  ['BOM topic', binaryFrame('', '{}', { topic: '\uFEFF' + topic })],
  ['BOM event', binaryFrame('', '{}', { event: '\uFEFFlive_state' })],
  ['BOM metadata', binaryFrame('\uFEFF{}')],
  ['BOM payload', binaryFrame('', '\uFEFF{}')],
  ...[
    'other:live-session:x',
    'realtime:other:x',
    'live-session:',
    'realtime:live-session:',
    topic + ':other',
    topic + '/other',
    topic + ' ',
    topic + '\n',
  ].map((name): [string, Buffer] => [
    'wrong namespace',
    binaryFrame('', '{}', { topic: name }),
  ]),
  ['wrong event', binaryFrame('', '{}', { event: 'other' })],
  ['suffixed event', binaryFrame('', '{}', { event: 'live_state_extra' })],
  ['over 64KiB', binaryFrame('', JSON.stringify({ pad: 'x'.repeat(65_536) }))],
  ['one byte over 64KiB', Buffer.concat([exactLimit, Buffer.from(' ')])],
  ['oversize UTF8 text', oversizedText],
  ['oversize UTF8 text Buffer', Buffer.from(oversizedText)],
  [
    'oversized text topic',
    JSON.stringify({ ...envelope, topic: 'live-session:' + 'x'.repeat(256) }),
  ],
  [
    'wrong text namespace',
    JSON.stringify({ ...envelope, topic: 'prefix:' + topic }),
  ],
  ['wrong text event', JSON.stringify({ ...envelope, event: 'phx_reply' })],
  [
    'wrong user event',
    JSON.stringify({ ...envelope, payload: { event: 'other' } }),
  ],
  ['wrong text payload', JSON.stringify({ ...envelope, payload: [] })],
  [
    'wrong inner text payload',
    JSON.stringify({
      ...envelope,
      payload: { event: 'live_state', payload: 'wrong' },
    }),
  ],
  [
    'wrong text metadata',
    JSON.stringify({
      ...envelope,
      payload: { event: 'live_state', meta: null },
    }),
  ],
  [
    'oversized array shape',
    JSON.stringify([null, null, topic, 'broadcast', envelope.payload, {}]),
  ],
  ['malformed text', '{'],
  ['primitive text', 'null'],
  ['invalid UTF8 text Buffer', alter(Buffer.from(textObject), 12, 255)],
];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const setup = async (secondState = 'question_open', secondPosition = 1) => {
  vi.useFakeTimers();
  let reads = 0;
  let outcome = 'waiting';
  const controller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      reads += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            session_id: '00000000-0000-4000-8000-000000000002',
            state: reads === 1 ? 'lobby' : secondState,
            state_version: reads === 1 ? 1 : 2,
            current_position: reads === 1 ? 0 : secondPosition,
            question_count: 3,
            participant_count: 2,
            rules_version: 'synthetic',
            question_display: 'device',
            server_time: '2026-11-14T00:00:00Z',
            is_host: false,
            mode: 'individual',
            team_count: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }),
  );
  const pageEvents = new EventEmitter();
  const socketEvents = new EventEmitter();
  const page = {
    on: (event: string, callback: (...args: unknown[]) => void) =>
      pageEvents.on(event, callback),
    addInitScript: () => Promise.resolve(),
  };
  const context = {
    grantPermissions: () => Promise.resolve(),
    route: () => Promise.resolve(),
    routeWebSocket: () => Promise.resolve(),
    newPage: () => Promise.resolve(page),
    close: () => Promise.resolve(),
  };
  const evidence = createCapacityReceipt(config, 'a'.repeat(40)).actors[1];
  if (!evidence) throw new Error('SYNTHETIC_ACTOR_MISSING');
  const actor = await createBrowserLiveActor(
    { newContext: () => Promise.resolve(context) } as unknown as Browser,
    config,
    {
      anonKey: 'synthetic-public',
      serviceKey: 'synthetic-admin',
      teacherPassword: 'synthetic-password',
    },
    {
      account: 'synthetic',
      password: 'synthetic-password',
      email: 'synthetic@invalid.test',
      role: 'student',
      displayName: 'synthetic',
    },
    controller.signal,
    evidence,
    () => undefined,
  );
  pageEvents.emit('websocket', {
    url: () => 'ws://127.0.0.1/realtime/v1/websocket',
    on: (event: string, callback: (...args: unknown[]) => void) =>
      socketEvents.on(event, callback),
  });
  const pending = actor
    .waitForState(
      '00000000-0000-4000-8000-000000000002',
      (state) => state.state === 'question_open' && state.currentPosition === 1,
    )
    .then(
      () => {
        outcome = 'matched';
        return outcome;
      },
      (error: unknown) => {
        outcome =
          error instanceof CapacityHarnessError ? error.publicCode : 'error';
        return outcome;
      },
    );
  await vi.advanceTimersByTimeAsync(0);
  return {
    evidence,
    pending,
    reads: () => reads,
    outcome: () => outcome,
    emit: (payload: string | Buffer) => {
      socketEvents.emit('framereceived', { payload });
    },
    close: async () => {
      controller.abort();
      await actor.close();
      await pending;
    },
  };
};

it.each([
  ['kind4 optional metadata', binaryFrame()],
  [
    'kind4 multibyte metadata/payload',
    binaryFrame(
      '{"id":"合成🎨"}',
      '{"label":"顏色é🎨","token":"SYNTHETIC_SECRET_MARKER"}',
    ),
  ],
  ['kind4 255-byte metadata', binaryFrame(metadataLimit)],
  [
    'kind4 255-byte topic',
    binaryFrame('', '{}', {
      topic: 'live-session:' + 'x'.repeat(255 - 'live-session:'.length),
    }),
  ],
  ['kind4 exact64KiB', exactLimit],
  [
    'kind4 Buffer offset',
    Buffer.concat([Buffer.from('padding'), binaryFrame()]).subarray(7),
  ],
  ['JSON object text', textObject],
  ['JSON array text', textArray],
  ['JSON object Buffer', Buffer.from(textObject)],
  ['JSON array Buffer', Buffer.from(textArray)],
  [
    'legacy minimal payload',
    JSON.stringify({
      ...envelope,
      topic: 'live-session:SYNTHETIC_SESSION',
      payload: { event: 'live_state' },
    }),
  ],
] as [string, string | Buffer][])(
  'wakes the public actor for %s and fetches authoritative state again',
  async (_name, frame) => {
    const probe = await setup();
    try {
      expect(probe.reads()).toBe(1);
      probe.emit(frame);
      await vi.advanceTimersByTimeAsync(0);
      expect(probe.evidence.broadcasts).toBe(1);
      expect(probe.reads()).toBe(2);
      await expect(probe.pending).resolves.toBe('matched');
      expect(JSON.stringify(probe.evidence)).not.toContain(
        'SYNTHETIC_SECRET_MARKER',
      );
    } finally {
      await probe.close();
    }
  },
);

it.each(negativeCases)('fails closed for %s', (_name, frame) => {
  expect(isLiveBroadcast(frame)).toBe(false);
});

it('ignores malformed/unrelated frames through the public observer and keeps the original 20s timeout', async () => {
  const probe = await setup();
  try {
    for (const [, frame] of negativeCases) {
      probe.emit(frame);
      expect(probe.evidence.broadcasts).toBe(0);
    }
    await vi.advanceTimersByTimeAsync(19_999);
    expect(probe.reads()).toBe(1);
    expect(probe.outcome()).toBe('waiting');
    await vi.advanceTimersByTimeAsync(1);
    await expect(probe.pending).resolves.toBe('CAPACITY_STAGE_TIMEOUT');
  } finally {
    await probe.close();
  }
});

it.each([
  ['lobby', 1],
  ['question_open', 2],
] as const)(
  'does not trust a broadcast over authoritative %s/position%s',
  async (state, position) => {
    const probe = await setup(state, position);
    try {
      probe.emit(
        binaryFrame('', '{"state":"question_open","current_position":1}'),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(probe.evidence.broadcasts).toBe(1);
      expect(probe.reads()).toBe(2);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(probe.pending).resolves.toBe('CAPACITY_STAGE_TIMEOUT');
    } finally {
      await probe.close();
    }
  },
);

it('uses byte rather than character limits at exactly 64KiB and for multibyte UTF8', () => {
  expect(exactLimit.byteLength).toBe(65_536);
  expect(isLiveBroadcast(exactLimit)).toBe(true);
  expect(oversizedText.length).toBeLessThan(65_536);
  expect(Buffer.byteLength(oversizedText)).toBeGreaterThan(65_536);
  expect(isLiveBroadcast(oversizedText)).toBe(false);
});
