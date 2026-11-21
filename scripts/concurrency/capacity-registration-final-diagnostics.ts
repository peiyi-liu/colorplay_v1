import { finalizeCapacityOnboardingLogout } from './capacity-browser-runtime';
import { onboardingLogoutEvidenceSchema } from './capacity-onboarding-logout';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { PrivateJournal } from './private-journal';
const clock = z.number().nonnegative();
const phase = z.enum([
  'entry',
  'login',
  'post_registration_login',
  'otp_send',
  'otp_verify',
  'registration_complete',
]);
const endpoint = z.enum([
  'APP_DOCUMENT',
  'APP_IMAGE',
  'APP_OTHER',
  'AUTH_OTP',
  'AUTH_VERIFY',
  'AUTH_LOGIN',
  'AUTH_LOGOUT',
  'STUDENT_REGISTER',
  'OTHER_API',
  'EXTERNAL',
  'UNKNOWN',
]);
const reason = z.enum([
  'UNKNOWN',
  'ABORT',
  'STOP',
  'STARTUP',
  'CREATE_ACTOR',
  'ACTOR_ADMISSION',
  'POPUP',
  'CLOSE',
  'REQUEST_PARSE',
  'RESPONSE_PARSE',
  'FINISHED_PARSE',
  'FAILED_PARSE',
  'RECORD_LIMIT',
  'UNARMED_ACTION',
  'DUPLICATE_ACTION',
  'HTTP_STATUS',
  'NETWORK_FAILURE',
  'ACTION_NETWORK_FAILURE',
  'ACTION_RESPONSE',
  'ACTION_FINISH',
  'ACTION_TIMEOUT',
  'ACTION_CANCEL',
  'ARM_INVALID',
  'PAGE_CLOSED',
  'DISPOSE',
  'NETWORK_ENABLE',
  'PROXY_ERROR',
]);
export const registrationFirstReasonSchema = z.strictObject({
  reason,
  atNodeMs: clock.nullable(),
  phase: phase.nullable(),
  endpoint,
  status: z.number().int().min(100).max(599).nullable(),
});
const metadataSchema = z.strictObject({
  collection: z.enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE']),
  firstReason: registrationFirstReasonSchema.nullable(),
  onboarding: onboardingLogoutEvidenceSchema.optional(),
  proxy: z
    .strictObject({
      collection: z.enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE']),
      firstReason: registrationFirstReasonSchema.nullable(),
    })
    .nullable(),
});
const unknown = () => ({
  collection: 'UNOBSERVED' as const,
  firstReason: null,
  proxy: null,
});
const ports = new WeakMap<object, () => unknown>();
const snapshots = new WeakMap<object, z.infer<typeof metadataSchema>>();
export const createRegistrationFirstReason = () => {
  let first: z.infer<typeof registrationFirstReasonSchema> | null = null;
  return {
    note(
      code: z.infer<typeof reason>,
      action: z.infer<typeof phase> | null = null,
      kind: z.infer<typeof endpoint> = 'UNKNOWN',
      status: number | null = null,
    ) {
      if (first) return;
      try {
        let atNodeMs: number | null = null;
        try {
          atNodeMs = clock.parse(performance.now());
        } catch {
          /* Unknown clock. */
        }
        first = registrationFirstReasonSchema.parse({
          reason: code,
          atNodeMs,
          phase: action,
          endpoint: kind,
          status,
        });
      } catch {
        first = {
          reason: 'UNKNOWN',
          atNodeMs: null,
          phase: null,
          endpoint: 'UNKNOWN',
          status: null,
        };
      }
    },
    snapshot: () => ({
      collection: 'OBSERVED' as const,
      firstReason: first,
      proxy: null,
    }),
  };
};
export const registrationPortDiagnostics = (port: object | null) => {
  try {
    return port
      ? metadataSchema.parse(ports.get(port)?.() ?? unknown())
      : unknown();
  } catch {
    return { ...unknown(), collection: 'UNAVAILABLE' as const };
  }
};
export const registerRegistrationDiagnostics = <T extends object>(
  port: T,
  observe: () => unknown,
): T => {
  ports.set(port, observe);
  return port;
};
export const registrationSnapshot = <T extends object>(
  value: T,
  observe: () => unknown,
): T => {
  try {
    snapshots.set(value, metadataSchema.parse(observe()));
  } catch {
    snapshots.set(value, { ...unknown(), collection: 'UNAVAILABLE' });
  }
  return value;
};
export const readRegistrationSnapshotDiagnostics = (value: object) =>
  snapshots.get(value) ?? unknown();
