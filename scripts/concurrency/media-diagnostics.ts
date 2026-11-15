import { z } from 'zod';
import { fail } from './config';
import type { PrivateJournal } from './private-journal';
const steps = [
  'authorization',
  'content_lookup',
  'owned_plan',
  'editor',
  'single',
  'single_recovery',
  'single_cancel',
  'single_duplicate',
  'leave_editor',
  'zip_recovery',
  'zip_cancel',
  'readback',
] as const;
const codes = [
  'FUNCTIONAL_ABORTED',
  'FUNCTIONAL_AUTH_FAILED',
  'FUNCTIONAL_SCOPE_INVALID',
  'FUNCTIONAL_OWNERSHIP_INVALID',
  'FUNCTIONAL_PREFLIGHT_FAILED',
  'FUNCTIONAL_BROWSER_FAILED',
  'FUNCTIONAL_OPERATION_FAILED',
] as const;
export const mediaStepDiagnosticSchema = z.strictObject({
  step: z.enum(steps),
  status: z.enum(['started', 'confirmed', 'failed']),
  code: z.enum(codes).nullable(),
});
export const withMediaDiagnostics = async <T>(
  journal: PrivateJournal,
  signal: AbortSignal,
  action: (step: (next: (typeof steps)[number]) => Promise<void>) => Promise<T>,
): Promise<T> => {
  const state: { current: (typeof steps)[number] | null; terminal: boolean } = {
    current: null,
    terminal: false,
  };
  const seen = new Set<string>();
  const check = () => {
    if (signal.aborted) return fail('FUNCTIONAL_ABORTED');
  };
  const write = (
    step: (typeof steps)[number],
    status: 'started' | 'confirmed' | 'failed',
    code: (typeof codes)[number] | null,
  ) =>
    journal.write(
      `media-step-${step}-${status}`,
      mediaStepDiagnosticSchema.parse({ step, status, code }),
    );
  const confirm = async () => {
    check();
    if (state.current && !state.terminal) {
      await write(state.current, 'confirmed', null);
      check();
      state.terminal = true;
    }
  };
  try {
    const result = await action(async (next) => {
      check();
      if (seen.has(next)) return fail('FUNCTIONAL_OWNERSHIP_INVALID');
      await confirm();
      state.current = next;
      state.terminal = false;
      seen.add(next);
      await write(next, 'started', null);
      check();
    });
    await confirm();
    return result;
  } catch (error) {
    let candidate: unknown = null;
    try {
      candidate =
        typeof error === 'object' && error !== null
          ? Object.getOwnPropertyDescriptor(error, 'code')?.value
          : null;
    } catch {
      /* Diagnostics cannot replace the original failure. */
    }
    const code =
      codes.find((known) => known === candidate) ??
      'FUNCTIONAL_OPERATION_FAILED';
    if (state.current && !state.terminal) {
      try {
        await write(state.current, 'failed', code);
      } catch {
        /* Preserve original failure. */
      }
    }
    throw error;
  }
};
