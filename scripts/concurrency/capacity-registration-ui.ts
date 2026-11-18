import {
  consumeCapacitySendPreparation,
  capacitySendCohortSummarySchema,
} from './capacity-send-cohort';
import type {
  CapacitySendDiagnostics,
  SendClickObserver,
} from './capacity-send-diagnostics';
import type { CapacityScope } from './capacity-scope';
import type { CapacityManifest } from './capacity-manifest';
import type {
  CapacityEntryOptions,
  CapacityEntryUi,
} from './capacity-browser-entry';
import type { PrivateJournal } from './private-journal';
import type {
  CapacityRegistrationOracle,
  CapacityPrivateRegistrationActor,
} from './capacity-registration-ownership';
import type { createCapacityMailbox } from './capacity-mailbox';
import { z } from 'zod';
import { performance } from 'node:perf_hooks';
import { capacityFailure } from './capacity-scope';
import { barrierResultSchema } from './capacity-metrics';
import {
  loginCapacityActor,
  type CapacityEntryIdentity,
} from './capacity-browser-entry';
import {
  openCapacityOnboardingLogout,
  completeCapacityOnboardingLogin,
  type NativeCapacityActor,
} from './capacity-browser-runtime';
export interface CapacityRegistrationUi {
  send: (
    actor: NativeCapacityActor,
    admit: () => void,
    observer?: SendClickObserver,
  ) => Promise<void>;
  verify: (
    actor: NativeCapacityActor,
    code: string,
    admit: () => void,
  ) => Promise<void>;
  complete: (
    actor: NativeCapacityActor,
    identity: CapacityEntryIdentity,
    admit: () => void,
  ) => Promise<void>;
  postLogin: (
    actor: NativeCapacityActor,
    identity: CapacityEntryIdentity,
    signal: AbortSignal,
    admit: () => void,
  ) => Promise<void>;
}
const requireReady = (value: unknown) => {
  if (value !== true) return capacityFailure();
};
export const actualUi: CapacityRegistrationUi = {
  send: async (actor, admit, observer) => {
    const prepared = consumeCapacitySendPreparation(actor, admit, observer);
    if (prepared) return prepared;
    admit();
    const emit = (state: 'ENTERED' | 'RETURNED' | 'FAILED') => {
      try {
        observer?.({ state });
      } catch {
        /* Passive only. */
      }
    };
    emit('ENTERED');
    try {
      const started = performance.now();
      let last = started;
      const timeLeft = () => {
        const at = performance.now();
        if (
          !Number.isFinite(started) ||
          !Number.isFinite(at) ||
          at < last ||
          at - started >= 15000
        )
          return capacityFailure();
        last = at;
        return 15000 - (at - started);
      };
      const remaining = () => {
        admit();
        return timeLeft();
      };
      const button = actor.page.getByRole('button', {
        name: '傳送驗證碼',
        exact: true,
      });
      await button.waitFor({ state: 'visible', timeout: remaining() });
      requireReady(await button.isEnabled({ timeout: remaining() }));
      await button.focus({ timeout: remaining() });
      const ready = await button.evaluate(
        (node) => {
          if (!(node instanceof HTMLButtonElement)) return false;
          const rect = node.getBoundingClientRect();
          return (
            node.ownerDocument === document &&
            node.isConnected &&
            node.type === 'button' &&
            node.matches(':enabled') &&
            node.tabIndex >= 0 &&
            !node.closest('[inert]') &&
            document.activeElement === node &&
            Number.isFinite(rect.width) &&
            Number.isFinite(rect.height) &&
            rect.width > 0 &&
            rect.height > 0 &&
            getComputedStyle(node).visibility === 'visible'
          );
        },
        undefined,
        { timeout: remaining() },
      );
      requireReady(ready);
      await button.press('Enter', { timeout: remaining() });
      timeLeft();
      emit('RETURNED');
    } catch (error) {
      emit('FAILED');
      throw error;
    }
  },
  verify: async (actor, code, admit) => {
    if (!/^\d{6}$/u.test(code)) return capacityFailure();
    await actor.page.getByLabel('E-mail 驗證碼', { exact: true }).fill(code);
    admit();
    await actor.page
      .getByRole('button', { name: '確認驗證', exact: true })
      .click();
    await actor.page
      .getByText('✓ 已認證', { exact: true })
      .waitFor({ state: 'visible' });
  },
  complete: async (actor, identity, admit) => {
    const lease = openCapacityOnboardingLogout(actor);
    try {
      await actor.page
        .getByRole('button', { name: '下一步', exact: true })
        .click();
      await actor.page
        .getByLabel('帳號（學號）', { exact: true })
        .fill(identity.account);
      await actor.page
        .getByLabel('密碼', { exact: true })
        .fill(identity.password);
      await actor.page
        .getByLabel('密碼確認', { exact: true })
        .fill(identity.password);
      admit();
      await actor.page
        .getByRole('button', { name: '完成註冊', exact: true })
        .click();
      await actor.page.waitForURL((url) => url.pathname === '/login');
      lease?.complete();
    } catch (error) {
      lease?.cancel();
      throw error;
    }
  },
  postLogin: async (actor, identity, signal, admit) => {
    await loginCapacityActor(actor, identity, signal, undefined, admit);
    completeCapacityOnboardingLogin(actor);
  },
};
const actorReportSchema = z.strictObject({
  actorIndex: z.number().int().min(0).max(59),
  sent: z.boolean(),
  verified: z.boolean(),
  completed: z.boolean(),
  unknown: z.boolean(),
  mailObservedAfterSendMs: z.number().nonnegative().nullable(),
  verifyUiMs: z.number().nonnegative().nullable(),
  completeUiMs: z.number().nonnegative().nullable(),
  postLoginUiMs: z.number().nonnegative().nullable(),
  readbackDriverMs: z.number().nonnegative(),
});
export const capacityRegistrationReportSchema = z.strictObject({
  mode: z.literal('NATIVE_BROWSER'),
  result: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
  phase: z.enum([
    'fresh',
    'intent',
    'before_send',
    'entry',
    'send',
    'mail',
    'verify',
    'complete',
    'post_login',
    'readback',
    'complete_cohort',
  ]),
  startedActors: z.union([z.literal(40), z.literal(60)]),
  completedActors: z.number().int().min(0).max(60),
  authCreatedActors: z.number().int().min(0).max(60).nullable(),
  ownershipKnown: z.boolean(),
  sendBarrier: barrierResultSchema.nullable(),
  sendPreparation: capacitySendCohortSummarySchema.optional(),
  entrySkewMs: z.number().nonnegative().nullable(),
  mailboxClosed: z.boolean(),
  elapsedMs: z.number().nonnegative(),
  actors: z.array(actorReportSchema).min(40).max(60),
});

