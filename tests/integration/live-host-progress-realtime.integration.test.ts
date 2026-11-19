import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, expect, it } from 'vitest';
import { z } from 'zod';
import { createLiveRepository } from '../../src/features/live/api/live-repository';
import type { Database } from '../../src/types/database';
import { isExplicitPermissionDenial } from '../../scripts/live/capacity-permission-denial';
import { CLASSROOM_FIXTURES, TEST_USERS } from '../fixtures/users';

// This file is executed only by fresh Local DB integration CI, never a mock or Hosted.
const clients: SupabaseClient<Database>[] = [];
const channels: { close: () => Promise<unknown> }[] = [];
const denialAudits: (() => void)[] = [];
const forgeryAudits: (() => void)[] = [];
const makeClient = () => {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key || new URL(url).origin !== 'http://127.0.0.1:54321')
    throw new Error('LOCAL_PUBLIC_ENV_INVALID');
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(client);
  return client;
};
const login = async (fixture: (typeof TEST_USERS)[keyof typeof TEST_USERS]) => {
  const client = makeClient();
  const result = await client.auth.signInWithPassword(fixture);
  expect(result.error).toBeNull();
  expect(result.data.session).not.toBeNull();
  await client.realtime.setAuth(result.data.session?.access_token);
  return client;
};
const assertPermissionRefusal = (status: string, error?: Error) => {
  expect(status).toBe('CHANNEL_ERROR');
  expect(isExplicitPermissionDenial(error)).toBe(true);
};
const subscribe = (
  client: SupabaseClient<Database>,
  topic: string,
  received: unknown[] = [],
) => {
  const channel = client.channel(topic, {
    config: { private: true, broadcast: { ack: true, self: true } },
  });
  let first: { status: string; error: Error | undefined } | undefined;
  let latest: string | undefined;
  let everSubscribed = false,
    contradiction = false,
    ownClosing = false;
  let closing: Promise<unknown> | undefined;
  const close = () => {
    ownClosing = true;
    return (closing ??= client.removeChannel(channel));
  };
  channels.push({ close });
  const settled = new Promise<string>((resolve) => {
    channel.on('broadcast', { event: 'live_state' }, (message) => {
      received.push(message.payload);
    });
    const remember = (status: string, error?: Error) => {
      first ??= { status, error };
      latest = status;
      if (status === 'SUBSCRIBED') everSubscribed = true;
      if (
        !(status === 'CHANNEL_ERROR' && isExplicitPermissionDenial(error)) &&
        !(
          status === 'CLOSED' &&
          ownClosing &&
          first.status === 'CHANNEL_ERROR' &&
          isExplicitPermissionDenial(first.error)
        )
      )
        contradiction = true;
      resolve(status);
    };
    channel.subscribe(remember, 10_000);
  });
  return {
    channel,
    settled,
    close,
    assertDenied: () => {
      assertPermissionRefusal(first?.status ?? 'UNOBSERVED', first?.error);
      expect(everSubscribed).toBe(false);
      expect(contradiction).toBe(false);
    },
    assertHealthy: () => {
      expect(latest).toBe('SUBSCRIBED');
    },
    assertNoForgery: () => {
      expect(
        received.some(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            'state' in value &&
            value.state === 'forged',
        ),
      ).toBe(false);
    },
  };
};
afterAll(async () => {
  await Promise.all(channels.map((entry) => entry.close()));
  for (const audit of [...denialAudits, ...forgeryAudits]) audit();
  await Promise.all(
    clients.map((client) => client.auth.signOut({ scope: 'local' })),
  );
});
it('real private SDK enforces Host-only progress and preserves shared roster/phase, with no service key', async () => {
  const [host, one, two, otherHost, outsider] = await Promise.all([
    login(TEST_USERS.teacher),
    login(TEST_USERS.studentOne),
    login(TEST_USERS.studentTwo),
    login(TEST_USERS.teacherTwo),
    login(TEST_USERS.outsider),
  ]);
  const owned = await host.rpc('list_owned_classrooms');
  expect(owned.error).toBeNull();
  const classroom = owned.data?.find(
    (row) => row.classroom_name === CLASSROOM_FIXTURES.teacherOneClassroom.name,
  );
  if (!classroom) throw new Error('LOCAL_CLASSROOM_FIXTURE_MISSING');
  const owner = createLiveRepository(host),
    studentOne = createLiveRepository(one),
    studentTwo = createLiveRepository(two);
  const activity = await owner.createActivity({
    title: 'M82 transport ' + randomUUID(),
    quizTemplateId: '4f208855-dfc8-6cc5-7671-02dfacba85d1',
    questionTimeLimitSeconds: 20,
    questionDisplay: 'device',
  });
  const created = await owner.createSession({
    activityId: activity.activityId,
    assignmentId: null,
    classroomId: classroom.classroom_id,
  });
  const sharedTopic = 'live-session:' + created.sessionId,
    progressTopic = 'live-host-progress:' + created.sessionId;
  try {
    const shared: unknown[] = [],
      progress: unknown[] = [],
      studentMessages: unknown[] = [];
    const main = subscribe(host, sharedTopic, shared),
      updates = subscribe(host, progressTopic, progress);
    expect(await main.settled).toBe('SUBSCRIBED');
    expect(await updates.settled).toBe('SUBSCRIBED');
    await owner.startSession(created.sessionId, created.stateVersion);
    await studentOne.join({
      joinCode: created.joinCode,
      requestId: randomUUID(),
    });
    await studentTwo.join({
      joinCode: created.joinCode,
      requestId: randomUUID(),
    });
    const studentMain = subscribe(one, sharedTopic, studentMessages);
    expect(await studentMain.settled).toBe('SUBSCRIBED');
    for (const client of [one, two, otherHost, outsider, makeClient()]) {
      const denied = subscribe(client, progressTopic);
      await denied.settled;
      denied.assertDenied();
      expect(await denied.close()).toBe('ok');
      denied.assertDenied();
      denialAudits.push(denied.assertDenied);
    }
    for (const suffix of ['', ':extra', '-invalid']) {
      const denied = subscribe(
        host,
        'live-host-progress:' +
          (suffix ? created.sessionId + suffix : 'not-a-uuid'),
      );
      await denied.settled;
      denied.assertDenied();
      expect(await denied.close()).toBe('ok');
      denied.assertDenied();
      denialAudits.push(denied.assertDenied);
    }
    // A write=false server may intentionally send no ACK. This result is transport-only.
    const sendOutcome = await updates.channel.send({
      type: 'broadcast',
      event: 'live_state',
      payload: { state: 'forged' },
    });
    expect(['ok', 'error', 'timed out']).toContain(sendOutcome);
    expect(await updates.channel.track({ state: 'forged' })).toBe('error');
    forgeryAudits.push(updates.assertNoForgery);
    const lobby = await owner.getState(created.sessionId);
    await owner.openQuestion(created.sessionId, lobby.stateVersion);
    const open = await studentOne.getState(created.sessionId),
      q = open.question;
    if (!q?.publicOptions[0]) throw new Error('LOCAL_QUESTION_FIXTURE_MISSING');
    const answer = {
      sessionQuestionId: q.questionId,
      selectedOptionId: q.publicOptions[0].id,
      idempotencyKey: randomUUID(),
    };
    await studentOne.submitAnswer(answer);
    await expect.poll(() => progress.length, { timeout: 5000 }).toBe(1);
    const wire = z.strictObject({
      id: z.uuid(),
      session_id: z.literal(created.sessionId),
      state: z.literal('question_open'),
      state_version: z.literal(open.stateVersion),
      answered_count: z.number().int(),
    });
    const first = wire.safeParse(progress[0]);
    expect(first.success).toBe(true);
    if (!first.success) throw new Error('HOST_PROGRESS_WIRE_INVALID');
    expect(first.data.answered_count).toBe(1);
    await studentOne.submitAnswer(answer);
    await studentTwo.submitAnswer({ ...answer, idempotencyKey: randomUUID() });
    await expect.poll(() => progress.length, { timeout: 5000 }).toBe(2);
    await expect
      .poll(
        () =>
          studentMessages.some(
            (value) =>
              typeof value === 'object' &&
              value !== null &&
              'state' in value &&
              value.state === 'question_feedback',
          ),
        { timeout: 5000 },
      )
      .toBe(true);
    expect(
      shared.some(
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          'joined_display_name' in value,
      ),
    ).toBe(true);
    for (const value of [...shared, ...studentMessages]) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'state' in value &&
        value.state === 'question_open'
      )
        expect(value).not.toHaveProperty('answered_count');
    }
    expect(progress).toHaveLength(2);
    for (const [index, message] of progress.entries()) {
      const parsed = wire.safeParse(message);
      expect(parsed.success).toBe(true);
      if (!parsed.success) throw new Error('HOST_PROGRESS_WIRE_INVALID');
      expect(parsed.data.answered_count).toBe(index + 1);
    }
    updates.assertNoForgery();
    for (const audit of denialAudits) audit();
    main.assertHealthy();
    updates.assertHealthy();
    studentMain.assertHealthy();
    expect(await owner.getState(created.sessionId)).toMatchObject({
      state: 'question_feedback',
    });
  } finally {
    const state = await owner.getState(created.sessionId);
    if (!['completed', 'cancelled'].includes(state.state))
      await owner.cancel(created.sessionId, state.stateVersion);
  }
}, 120_000);

