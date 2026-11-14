export const AUTH_LOGIN_DEADLINE_MS = 12_000;

class AuthLoginDeadlineError extends Error {
  constructor() {
    super('AUTH_TIMEOUT');
    this.name = 'AbortError';
  }
}

// A single request budget covers SDK fetches and every consumed body. No hop
// starts its own timer, and aborting one request cannot cancel another one.
export const createAuthLoginDeadline = (
  requestSignal: AbortSignal,
  now: () => number,
) => {
  const controller = new AbortController();
  const expiresAt = now() + AUTH_LOGIN_DEADLINE_MS;
  const bodies = new Set<() => void>();
  const abort = () => {
    controller.abort(new AuthLoginDeadlineError());
  };
  const timer = setTimeout(abort, AUTH_LOGIN_DEADLINE_MS);
  let rejectAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => {
      reject(new AuthLoginDeadlineError());
    };
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  requestSignal.addEventListener('abort', abort, { once: true });
  if (requestSignal.aborted) abort();
  const check = () => {
    if (now() >= expiresAt) abort();
    controller.signal.throwIfAborted();
  };
  const bindBody = (response: Response): Response => {
    check();
    if (response.body === null) return response;
    const reader = response.body.getReader();
    let finished = false;
    let streamController:
      ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      controller.signal.removeEventListener('abort', cancel);
      bodies.delete(cancel);
    };
    const cancel = () => {
      if (finished) return;
      finish();
      void reader.cancel().catch(() => undefined);
      streamController?.error(new AuthLoginDeadlineError());
    };
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(value) {
        streamController = value;
        bodies.add(cancel);
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (controller.signal.aborted) cancel();
      },
      async pull(value) {
        try {
          const chunk = await reader.read();
          if (finished) return;
          if (chunk.done) {
            finish();
            value.close();
          } else value.enqueue(new Uint8Array(chunk.value));
        } catch {
          if (!finished) {
            finish();
            value.error(new Error('AUTH_BODY_UNAVAILABLE'));
          }
        }
      },
      cancel() {
        finish();
        void reader.cancel().catch(() => undefined);
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  return {
    signal: controller.signal,
    check,
    run: <T>(operation: () => Promise<T>): Promise<T> =>
      Promise.race([
        Promise.resolve().then(() => {
          check();
          return operation();
        }),
        aborted,
      ]),
    fetch:
      (fetcher: typeof fetch): typeof fetch =>
      async (input, init) => {
        const safeFailure = (status: 503 | 504) =>
          new Response(
            JSON.stringify({
              message: status === 504 ? 'AUTH_TIMEOUT' : 'AUTH_UNAVAILABLE',
            }),
            { status, headers: { 'Content-Type': 'application/json' } },
          );
        if (now() >= expiresAt) abort();
        if (controller.signal.aborted) return safeFailure(504);
        let response: Response;
        try {
          response = await fetcher(input, {
            ...init,
            signal: controller.signal,
          });
        } catch {
          // Only fetch rejection is translated here: GoTrue otherwise logs its
          // provider exception. Body parsing and handler logic use their own gates.
          return safeFailure(controller.signal.aborted ? 504 : 503);
        }
        if (now() >= expiresAt) abort();
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          return safeFailure(504);
        }
        return bindBody(response);
      },
    json: (request: Request): Promise<unknown> =>
      bindBody(new Response(request.body)).json(),
    dispose() {
      clearTimeout(timer);
      requestSignal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', rejectAbort);
      for (const cancel of [...bodies]) cancel();
    },
  };
};
