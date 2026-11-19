import { performance } from 'node:perf_hooks';
import { expect, type Locator, type Page } from '@playwright/test';
import type { LiveSessionState } from '../../src/features/live/types';
import { capacityFailure } from './capacity-scope';
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const student = (value: unknown) => value === false;
export const capacityLiveStudentQuestion = (
  state: LiveSessionState,
  position: number,
  questionCount: number,
) => {
  const mode: unknown = state.questionDisplay;
  const question = state.question;
  if (
    !Number.isInteger(position) ||
    !Number.isInteger(questionCount) ||
    position < 1 ||
    position > questionCount ||
    questionCount > 20 ||
    (mode !== 'screen_only' && mode !== 'device') ||
    state.state !== 'question_open' ||
    state.currentPosition !== position ||
    state.questionCount !== questionCount ||
    !student(state.isHost) ||
    state.waitingForNext ||
    question?.position !== position ||
    question.publicOptions.length < 2 ||
    question.publicOptions.some((o) => !nonempty(o.id)) ||
    new Set(question.publicOptions.map((o) => o.id)).size !==
      question.publicOptions.length
  )
    return capacityFailure();
  let displayText: string;
  if (mode === 'device') {
    if (!nonempty(question.prompt)) return capacityFailure();
    displayText = question.prompt;
  } else {
    if (
      question.prompt !== undefined ||
      question.publicOptions.some((o) => o.text !== undefined)
    )
      return capacityFailure();
    displayText = '請看投影幕作答';
  }
  return {
    question,
    displayText,
    counterText: `第 ${String(position)} / ${String(questionCount)} 題`,
  };
};
const remainingBudget = (signal: AbortSignal, now: () => number) => {
  const began = now();
  let last = began;
  return () => {
    signal.throwIfAborted();
    const at = now();
    if (
      !Number.isFinite(began) ||
      !Number.isFinite(at) ||
      began < 0 ||
      at < last ||
      at - began >= 20000
    )
      return capacityFailure();
    last = at;
    return 20000 - (at - began);
  };
};
export interface PromptWaitObservation {
  wait: 'COUNTER' | 'MODE_TEXT';
  state: 'ENTERED' | 'RETURNED' | 'FAILED';
}
export const waitCapacityLiveStudentPrompt = async (
  page: Page,
  question: ReturnType<typeof capacityLiveStudentQuestion>,
  signal: AbortSignal,
  now: () => number = () => performance.now(),
  observe?: (event: PromptWaitObservation) => void,
) => {
  const remaining = remainingBudget(signal, now);
  let wait: PromptWaitObservation['wait'] = 'COUNTER';
  const note = (state: PromptWaitObservation['state']) => {
    try {
      observe?.({ wait, state });
    } catch {
      /* Passive only. */
    }
  };
  try {
    note('ENTERED');
    await expect(
      page.getByText(question.counterText, { exact: false }).first(),
    ).toBeVisible({ timeout: remaining() });
    note('RETURNED');
    wait = 'MODE_TEXT';
    note('ENTERED');
    await expect(
      page.getByText(question.displayText, { exact: true }).first(),
    ).toBeVisible({ timeout: remaining() });
    remaining();
    note('RETURNED');
  } catch (error) {
    note('FAILED');
    throw error;
  }
};
export const waitCapacityLiveStudentOptions = async (
  buttons: Locator,
  count: number,
  signal: AbortSignal,
  now: () => number = () => performance.now(),
) => {
  if (!Number.isInteger(count) || count < 2) return capacityFailure();
  const remaining = remainingBudget(signal, now);
  await buttons.first().waitFor({ state: 'visible', timeout: remaining() });
  await expect(buttons).toHaveCount(count, { timeout: remaining() });
  remaining();
};
