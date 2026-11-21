import { z } from 'zod';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const codes = new Set([
  'ERR_FAILED',
  'ERR_ABORTED',
  'ERR_BLOCKED_BY_ORB',
  'ERR_BLOCKED_BY_RESPONSE',
  'ERR_BLOCKED_BY_CLIENT',
  'ERR_BLOCKED_BY_ADMINISTRATOR',
  'ERR_ACCESS_DENIED',
  'ERR_NETWORK_ACCESS_DENIED',
  'ERR_LOCAL_NETWORK_PERMISSION_CHECK_FAILED',
  'ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_CLOSED',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_EMPTY_RESPONSE',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_TIMED_OUT',
  'ERR_HTTP_RESPONSE_CODE_FAILURE',
  'ERR_CONTENT_LENGTH_MISMATCH',
  'ERR_INCOMPLETE_CHUNKED_ENCODING',
  'ERR_CONTENT_DECODING_FAILED',
  'ERR_INVALID_RESPONSE',
  'ERR_TOO_MANY_REDIRECTS',
  'ERR_UNSAFE_REDIRECT',
  'ERR_CLEARTEXT_NOT_PERMITTED',
  'ERR_SSL_PROTOCOL_ERROR',
  'ERR_CERT_AUTHORITY_INVALID',
] as const);
export const imageFailureCode = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.length > 128) return 'UNKNOWN';
  const value = raw.startsWith('Failed to load resource: net::')
    ? raw.slice('Failed to load resource: net::'.length)
    : raw.startsWith('net::')
      ? raw.slice(5)
      : '';
  return [...codes].find((code) => code === value) ?? 'UNKNOWN';
};
const reason = (raw: unknown, allowed: readonly string[]) =>
  raw === undefined
    ? 'NONE'
    : typeof raw === 'string' && allowed.includes(raw)
      ? raw
      : 'UNKNOWN';
export const imageBlockedReason = (raw: unknown) =>
  reason(raw, [
    'other',
    'csp',
    'mixed-content',
    'origin',
    'inspector',
    'integrity',
    'subresource-filter',
    'content-type',
    'coep-frame-resource-needs-coep-header',
    'coop-sandboxed-iframe-cannot-navigate-to-coop-page',
    'corp-not-same-origin',
    'corp-not-same-origin-after-defaulted-to-same-origin-by-coep',
    'corp-not-same-origin-after-defaulted-to-same-origin-by-dip',
    'corp-not-same-site',
    'sri-message-signature-mismatch',
  ]);
export const imageCorsReason = (raw: unknown) =>
  reason(raw, [
    'DisallowedByMode',
    'InvalidResponse',
    'WildcardOriginNotAllowed',
    'MissingAllowOriginHeader',
    'MultipleAllowOriginValues',
    'InvalidAllowOriginValue',
    'AllowOriginMismatch',
    'InvalidAllowCredentials',
    'CorsDisabledScheme',
    'PreflightInvalidStatus',
    'PreflightDisallowedRedirect',
    'PreflightWildcardOriginNotAllowed',
    'PreflightMissingAllowOriginHeader',
    'PreflightMultipleAllowOriginValues',
    'PreflightInvalidAllowOriginValue',
    'PreflightAllowOriginMismatch',
    'PreflightInvalidAllowCredentials',
    'PreflightMissingAllowExternal',
    'PreflightInvalidAllowExternal',
    'PreflightMissingAllowPrivateNetwork',
    'PreflightInvalidAllowPrivateNetwork',
    'InvalidAllowMethodsPreflightResponse',
    'InvalidAllowHeadersPreflightResponse',
    'MethodDisallowedByPreflightResponse',
    'HeaderDisallowedByPreflightResponse',
    'RedirectContainsCredentials',
    'InsecurePrivateNetwork',
    'InvalidPrivateNetworkAccess',
    'UnexpectedPrivateNetworkAccess',
    'NoCorsRedirectModeNotFollow',
    'PreflightMissingPrivateNetworkAccessId',
    'PreflightMissingPrivateNetworkAccessName',
    'PrivateNetworkAccessPermissionUnavailable',
    'PrivateNetworkAccessPermissionDenied',
    'LocalNetworkAccessPermissionDenied',
  ]);
