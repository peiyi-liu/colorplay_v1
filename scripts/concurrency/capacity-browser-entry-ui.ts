import { coldEntryNote } from './capacity-cold-entry-observer';
import { z } from 'zod';
import {
  capacityFailure,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
import {
  validateCapacityManifest,
  findCapacityLeg,
  type CapacityManifest,
} from './capacity-manifest';
import type { NativeCapacityActor } from './capacity-browser-runtime';
import type { CapacityReadySubphase } from './capacity-run-diagnostics';
export const capacityEntryIdentitySchema = z.strictObject({
  alias: z.string().regex(/^(T1|REG(?:40|60)_[0-9]{2})$/u),
  account: z.string().regex(/^[a-z0-9]{3,20}$/u),
  password: z.string().min(6).max(128),
  displayName: z.string().min(2).max(40),
  role: z.enum(['student', 'teacher']),
  userId: z.uuid().nullable(),
  email: z.string().max(254).optional(),
  fullName: z.string().min(1).max(40).optional(),
  nickname: z.string().min(2).max(16).optional(),
  classCode: z
    .string()
    .regex(/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{8})?$/u)
    .optional(),
});
export type CapacityEntryIdentity = z.infer<typeof capacityEntryIdentitySchema>;
export interface CapacityEntryUi {
  landing: (actor: NativeCapacityActor, scope: CapacityScope) => Promise<void>;
  ready: (
    actor: NativeCapacityActor,
    scope: CapacityScope,
    identity: CapacityEntryIdentity | undefined,
    registration: boolean,
    step?: (phase: CapacityReadySubphase) => void,
  ) => Promise<void>;
  submit: (actor: NativeCapacityActor) => Promise<void>;
  confirmed: (
    actor: NativeCapacityActor,
    identity: CapacityEntryIdentity,
  ) => Promise<void>;
}
export const loginFields = async (
  actor: NativeCapacityActor,
  identity: CapacityEntryIdentity,
  step?: (phase: CapacityReadySubphase) => void,
) => {
  if (identity.role === 'teacher') {
    step?.('TEACHER_PORTAL');
    await actor.page.getByText('教師端登入', { exact: true }).click();
  }
  step?.('ACCOUNT');
  await actor.page
    .getByRole('textbox', { name: '帳號', exact: true })
    .fill(identity.account);
  step?.('PASSWORD');
  await actor.page.getByLabel('密碼', { exact: true }).fill(identity.password);
  step?.('LOGIN_BUTTON_VISIBLE');
  await actor.page
    .getByRole('button', { name: '登入', exact: true })
    .waitFor({ state: 'visible' });
};
export const capacityEntryUi: CapacityEntryUi = {
  landing: async (actor, scope) => {
    if (actor.page.url() !== 'about:blank') return capacityFailure();
    coldEntryNote(actor, 'GOTO_ENTER');
    try {
      await actor.page.goto(scope.appUrl);
      coldEntryNote(actor, 'GOTO_FULFILLED');
    } catch (error) {
      coldEntryNote(actor, 'GOTO_REJECTED');
      throw error;
    }
    try {
      await actor.page
        .getByRole('heading', { name: 'ColorPlay', exact: true })
        .waitFor({ state: 'visible' });
      coldEntryNote(actor, 'HEADING_FULFILLED');
    } catch (error) {
      coldEntryNote(actor, 'HEADING_REJECTED');
      throw error;
    }
  },
  ready: async (actor, scope, identity, registration, step) => {
    step?.('LANDING_CTA');
    await actor.page
      .getByRole('link', { name: '開始冒險', exact: true })
      .click();
    step?.('LOGIN_ROUTE');
    await actor.page.waitForURL(
      (url) => url.origin === scope.appUrl && url.pathname === '/login',
    );
    if (!registration) {
      if (!identity) return capacityFailure();
      await loginFields(actor, identity, step);
      return;
    }
    step?.('REGISTER_CTA');
    await actor.page
      .getByRole('link', { name: '註冊帳號', exact: true })
      .click();
    step?.('REGISTER_ROUTE');
    await actor.page.waitForURL(
      (url) => url.origin === scope.appUrl && url.pathname === '/register',
    );
    step?.('NAME');
    await actor.page
      .getByLabel('名字', { exact: true })
      .fill(identity?.fullName ?? '匿名準備');
    step?.('NICKNAME');
    await actor.page
      .getByLabel('暱稱', { exact: true })
      .fill(identity?.nickname ?? `準備${String(actor.actorIndex)}`);
    step?.('CLASS');
    await actor.page
      .getByLabel('班級序號', { exact: true })
      .fill(identity?.classCode ?? 'ABCDEFGH');
    step?.('NEXT');
    await actor.page
      .getByRole('button', { name: '下一步', exact: true })
      .click();
    step?.('EMAIL');
    await actor.page
      .getByLabel('E-mail', { exact: true })
      .fill(
        identity?.email ??
          `${scope.planId}.prepare.${String(actor.actorIndex)}@colorplay.test`,
      );
    step?.('SEND_BUTTON_VISIBLE');
    await actor.page
      .getByRole('button', { name: '傳送驗證碼', exact: true })
      .waitFor({ state: 'visible' });
  },
  submit: async (actor) => {
    await actor.page.getByRole('button', { name: '登入', exact: true }).click();
  },
  confirmed: async (actor, identity) => {
    await actor.page.waitForURL(
      (url) =>
        url.pathname === (identity.role === 'teacher' ? '/teacher' : '/app'),
    );
    await actor.page
      .getByText(
        identity.role === 'teacher'
          ? `${identity.displayName}・教師端`
          : identity.displayName,
        { exact: true },
      )
      .first()
      .waitFor({ state: 'visible' });
    if (identity.role === 'teacher')
      await actor.page
        .getByRole('form', { name: '分析篩選', exact: true })
        .waitFor({ state: 'visible' });
    else
      await actor.page
        .locator('.lobby--map-fullscreen .chapter-map-shell')
        .waitFor({ state: 'visible' });
  },
};
export interface CapacityLoginCohortInput {
  actors: readonly NativeCapacityActor[];
  scope: CapacityScope;
  plan: CapacityManifest;
  legId: string;
  identities: readonly Pick<CapacityEntryIdentity, 'alias' | 'role'>[];
  admit: () => void;
  signal: AbortSignal;
}
export const capacityLoginCohortContext = (input: CapacityLoginCohortInput) => {
  requireCapacityScope(input.scope);
  validateCapacityManifest(input.plan, input.scope);
  const leg = findCapacityLeg(input.plan, input.legId);
  if (
    leg.mode !== 'NATIVE_BROWSER' ||
    leg.scenario !== 'existing_login_game' ||
    input.actors.length !== leg.actors ||
    input.identities.length !== leg.actors ||
    input.identities.some(
      (identity, i) =>
        identity.alias !== leg.members[i] ||
        identity.role !== (identity.alias === 'T1' ? 'teacher' : 'student'),
    )
  )
    return capacityFailure();
  return {
    origin: input.scope.appUrl,
    destinations: input.identities.map((identity) =>
      identity.role === 'teacher' ? '/teacher' : '/app',
    ),
  };
};
export const capacityLoginUrlMatches = (
  value: string,
  origin: string,
  path: string,
) => {
  try {
    const url = new URL(value);
    return (
      url.origin === origin && url.pathname === path && !url.search && !url.hash
    );
  } catch {
    return false;
  }
};
export type CapacityCohortIntent = 'OTP_SEND' | 'EXISTING_LOGIN';
export const capacityCohortButtonName = (intent: CapacityCohortIntent) =>
  intent === 'OTP_SEND' ? '傳送驗證碼' : '登入';
// Self-contained serialized page callback: no Node closure or DOM mutation.
export const capacityPreparedButtonReady = (
  node: HTMLElement | SVGElement,
  input: { expected: HTMLElement | SVGElement; intent: string },
) => {
  if (
    node !== input.expected ||
    !(node instanceof HTMLButtonElement) ||
    (input.intent !== 'OTP_SEND' && input.intent !== 'EXISTING_LOGIN')
  )
    return false;
  const rect = node.getBoundingClientRect();
  return (
    node.ownerDocument === document &&
    node.isConnected &&
    node.type === (input.intent === 'OTP_SEND' ? 'button' : 'submit') &&
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
};

export const capacityCohortErrorClass = (
  error: unknown,
): 'ERROR' | 'TYPE_ERROR' | 'OTHER' => {
  try {
    return error instanceof TypeError
      ? 'TYPE_ERROR'
      : error instanceof Error
        ? 'ERROR'
        : 'OTHER';
  } catch {
    return 'OTHER';
  }
};

export const capacityLoginFrameMatches = (
  frame: { url(): string },
  origin: string,
  path: string,
) => {
  try {
    return capacityLoginUrlMatches(frame.url(), origin, path);
  } catch {
    return false;
  }
};
