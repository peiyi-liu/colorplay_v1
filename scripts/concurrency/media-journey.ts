/// <reference types="vite/client" />
import { expect, type Page, type Dialog, type Locator } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/types/database';
import { createContentAuthoringRepository } from '../../src/features/content-studio/api/content-authoring-repository';
import { sessionTokensFromPage } from '../../tests/e2e/helpers/staging-capacity-browser';
import { adminRead, adminReadNames } from './admin-denials';
import { sha256, type FunctionalSecrets } from './local-runtime';
import { withMediaDiagnostics } from './media-diagnostics';
import { buildMediaFixtures } from './media-fixtures';
import { createMediaInterception } from './media-interception';
import type { createMediaHookBinding } from './media-hook-binding';
import type { PrivateJournal } from './private-journal';
import { fail, safely, type FunctionalScope } from './config';
import type { FunctionalIdentity } from './owned-fixtures';
import {
  assertMediaReadback,
  type MediaReadonlyOracle,
  type MediaReadbackInput,
} from './media-readback';
const authoring = (
  client: SupabaseClient<Database>,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
) =>
  createContentAuthoringRepository({
    rpc: async (name, args) => {
      const parsed = z.enum(adminReadNames).safeParse(name);
      if (!parsed.success) return fail('FUNCTIONAL_SCOPE_INVALID');
      const result = await adminRead(
        client,
        scope,
        secrets,
        signal,
        parsed.data,
        args,
      );
      if (result.status !== 200) return fail('FUNCTIONAL_OPERATION_FAILED');
      return result.body;
    },
  });
export const leaveUnsavedMediaEditor = async (
  page: Page,
  action: () => Promise<unknown>,
) => {
  let seen = 0;
  const state = { valid: true };
  const tasks: Promise<void>[] = [];
  const listener = (dialog: Dialog) => {
    seen++;
    const expected =
      dialog.type() === 'confirm' &&
      dialog.message() === '尚有未儲存變更，離開會捨棄這些變更。確定繼續嗎？';
    if (!expected || seen > 1) state.valid = false;
    tasks.push(
      (expected && seen === 1 ? dialog.accept() : dialog.dismiss()).catch(
        () => {
          state.valid = false;
        },
      ),
    );
  };
  page.on('dialog', listener);
  try {
    await action();
    await Promise.allSettled(tasks);
    if (seen !== 1 || !state.valid) return fail('FUNCTIONAL_OPERATION_FAILED');
  } finally {
    page.off('dialog', listener);
    await Promise.allSettled(tasks);
  }
};
export const functionalImportCommitStatus = (container: Locator) =>
  container.getByRole('status').filter({
    hasText: /^匯入完成：已建立或更新 2 份草稿。$/u,
  });

export const functionalMediaPurpose = (page: Page) =>
  page
    .getByRole('group', { name: '內容圖片（最多 3 張）', exact: true })
    .getByRole('combobox');