const safeCode = z
  .string()
  .refine(
    (v) => v === 'NONE' || v === 'UNKNOWN' || [...codes].some((c) => c === v),
  );
export const browserDiagnosticSchema = z
  .strictObject({
    collection: z.enum(['OBSERVED', 'UNOBSERVED']),
    product: z
      .string()
      .regex(/^(?:Chrome|HeadlessChrome)\/[0-9]{1,3}(?:\.[0-9]{1,6}){3}$/u)
      .nullable(),
    protocolVersion: z
      .string()
      .regex(/^[0-9]{1,3}\.[0-9]{1,3}$/u)
      .nullable(),
    revision: z
      .string()
      .regex(/^@[a-f0-9]{40}$/u)
      .nullable(),
  })
  .refine((v) =>
    v.collection === 'OBSERVED'
      ? !!(v.product && v.protocolVersion && v.revision)
      : v.product === null && v.protocolVersion === null && v.revision === null,
  );
export const emptyBrowserDiagnostic = () => ({
  collection: 'UNOBSERVED' as const,
  product: null,
  protocolVersion: null,
  revision: null,
});
export const readBrowserDiagnostic = (raw: unknown) => {
  try {
    const value = z
      .object({
        product: z.unknown(),
        protocolVersion: z.unknown(),
        revision: z.unknown(),
      })
      .parse(raw);
    return browserDiagnosticSchema.parse({ collection: 'OBSERVED', ...value });
  } catch {
    return emptyBrowserDiagnostic();
  }
};
export const imageContextSchema = z.strictObject({
  collection: z.enum(['UNOBSERVED', 'OBSERVED', 'UNKNOWN']),
  asset: z.enum(['LOGIN_PNG', 'BLOOK', 'OTHER_IMAGE', 'UNKNOWN']),
  assetOrdinal: count.positive().max(1000).nullable(),
  resourceType: z.enum(['Image', 'UNKNOWN']),
  method: z.enum(['GET', 'UNKNOWN']),
  failureCode: safeCode,
  consoleCode: safeCode,
  logCode: safeCode,
  blockedReason: z
    .string()
    .refine((v) => imageBlockedReason(v === 'NONE' ? undefined : v) === v),
  corsReason: z
    .string()
    .refine((v) => imageCorsReason(v === 'NONE' ? undefined : v) === v),
  requestAtNodeMs: z.number().nonnegative().nullable(),
  responseAtNodeMs: z.number().nonnegative().nullable(),
  terminalAtNodeMs: z.number().nonnegative().nullable(),
  canceled: z.boolean().nullable(),
  routeOrdinal: count.positive().nullable(),
  stages: z
    .array(
      z.strictObject({
        stage: z.enum([
          'FETCH',
          'PARSE',
          'HOOK',
          'FULFILL',
          'DISPOSE',
          'ORIGIN_BLOCK',
          'REDIRECT_BLOCK',
          'CATCH_ABORT',
        ]),
        state: z.enum(['STARTED', 'COMPLETED', 'FAILED']),
        atNodeMs: z.number().nonnegative(),
      }),
    )
    .max(20),
  routeClosed: z.boolean(),
  status: z.number().int().min(100).max(599).nullable(),
  mime: z.enum([
    'PNG',
    'WEBP',
    'JPEG',
    'SVG',
    'HTML',
    'JSON',
    'OTHER',
    'NONE',
    'UNKNOWN',
  ]),
  encoding: z.enum([
    'NONE',
    'IDENTITY',
    'GZIP',
    'BR',
    'DEFLATE',
    'OTHER',
    'UNKNOWN',
  ]),
  contentLength: count.nullable(),
  cache: z.enum([
    'NO_STORE',
    'NO_CACHE',
    'PRIVATE',
    'PUBLIC',
    'OTHER',
    'NONE',
    'UNKNOWN',
  ]),
  nosniff: z.enum(['YES', 'NO', 'OTHER', 'UNKNOWN']),
  corp: z.enum([
    'SAME_ORIGIN',
    'SAME_SITE',
    'CROSS_ORIGIN',
    'NONE',
    'OTHER',
    'UNKNOWN',
  ]),
  redirectPresent: z.boolean().nullable(),
});
export type ImageContext = z.infer<typeof imageContextSchema>;
export const emptyImageContext = (): ImageContext => ({
  collection: 'UNOBSERVED',
  asset: 'UNKNOWN',
  assetOrdinal: null,
  resourceType: 'UNKNOWN',
  method: 'UNKNOWN',
  failureCode: 'NONE',
  consoleCode: 'NONE',
  logCode: 'NONE',
  blockedReason: 'NONE',
  corsReason: 'NONE',
  requestAtNodeMs: null,
  responseAtNodeMs: null,
  terminalAtNodeMs: null,
  canceled: null,
  routeOrdinal: null,
  stages: [],
  routeClosed: false,
  status: null,
  mime: 'UNKNOWN',
  encoding: 'UNKNOWN',
  contentLength: null,
  cache: 'UNKNOWN',
  nosniff: 'UNKNOWN',
  corp: 'UNKNOWN',
  redirectPresent: null,
});
export const imageAsset = (
  origin: string,
  approved: readonly string[],
  raw: unknown,
): Pick<ImageContext, 'asset' | 'assetOrdinal'> => {
  try {
    if (typeof raw !== 'string' || raw.length > 32768) throw Error();
    const u = new URL(raw);
    if (
      u.origin !== origin ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      raw !== origin + u.pathname
    )
      throw Error();
    if (u.pathname === '/colorplay-grimoire-pixel.png')
      return { asset: 'LOGIN_PNG', assetOrdinal: null };
    const index = approved.indexOf(u.pathname);
    return index >= 0
      ? { asset: 'BLOOK', assetOrdinal: index + 1 }
      : { asset: 'OTHER_IMAGE', assetOrdinal: null };
  } catch {
    return { asset: 'UNKNOWN', assetOrdinal: null };
  }
};
export const imageResponseHeaders = (
  headers: Record<string, string>,
  status: number,
): Partial<ImageContext> => {
  const h = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  if (
    Object.keys(headers).length > 128 ||
    h.size !== Object.keys(headers).length
  )
    throw Error();
  if ([...h.values()].some((v) => typeof v !== 'string' || v.length > 32768))
    throw Error();
  const m = (h.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  const mime: ImageContext['mime'] =
    m === 'image/png'
      ? 'PNG'
      : m === 'image/webp'
        ? 'WEBP'
        : m === 'image/jpeg'
          ? 'JPEG'
          : m === 'image/svg+xml'
            ? 'SVG'
            : m === 'text/html'
              ? 'HTML'
              : m === 'application/json'
                ? 'JSON'
                : m
                  ? 'OTHER'
                  : 'NONE';
  const e = h.get('content-encoding')?.trim().toLowerCase();
  const encoding: ImageContext['encoding'] = !e
    ? 'NONE'
    : e === 'identity'
      ? 'IDENTITY'
      : e === 'gzip'
        ? 'GZIP'
        : e === 'br'
          ? 'BR'
          : e === 'deflate'
            ? 'DEFLATE'
            : 'OTHER';
  const length = h.get('content-length');
  if (length !== undefined && !/^(0|[1-9][0-9]{0,12})$/u.test(length))
    throw Error();
  const contentLength =
    length === undefined ? null : count.parse(Number(length));
  const cache = (h.get('cache-control') ?? '')
    .toLowerCase()
    .split(',')
    .map((v) => v.trim());
  const c = h.get('cross-origin-resource-policy');
  return {
    status: z.number().int().min(100).max(599).parse(status),
    mime,
    encoding,
    contentLength,
    cache: cache.includes('no-store')
      ? 'NO_STORE'
      : cache.includes('no-cache')
        ? 'NO_CACHE'
        : cache.includes('private')
          ? 'PRIVATE'
          : cache.includes('public')
            ? 'PUBLIC'
            : cache.some(Boolean)
              ? 'OTHER'
              : 'NONE',
    nosniff: h.has('x-content-type-options')
      ? h.get('x-content-type-options')?.toLowerCase() === 'nosniff'
        ? 'YES'
        : 'OTHER'
      : 'NO',
    corp:
      c === 'same-origin'
        ? 'SAME_ORIGIN'
        : c === 'same-site'
          ? 'SAME_SITE'
          : c === 'cross-origin'
            ? 'CROSS_ORIGIN'
            : c
              ? 'OTHER'
              : 'NONE',
    redirectPresent: h.has('location'),
  };
};
