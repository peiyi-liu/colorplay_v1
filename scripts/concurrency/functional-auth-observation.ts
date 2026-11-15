import {
  AuthSessionMissingError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';
import type { CDPSession, Page } from '@playwright/test';
import { z } from 'zod';
import { fail, type FunctionalScope } from './config';
import { sha256 } from './local-runtime';
import type { FunctionalStage } from './functional-receipt';
export const approvedStaticAssetPathsSchema = z
  .array(
    z
      .string()
      .max(512)
      .regex(/^\/assets\/[A-Za-z0-9_-]+\.(?:js|css)$/u),
  )
  .min(1)
  .max(1000)
  .refine((paths) =>
    paths.every(
      (path, index) => index === 0 || path > (paths[index - 1] ?? ''),
    ),
  );
export interface FunctionalAuthHooks {
  identify(page: Page, actor: string): void;
  beforeLogout(
    page: Page,
    kind: 'normal' | 'shared_revoked' | 'registration_completion',
  ): Promise<void>;
}
export const readFunctionalAuthCode = async (
  cdp: CDPSession,
  requestId: string,
) => {
  const response = z
    .object({ body: z.string().max(24576), base64Encoded: z.boolean() })
    .parse(await cdp.send('Network.getResponseBody', { requestId }));
  if (Buffer.byteLength(response.body) > 24576) return null;
  const body = response.base64Encoded
    ? Buffer.from(response.body, 'base64').toString('utf8')
    : response.body;
  if (Buffer.byteLength(body) > 16384) return null;
  const data = z
    .object({
      error_code: z.string().max(80).optional(),
      code: z.union([z.string().max(80), z.number()]).optional(),
    })
    .parse(JSON.parse(body));
  if (
    typeof data.code === 'string' &&
    data.error_code &&
    data.code !== data.error_code
  )
    return null;
  const code =
    data.error_code ?? (typeof data.code === 'string' ? data.code : null);
  return (
    [
      'session_not_found',
      'refresh_token_not_found',
      'refresh_token_already_used',
    ].find((known) => known === code) ?? null
  );
};
interface PageState {
  index: number;
  actor: string | null;
  opener: Page | null;
  initial: boolean;
}
interface Logout {
  page: Page;
  phase: FunctionalStage | null;
  hash: string;
  kind: 'normal' | 'shared_revoked' | 'registration_completion';
  requestId: string | null;
  status: number | null;
  complete: boolean;
  aborted: boolean;
  denied: boolean;
}
// This policy supplies bounded completeness proofs only, never network timings.
// Request bodies/headers/tokens are reduced to an exact one-action tuple in memory.
export const createFunctionalAuthObservation = (
  scope: FunctionalScope,
  phase: () => FunctionalStage | null,
  approvedPaths: readonly string[] = [],
) => {
  const app = new URL(scope.appUrl).origin;
  const api = new URL(scope.supabaseUrl).origin;
  const assets = new Set(
    approvedPaths.length
      ? approvedStaticAssetPathsSchema.parse(approvedPaths)
      : [],
  );
  const pages = new Map<Page, PageState>();
  const gapIds = new Set<string>();
  const logouts: Logout[] = [];
  let gaps = 0,
    aborts = 0,
    denials = 0;
  const key = (page: Page, id: string) =>
    `${String(pages.get(page)?.index)}:${id}`;
  const known = (page: Page, id: string) =>
    logouts.find((row) => row.page === page && row.requestId === id);
  const isLogoutUrl = (raw: string) => {
    try {
      const url = new URL(raw);
      return (
        url.origin === api &&
        url.pathname === '/auth/v1/logout' &&
        url.search === '?scope=local' &&
        url.hash === ''
      );
    } catch {
      return false;
    }
  };
  const initialApp = (page: Page) => {
    try {
      const url = new URL(page.url());
      return (
        url.origin === app &&
        url.pathname === '/app' &&
        url.search === '' &&
        url.hash === ''
      );
    } catch {
      return false;
    }
  };
  return {
    register: (page: Page, index: number) => {
      pages.set(page, { index, actor: null, opener: null, initial: true });
    },
    observeOpener: async (page: Page) => {
      const info = pages.get(page);
      if (!info) return fail('FUNCTIONAL_BROWSER_FAILED');
      info.opener = await page.opener();
      if (
        info.opener &&
        phase() === 'auth_controls' &&
        pages.get(info.opener)?.actor === 'S1'
      )
        info.actor = 'S1';
    },
    identify: (page: Page, actor: string) => {
      const info = pages.get(page);
      if (!info) return fail('FUNCTIONAL_BROWSER_FAILED');
      info.actor = actor;
    },
    navigated: (page: Page) => {
      const info = pages.get(page);
      if (info) info.initial = false;
    },
    loaded: (page: Page) => {
      const info = pages.get(page);
      if (info && initialApp(page)) info.initial = false;
    },
    gap: (page: Page, raw: unknown) => {
      const info = pages.get(page);
      if (
        !info?.initial ||
        phase() !== 'auth_controls' ||
        !info.opener ||
        pages.get(info.opener)?.actor !== 'S1' ||
        !initialApp(page) ||
        gapIds.size >= 1000
      )
        return false;
      const parsed = z
        .object({
          requestId: z.string().max(180),
          type: z.enum(['Script', 'Stylesheet']),
          response: z.object({
            url: z.string().max(32768),
            status: z.literal(200),
            mimeType: z.string().max(100),
          }),
        })
        .safeParse(raw);
      if (!parsed.success) return false;
      const event = parsed.data;
      let url: URL;
      try {
        url = new URL(event.response.url);
      } catch {
        return false;
      }
      if (
        url.origin !== app ||
        url.search ||
        url.hash ||
        !assets.has(url.pathname)
      )
        return false;
      const script =
        event.type === 'Script' &&
        url.pathname.endsWith('.js') &&
        ['application/javascript', 'text/javascript'].includes(
          event.response.mimeType,
        );
      const css =
        event.type === 'Stylesheet' &&
        url.pathname.endsWith('.css') &&
        event.response.mimeType === 'text/css';
      const id = key(page, event.requestId);
      if ((!script && !css) || gapIds.has(id)) return false;
      gapIds.add(id);
      gaps++;
      return true;
    },
    gapFinished: (page: Page, id: string) => gapIds.has(key(page, id)),
    expectLogout: (
      page: Page,
      token: string,
      kind: 'normal' | 'shared_revoked' | 'registration_completion',
    ) => {
      const actor = pages.get(page)?.actor;
      const permitted =
        (phase() === 'registration_recovery' &&
          actor === 'R1' &&
          (kind === 'normal' || kind === 'registration_completion')) ||
        (phase() === 'auth_controls' &&
          (actor === 'S1' || actor === 'S2') &&
          (kind === 'normal' || (kind === 'shared_revoked' && actor === 'S1')));
      if (
        !['normal', 'shared_revoked', 'registration_completion'].includes(
          kind,
        ) ||
        !permitted ||
        !token ||
        token.length > 16384 ||
        logouts.length >= 64 ||
        logouts.some((row) => row.page === page && !row.complete)
      )
        return fail('FUNCTIONAL_BROWSER_FAILED');
      logouts.push({
        page,
        phase: phase(),
        hash: sha256(token),
        kind,
        requestId: null,
        status: null,
        complete: false,
        aborted: false,
        denied: false,
      });
    },
    request: (page: Page, id: string, raw: unknown) => {
      const request = z
        .object({ url: z.string(), method: z.string() })
        .parse(raw);
      if (request.method !== 'POST' || !isLogoutUrl(request.url)) return false;
      const row = logouts.find(
        (item) =>
          item.page === page &&
          item.phase === phase() &&
          item.requestId === null &&
          !item.complete,
      );
      if (!row) return false;
      const headers = z
        .object({ headers: z.record(z.string(), z.unknown()) })
        .parse(raw).headers;
      const header = Object.entries(headers).find(
        ([name]) => name.toLowerCase() === 'authorization',
      )?.[1];
      if (
        typeof header !== 'string' ||
        !header.startsWith('Bearer ') ||
        header.length > 16391 ||
        sha256(header.slice(7)) !== row.hash
      )
        return false;
      row.requestId = id;
      return true;
    },
    response: (page: Page, id: string, status: number) => {
      const row = known(page, id);
      if (row) row.status = status;
    },
    aborted: (page: Page, id: string, errorText: string) => {
      const row = known(page, id);
      if (
        row?.phase !== phase() ||
        !['normal', 'registration_completion'].includes(row.kind) ||
        row.status !== 204 ||
        row.aborted ||
        errorText !== 'net::ERR_ABORTED'
      )
        return false;
      row.aborted = true;
      row.complete = true;
      aborts++;
      return true;
    },
    finished: async (page: Page, id: string, cdp: CDPSession) => {
      const row = known(page, id);
      if (row?.phase !== phase()) return false;
      if (
        ['normal', 'registration_completion'].includes(row.kind) &&
        row.status === 204
      ) {
        row.complete = true;
        return true;
      }
      if (
        !['shared_revoked', 'registration_completion'].includes(row.kind) ||
        row.status !== 403 ||
        row.denied
      )
        return false;
      if ((await readFunctionalAuthCode(cdp, id)) !== 'session_not_found')
        return false;
      row.denied = true;
      row.complete = true;
      denials++;
      return true;
    },
    deniedLog: (page: Page, id: string, text: string) => {
      const row = known(page, id);
      return (
        !!row &&
        row.phase === phase() &&
        ['shared_revoked', 'registration_completion'].includes(row.kind) &&
        /^Failed to load resource: the server responded with a status of 403 \([A-Za-z ]+\)$/u.test(
          text,
        )
      );
    },
    diagnostics: () => ({
      approvedPopupStaticGaps: gaps,
      expectedLogoutAborts: aborts,
      expectedRevokedLogouts: denials,
      unresolvedLogoutDeclarations: logouts.filter((row) => !row.complete)
        .length,
    }),
    isLogoutUrl,
  };
};

export const createFunctionalAuthHooks = (
  health: {
    identify(page: Page, actor: string): void;
    expectLogout(
      page: Page,
      token: string,
      kind: 'normal' | 'shared_revoked' | 'registration_completion',
    ): void;
  },
  accessToken: (page: Page) => Promise<string>,
): FunctionalAuthHooks => ({
  identify: (page, actor) => {
    health.identify(page, actor);
  },
  beforeLogout: async (page, kind) => {
    health.expectLogout(page, await accessToken(page), kind);
  },
});

export const isFunctionalMissingSession = (error: unknown) =>
  error instanceof AuthSessionMissingError && isAuthSessionMissingError(error);
export const isFunctionalRefreshCode = (code: string) =>
  [
    'refresh_token_not_found',
    'refresh_token_already_used',
    'session_not_found',
  ].includes(code);
