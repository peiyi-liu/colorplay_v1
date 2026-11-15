import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import {
  withMediaDiagnostics,
  mediaStepDiagnosticSchema,
} from '../../scripts/concurrency/media-diagnostics';
import { functionalMediaPurpose } from '../../scripts/concurrency/media-journey';
describe('actual media controls and fixed private substeps', () => {
  it('selects the real fieldset unique purpose combobox, not an absent label', () => {
    const selectOption = vi.fn(() => Promise.resolve());
    const page = {
      getByRole: vi.fn((role: string, options: unknown) => {
        expect(role).toBe('group');
        expect(options).toEqual({ name: '內容圖片（最多 3 張）', exact: true });
        return {
          getByRole: (child: string) => {
            expect(child).toBe('combobox');
            return { selectOption };
          },
        };
      }),
      getByLabel: vi.fn(() => {
        throw new Error('SYNTHETIC_WRONG_SELECTOR');
      }),
    } as unknown as Page;
    void functionalMediaPurpose(page).selectOption('standard');
    expect(selectOption).toHaveBeenCalledWith('standard');
  });
  it('records started/confirmed/failed without raw errors, IDs or body', async () => {
    const records: { name: string; value: unknown }[] = [];
    const cause = new Error('SYNTHETIC_PRIVATE');
    await expect(
      withMediaDiagnostics(
        {
          directory: 'synthetic',
          write: (name, value) => {
            records.push({ name, value });
            return Promise.resolve();
          },
        },
        new AbortController().signal,
        async (step) => {
          await step('single');
          await step('single_recovery');
          throw cause;
        },
      ),
    ).rejects.toBe(cause);
    expect(records.map((row) => row.name)).toEqual([
      'media-step-single-started',
      'media-step-single-confirmed',
      'media-step-single_recovery-started',
      'media-step-single_recovery-failed',
    ]);
    for (const row of records)
      expect(mediaStepDiagnosticSchema.safeParse(row.value).success).toBe(true);
    expect(JSON.stringify(records)).not.toContain('SYNTHETIC_PRIVATE');
    expect(records.at(-1)?.value).toMatchObject({
      code: 'FUNCTIONAL_OPERATION_FAILED',
    });
    expect(
      mediaStepDiagnosticSchema.safeParse({
        step: 'single',
        status: 'failed',
        code: null,
        raw: 'SYNTHETIC_PRIVATE',
      }).success,
    ).toBe(false);
  });
  it('journal startup failure prevents action; aborted/duplicate steps do not confirm', async () => {
    const action = vi.fn(() => Promise.resolve());
    const broken = {
      directory: 'synthetic',
      write: () => Promise.reject(new Error('SYNTHETIC_WRITE')),
    };
    await expect(
      withMediaDiagnostics(
        broken,
        new AbortController().signal,
        async (step) => {
          await step('single');
          await action();
        },
      ),
    ).rejects.toThrow('SYNTHETIC_WRITE');
    expect(action).not.toHaveBeenCalled();
    const abort = new AbortController(),
      writes: string[] = [];
    await expect(
      withMediaDiagnostics(
        {
          directory: 'synthetic',
          write: (name) => {
            writes.push(name);
            return Promise.resolve();
          },
        },
        abort.signal,
        async (step) => {
          await step('single');
          abort.abort();
        },
      ),
    ).rejects.toThrow('FUNCTIONAL_ABORTED');
    expect(writes).not.toContain('media-step-single-confirmed');
  });
});
