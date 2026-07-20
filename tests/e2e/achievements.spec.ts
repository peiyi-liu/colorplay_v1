import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import type { Database } from '../../src/types/database';
import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { TEST_USERS } from '../fixtures/users';
import { attachBrowserHealth, unexpectedBrowserHealth } from './browser-health';

const viewports = [
  { width: 375, height: 812, label: '375x812' },
  { width: 768, height: 1024, label: '768x1024' },
  { width: 1440, height: 900, label: '1440x900' },
] as const;

const deferredBadges = [
  '不屈不撓',
  '章節精熟',
  '色彩大師',
  '課堂挑戰者',
] as const;
const challenge = CONTENT_MANIFEST.find(
  ({ questionCount }) => questionCount >= 10,
);
if (!challenge) throw new Error('ACHIEVEMENTS_CHALLENGE_MISSING');

const requiredEnvironment = (name: 'SUPABASE_ANON_KEY' | 'SUPABASE_URL') => {
  const value = process.env[name];
  if (!value) throw new Error(`ACHIEVEMENTS_${name}_MISSING`);
  return value;
};

test('Achievements phase gate', async ({ browserName, page }, testInfo) => {
  const acceptanceMode = process.env.PLAYWRIGHT_ACCEPTANCE === 'on';
  if (!acceptanceMode) throw new Error('ACHIEVEMENTS_ACCEPTANCE_MODE_REQUIRED');
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (!evidenceRoot) throw new Error('ACHIEVEMENTS_EVIDENCE_ROOT_MISSING');
  const health = attachBrowserHealth(page);

  await page.goto('/login');
  await page.getByLabel('帳號').fill(TEST_USERS.studentOne.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentOne.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);

  await page.goto('/app/achievements');
  await expect(page.getByRole('heading', { name: '成就徽章' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(9);
  for (const badge of deferredBadges) {
    await expect(
      page
        .getByRole('heading', { name: badge })
        .locator('xpath=ancestor::article'),
    ).toContainText('未開始');
  }

  await page.goto('/app');
  await page
    .locator(`a[href="/app/quiz/new?template=${challenge.templateId}"]`)
    .click();
  for (let position = 1; position <= 10; position += 1) {
    await expect(page.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / 10 題`,
    );
    const prompt = await page.locator('.question-card legend').innerText();
    const answer = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!answer) throw new Error('ACHIEVEMENTS_ANSWER_MISSING');
    await page.getByRole('radio', { name: answer }).check();
    await page.getByRole('button', { name: '送出答案' }).click();
    await expect(page.getByRole('heading', { name: '✓ 答對了' })).toBeVisible();
    await page
      .getByRole('button', {
        name: position === 10 ? '結算並查看結果' : '我理解了，下一題',
      })
      .click();
  }

  await page.getByRole('link', { name: '成就徽章' }).click();
  for (const badge of ['初出茅廬', '百發百中']) {
    await expect(
      page
        .getByRole('heading', { name: badge })
        .locator('xpath=ancestor::article'),
    ).toContainText('已解鎖');
  }
  await page.reload();
  await expect(page.getByText('已解鎖 2 / 9')).toBeVisible();

  const anonymousClient = createClient<Database>(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const forgedUnlock = await anonymousClient
    .from('achievement_unlocks')
    .insert({
      achievement_definition_id: '60000000-0000-0000-0000-000000000001',
      definition_version: 1,
      source_id: '64000000-0000-0000-0000-000000000001',
      source_type: 'catalog_backfill',
      user_id: '64000000-0000-0000-0000-000000000001',
    });
  expect(forgedUnlock.error).not.toBeNull();
  const forgedProgress = await anonymousClient
    .from('achievement_progress')
    .update({ current_value: 999 })
    .eq('user_id', '64000000-0000-0000-0000-000000000001');
  expect(forgedProgress.error).not.toBeNull();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading', { name: '成就徽章' })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`achievement-badges-${viewport.label}.png`),
    });
  }

  const browserHealth = unexpectedBrowserHealth(health, browserName);
  expect(browserHealth).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  });
  await mkdir(join(evidenceRoot, 'reports'), { recursive: true });
  await writeFile(
    join(evidenceRoot, 'reports/browser-health.json'),
    `${JSON.stringify({
      console_errors: browserHealth.consoleErrors.length,
      failed_requests: browserHealth.failedRequests.length,
      page_errors: browserHealth.pageErrors.length,
      server_errors: browserHealth.serverErrors.length,
    })}\n`,
  );
});
