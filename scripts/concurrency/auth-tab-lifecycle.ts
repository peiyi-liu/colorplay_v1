import type { BrowserContext, Page } from '@playwright/test';
import { fail } from './config';
import type { FunctionalIdentity } from './owned-fixtures';
import { openFunctionalPopup } from './auth-popup';
export interface TabBalance {
  totalXp: number;
  tokenBalance: number;
}
export interface FunctionalTabActions {
  login(page: Page, identity: FunctionalIdentity): Promise<void>;
  logout(page: Page): Promise<void>;
  authenticated(page: Page, identity: FunctionalIdentity): Promise<TabBalance>;
  anonymous(page: Page): Promise<void>;
  accessToken(page: Page): Promise<string>;
  clearSharedRevoked(
    page: Page,
    identity: FunctionalIdentity,
    originalAccessToken: string,
  ): Promise<'anonymous' | 'cached_source_identity'>;
  refreshToken(page: Page): Promise<string>;
}
export const runFunctionalTabLifecycle = async (
  context: BrowserContext,
  signal: AbortSignal,
  s1: FunctionalIdentity,
  s2: FunctionalIdentity,
  actions: FunctionalTabActions,
) => {
  const first = await context.newPage();
  let second: Page | undefined;
  let copied: Page | undefined;
  let fresh: Page | undefined;
  const equal = (a: TabBalance, b: TabBalance) =>
    a.totalXp === b.totalXp && a.tokenBalance === b.tokenBalance;
  try {
    second = await context.newPage();
    await actions.login(first, s1);
    const baseline1 = await actions.authenticated(first, s1);
    await first.reload();
    if (!equal(await actions.authenticated(first, s1), baseline1))
      return fail('FUNCTIONAL_AUTH_FAILED');
    await actions.login(second, s2);
    const baseline2 = await actions.authenticated(second, s2);
    copied = await openFunctionalPopup(context, signal, () =>
      first.evaluate(() => {
        window.open('/app', '_blank');
      }),
    );
    await copied.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    if (
      !equal(await actions.authenticated(copied, s1), baseline1) ||
      (await actions.refreshToken(copied)) !==
        (await actions.refreshToken(first))
    )
      return fail('FUNCTIONAL_AUTH_FAILED');
    const originalAccessToken = await actions.accessToken(first);
    await actions.logout(copied);
    await actions.anonymous(copied);
    // Native opener copies share the original server session. Its revocation
    // is expected, so clear the old page before establishing independent ones.
    const sourceUiBeforeClear = await actions.clearSharedRevoked(
      first,
      s1,
      originalAccessToken,
    );
    await actions.anonymous(first);
    await actions.anonymous(copied);
    if (!equal(await actions.authenticated(second, s2), baseline2))
      return fail('FUNCTIONAL_AUTH_FAILED');
    const verifyIndependent = async (
      firstIdentity: FunctionalIdentity | null,
      copiedIdentity: FunctionalIdentity | null,
    ) => {
      if (firstIdentity) {
        if (
          !equal(
            await actions.authenticated(first, firstIdentity),
            firstIdentity.label === 'S1' ? baseline1 : baseline2,
          )
        )
          return fail('FUNCTIONAL_AUTH_FAILED');
      } else await actions.anonymous(first);
      if (!second || !copied) return fail('FUNCTIONAL_AUTH_FAILED');
      if (!equal(await actions.authenticated(second, s2), baseline2))
        return fail('FUNCTIONAL_AUTH_FAILED');
      if (copiedIdentity) {
        if (
          !equal(await actions.authenticated(copied, copiedIdentity), baseline2)
        )
          return fail('FUNCTIONAL_AUTH_FAILED');
      } else await actions.anonymous(copied);
    };
    await actions.login(first, s1);
    await verifyIndependent(s1, null);
    await actions.login(copied, s2);
    await verifyIndependent(s1, s2);
    const tokens = await Promise.all([
      actions.refreshToken(first),
      actions.refreshToken(second),
      actions.refreshToken(copied),
    ]);
    if (new Set(tokens).size !== 3) return fail('FUNCTIONAL_AUTH_FAILED');
    await actions.logout(first);
    await verifyIndependent(null, s2);
    await actions.login(first, s2);
    await verifyIndependent(s2, s2);
    await actions.logout(copied);
    await verifyIndependent(s2, null);
    await first.close();
    fresh = await context.newPage();
    await fresh.goto('/app');
    await fresh.waitForURL(/\/login$/u);
    await actions.anonymous(fresh);
    if (!equal(await actions.authenticated(second, s2), baseline2))
      return fail('FUNCTIONAL_AUTH_FAILED');
    await actions.anonymous(copied);
    return {
      reload: true,
      switch: true,
      independentTabs: true,
      sharedOpenerSessionRevoked: true,
      sourceUiBeforeClear,
      copiedOpenerIsolation: true,
      freshTabUnauthenticated: true,
    };
  } finally {
    await Promise.allSettled([
      first.close(),
      ...(second ? [second.close()] : []),
      ...(copied ? [copied.close()] : []),
      ...(fresh ? [fresh.close()] : []),
    ]);
  }
};