it.each(['TIMED_OUT', 'CLOSED', 'UNKNOWN'])(
  'offline SDK refusal contract rejects %s as authorization evidence',
  (status) => {
    expect(() => {
      assertPermissionRefusal(status, new Error('transport'));
    }).toThrow();
  },
);
it('offline SDK refusal contract requires explicit permission rather than arbitrary CHANNEL_ERROR', () => {
  expect(() => {
    assertPermissionRefusal('CHANNEL_ERROR', new Error('transport'));
  }).toThrow();
  expect(() => {
    assertPermissionRefusal('CHANNEL_ERROR', new Error('Unauthorized'));
  }).not.toThrow();
});

it.each(['SUBSCRIBED', 'TIMED_OUT', 'transport'])(
  'offline SDK denial latch rejects a later %s contradiction even after own removal',
  async (status) => {
    let callback!: (status: string, error?: Error) => void;
    const channel = {
      on: () => channel,
      subscribe: (fn: typeof callback) => {
        callback = fn;
        return channel;
      },
    };
    const client = {
      channel: () => channel,
      removeChannel: () => Promise.resolve('ok'),
    } as unknown as SupabaseClient<Database>;
    const observed = subscribe(client, 'synthetic');
    callback('CHANNEL_ERROR', new Error('Unauthorized'));
    await observed.settled;
    observed.assertDenied();
    await observed.close();
    callback(
      status,
      status === 'transport' ? new Error('transport') : undefined,
    );
    expect(() => {
      observed.assertDenied();
    }).toThrow();
  },
);
it('offline SDK denial latch accepts only explicit refusal and its own CLOSED cleanup', async () => {
  let callback!: (status: string, error?: Error) => void;
  const channel = {
    on: () => channel,
    subscribe: (fn: typeof callback) => {
      callback = fn;
      return channel;
    },
  };
  const client = {
    channel: () => channel,
    removeChannel: () => {
      callback('CLOSED');
      return Promise.resolve('ok');
    },
  } as unknown as SupabaseClient<Database>;
  const observed = subscribe(client, 'synthetic');
  callback('CHANNEL_ERROR', new Error('Forbidden'));
  await observed.settled;
  observed.assertDenied();
  await observed.close();
  observed.assertDenied();
});

it('offline SDK denial latch rejects CLOSED before its own removal', async () => {
  let callback!: (status: string, error?: Error) => void;
  const channel = {
    on: () => channel,
    subscribe: (fn: typeof callback) => {
      callback = fn;
      return channel;
    },
  };
  const client = {
    channel: () => channel,
    removeChannel: () => Promise.resolve('ok'),
  } as unknown as SupabaseClient<Database>;
  const observed = subscribe(client, 'synthetic');
  callback('CHANNEL_ERROR', new Error('Forbidden'));
  await observed.settled;
  callback('CLOSED');
  expect(() => {
    observed.assertDenied();
  }).toThrow();
  await observed.close();
});
