import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import type { Database } from '../../src/types/database';
import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const correctAnswers = GENERATED_CORRECT_ANSWERS;
// 挑一個題數足夠出滿 10 題挑戰的章節，內容變動時自動跟上。
const fullChallengeChapter = CONTENT_MANIFEST.find(
  (chapter) => chapter.questionCount >= 10,
);
if (!fullChallengeChapter) {
  throw new Error('沒有任何章節有 10 題以上，無法執行完整挑戰測試');
}
const CHALLENGE_LINK = `/app/quiz/new?template=${fullChallengeChapter.templateId}`;

const requiredEnvironment = (name: 'SUPABASE_ANON_KEY' | 'SUPABASE_URL') => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for this local E2E test`);
  return value;
};

test('student completes a mixed ten-question challenge with durable server totals', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_USERS.studentOne.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentOne.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.locator(`a[href="${CHALLENGE_LINK}"]`).click();
  await expect(page).toHaveURL(/\/app\/quiz\/[0-9a-f-]{36}$/u);

  const sessionId = new URL(page.url()).pathname.split('/').at(-1);
  expect(sessionId).toMatch(/^[0-9a-f-]{36}$/u);

  for (let position = 1; position <= 10; position += 1) {
    await expect(page.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / 10 題`,
    );
    const prompt = await page.locator('.question-card legend').innerText();
    const correctAnswer = correctAnswers.get(prompt);
    if (!correctAnswer) {
      throw new Error(`missing answer for prompt: ${prompt}`);
    }

    if (position <= 5) {
      await page.getByRole('radio', { name: correctAnswer }).check();
    } else {
      await page
        .locator('.question-option')
        .filter({ hasNotText: correctAnswer })
        .first()
        .getByRole('radio')
        .check();
    }
    await page.getByRole('button', { name: '送出答案' }).click();

    await expect(
      page.getByRole('heading', {
        name: position <= 5 ? '✓ 答對了' : '✕ 答錯了',
      }),
    ).toBeVisible();
    await expect(page.locator('.feedback-card > p').last()).toBeVisible();

    await page
      .getByRole('button', {
        name: position === 10 ? '結算並查看結果' : '我理解了，下一題',
      })
      .click();
  }

  await expect(page).toHaveURL(
    new RegExp(`/app/quiz/${sessionId ?? ''}/result$`, 'u'),
  );
  await expect(page.getByRole('heading', { name: '挑戰完成' })).toBeVisible();
  await expect(page.getByText('總分 750')).toBeVisible();
  await expect(page.getByText('答對 5 / 10 題')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(10);

  const supabase = createClient<Database>(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_ANON_KEY'),
  );
  const { error: signInError } = await supabase.auth.signInWithPassword(
    TEST_USERS.studentOne,
  );
  expect(signInError).toBeNull();
  const { data: aggregate, error: aggregateError } = await supabase
    .from('quiz_sessions')
    .select('status, answered_count, correct_count, total_score')
    .eq('id', sessionId ?? '')
    .single();
  expect(aggregateError).toBeNull();
  expect(aggregate).toEqual({
    answered_count: 10,
    correct_count: 5,
    status: 'completed',
    total_score: 750,
  });

  await page.reload();
  await expect(page.getByRole('heading', { name: '挑戰完成' })).toBeVisible();
  await expect(page.getByText('總分 750')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(10);

  await page.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel('Email').fill(TEST_USERS.studentTwo.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentTwo.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/app/quiz/${sessionId ?? ''}/result$`, 'u'),
  );
  await expect(
    page.getByRole('heading', { name: '無法顯示結果' }),
  ).toBeVisible();
  await expect(
    page.getByText('找不到這次挑戰，或你沒有檢視權限。'),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
