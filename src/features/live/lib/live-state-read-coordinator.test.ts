import { expect, it } from 'vitest';

import type { LiveSessionState } from '../types';
import {
  pendingLiveStateReads,
  readLiveState,
} from './live-state-read-coordinator';

const state: LiveSessionState = {
  sessionId: 'synthetic',
  state: 'lobby',
  stateVersion: 2,
  currentPosition: 0,
  questionCount: 3,
  participantCount: 1,
  rulesVersion: 'synthetic',
  questionDisplay: 'device',
  serverTime: '2026-11-14T00:00:00Z',
  isHost: true,
};
const deferred = () => {
  let resolve!: (value: LiveSessionState) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<LiveSessionState>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return {
    promise,
    resolve: (value: LiveSessionState) => {
      resolve(value);
    },
    reject: (error: unknown) => {
      reject(error);
    },
  };
};

it('shares one physical read plus one coalesced queued read and waits for both to settle', async () => {
  const owner = {};
  const first = deferred();
  const next = deferred();
  let calls = 0;
  const read = () => {
    calls += 1;
    return calls === 1 ? first.promise : next.promise;
  };
  const active = readLiveState(owner, 'session', read);
  const queued = Array.from({ length: 39 }, () =>
    readLiveState(owner, 'session', read),
  );
  expect(calls).toBe(1);
  expect(new Set(queued).size).toBe(1);
  let idle = false;
  const settled = pendingLiveStateReads(owner, 'session')?.then(() => {
    idle = true;
  });
  first.resolve(state);
  await active;
  expect(calls).toBe(2);
  expect(idle).toBe(false);
  next.resolve({ ...state, stateVersion: 3 });
  await expect(Promise.all(queued)).resolves.toEqual(
    Array.from({ length: 39 }, () => ({ ...state, stateVersion: 3 })),
  );
  await settled;
  expect(idle).toBe(true);
  expect(pendingLiveStateReads(owner, 'session')).toBeUndefined();
});

it('keeps query clients and session keys isolated', async () => {
  const owner = {};
  const other = {};
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const reads = [
    readLiveState(owner, 'a', () => first.promise),
    readLiveState(owner, 'b', () => second.promise),
    readLiveState(other, 'a', () => third.promise),
  ];
  first.resolve(state);
  second.resolve(state);
  third.resolve(state);
  await Promise.all(reads);
  expect(pendingLiveStateReads(owner, 'a')).toBeUndefined();
  expect(pendingLiveStateReads(owner, 'b')).toBeUndefined();
  expect(pendingLiveStateReads(other, 'a')).toBeUndefined();
});

it('forwards the original failure without adding retries and still drains queued work', async () => {
  const owner = {};
  const first = deferred();
  const error = new Error('SYNTHETIC_READ_ERROR');
  const active = readLiveState(owner, 'a', () => first.promise);
  const failed = expect(active).rejects.toBe(error);
  const next = readLiveState(owner, 'a', () => Promise.resolve(state));
  first.reject(error);
  await failed;
  await expect(next).resolves.toEqual(state);
  expect(pendingLiveStateReads(owner, 'a')).toBeUndefined();
});

it('coalesces queued observers using their latest requested reader', async () => {
  const owner = {};
  const first = deferred();
  const active = readLiveState(owner, 'a', () => first.promise);
  let superseded = 0;
  const older = readLiveState(owner, 'a', () => {
    superseded += 1;
    return Promise.resolve(state);
  });
  const newer = readLiveState(owner, 'a', () =>
    Promise.resolve({ ...state, stateVersion: 4 }),
  );
  first.resolve(state);
  await active;
  await expect(older).resolves.toMatchObject({ stateVersion: 4 });
  await expect(newer).resolves.toMatchObject({ stateVersion: 4 });
  expect(superseded).toBe(0);
});

it('settles a synchronous reader failure and releases its tracking entry', async () => {
  const owner = {};
  const error = new Error('SYNTHETIC_READ_ERROR');
  await expect(
    readLiveState(owner, 'a', () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(pendingLiveStateReads(owner, 'a')).toBeUndefined();
  await expect(
    readLiveState(owner, 'a', () => Promise.resolve(state)),
  ).resolves.toEqual(state);
});
