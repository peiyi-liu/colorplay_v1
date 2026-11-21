import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deferred,
  setupMediaHandler,
  sourcePath,
} from './content-media-handler-harness';

afterEach(() => vi.restoreAllMocks());
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 50 && !predicate(); i += 1) await Promise.resolve();
  expect(predicate()).toBe(true);
};
describe('content media original handler recovery', () => {
  it('retains committed objects when the completion reply is lost', async () => {
    const supplied = setupMediaHandler({ completeReplyLost: true });
    const response = await supplied.invoke();
    expect(response.status).toBe(200);
    expect(supplied.quarantine.size).toBe(0);
    expect(supplied.status()).toBe('verified');
    expect(supplied.objects.size).toBe(3);
    expect(supplied.events).not.toContain('remove_final');
  });
  it('does not roll committed objects back after quarantine cleanup throws', async () => {
    const supplied = setupMediaHandler({ cleanupThrows: true });
    await supplied.invoke().catch(() => undefined);
    expect(supplied.status()).toBe('verified');
    expect(supplied.objects.size).toBe(3);
  });
  it.each(['error', 'lost', 'denied', 'wrong_run', 'malformed'] as const)(
    'retains final objects when failure fence is %s',
    async (failReply) => {
      const supplied = setupMediaHandler({ uploadFails: true, failReply });
      await supplied.invoke().catch(() => undefined);
      expect(supplied.objects.size).toBe(1);
      expect(supplied.events).not.toContain('remove_final');
    },
  );
  it('cleans only after a definitive failure fence', async () => {
    const supplied = setupMediaHandler({ uploadFails: true, failReply: 'ok' });
    await supplied.invoke();
    expect(supplied.status()).toBe('failed');
    expect(supplied.objects.size).toBe(0);
    expect(supplied.events.indexOf('fail')).toBeLessThan(
      supplied.events.indexOf('remove_final'),
    );
  });
  it('does not run or delete a concurrent processing replay', async () => {
    const gate = deferred();
    const supplied = setupMediaHandler({ completeGate: gate });
    const first = supplied.invoke();
    await until(() => supplied.events.includes('complete'));
    const second = supplied.invoke();
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    gate.resolve();
    await Promise.allSettled([first, second]);
    expect(supplied.processorCalls()).toBe(1);
    expect(
      supplied.events.filter((event) => event === 'download'),
    ).toHaveLength(1);
    expect(supplied.objects.size).toBe(3);
    expect(supplied.events).not.toContain('remove_final');
  });
});

it.each(['lost', 'wrong_run'] as const)(
  'does not confirm abort with %s reply',
  async (abortReply) => {
    const supplied = setupMediaHandler({ abortReply });
    const response = await supplied.invoke('abort');
    expect(response.status).toBe(503);
  },
);
it('prevents a late complete when explicit abort wins first', async () => {
  const gate = deferred();
  const supplied = setupMediaHandler({ completeGate: gate });
  const process = supplied.invoke();
  await until(() => supplied.events.includes('complete'));
  expect((await supplied.invoke('abort')).status).toBe(200);
  gate.resolve();
  await process;
  expect(supplied.status()).not.toBe('verified');
});
it('refuses abort after complete and recovers the original verified receipt', async () => {
  const supplied = setupMediaHandler();
  expect((await supplied.invoke()).status).toBe(200);
  expect((await supplied.invoke('abort')).status).toBe(403);
  expect((await supplied.invoke()).status).toBe(200);
  expect(supplied.processorCalls()).toBe(1);
  expect(supplied.objects.size).toBe(3);
});

