export type ReadFailure =
  | 'AUTH'
  | 'PERMISSION'
  | 'RATE_LIMIT'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'UNAVAILABLE';

// Upstream error bodies are untrusted. Read only fixed own data properties;
// never inspect a cause, evaluate an accessor or return provider details.
const ownValue = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null) return undefined;
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value as unknown;
  } catch {
    return undefined;
  }
};
const ownText = (value: unknown, key: string): string | undefined => {
  const field = ownValue(value, key);
  return typeof field === 'string' && field.length <= 256 ? field : undefined;
};
const authCodes = new Set([
  'PGRST301',
  'PGRST302',
  'PGRST303',
  '28000',
  '28P01',
  'invalid_jwt',
  'jwt_expired',
  'AUTH_REQUIRED',
]);
const validationCodes = new Set([
  '22023',
  '22P02',
  '23502',
  '23503',
  '23505',
  '23514',
  'PGRST100',
  'PGRST102',
]);

export const classifyReadFailure = ({
  error,
  status,
}: Readonly<{
  error: unknown;
  status?: number | undefined;
}>): ReadFailure => {
  const ownStatus = ownValue(error, 'status');
  const storageStatus = ownText(error, 'statusCode');
  const httpStatus =
    status ??
    (typeof ownStatus === 'number' &&
    Number.isInteger(ownStatus) &&
    ownStatus >= 100 &&
    ownStatus <= 599
      ? ownStatus
      : undefined) ??
    (storageStatus !== undefined && /^[1-5][0-9]{2}$/u.test(storageStatus)
      ? Number(storageStatus)
      : undefined);
  if (httpStatus === 401) return 'AUTH';
  if (httpStatus === 403) return 'PERMISSION';
  if (httpStatus === 429) return 'RATE_LIMIT';
  if (httpStatus === 400 || httpStatus === 422) return 'VALIDATION';
  if (httpStatus === 404 || httpStatus === 406) return 'NOT_FOUND';
  const code = ownText(error, 'code');
  const message = ownText(error, 'message');
  if (
    (code !== undefined && authCodes.has(code)) ||
    (message !== undefined &&
      /^(?:JWT expired|JWT is expired|Invalid JWT|JWT is not valid|JWSError JWTExpired|AUTH_REQUIRED(?::.*)?)$/iu.test(
        message,
      ))
  )
    return 'AUTH';
  if (code === '42501') return 'PERMISSION';
  if (code === '429' || code === 'PT429') return 'RATE_LIMIT';
  if (code !== undefined && validationCodes.has(code)) return 'VALIDATION';
  if (code === 'PGRST116' || code === 'P0002') return 'NOT_FOUND';
  return 'UNAVAILABLE';
};
