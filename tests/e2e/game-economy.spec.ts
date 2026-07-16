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

const challenge = CONTENT_MANIFEST.find(
  ({ questionCount }) => questionCount >= 10,
);
if (!challenge) throw new Error('GAME_ECONOMY_CHALLENGE_MISSING');

const requiredEnvironment = (name: 'SUPABASE_ANON_KEY' | 'SUPABASE_URL') => {
  const value = process.env[name];
  if (!value) throw new Error(`GAME_ECONOMY_${name}_MISSING`);
  return value;
};

test('Game Economy v2 phase gate', async ({ browserName, page }, testInfo) => {
  const acceptanceMode = process.env.PLAYWRIGHT_ACCEPTANCE === 'on';
  const precheckMode = process.env.GAME_ECONOMY_PRECHECK === 'on';
  if (!acceptanceMode && !precheckMode) {
    throw new Error('GAME_ECONOMY_ACCEPTANCE_MODE_REQUIRED');
  }
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (acceptanceMode && !evidenceRoot) {
    throw new Error('GAME_ECONOMY_EVIDENCE_ROOT_MISSING');
  }
  if (precheckMode && evidenceRoot) {
    throw new Error('GAME_ECONOMY_PRECHECK_EVIDENCE_FORBIDDEN');
  }
  const health = attachBrowserHealth(page);

  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_USERS.studentOne.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentOne.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await page
    .locator(`a[href="/app/quiz/new?template=${challenge.templateId}"]`)
    .click();
  await expect(page).toHaveURL(/\/app\/quiz\/[0-9a-f-]{36}$/u);
  const sessionId = new URL(page.url()).pathname.split('/').at(-1);
  if (!sessionId) throw new Error('GAME_ECONOMY_SESSION_ID_MISSING');

  for (let position = 1; position <= 10; position += 1) {
    await expect(page.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / 10 題`,
    );
    const prompt = await page.locator('.question-card legend').innerText();
    const answer = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!answer) throw new Error('GAME_ECONOMY_ANSWER_MISSING');
    await page.getByRole('radio', { name: answer }).check();
    await page.getByRole('button', { name: '送出答案' }).click();
    await expect(page.getByRole('heading', { name: '✓ 答對了' })).toBeVisible();
    await page
      .getByRole('button', {
        name: position === 10 ? '結算並查看結果' : '我理解了，下一題',
      })
      .click();
  }

  await expect(page).toHaveURL(
    new RegExp(`/app/quiz/${sessionId}/result$`, 'u'),
  );
  await expect(page.getByText('+750 XP')).toBeVisible();
  await expect(page.getByText('+250 Token')).toBeVisible();
  await expect(page.getByText('Level 2')).toBeVisible();
  await expect(page.getByText('250 / 500 XP')).toBeVisible();
  await expect(page.getByText('250 Token', { exact: true })).toBeVisible();

  if (acceptanceMode) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(
        page.getByRole('heading', { name: '挑戰完成' }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`game-economy-result-${viewport.label}.png`),
      });
    }
  }

  await page.getByRole('link', { name: 'Blook 商店' }).click();
  await expect(page).toHaveURL(/\/app\/shop$/u);
  await page.getByRole('button', { name: '購買 招財貓，100 Token' }).click();
  await expect(
    page.getByRole('dialog', { name: '購買「招財貓」？' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '確認購買' }).click();
  await expect(page.getByRole('status')).toContainText('已購買招財貓。');
  await expect(page.getByText('150 Token 可用')).toBeVisible();
  await page.getByRole('button', { name: '選用 招財貓' }).click();
  await expect(page.getByRole('status')).toContainText('已裝備招財貓。');
  await expect(page.getByText('已裝備', { exact: true })).toHaveCount(1);

  await page.reload();
  await expect(page.getByText('已裝備', { exact: true })).toHaveCount(1);
  await page.goto('/app/shop');
  await expect(page.getByText('150 Token 可用')).toBeVisible();
  await expect(page.getByText('已裝備', { exact: true })).toHaveCount(1);

  const client = createClient<Database>(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: signInError } = await client.auth.signInWithPassword(
    TEST_USERS.studentOne,
  );
  expect(signInError).toBeNull();
  const retriedFinalize = await client.rpc('finalize_quiz_session', {
    session_id: sessionId,
  });
  expect(retriedFinalize.error).toBeNull();
  expect(retriedFinalize.data).toMatchObject({
    tokens_awarded: 250,
    xp_awarded: 750,
  });

  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('GAME_ECONOMY_USER_ID_MISSING');
  const forgedLedger = await client.from('wallet_transactions').insert({
    amount: 999,
    reason: 'forged browser reward',
    source_id: sessionId,
    source_type: 'quiz_finalize',
    user_id: userId,
  });
  expect(forgedLedger.error).not.toBeNull();

  await page.goto(`/app/quiz/${sessionId}/result`);
  await expect(page.getByText('+750 XP')).toBeVisible();
  await expect(page.getByText('+250 Token')).toBeVisible();
  await page.getByRole('link', { name: 'Blook 商店' }).click();
  await expect(page.getByText('150 Token 可用')).toBeVisible();

  const browserHealth = unexpectedBrowserHealth(health, browserName);
  expect(browserHealth).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  });
  if (acceptanceMode && evidenceRoot) {
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
  }
});