it.each(['original', 'manual recovery'] as const)(
  'processes only the first atomic claim when %s arrives first',
  async () => {
    const gate = deferred();
    const supplied = setupMediaHandler({ processorGate: gate });
    const first = supplied.invoke();
    await until(() => supplied.processorCalls() === 1);
    const replay = await supplied.invoke();
    expect(replay.status).toBe(202);
    expect(supplied.events).not.toContain('remove_final');
    gate.resolve();
    expect((await first).status).toBe(200);
    expect(supplied.processorCalls()).toBe(1);
    expect((await supplied.invoke()).status).toBe(200);
    expect(supplied.processorCalls()).toBe(1);
  },
);
it('recovers committed completion returned as an SDK error without deleting final objects', async () => {
  const supplied = setupMediaHandler({ completeReplyError: true });
  const response = await supplied.invoke();
  expect(response.status).toBe(200);
  expect(supplied.objects.size).toBe(3);
  expect(supplied.events).not.toContain('remove_final');
});
it.each(['error', 'lost', 'wrong_run', 'wrong_request', 'malformed'] as const)(
  'retains committed objects and a pending result when reconciliation is %s',
  async (reconcileReply) => {
    const supplied = setupMediaHandler({
      completeReplyLost: true,
      reconcileReply,
    });
    const response = await supplied.invoke();
    expect(response.status).toBe(202);
    expect(supplied.quarantine.has(sourcePath)).toBe(true);
    expect(supplied.objects.size).toBe(3);
    expect(supplied.events).not.toContain('remove_final');
    expect(await response.text()).not.toContain('SYNTHETIC_RAW_MARKER');
  },
);
it('allows retrying confirmed abort after quarantine cleanup was uncertain', async () => {
  const scenario = {
    cleanupThrows: true,
    initialStatus: 'processing' as const,
  };
  const supplied = setupMediaHandler(scenario);
  expect((await supplied.invoke('abort')).status).toBe(503);
  expect(supplied.status()).toBe('aborted');
  scenario.cleanupThrows = false;
  expect((await supplied.invoke('abort')).status).toBe(200);
  expect(supplied.status()).toBe('aborted');
  expect(supplied.processorCalls()).toBe(0);
});

it('reports cleanup uncertainty using only fixed metadata/counts and retains the committed receipt', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const supplied = setupMediaHandler({ cleanupThrows: true });
  const response = await supplied.invoke();
  expect(response.status).toBe(200);
  expect(log).toHaveBeenCalledWith(
    JSON.stringify({
      event: 'content_media_cleanup_unconfirmed',
      bucket: 'quarantine',
      attempted_path_count: 1,
      removed_path_count: null,
    }),
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain('SYNTHETIC_CLEANUP');
  expect(JSON.stringify(log.mock.calls)).not.toContain(sourcePath);
  expect(supplied.events).not.toContain('remove_final');
});

it('cleans only its known quarantine after recovering a committed reply-lost receipt', async () => {
  const supplied = setupMediaHandler({ completeReplyError: true });
  supplied.quarantine.add('synthetic-other-run/source.png');
  expect((await supplied.invoke()).status).toBe(200);
  expect(supplied.quarantine.has(sourcePath)).toBe(false);
  expect([...supplied.quarantine]).toEqual(['synthetic-other-run/source.png']);
  expect(supplied.objects.size).toBe(3);
  expect(supplied.events).not.toContain('remove_final');
});
it('retains the recovered receipt and all final objects when exact quarantine cleanup fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const supplied = setupMediaHandler({
    completeReplyLost: true,
    cleanupThrows: true,
  });
  const response = await supplied.invoke();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ outcome: 'ok' });
  expect(supplied.quarantine.size).toBe(1);
  expect(supplied.objects.size).toBe(3);
  expect(supplied.events).not.toContain('remove_final');
});
it('does not guess quarantine paths for an initial verified replay', async () => {
  const supplied = setupMediaHandler({ initialStatus: 'verified' });
  expect((await supplied.invoke()).status).toBe(200);
  expect(supplied.quarantine.size).toBe(1);
  expect(supplied.events).not.toContain('remove_source');
  expect(supplied.processorCalls()).toBe(0);
});
it('rejects an invalid incomplete processor manifest at the fake completion boundary', async () => {
  const supplied = setupMediaHandler({ omitReading: true });
  expect((await supplied.invoke()).status).toBe(422);
  expect(supplied.status()).toBe('failed');
  expect(supplied.events).toContain('complete_invalid');
  expect(supplied.objects.size).toBe(0);
});
it.each(['ok', 'lost'] as const)(
  'preserves partial-upload reply-lost semantics with a %s failure fence',
  async (failReply) => {
    const supplied = setupMediaHandler({ uploadReplyLost: true, failReply });
    const response = await supplied.invoke();
    expect(response.status).toBe(failReply === 'ok' ? 422 : 202);
    expect(supplied.objects.size).toBe(failReply === 'ok' ? 0 : 2);
    if (failReply === 'lost')
      expect(supplied.events).not.toContain('remove_final');
    else
      expect(supplied.events.indexOf('fail')).toBeLessThan(
        supplied.events.indexOf('remove_final'),
      );
  },
);
