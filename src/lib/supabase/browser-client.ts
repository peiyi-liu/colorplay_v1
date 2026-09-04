import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';
import type { PublicEnv } from '../config/public-env';

let singleton: SupabaseClient<Database> | undefined;

export const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_ERROR_MESSAGE = 'SUPABASE_REQUEST_TIMEOUT';

export class RequestTimeoutError extends Error {
  constructor() {
    super(REQUEST_TIMEOUT_ERROR_MESSAGE);
    this.name = 'RequestTimeoutError';
  }
}

export const isRequestTimeoutError = (error: unknown): boolean => {
  if (error instanceof RequestTimeoutError) return true;
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as Readonly<{ message?: unknown; name?: unknown }>;
  return (
    candidate.name === 'RequestTimeoutError' ||
    candidate.message === REQUEST_TIMEOUT_ERROR_MESSAGE
  );
};

const abortReason = (signal: AbortSignal): Error => {
  const reason = signal.reason as unknown;
  return reason instanceof Error
    ? reason
    : new DOMException('Aborted', 'AbortError');
};

const withBoundedBody = (
  response: Response,
  signal: AbortSignal,
  cleanup: () => void,
): Response => {
  if (
    response.body === null ||
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    cleanup();
    return response;
  }

  const reader = response.body.getReader();
  let finished = false;
  let streamController:
    ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined;

  const finish = () => {
    if (finished) return;
    finished = true;
    signal.removeEventListener('abort', handleAbort);
    cleanup();
  };
  const handleAbort = () => {
    if (finished) return;
    const reason = abortReason(signal);
    void reader.cancel(reason).catch(() => undefined);
    try {
      streamController?.error(reason);
    } finally {
      finish();
    }
  };

  const body = new ReadableStream<Uint8Array>({
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (finished) return;
        if (chunk.done) {
          controller.close();
          finish();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        if (!finished) controller.error(error);
        finish();
      }
    },
    start(controller) {
      streamController = controller;
      signal.addEventListener('abort', handleAbort, { once: true });
      if (signal.aborted) handleAbort();
    },
  });
  const boundedResponse = new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });

  Object.defineProperties(boundedResponse, {
    redirected: { value: response.redirected },
    type: { value: response.type },
    url: { value: response.url },
  });
  return boundedResponse;
};

export const createBoundedFetch = (
  baseFetch: typeof fetch = globalThis.fetch,
  timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS,
): typeof fetch => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('SUPABASE_REQUEST_TIMEOUT_INVALID');
  }

  return async (input, init) => {
    const controller = new AbortController();
    const requestSignal =
      typeof Request !== 'undefined' && input instanceof Request
        ? input.signal
        : undefined;
    const upstreamSignal = init?.signal ?? requestSignal;
    const abortFromUpstream = () => {
      controller.abort(upstreamSignal?.reason);
    };

    if (upstreamSignal?.aborted) abortFromUpstream();
    else
      upstreamSignal?.addEventListener('abort', abortFromUpstream, {
        once: true,
      });

    let cleanedUp = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    };
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        const error = new RequestTimeoutError();
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });

    try {
      const response = await Promise.race([
        baseFetch(input, { ...init, signal: controller.signal }),
        timeout,
      ]);
      return withBoundedBody(response, controller.signal, cleanup);
    } catch (error) {
      cleanup();
      throw error;
    }
  };
};

export function getBrowserSupabaseClient(
  env: PublicEnv,
): SupabaseClient<Database> {
  // sessionStorage：關閉分頁／瀏覽器即結束登入（owner 要求的自動登出），
  // 同分頁重新整理仍可復原 session（E2E-004 refresh recovery）。
  singleton ??= createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { storage: window.sessionStorage },
    global: { fetch: createBoundedFetch() },
  });
  return singleton;
}