export const runMediaJourney = async (
  page: Page,
  client: SupabaseClient<Database>,
  admin: FunctionalIdentity,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
  journal: PrivateJournal,
  binding: ReturnType<typeof createMediaHookBinding>,
  oracle: MediaReadonlyOracle,
) =>
  safely(() =>
    withMediaDiagnostics(journal, signal, async (step) => {
      await step('authorization');
      if (admin.label !== 'A1' || !admin.userId)
        return fail('FUNCTIONAL_SCOPE_INVALID');
      const tokens = await sessionTokensFromPage(page, scope.supabaseUrl);
      const subject = await client.auth.getUser(tokens.access_token);
      if (subject.error || subject.data.user.id !== admin.userId)
        return fail('FUNCTIONAL_AUTH_FAILED');
      let authSessionId: string;
      try {
        authSessionId = z
          .object({ sub: z.literal(admin.userId), session_id: z.uuid() })
          .parse(
            JSON.parse(
              Buffer.from(
                tokens.access_token.split('.')[1] ?? '',
                'base64url',
              ).toString(),
            ) as unknown,
          ).session_id;
      } catch {
        return fail('FUNCTIONAL_AUTH_FAILED');
      }
      await step('content_lookup');
      const repository = authoring(client, scope, secrets, signal);
      const catalog = await repository.listCatalog();
      if (catalog.outcome !== 'ok') return fail('FUNCTIONAL_OPERATION_FAILED');
      const chapter = catalog.chapters.find(
        (row) => row.stableCode === 'chapter-3' && row.status === 'published',
      );
      if (!chapter) return fail('FUNCTIONAL_OPERATION_FAILED');
      const content = await repository.listScope({
        chapterId: chapter.chapterId,
      });
      if (content.outcome !== 'ok') return fail('FUNCTIONAL_OPERATION_FAILED');
      const section = content.sections.find(
        (row) =>
          row.status === 'published' &&
          row.subtopics.some((topic) => topic.status === 'published'),
      );
      const topic = section?.subtopics.find(
        (row) => row.status === 'published',
      );
      if (!section || !topic) return fail('FUNCTIONAL_OPERATION_FAILED');
      const fixture = buildMediaFixtures(scope, topic.stableCode);
      await step('owned_plan');
      await journal.write('media-owned-plan', {
        scopeRunId: scope.runId,
        actorId: admin.userId,
        authSessionId,
        sources: fixture.sources,
        stableCodes: fixture.stableCodes,
        parentSubtopicId: topic.subtopicId,
        retention: 'ASSETS_DRAFTS_AUDIT_RETAINED_NO_PUBLISH',
      });
      const policy = createMediaInterception(
        scope,
        sha256(tokens.access_token),
        admin.userId,
        fixture.sources,
        journal,
        signal,
      );
      binding.bind(policy.hooks);
      const untrack = policy.track(page);
      try {
        await step('editor');
        await page.goto('/admin/content');
        await page.getByRole('button', { name: '新增', exact: true }).click();
        await page
          .getByRole('combobox', { name: '章節', exact: true })
          .selectOption(chapter.chapterId);
        await page
          .getByRole('combobox', { name: '小節', exact: true })
          .selectOption(section.sectionId);
        await page
          .getByRole('combobox', { name: '子主題', exact: true })
          .selectOption(topic.subtopicId);
        await page
          .getByLabel('標題', { exact: true })
          .fill(`${scope.runId} 單張驗證`);
        await page
          .getByLabel('複習卡內容', { exact: true })
          .fill('僅本次未儲存的 Local 功能驗證，不發布。');
        const purpose = functionalMediaPurpose(page);
        await expect(purpose).toHaveCount(1);
        await step('single');
        const single = fixture.images.find((image) => image.slot === 'single');
        if (!single) return fail('FUNCTIONAL_OPERATION_FAILED');
        await page
          .getByLabel('圖片檔案', { exact: true })
          .setInputFiles(single);
        await page
          .getByLabel('替代文字', { exact: true })
          .fill('Local合成單張');
        await page
          .getByRole('button', { name: '插入圖片', exact: true })
          .click();
        await expect(
          page.locator('code').filter({ hasText: /^content-media:/u }),
        ).toHaveCount(1);
        policy.assertSlot('single');
        await step('single_recovery');
        const recovering = fixture.images.find(
          (image) => image.slot === 'single-recovery',
        );
        const cancelling = fixture.images.find(
          (image) => image.slot === 'single-cancel',
        );
        if (!recovering || !cancelling)
          return fail('FUNCTIONAL_OPERATION_FAILED');
        await purpose.selectOption('color_critical');
        await page
          .getByLabel('圖片檔案', { exact: true })
          .setInputFiles(recovering);
        await page
          .getByLabel('替代文字', { exact: true })
          .fill('Local合成恢復圖片');
        await page
          .getByRole('button', { name: '插入圖片', exact: true })
          .click();
        await expect(page.getByRole('alert')).toContainText(
          '圖片處理結果尚未確認',
        );
        await expect(
          page.getByLabel('圖片檔案', { exact: true }),
        ).toBeDisabled();
        await expect(purpose).toBeDisabled();
        await page
          .getByRole('button', { name: '確認並恢復處理', exact: true })
          .click();
        await expect(
          page.locator('code').filter({ hasText: /^content-media:/u }),
        ).toHaveCount(2);
        policy.assertSlot('single-recovery');
        await step('single_cancel');
        await purpose.selectOption('standard');
        await page
          .getByLabel('圖片檔案', { exact: true })
          .setInputFiles(cancelling);
        await page
          .getByLabel('替代文字', { exact: true })
          .fill('Local合成取消圖片');
        await page
          .getByRole('button', { name: '插入圖片', exact: true })
          .click();
        await expect(page.getByRole('alert')).toContainText(
          '圖片處理結果尚未確認',
        );
        await page
          .getByRole('button', { name: '取消這次上傳', exact: true })
          .click();
        await expect(
          page.getByLabel('圖片檔案', { exact: true }),
        ).toBeEnabled();
        await expect(page.getByLabel('圖片檔案', { exact: true })).toHaveValue(
          '',
        );
        await expect(
          page.locator('code').filter({ hasText: /^content-media:/u }),
        ).toHaveCount(2);
        policy.assertSlot('single-cancel');
        await step('single_duplicate');
        const duplicate = fixture.images.find(
          (image) => image.slot === 'single-duplicate',
        );
        if (!duplicate) return fail('FUNCTIONAL_OPERATION_FAILED');
        await expect(purpose).toBeEnabled();
        await purpose.selectOption('standard');
        await expect(purpose).toHaveValue('standard');
        await page
          .getByLabel('圖片檔案', { exact: true })
          .setInputFiles(duplicate);
        await page
          .getByLabel('替代文字', { exact: true })
          .fill('Local合成相同原圖再次上傳');
        await page
          .getByRole('button', { name: '插入圖片', exact: true })
          .click();
        await expect(
          page.locator('code').filter({ hasText: /^content-media:/u }),
        ).toHaveCount(3);
        const duplicateProof = policy.assertDuplicate();
        await step('leave_editor');
        await leaveUnsavedMediaEditor(page, () =>
          page.getByRole('button', { name: '外部匯入', exact: true }).click(),
        );
        await step('zip_recovery');
        const importUi = page.locator('section[aria-label="內容匯入流程"]');
        await importUi
          .getByLabel('內容套件（XLSX 或 CSV＋圖片 ZIP）')
          .setInputFiles(fixture.zip);
        await importUi
          .getByRole('button', { name: '上傳並預覽差異', exact: true })
          .click();
        await expect(importUi.getByRole('alert')).toContainText(
          '圖片處理結果尚未確認',
        );
        await expect(
          importUi.getByLabel('內容套件（XLSX 或 CSV＋圖片 ZIP）'),
        ).toBeDisabled();
        await importUi
          .getByRole('button', { name: '確認並恢復處理', exact: true })
          .click();
        const table = importUi.getByRole('table', { name: '匯入差異' });
        await expect(table.getByRole('row')).toHaveCount(3);
        for (const code of fixture.stableCodes)
          await expect(
            table.getByRole('row').filter({ hasText: code }),
          ).toContainText('create');
        await expect(
          importUi.getByRole('button', { name: '確認並建立草稿', exact: true }),
        ).toBeEnabled();
        policy.assertSlot('zip1');
        policy.assertSlot('zip2');
        await journal.write('media-zip-draft-commit-intent', {
          stableCodes: fixture.stableCodes,
        });
        await importUi
          .getByRole('button', { name: '確認並建立草稿', exact: true })
          .click();
        const completedStatus = functionalImportCommitStatus(importUi);
        await expect(completedStatus).toHaveCount(1);
        await expect(completedStatus).toContainText(
          '匯入完成：已建立或更新 2 份草稿。',
        );
        const refreshed = await repository.listCatalog();
        if (refreshed.outcome !== 'ok')
          return fail('FUNCTIONAL_OPERATION_FAILED');
        const drafts =
          refreshed.drafts?.filter((draft) =>
            fixture.stableCodes.includes(draft.stableCode),
          ) ?? [];
        if (
          drafts.length !== 2 ||
          drafts.some(
            (draft) =>
              draft.entityType !== 'review_card' || draft.entityId !== null,
          )
        )
          return fail('FUNCTIONAL_OPERATION_FAILED');
        for (const draft of drafts) {
          const editor = await repository.readEditorState({
            draftId: draft.draftId,
            entityId: null,
            entityType: 'review_card',
          });
          if (
            editor.outcome !== 'ok' ||
            editor.current ||
            editor.draft?.stableCode !== draft.stableCode ||
            !Array.isArray(editor.draft.payload.media) ||
            editor.draft.payload.media.length !== 1
          )
            return fail('FUNCTIONAL_OPERATION_FAILED');
        }
        await journal.write('media-owned-drafts-confirmed', {
          drafts: drafts.map((draft) => ({
            draftId: draft.draftId,
            stableCode: draft.stableCode,
          })),
        });
        await step('zip_cancel');
        await importUi
          .getByLabel('內容套件（XLSX 或 CSV＋圖片 ZIP）')
          .setInputFiles(fixture.cancelZip);
        await importUi
          .getByRole('button', { name: '上傳並預覽差異', exact: true })
          .click();
        await expect(importUi.getByRole('alert')).toContainText(
          '圖片處理結果尚未確認',
        );
        await importUi
          .getByRole('button', { name: '取消這次上傳', exact: true })
          .click();
        await expect(
          importUi.getByLabel('內容套件（XLSX 或 CSV＋圖片 ZIP）'),
        ).toHaveValue('');
        await expect(
          importUi.getByLabel('內容套件（XLSX 或 CSV＋圖片 ZIP）'),
        ).toBeEnabled();
        policy.assertSlot('cancel');
        await step('readback');
        for (const source of fixture.sources) policy.assertSlot(source.slot);
        const runs = policy.privateEntries().map((entry) => {
          if (!entry.runId || (!entry.aborted && !entry.asset))
            return fail('FUNCTIONAL_OWNERSHIP_INVALID');
          return {
            slot: entry.slot,
            runId: entry.runId,
            requestId: entry.requestId,
            authSessionId,
            expectedStatus: entry.aborted
              ? ('aborted' as const)
              : ('verified' as const),
            semanticRole: entry.semanticRole,
            sourceSha256: entry.sourceSha256,
            receipt: entry.asset,
          };
        });
        const expectedVariants = runs.reduce(
          (count, run) => count + (run.receipt?.variants.length ?? 0),
          0,
        );
        const input: MediaReadbackInput = {
          scopeRunId: scope.runId,
          actorId: admin.userId,
          runs,
          draftIds: drafts.map((draft) => draft.draftId),
          expected: {
            verifiedRuns: runs.filter(
              (run) => run.expectedStatus === 'verified',
            ).length,
            abortedRuns: runs.filter((run) => run.expectedStatus === 'aborted')
              .length,
            assets: runs.filter((run) => run.receipt !== null).length,
            variants: expectedVariants,
            masterObjects: runs.filter((run) => run.receipt !== null).length,
            variantObjects: expectedVariants,
            quarantineObjects: 0,
          },
        };
        await journal.write('media-readback-approved-plan', input);
        const readback = assertMediaReadback(input, await oracle(input));
        return {
          mode: 'INTERCEPTED_FUNCTIONAL_CORRECTNESS' as const,
          injection:
            'SECOND_MEDIA_PROCESS_POST_VERIFIED_RESPONSE_DROP' as const,
          cancelInjection: 'OWNED_PROCESS_PRE_SEND_DROP' as const,
          singleDuplicate: duplicateProof,
          singleSavedDraft: false,
          retainedDrafts: 2,
          retainedAssets: input.expected.assets,
          singleRecoveryRole: 'color_critical' as const,
          singleInjection:
            'OWNED_SINGLE_PROCESS_POST_VERIFIED_RESPONSE_DROP' as const,
          sources: policy.snapshot(),
          readback,
        };
      } finally {
        untrack();
      }
    }),
  );
