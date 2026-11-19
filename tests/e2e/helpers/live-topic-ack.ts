import type { Page, Request } from '@playwright/test';
import {
  liveFrameTopic,
  type decodeSafeRealtimeFrame,
} from './live-connection-diagnostics';
type Frame = NonNullable<ReturnType<typeof decodeSafeRealtimeFrame>>;
type Topic = 'SHARED' | 'HOST_PROGRESS';
export type LiveAckMode = 'SHARED' | 'HOST_PROGRESS';

// Raw topic/session/ref bindings stay in this closure and the decoder WeakMap; never in journals.
export const createLiveTopicAck = (page: Page) => {
  let socket = 0,
    documentGeneration = 0,
    session: string | undefined;
  const socketDocuments = new Map<number, number>();
  let failed = false,
    generation = 0;
  const seen = new Set<string>();
  const pending = new Map<string, { kind: Topic; generation: number }>();
  const attempted = new Set<Topic>(),
    acknowledged = new Set<Topic>();
  const waiters = new Set<() => void>();
  const notify = () => {
    for (const check of [...waiters]) check();
  };
  const reset = (failure: boolean) => {
    generation += 1;
    failed = failure;
    pending.clear();
    attempted.clear();
    acknowledged.clear();
    notify();
  };
  const scope = () => {
    try {
      const match = /^\/(?:teacher|app)\/live\/([a-f0-9-]{36})$/iu.exec(
        new URL(page.url()).pathname,
      );
      const value = match?.[1]?.toLowerCase();
      if (value !== session) {
        session = value;
        reset(false);
      }
      return session;
    } catch {
      return undefined;
    }
  };
  page.on('request', (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentGeneration += 1;
      reset(false);
      seen.clear();
    }
  });
  const current = (id: number) =>
    id === socket && socketDocuments.get(id) === documentGeneration;
  const accept = (id: number, frame: Frame) => {
    const expected = scope();
    return current(id) && expected
      ? liveFrameTopic(frame, expected)
      : undefined;
  };
  return {
    open: () => {
      socket += 1;
      socketDocuments.clear();
      socketDocuments.set(socket, documentGeneration);
      seen.clear();
      reset(false);
      return socket;
    },
    sent: (id: number, frame: Frame) => {
      const topic = accept(id, frame);
      if (!topic || frame.event !== 'phx_join' || !frame.ref) return;
      if (seen.has(frame.ref) || seen.size >= 16) {
        reset(true);
        return;
      }
      seen.add(frame.ref);
      if (topic.kind === 'SHARED') reset(false);
      else if (attempted.has('HOST_PROGRESS')) {
        reset(true);
        return;
      }
      if (failed || (!attempted.has('SHARED') && topic.kind !== 'SHARED'))
        return;
      attempted.add(topic.kind);
      pending.set(frame.ref, { kind: topic.kind, generation });
      notify();
    },
    received: (id: number, frame: Frame) => {
      const topic = accept(id, frame);
      if (!topic) return;
      if (
        (frame.event === 'phx_error' || frame.event === 'phx_close') &&
        attempted.has(topic.kind)
      ) {
        reset(true);
        return;
      }
      if (failed || frame.event !== 'phx_reply' || !frame.ref) return;
      const request = pending.get(frame.ref);
      if (
        request?.kind !== topic.kind ||
        request.generation !== generation ||
        (topic.joinRef !== null && topic.joinRef !== frame.ref)
      )
        return;
      pending.delete(frame.ref);
      if (frame.replyStatus !== 'ok') {
        reset(true);
        return;
      }
      acknowledged.add(topic.kind);
      notify();
    },
    closed: (id: number) => {
      if (current(id)) reset(true);
    },
    wait: (
      timeoutMs: number,
      signal?: AbortSignal,
      mode: LiveAckMode = 'SHARED',
    ) => {
      if (
        signal?.aborted ||
        page.isClosed() ||
        !scope() ||
        failed ||
        waiters.size >= 4
      )
        return Promise.resolve(false);
      const ready = () =>
        acknowledged.has('SHARED') &&
        (mode === 'SHARED' || acknowledged.has('HOST_PROGRESS'));
      if (ready()) return Promise.resolve(true);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        return Promise.resolve(false);
      let started: number | null = attempted.has('SHARED') ? generation : null;
      const expectedSession = session;
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          waiters.delete(check);
          signal?.removeEventListener('abort', abort);
          page.off('close', closed);
          resolve(value);
        };
        const check = () => {
          if (started === null && attempted.has('SHARED')) started = generation;
          if (
            failed ||
            (started !== null && generation !== started) ||
            session !== expectedSession ||
            signal?.aborted ||
            page.isClosed()
          )
            finish(false);
          else if (ready()) finish(true);
        };
        const stop = () => {
          reset(true);
          finish(false);
        };
        const abort = stop,
          closed = stop;
        const timer = setTimeout(stop, timeoutMs);
        waiters.add(check);
        signal?.addEventListener('abort', abort, { once: true });
        page.on('close', closed);
        check();
      });
    },
  };
};
