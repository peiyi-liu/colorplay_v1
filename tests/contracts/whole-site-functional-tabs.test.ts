import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import {
  runFunctionalTabLifecycle,
  type FunctionalTabActions,
} from '../../scripts/concurrency/auth-tab-lifecycle';
import type { FunctionalIdentity } from '../../scripts/concurrency/owned-fixtures';
const identity = (label: 'S1' | 'S2'): FunctionalIdentity => ({
  label,
  userId: label,
  displayName: label,
  account: label,
  email: 'synthetic@colorplay.test',
  password: 'Aa1synthetic',
  replacementPassword: 'Bb2synthetic',
});
const harness = () => {
  interface State {
    ui: string | null;
    session: string | null;
    closed: boolean;
  }
  const ctx = new EventEmitter();
  const states = new Map<Page, State>();
  const revoked = new Set<string>();
  const subjects = new Map<string, string>();
  let sequence = 0;
  let popup: Page | undefined;
  let sabotage = false;
  const checks: {
    ui: string | null;
    expected: string | null;
    subject: string | null;
  }[] = [];
  const page = () => {
    const value = {
      reload: () => Promise.resolve(),
      waitForLoadState: () => Promise.resolve(),
      goto: () => Promise.resolve(),
      waitForURL: () => Promise.resolve(),
      close: () => {
        const state = states.get(value);
        if (state) state.closed = true;
        return Promise.resolve();
      },
      evaluate: () => {
        const source = states.get(value);
        popup = page();
        if (!source) throw new Error('SYNTHETIC_STATE_MISSING');
        states.set(popup, { ...source, closed: false });
        ctx.emit('page', popup);
        return Promise.resolve();
      },
    } as unknown as Page;
    states.set(value, { ui: null, session: null, closed: false });
    return value;
  };
  const context = Object.assign(ctx, {
    newPage: () => Promise.resolve(page()),
  }) as unknown as BrowserContext;
  const current = (page: Page) => {
    const value = states.get(page);
    if (!value) throw new Error('SYNTHETIC_STATE_MISSING');
    return value;
  };
  const actions: FunctionalTabActions = {
    login: (page, who) => {
      const session = `synthetic-session-${String(++sequence)}`;
      subjects.set(session, who.label);
      states.set(page, {
        ui: sabotage && popup === page ? 'S1' : who.label,
        session,
        closed: false,
      });
      return Promise.resolve();
    },
    logout: (page) => {
      const state = current(page);
      if (state.session) revoked.add(state.session);
      state.ui = null;
      state.session = null;
      return Promise.resolve();
    },
    authenticated: (page, who) => {
      const state = current(page);
      const subject =
        state.session && !revoked.has(state.session)
          ? (subjects.get(state.session) ?? null)
          : null;
      checks.push({ ui: state.ui, expected: who.label, subject });
      if (state.ui !== who.label || subject !== who.label)
        return Promise.reject(new Error('SYNTHETIC_IDENTITY_MISMATCH'));
      // Both balances deliberately equal: UI and canonical subject are required.
      return Promise.resolve({ totalXp: 0, tokenBalance: 0 });
    },
    anonymous: (page) => {
      const state = current(page);
      checks.push({
        ui: state.ui,
        expected: null,
        subject: state.session ? (subjects.get(state.session) ?? null) : null,
      });
      return state.ui === null && state.session === null
        ? Promise.resolve()
        : Promise.reject(new Error('SYNTHETIC_NOT_ANONYMOUS'));
    },
    accessToken: (page) => Promise.resolve(current(page).session ?? ''),
    refreshToken: (page) => Promise.resolve(current(page).session ?? ''),
    clearSharedRevoked: (page, who, old) => {
      const state = current(page);
      if (
        !revoked.has(old) ||
        subjects.get(old) !== who.label ||
        state.ui !== who.label
      )
        return Promise.reject(
          new Error('SYNTHETIC_SHARED_SESSION_NOT_REVOKED'),
        );
      state.ui = null;
      state.session = null;
      return Promise.resolve('cached_source_identity');
    },
  };
  return {
    context,
    emitter: ctx,
    actions,
    states,
    checks,
    setSabotage: () => {
      sabotage = true;
    },
  };
};
describe('shared opener revocation vs independent session isolation', () => {
  it('clears the legitimately revoked source then checks actual identity on all independent pages', async () => {
    const h = harness();
    const cleared = vi.spyOn(h.actions, 'clearSharedRevoked');
    const result = await runFunctionalTabLifecycle(
      h.context,
      new AbortController().signal,
      identity('S1'),
      identity('S2'),
      h.actions,
    );
    expect(result.sharedOpenerSessionRevoked).toBe(true);
    expect(result.sourceUiBeforeClear).toBe('cached_source_identity');
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(h.checks.length).toBeGreaterThan(20);
    expect(
      h.checks.every(
        (check) =>
          check.ui === check.expected && check.subject === check.expected,
      ),
    ).toBe(true);
    expect([...h.states.values()].every((state) => state.closed)).toBe(true);
    expect(h.emitter.listeners('page')).toHaveLength(0);
  });
  it('equal wallets and a correct Node subject cannot hide the wrong UI identity', async () => {
    const h = harness();
    h.setSabotage();
    await expect(
      runFunctionalTabLifecycle(
        h.context,
        new AbortController().signal,
        identity('S1'),
        identity('S2'),
        h.actions,
      ),
    ).rejects.toThrow('SYNTHETIC_IDENTITY_MISMATCH');
    expect([...h.states.values()].every((state) => state.closed)).toBe(true);
  });
});
