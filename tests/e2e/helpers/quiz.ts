import type { Page } from '@playwright/test';

// 明確帶 .ts 副檔名：這支 helper 同時被 Playwright（esbuild 轉譯，允許省略
// 副檔名）與 scripts/design-audit/capture-screens.mjs（Node 原生 ESM
// resolver，要求明確副檔名）兩種載入器 import，寫明確副檔名兩邊都相容
// （tsconfig 的 allowImportingTsExtensions 已開啟）。
import { CONTENT_MANIFEST } from '../../fixtures/content-manifest.generated.ts';

// 共用 quiz 互動：原本 tests/e2e/quiz-runner.spec.ts、
// tests/e2e/playable-slice.spec.ts、scripts/design-audit/capture-screens.mjs
// 三處各自重複「挑一個章節開始挑戰」「選項→送出→等回饋」的選擇器序列，抽成
// 這裡共用。同樣刻意不含 expect() 斷言，機制與斷言分離。

// 十題完整挑戰需要一個題數 ≥10 的章節；quiz-runner.spec.ts 與
// playable-slice.spec.ts 原本各自算一次同樣的 find()，這裡只算一次共用。
const resolvedFullChallengeChapter = CONTENT_MANIFEST.find(
  (chapter) => chapter.questionCount >= 10,
);
if (!resolvedFullChallengeChapter) {
  throw new Error('QUIZ_HELPER_NO_FULL_CHALLENGE_CHAPTER');
}
export const fullChallengeChapter = resolvedFullChallengeChapter;

const quizSessionUrlPattern = /\/app\/quiz\/[0-9a-f-]{36}$/u;
const quizFeedbackHeadingPattern = /(?:✓ 答對了|✕ 答錯了)/u;

const isOnQuizResultPage = (page: Page): boolean =>
  new URL(page.url()).pathname.endsWith('/result');

// 從地圖開始一場 quiz。傳 templateId 時先由型別化 manifest 解回章節序號，
// 再依學生真的看得到的兩步流程「選建築→進入複習與進度→開始挑戰」操作；
// 不使用舊卡片 selector 或隱藏直達 URL。
export async function startQuizFromLobby(
  page: Page,
  options?: Readonly<{ templateId?: string }>,
): Promise<void> {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  const chapter = options?.templateId
    ? CONTENT_MANIFEST.find((entry) => entry.templateId === options.templateId)
    : CONTENT_MANIFEST.find((entry) => entry.questionCount > 0);
  if (!chapter) throw new Error('QUIZ_HELPER_TEMPLATE_NOT_IN_MANIFEST');

  const map = page.getByRole('list', { name: '六章學習地圖' });
  await map
    .getByRole('button', {
      name: new RegExp(`^Chapter ${String(chapter.chapterNumber)} `, 'u'),
    })
    .click();
  const detailAction = page.getByRole('link', { name: '進入複習與進度' });
  await detailAction.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
    throw new Error(
      `QUIZ_HELPER_CHAPTER_NOT_ENTERABLE: Chapter ${String(chapter.chapterNumber)}`,
    );
  });
  await detailAction.click();

  const challengeAction = page.getByRole('link', { name: '開始挑戰' });
  await challengeAction.waitFor({ state: 'visible', timeout: 10000 });
  await challengeAction.click();
  await page.waitForURL(quizSessionUrlPattern);
}

// 上一題「下一題／結算」點下去後 React 需要一拍重繪新題目；沒有這個等待，
// 選項的 locator 有機率仍解析到舊題已停用的節點，導致 click() 卡在
// 「element is not enabled」重試迴圈。用新題目一定會出現的「送出答案」按鈕
// （初始為停用狀態，但存在）當作重繪完成的訊號。
export async function waitForFreshQuizQuestion(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: '送出答案' })
    .waitFor({ state: 'visible' });
}

// 點下已選定的選項後，送出並等待回饋卡片出現（通用的答對／答錯 regex）。
export async function submitSelectedQuizOption(page: Page): Promise<void> {
  await page.getByRole('button', { name: '送出答案' }).click();
  await page
    .getByRole('heading', { name: quizFeedbackHeadingPattern })
    .waitFor({ state: 'visible' });
}

// 點下「結算並查看結果」到真的導向 /result，中間還有一段結算用的非同步呼叫；
// 這段時間內 networkidle 常常提早判定完成（兩次請求間剛好有 >500ms 空檔），
// 之後才發生真正的導頁。改為手動輪詢「/result 網址」或「下一題一定會出現的
// 送出答案按鈕」兩者其一出現，避免用 Promise.race + 個別 waitFor 造成其中一
// 支未被等待的 promise 之後才 reject 而變成 unhandled rejection。
export async function waitForNextQuizStep(
  page: Page,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isOnQuizResultPage(page)) return;
    if (
      await page
        .getByRole('button', { name: '送出答案' })
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('QUIZ_HELPER_STEP_TIMEOUT');
}

// runner 專用便利函式：不在意正確與否，永遠點第一個選項——用於截圖情境
// （只需要「有一題被回答」的畫面狀態，不像 playable-slice.spec.ts 需要精確
// 控制對錯比例）。
export async function answerQuizQuestionByFirstOption(
  page: Page,
): Promise<void> {
  await waitForFreshQuizQuestion(page);
  await page.locator('.question-option').first().click();
  await submitSelectedQuizOption(page);
}

// runner 專用：從大廳開始一場完整挑戰的 quiz，並不斷點第一個選項直到跑完，
// 最後停在 /result。安全上限 20 題，避免真的卡住時無限迴圈。
export async function finishQuizByAnsweringFirstOption(
  page: Page,
): Promise<void> {
  await startQuizFromLobby(page, {
    templateId: fullChallengeChapter.templateId,
  });
  const maxQuestions = 20;
  for (let attempt = 0; attempt < maxQuestions; attempt += 1) {
    if (isOnQuizResultPage(page)) return;
    await answerQuizQuestionByFirstOption(page);
    const continueButton = page.getByRole('button', {
      name: /我理解了，下一題|結算並查看結果/u,
    });
    await continueButton.click();
    await waitForNextQuizStep(page);
  }
  throw new Error('QUIZ_HELPER_DID_NOT_FINISH');
}
