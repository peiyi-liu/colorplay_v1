import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  withMediaDiagnostics,
  mediaStepDiagnosticSchema,
} from '../../scripts/concurrency/media-diagnostics';
import { createPrivateJournal } from '../../scripts/concurrency/private-journal';
import { FunctionalError } from '../../scripts/concurrency/config';
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
      'media-step-single-recovery-started',
      'media-step-single-recovery-failed',
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

describe('media diagnostics through the actual private journal writer', () => {
  let root: string;
  beforeEach(async () => {
    root = await realpath(
      await mkdtemp(join(tmpdir(), 'colorplay-media-journal-')),
    );
    await chmod(root, 0o700);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const steps = mediaStepDiagnosticSchema.shape.step.options;
  const filename = (step: string, status: string) =>
    `media-step-${step.replaceAll('_', '-')}-${status}.json`;
  const openJournal = () => createPrivateJournal(root, 'wsb-journal-fixture');
  it('persists all twelve step enums with legal filenames and private write-once bytes', async () => {
    expect(steps).toHaveLength(12);
    const journal = await openJournal();
    await expect(
      withMediaDiagnostics(
        journal,
        new AbortController().signal,
        async (step) => {
          for (const value of steps) await step(value);
          return 'COMPLETED';
        },
      ),
    ).resolves.toBe('COMPLETED');
    const names = await readdir(journal.directory);
    expect(names.sort()).toEqual(
      steps
        .flatMap((step) => [
          filename(step, 'started'),
          filename(step, 'confirmed'),
        ])
        .sort(),
    );
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(journal.directory)).mode & 0o777).toBe(0o700);
    for (const step of steps) {
      for (const status of ['started', 'confirmed'] as const) {
        const path = join(journal.directory, filename(step, status));
        const bytes = await readFile(path, 'utf8');
        expect(JSON.parse(bytes)).toEqual({ step, status, code: null });
        expect((await stat(path)).mode & 0o777).toBe(0o600);
        await expect(
          journal.write(filename(step, status).slice(0, -5), {}),
        ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
        expect(await readFile(path, 'utf8')).toBe(bytes);
      }
    }
  });
  it.each(steps)(
    'preserves %s failure and writes only its safe failed terminal',
    async (stepName) => {
      const journal = await openJournal();
      const original = new FunctionalError('FUNCTIONAL_BROWSER_FAILED');
      original.message = 'SYNTHETIC_PRIVATE_ERROR';
      await expect(
        withMediaDiagnostics(
          journal,
          new AbortController().signal,
          async (step) => {
            await step(stepName);
            throw original;
          },
        ),
      ).rejects.toBe(original);
      expect((await readdir(journal.directory)).sort()).toEqual(
        [filename(stepName, 'failed'), filename(stepName, 'started')].sort(),
      );
      const bytes = await readFile(
        join(journal.directory, filename(stepName, 'failed')),
        'utf8',
      );
      expect(JSON.parse(bytes)).toEqual({
        step: stepName,
        status: 'failed',
        code: 'FUNCTIONAL_BROWSER_FAILED',
      });
      expect(bytes).not.toContain('SYNTHETIC_PRIVATE_ERROR');
      expect(
        (await stat(join(journal.directory, filename(stepName, 'failed'))))
          .mode & 0o777,
      ).toBe(0o600);
    },
  );
  it('does not replace the original error when a failed-terminal write collides', async () => {
    const journal = await openJournal();
    const saved = {
      step: 'single',
      status: 'failed',
      code: 'FUNCTIONAL_ABORTED',
    };
    await journal.write('media-step-single-failed', saved);
    const original = new Error('SYNTHETIC_ORIGINAL');
    await expect(
      withMediaDiagnostics(
        journal,
        new AbortController().signal,
        async (step) => {
          await step('single');
          throw original;
        },
      ),
    ).rejects.toBe(original);
    expect(
      JSON.parse(
        await readFile(
          join(journal.directory, 'media-step-single-failed.json'),
          'utf8',
        ),
      ),
    ).toEqual(saved);
  });
});
