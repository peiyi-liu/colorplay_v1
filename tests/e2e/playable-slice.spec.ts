import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import type { Database } from '../../src/types/database';
import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const correctAnswers: ReadonlyMap<string, string> = new Map([
  ['螢幕以光呈現色彩時，最常使用哪一種色彩模型？', 'RGB'],
  ['四色印刷通常使用哪四種色料？', '青、洋紅、黃、黑'],
  ['在 HSL 色彩模型中，H 代表什麼？', '色相'],
  ['CIELAB 的 L* 軸主要描述哪一項色彩屬性？', '明度'],
  ['十六進位色碼 #FF0000 表示哪一種顏色？', '紅色'],
  ['RGB 三個色光通道都設為最大值時，畫面會呈現什麼顏色？', '白色'],
  ['CMYK 中加入 K（黑色）版的主要原因是什麼？', '提供穩定深色與清晰細節'],
  ['HSL 的飽和度降低到 0% 時，顏色會變成什麼狀態？', '只剩灰階'],
  ['「色域」這個詞最適合描述什麼？', '可表示的顏色範圍'],
  [
    '為什麼同一組 RGB 數值可能在不同螢幕上看起來不同？',
    '不同裝置的色彩特性不同',
  ],
  ['每個 RGB 通道使用 8 位元時，一個通道可表示多少個階調？', '256'],
  [
    '設計檔由螢幕輸出改為印刷時，為何需要進行色彩管理？',
    '因為螢幕與印刷的色域和成色方式不同',
  ],
]);

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
  await page.getByRole('link', { name: '開始挑戰' }).click();
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
