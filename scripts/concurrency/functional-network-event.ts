import type { FunctionalStage } from './functional-receipt';
export interface NetworkRecord {
  page: number;
  phase: FunctionalStage | null;
  endpoint: 'media' | 'refresh' | 'logout' | 'other';
  media: string | null;
  refresh: string | null;
  status: number | null;
  failed: boolean;
  finished: boolean;
}
export const functionalEndpoint = (
  api: string,
  isLogout: (raw: string) => boolean,
  raw: string,
) => {
  try {
    const url = new URL(raw);
    if (url.origin !== api) return 'other';
    if (isLogout(raw)) return 'logout';
    if (url.pathname === '/functions/v1/content-media' && url.search === '')
      return 'media';
    if (
      url.pathname === '/auth/v1/token' &&
      url.search === '?grant_type=refresh_token'
    )
      return 'refresh';
  } catch {
    /* Fixed unknown. */
  }
  return 'other';
};
export const resourceCode = (text: string) =>
  text === 'Failed to load resource: net::ERR_FAILED'
    ? 'failed'
    : /^Failed to load resource: the server responded with a status of (400|401|403) \([A-Za-z ]+\)$/u.test(
          text,
        )
      ? 'denied'
      : null;

export const functionalRequestContext = (api: string, raw: unknown) => {
  const unknown = {
    method: 'UNKNOWN',
    functionFamily: 'UNKNOWN',
    action: 'UNKNOWN',
    valid: true,
  };
  if (!raw || typeof raw !== 'object') return { ...unknown, valid: false };
  const request = raw as {
    url?: unknown;
    method?: unknown;
    postData?: unknown;
  };
  const method =
    typeof request.method !== 'string'
      ? 'UNKNOWN'
      : ['GET', 'POST', 'OPTIONS'].includes(request.method)
        ? request.method
        : 'OTHER';
  try {
    if (typeof request.url !== 'string' || request.url.length > 32768)
      return { ...unknown, method, valid: false };
    const url = new URL(request.url);
    if (
      url.origin !== api ||
      request.url !== api + url.pathname ||
      url.search ||
      url.hash
    )
      return { ...unknown, method };
    const functionFamily =
      url.pathname === '/functions/v1/content-media'
        ? 'MEDIA'
        : url.pathname === '/functions/v1/content-import'
          ? 'CONTENT_IMPORT'
          : url.pathname.startsWith('/functions/v1/')
            ? 'OTHER_FUNCTION'
            : 'UNKNOWN';
    if (
      method !== 'POST' ||
      !['MEDIA', 'CONTENT_IMPORT'].includes(functionFamily)
    )
      return { ...unknown, method, functionFamily };
    if (
      typeof request.postData !== 'string' ||
      Buffer.byteLength(request.postData) > 4096
    )
      return { ...unknown, method, functionFamily, valid: false };
    const body: unknown = JSON.parse(request.postData);
    const action =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { action?: unknown }).action
        : null;
    const allowed =
      functionFamily === 'MEDIA'
        ? ['begin', 'process', 'abort', 'resolve']
        : ['begin', 'preview', 'commit'];
    return {
      method,
      functionFamily,
      action:
        typeof action === 'string' && allowed.includes(action)
          ? `${functionFamily === 'MEDIA' ? 'MEDIA' : 'IMPORT'}_${action.toUpperCase()}`
          : 'UNKNOWN',
      valid: typeof action === 'string' && allowed.includes(action),
    };
  } catch {
    return { ...unknown, method, valid: false };
  }
};