export const registrationEndpoint = (
  url: string,
  app: string,
  api: string,
): z.infer<typeof endpoint> => {
  try {
    const parsed = new URL(url);
    if (
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      parsed.origin === api &&
      parsed.pathname === '/auth/v1/logout' &&
      parsed.search === '?scope=local'
    )
      return 'AUTH_LOGOUT';
    if (parsed.username || parsed.password || parsed.search || parsed.hash)
      return 'UNKNOWN';
    if (parsed.origin === app)
      return parsed.pathname === '/'
        ? 'APP_DOCUMENT'
        : /\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/iu.test(parsed.pathname)
          ? 'APP_IMAGE'
          : 'APP_OTHER';
    if (parsed.origin !== api) return 'EXTERNAL';
    switch (parsed.pathname) {
      case '/auth/v1/otp':
        return 'AUTH_OTP';
      case '/auth/v1/verify':
        return 'AUTH_VERIFY';
      case '/functions/v1/auth-login':
        return 'AUTH_LOGIN';
      case '/functions/v1/student-register':
        return 'STUDENT_REGISTER';
      default:
        return 'OTHER_API';
    }
  } catch {
    return 'UNKNOWN';
  }
};
const actorSnapshot = z.object({
  available: z.boolean(),
  pendingAction: z.boolean(),
  unexpectedHttpErrors: z.number().int().nonnegative(),
  unexpectedNetworkFailures: z.number().int().nonnegative(),
});
const actorRow = z
  .strictObject({
    actorOrdinal: z.number().int().min(0).max(59),
    collection: z.enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE']),
    sampledAtNodeMs: clock.nullable(),
    snapshot: actorSnapshot.nullable(),
    diagnostics: metadataSchema,
  })
  .refine(
    (row) =>
      row.collection === 'OBSERVED'
        ? row.snapshot !== null
        : row.snapshot === null,
    'Collection and snapshot must agree',
  );
export const registrationFinalGateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal('NON_AUTHORITY'),
  clock: z.literal('NODE_MONOTONIC'),
  collection: z.enum(['OBSERVED', 'UNAVAILABLE']),
  atNodeMs: clock.nullable(),
  gate: z.enum(['ACCEPTED', 'REJECTED', 'THREW']),
  actorsExpected: z.number().int().min(1).max(60),
  runtime: z.strictObject({
    collection: z.enum(['OBSERVED', 'UNAVAILABLE']),
    available: z.boolean().nullable(),
    diagnostics: metadataSchema,
  }),
  actors: z.array(actorRow).max(60),
});
interface GateActor {
  actorIndex: number;
  observer: { snapshot(): z.infer<typeof actorSnapshot> };
}
export const observeRegistrationFinalGate = async (
  runtime: { snapshot(): { available: boolean } },
  actors: readonly GateActor[],
  journal: PrivateJournal,
): Promise<boolean> => {
  const rows: z.infer<typeof actorRow>[] = actors.map((actor) => ({
    actorOrdinal: actor.actorIndex,
    collection: 'UNOBSERVED',
    sampledAtNodeMs: null,
    snapshot: null,
    diagnostics: unknown(),
  }));
  let accepted = false,
    original: unknown,
    threw = false,
    valid = true;
  let runtimeRow: z.infer<typeof registrationFinalGateSchema>['runtime'] = {
    collection: 'UNAVAILABLE',
    available: null,
    diagnostics: unknown(),
  };
  const time = () => {
    try {
      return clock.parse(performance.now());
    } catch {
      valid = false;
      return null;
    }
  };
  const atNodeMs = time();
  try {
    const actual = runtime.snapshot();
    const available = actual.available;
    try {
      runtimeRow = {
        collection: 'OBSERVED',
        available: z.boolean().parse(available),
        diagnostics: readRegistrationSnapshotDiagnostics(actual),
      };
    } catch {
      valid = false;
    }
    accepted = !(
      !available ||
      actors.some((actor, index) => {
        finalizeCapacityOnboardingLogout(actor);
        const sample = actor.observer.snapshot();
        const rejected =
          !sample.available ||
          sample.pendingAction ||
          sample.unexpectedHttpErrors !== 0 ||
          sample.unexpectedNetworkFailures !== 0;
        try {
          const fields = Object.getOwnPropertyDescriptors(sample);
          const data = Object.fromEntries(
            [
              'available',
              'pendingAction',
              'unexpectedHttpErrors',
              'unexpectedNetworkFailures',
            ].map((key) => {
              const field = fields[key];
              if (!field || !('value' in field)) throw Error();
              return [key, field.value as unknown];
            }),
          );
          rows[index] = {
            actorOrdinal: actor.actorIndex,
            collection: 'OBSERVED',
            sampledAtNodeMs: time(),
            snapshot: actorSnapshot.parse(data),
            diagnostics: readRegistrationSnapshotDiagnostics(sample),
          };
        } catch {
          valid = false;
          const row = rows[index];
          if (row) rows[index] = { ...row, collection: 'UNAVAILABLE' };
        }
        return rejected;
      })
    );
  } catch (error) {
    original = error;
    threw = true;
    valid = false;
  }
  try {
    const payload = registrationFinalGateSchema.parse({
      schemaVersion: 1,
      authority: 'NON_AUTHORITY',
      clock: 'NODE_MONOTONIC',
      collection: valid ? 'OBSERVED' : 'UNAVAILABLE',
      atNodeMs,
      gate: threw ? 'THREW' : accepted ? 'ACCEPTED' : 'REJECTED',
      actorsExpected: actors.length,
      runtime: runtimeRow,
      actors: rows,
    });
    await journal.write(
      actors.length === 40
        ? 'registration-final-gate-40'
        : actors.length === 60
          ? 'registration-final-gate-60'
          : 'registration-final-gate',
      payload,
    );
  } catch {
    valid = false;
  }
  if (threw) throw original;
  return accepted && valid;
};