export const newCapacityRegistrationReport = (size: 40 | 60) => {
  return capacityRegistrationReportSchema.parse({
    mode: 'NATIVE_BROWSER',
    result: 'FAIL',
    phase: 'fresh',
    startedActors: size,
    completedActors: 0,
    authCreatedActors: null,
    ownershipKnown: false,
    sendBarrier: null,
    entrySkewMs: null,
    mailboxClosed: false,
    elapsedMs: 0,
    actors: Array.from({ length: size }, (_, actorIndex) => ({
      actorIndex,
      sent: false,
      verified: false,
      completed: false,
      unknown: false,
      mailObservedAfterSendMs: null,
      verifyUiMs: null,
      completeUiMs: null,
      postLoginUiMs: null,
      readbackDriverMs: 0,
    })),
  });
};

export interface CapacityRegistrationOptions {
  scope: CapacityScope;
  plan: CapacityManifest;
  legId: string;
  predecessors: readonly { receiptBytes: string }[];
  actors: readonly CapacityPrivateRegistrationActor[];
  classroom: { classroomId: string; joinCode: string };
  runtime: CapacityEntryOptions['runtime'];
  journal: PrivateJournal;
  signal: AbortSignal;
  oracle: CapacityRegistrationOracle;
  subject: (
    actor: NativeCapacityActor,
    stage: 'after_verify' | 'post_login',
  ) => Promise<string>;
  entryUi?: CapacityEntryUi;
  ui?: CapacityRegistrationUi;
  mailboxFactory?: typeof createCapacityMailbox;
  sendDiagnostics?: CapacitySendDiagnostics;
  now?: () => number;
}
