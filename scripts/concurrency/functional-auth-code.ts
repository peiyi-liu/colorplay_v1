const known = [
  'session_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
] as const;
export const isFunctionalRevocationCode = (value: string) =>
  known.some((code) => code === value);
// Response data, not Error/cause traversal. Getters and inherited aliases never run.
export const readOwnFunctionalAuthCode = (body: unknown): string | null => {
  try {
    if (typeof body !== 'object' || body === null) return null;
    const prototype: unknown = Object.getPrototypeOf(body);
    if (prototype !== null && prototype !== Object.prototype) return null;
    const legacy = Object.getOwnPropertyDescriptor(body, 'error_code');
    const modern = Object.getOwnPropertyDescriptor(body, 'code');
    if (
      (legacy && !Object.hasOwn(legacy, 'value')) ||
      (modern && !Object.hasOwn(modern, 'value'))
    )
      return null;
    const a: unknown = legacy?.value,
      b: unknown = modern?.value;
    if (legacy && (typeof a !== 'string' || a.length > 80)) return null;
    if (
      modern &&
      !(typeof b === 'string' && b.length <= 80) &&
      !(typeof b === 'number' && Number.isFinite(b))
    )
      return null;
    if (typeof a === 'string' && typeof b === 'string' && a !== b) return null;
    const code = typeof a === 'string' ? a : typeof b === 'string' ? b : null;
    return code && isFunctionalRevocationCode(code) ? code : null;
  } catch {
    return null;
  }
};
