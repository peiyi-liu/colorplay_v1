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
