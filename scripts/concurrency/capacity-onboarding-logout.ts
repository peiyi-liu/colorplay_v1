import { z } from 'zod';
const failure = z.enum([
  'OWNER',
  'WINDOW',
  'REGISTER',
  'DUPLICATE',
  'STATUS',
  'DATA',
  'BODY',
  'CODE',
  'ABORT',
  'DISPOSE',
  'POST_LOGIN',
  'PENDING',
  'LATE',
]);
export const onboardingLogoutEvidenceSchema = z.strictObject({
  authority: z.literal('NON_AUTHORITY'),
  candidateCount: z.number().int().min(0).max(2),
  bodyReads: z.number().int().min(0).max(1),
  decodedBytes: z.number().int().min(0).max(4096).nullable(),
  status: z.number().int().min(100).max(599).nullable(),
  code: z.enum(['UNOBSERVED', 'SESSION_NOT_FOUND', 'UNKNOWN']),
  registrationObserved: z.boolean(),
  uiComplete: z.boolean(),
  loginObserved: z.boolean(),
  loginUiComplete: z.boolean(),
  classifiedEvents: z.number().int().min(0).max(1),
  expectedEvents: z.number().int().min(0).max(1),
  pending: z.number().int().min(0).max(1),
  firstFailure: failure.nullable(),
  finalized: z.boolean(),
  revoked: z.boolean(),
});
const bodySchema = z.strictObject({
  code: z.literal(403).optional(),
  error_code: z.literal('session_not_found'),
  msg: z.string().max(2048).optional(),
});
const responseBodySchema = z.strictObject({
  body: z.string().max(4096),
  base64Encoded: z.literal(false),
});
export const isExactLocalLogout = (
  url: string,
  method: string,
  origin: string,
) => {
  try {
    const v = new URL(url);
    return (
      method === 'POST' &&
      v.origin === origin &&
      !v.username &&
      !v.password &&
      !v.hash &&
      v.pathname === '/auth/v1/logout' &&
      v.search === '?scope=local'
    );
  } catch {
    return false;
  }
};
export const createOnboardingLogout = (
  origin: string,
  readBody: (id: string) => Promise<unknown>,
) => {
  let generation: number | null = null,
    loginGeneration: number | null = null,
    opened = false,
    windowDone = false,
    registered = false,
    loginObserved = false,
    loginUi = false,
    candidate: string | null = null,
    candidates = 0,
    status: number | null = null,
    bytes: number | null = 0,
    dataEvents = 0,
    reads = 0,
    pending = 0,
    code: 'UNOBSERVED' | 'SESSION_NOT_FOUND' | 'UNKNOWN' = 'UNOBSERVED',
    first: z.infer<typeof failure> | null = null,
    finalized = false,
    revoked = false,
    expected = 0;
  const seen = new Set<string>();
  let responseSeen = false,
    finished = false;
  const reject = (reason: z.infer<typeof failure>) => {
    first ??= reason;
    revoked = true;
  };
  const live = () => !revoked && !finalized;
  return {
    arm(phase: string, next: number) {
      if (phase === 'registration_complete') {
        if (generation !== null) reject('REGISTER');
        else generation = next;
      } else if (generation !== null && phase === 'post_registration_login') {
        if (!windowDone || !registered || next !== generation + 1)
          reject('POST_LOGIN');
        else loginGeneration = next;
      } else if (generation !== null) reject('POST_LOGIN');
    },
    begin() {
      if (!live() || generation === null || opened) {
        reject('WINDOW');
        return undefined;
      }
      opened = true;
      return {
        complete() {
          if (!live() || !opened || !registered) reject('REGISTER');
          else windowDone = true;
        },
        cancel() {
          reject('WINDOW');
        },
      };
    },
    completed(phase: string, actual: number) {
      if (
        phase === 'registration_complete' &&
        actual === generation &&
        opened &&
        live()
      )
        registered = true;
      if (
        phase === 'post_registration_login' &&
        actual === loginGeneration &&
        live()
      )
        loginObserved = true;
    },
    loginComplete() {
      if (live() && windowDone && loginObserved) loginUi = true;
      else if (generation !== null) reject('POST_LOGIN');
    },
    request(id: string, url: string, method: string, redirected = false) {
      const exact = isExactLocalLogout(url, method, origin);
      const reused = seen.has(id);
      if (opened && !windowDone && seen.size < 2048) seen.add(id);
      else if (opened && !windowDone) reject('DUPLICATE');
      if (id === candidate) {
        candidates = 2;
        reject('DUPLICATE');
        return;
      }
      if (!exact) return;
      candidates = Math.min(2, candidates + 1);
      if (candidates !== 1 || redirected || reused) {
        reject('DUPLICATE');
        return;
      }
      if (!live() || !opened || windowDone || !registered) {
        reject('WINDOW');
        return;
      }
      candidate = id;
    },
    response(id: string, observed: number) {
      if (id !== candidate) return;
      if (responseSeen || finished) {
        reject('DUPLICATE');
        return;
      }
      responseSeen = true;
      status = observed;
      if (observed !== 403) reject('STATUS');
    },
    data(raw: unknown) {
      if (
        !raw ||
        typeof raw !== 'object' ||
        !('requestId' in raw) ||
        raw.requestId !== candidate
      )
        return;
      if (
        !live() ||
        finished ||
        status !== 403 ||
        !('dataLength' in raw) ||
        typeof raw.dataLength !== 'number' ||
        !Number.isSafeInteger(raw.dataLength) ||
        raw.dataLength < 0 ||
        bytes === null ||
        bytes + raw.dataLength > 4096
      ) {
        bytes = null;
        reject('DATA');
        return;
      }
      bytes += raw.dataLength;
      dataEvents++;
    },
    finished(id: string) {
      if (id !== candidate) return;
      if (!live() || windowDone || finished || reads !== 0) {
        reject('LATE');
        return;
      }
      if (status !== 403 || !dataEvents || bytes === null || bytes <= 0) {
        reject('DATA');
        return;
      }
      finished = true;
      reads = 1;
      pending = 1;
      const task = Promise.resolve()
        .then(() => {
          if (!live()) {
            reject('LATE');
            return undefined;
          }
          return readBody(id);
        })
        .then((raw) => {
          if (!live()) return;
          const result = responseBodySchema.safeParse(raw);
          if (
            !result.success ||
            Buffer.byteLength(result.data.body, 'utf8') !== bytes ||
            Buffer.byteLength(result.data.body, 'utf8') > 4096
          ) {
            reject('BODY');
            return;
          }
          try {
            const text = result.data.body;
            const keys = new Set<string>();
            for (const token of text.matchAll(/"(?:\\.|[^"\\])*"/gu)) {
              const key = token[0];
              if (
                !text
                  .slice(token.index + key.length)
                  .trimStart()
                  .startsWith(':')
              )
                continue;
              if (
                !['"error_code"', '"code"', '"msg"'].includes(key) ||
                keys.has(key)
              )
                throw Error();
              keys.add(key);
            }
            if (!keys.has('"error_code"')) throw Error();
            const value: unknown = JSON.parse(text);
            if (!bodySchema.safeParse(value).success) throw Error();
            code = 'SESSION_NOT_FOUND';
          } catch {
            code = 'UNKNOWN';
            reject('CODE');
          }
        })
        .catch(() => {
          if (live()) reject('BODY');
        })
        .finally(() => {
          pending = 0;
        });
      void task.catch(() => undefined);
    },
    failed(id: string) {
      if (id === candidate) reject('BODY');
    },
    cancel(reason: z.infer<typeof failure>) {
      if (generation !== null) {
        if (
          finalized &&
          expected === 1 &&
          first === null &&
          (reason === 'DISPOSE' || reason === 'ABORT')
        )
          revoked = true;
        else reject(reason);
      }
    },
    finalize() {
      if (finalized) return 0;
      finalized = true;
      if (
        revoked ||
        candidates !== 1 ||
        status !== 403 ||
        code !== 'SESSION_NOT_FOUND' ||
        pending ||
        !registered ||
        !windowDone ||
        !loginObserved ||
        !loginUi
      ) {
        if (generation !== null && !revoked)
          reject(pending ? 'PENDING' : 'POST_LOGIN');
        return 0;
      }
      expected = 1;
      return 1;
    },
    discount: () => (first === null ? expected : 0),
    snapshot: () =>
      onboardingLogoutEvidenceSchema.parse({
        authority: 'NON_AUTHORITY',
        candidateCount: candidates,
        bodyReads: reads,
        decodedBytes: bytes,
        status,
        code,
        registrationObserved: registered,
        uiComplete: windowDone,
        loginObserved,
        loginUiComplete: loginUi,
        classifiedEvents: expected,
        expectedEvents: first === null ? expected : 0,
        pending,
        firstFailure: first,
        finalized,
        revoked,
      }),
  };
};
export type OnboardingLogout = ReturnType<typeof createOnboardingLogout>;
