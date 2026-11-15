import { z } from 'zod';
import { executionProfileDigest } from './execution-profile';
import { assertLoopbackUrl } from '../live/capacity-config';

const publicCodes = [
  'FUNCTIONAL_SCOPE_INVALID',
  'FUNCTIONAL_OWNERSHIP_INVALID',
  'FUNCTIONAL_PREFLIGHT_FAILED',
  'FUNCTIONAL_OPERATION_FAILED',
  'FUNCTIONAL_AUTH_FAILED',
  'FUNCTIONAL_MAIL_FAILED',
  'FUNCTIONAL_RECOVERY_INVALID',
  'FUNCTIONAL_BROWSER_FAILED',
  'FUNCTIONAL_STUDENT_FAILED',
  'FUNCTIONAL_FIXTURE_FAILED',
  'FUNCTIONAL_ABORTED',
] as const;
export type FunctionalCode = (typeof publicCodes)[number];
export class FunctionalError extends Error {
  constructor(readonly code: FunctionalCode) {
    super(code);
    this.name = 'FunctionalError';
  }
}
export const fail = (code: FunctionalCode): never => {
  throw new FunctionalError(code);
};
const digest = z.string().regex(/^[0-9a-f]{64}$/u);
const schema = z.strictObject({
  schemaVersion: z.literal(1),
  environment: z.literal('local'),
  projectId: z.literal('cp-whole-site-261115'),
  runId: z.string().regex(/^wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u),
  expectedRevision: z.string().regex(/^[0-9a-f]{40}$/u),
  appUrl: z.string(),
  supabaseUrl: z.string(),
  mailpitUrl: z.string(),
  databaseUrl: z.string(),
  privateRoot: z.string().min(1),
  anonKeySha256: digest,
  serviceKeySha256: digest,
  databaseIdentitySha256: digest,
  runtimeAttestationSha256: digest,
  executionProfileSha256: executionProfileDigest.optional(),
  confirmation: z.literal('LOCAL_WHOLE_SITE_FUNCTIONAL'),
});
export type FunctionalScope = z.infer<typeof schema>;
export const parseFunctionalScope = (value: unknown): FunctionalScope => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return fail('FUNCTIONAL_SCOPE_INVALID');
  const scope = parsed.data;
  try {
    for (const [key, port] of [
      ['appUrl', '58373'],
      ['supabaseUrl', '58321'],
      ['mailpitUrl', '58324'],
    ] as const) {
      if (assertLoopbackUrl(scope[key]).port !== port)
        return fail('FUNCTIONAL_SCOPE_INVALID');
    }
    if (
      assertLoopbackUrl(scope.databaseUrl, true).port !== '58322' ||
      scope.anonKeySha256 === scope.serviceKeySha256
    )
      return fail('FUNCTIONAL_SCOPE_INVALID');
  } catch {
    return fail('FUNCTIONAL_SCOPE_INVALID');
  }
  if (!scope.privateRoot.startsWith('/') || scope.privateRoot.includes('/../'))
    return fail('FUNCTIONAL_SCOPE_INVALID');
  return scope;
};
export const functionalFailureCode = (value: unknown): FunctionalCode => {
  try {
    if (!(value instanceof FunctionalError))
      return 'FUNCTIONAL_OPERATION_FAILED';
    const property = Object.getOwnPropertyDescriptor(value, 'code');
    const code: unknown =
      property && 'value' in property ? property.value : null;
    return typeof code === 'string' &&
      publicCodes.some((allowed) => allowed === code)
      ? (code as FunctionalCode)
      : 'FUNCTIONAL_OPERATION_FAILED';
  } catch {
    return 'FUNCTIONAL_OPERATION_FAILED';
  }
};
export const safely = async <T>(
  operation: () => Promise<T>,
  code: FunctionalCode = 'FUNCTIONAL_OPERATION_FAILED',
): Promise<T> => {
  try {
    return await operation();
  } catch {
    return fail(code);
  }
};
