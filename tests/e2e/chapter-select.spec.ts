import { expect, test } from '@playwright/test';

import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const playableChapters = CONTENT_MANIFEST.filter(
  (chapter) => chapter.questionCount > 0,
);

test('student sees all published chapters and every playable challenge', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/login');
  await page
    .getByRole('textbox', { name: '帳號' })
    .fill(TEST_USERS.studentOne.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentOne.password);
  await page.getByRole('button', { name: '登入' }).click();

  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();

  // 分頁批：大廳章節卡以 GamePager 分頁（wide 容量 3），DOM 每次只掛載
  // 當頁卡片。原本的單頁全量 toHaveCount 斷言改為逐頁累加；沒有分頁 chrome
  // （items ≤ 容量）時迴圈只跑一輪，等價於原本的單頁行為。
  const nextButton = page.getByRole('button', { name: '下一頁' });
  const prevButton = page.getByRole('button', { name: '上一頁' });
  const hasPager = (await nextButton.count()) > 0;

  let articleTotal = 0;
  // GGAME 大廳：可玩章節的入口連結文字為「開始任務」（非目前解鎖前緣）或
  // 「繼續學習」（目前解鎖前緣），並無「開始挑戰」字樣（該字樣只出現在章節
  // 詳情頁）；改以兩者聯集比對，行為與 startHref 存在與否等價。
  let startLinkTotal = 0;
  let lockedTotal = 0;
  let comingSoonTotal = 0;
  let guard = 0;

  for (;;) {
    articleTotal += await page.getByRole('article').count();
    startLinkTotal += await page
      .getByRole('link', { name: /^(開始任務|繼續學習)$/u })
      .count();
    // 現行 UI：未開放章節以「尚未解鎖」狀態標籤與「完成前一章節後解鎖」
    // 提示呈現，無挑戰入口（原本斷言的「鎖定中」／「敬請期待」字樣在目前
    // codebase 內查無出處，屬撰寫當下就已失配的舊字串，隨本批一併校正）。
    lockedTotal += await page.getByText('尚未解鎖').count();
    comingSoonTotal += await page.getByText('完成前一章節後解鎖').count();

    if (!hasPager) break;
    if (await nextButton.isDisabled()) break;
    await nextButton.click();
    await expect(page.getByText(/第 \d+ \/ \d+ 頁/u)).toBeVisible();
    guard += 1;
    if (guard > 20) throw new Error('chapter pager loop guard exceeded');
  }

  expect(articleTotal).toBe(CONTENT_MANIFEST.length);
  expect(startLinkTotal).toBe(playableChapters.length);
  expect(lockedTotal).toBe(CONTENT_MANIFEST.length - playableChapters.length);
  expect(comingSoonTotal).toBe(
    CONTENT_MANIFEST.length - playableChapters.length,
  );

  // 逐一核對每個可玩章節的挑戰連結：先回到第 1 頁，再逐頁往前找，找到即
  // 停止（同素材批「先點下一頁」慣例，不假設固定分頁容量）。
  if (hasPager) {
    guard = 0;
    while (!(await prevButton.isDisabled())) {
      await prevButton.click();
      guard += 1;
      if (guard > 20) throw new Error('chapter pager rewind guard exceeded');
    }
  }

  for (const chapter of playableChapters) {
    const link = page.locator(
      `a[href="/app/quiz/new?template=${chapter.templateId}"]`,
    );
    guard = 0;
    for (;;) {
      if ((await link.count()) > 0) break;
      if (!hasPager || (await nextButton.isDisabled())) break;
      await nextButton.click();
      await expect(page.getByText(/第 \d+ \/ \d+ 頁/u)).toBeVisible();
      guard += 1;
      if (guard > 20) throw new Error('chapter pager search guard exceeded');
    }
    await expect(link).toBeVisible();
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
