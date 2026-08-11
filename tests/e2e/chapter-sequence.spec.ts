import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { TEST_USERS } from '../fixtures/users';
import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { signedInClient } from '../helpers/signed-in-client';
import { attachBrowserHealth, unexpectedBrowserHealth } from './browser-health';
import { signInStudent, signInTeacher, signOutViaHud } from './helpers/auth';
import { createClassroom, joinClassroomByCode } from './helpers/classrooms';

const FIXTURE_EMAIL = 'sequence.student@colorplay.test';
const CHAPTER_COUNT = 6;
const CLASSROOM_NAME = '章節循序驗收班級';
const chapterId = (chapterNumber: number) =>
  `21000000-0000-0000-0000-${String(chapterNumber).padStart(12, '0')}`;
const chapterName = (chapterNumber: number, state?: string) =>
  new RegExp(
    `^Chapter ${String(chapterNumber)} .+${state ? ` ${state}` : ''}$`,
    'u',
  );
const mapFor = (page: Page) => page.getByRole('list', { name: '六章學習地圖' });
const buildingFor = (page: Page, chapterNumber: number, state?: string) =>
  mapFor(page).getByRole('button', {
    name: chapterName(chapterNumber, state),
  });
const panelFor = (page: Page) => page.locator('.chapter-map__panel');

type ViewportMeasurement = Readonly<{
  action_height: number;
  action_width: number;
  building_min_height: number;
  building_min_width: number;
  focus_visible: boolean;
  height: number;
  information: readonly string[];
  label: string;
  locked_cloud_covers_building: boolean;
  locked_cloud_covers_sign: boolean;
  reduced_motion_animation_none: boolean;
  scroll_width: number;
  viewport_width: number;
  width: number;
}>;

const rectsOverlap = (
  left: Readonly<{ height: number; width: number; x: number; y: number }>,
  right: Readonly<{ height: number; width: number; x: number; y: number }>,
) =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

async function openMap(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: '學習地圖' })).toBeVisible();
}

async function assertLockedChapter(
  page: Page,
  lockedChapterNumber: number,
): Promise<void> {
  await buildingFor(page, lockedChapterNumber, '尚未解鎖').click();
  const panel = panelFor(page);
  await expect(panel.getByText('尚未解鎖', { exact: true })).toBeVisible();
  await expect(panel.getByRole('heading')).toContainText(
    `Chapter ${String(lockedChapterNumber)}`,
  );
  await expect(panel.getByRole('heading', { name: '解鎖條件' })).toBeVisible();
  await expect(panel.getByText(/複習 0 \/ \d+/u)).toBeVisible();
  await expect(panel.getByRole('link', { name: '進入複習與進度' })).toHaveCount(
    0,
  );
}

async function assertLockedDeepLink(
  page: Page,
  lockedChapterNumber: number,
): Promise<void> {
  const lockedId = chapterId(lockedChapterNumber);
  await page.goto(`/app/chapters/${lockedId}`);
  await expect(page).toHaveURL(
    new RegExp(`/app\\?chapter=${lockedId}&reason=locked$`, 'u'),
  );
  await expect(
    buildingFor(page, lockedChapterNumber, '尚未解鎖'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(panelFor(page).getByText(/複習 0 \/ \d+/u)).toBeVisible();
}

async function assertServerRejectsLockedChallenge(
  lockedChapterNumber: number,
): Promise<void> {
  const chapter = CONTENT_MANIFEST.find(
    (entry) => entry.chapterNumber === lockedChapterNumber,
  );
  if (!chapter) throw new Error('CHAPTER_SEQUENCE_MANIFEST_CHAPTER_MISSING');
  const client = await signedInClient(TEST_USERS.sequenceStudent);
  try {
    const { error } = await client.rpc('create_quiz_session', {
      client_request_id: randomUUID(),
      template_id: chapter.templateId,
    });
    expect(error?.message).toContain('CHAPTER_LOCKED');
  } finally {
    await client.auth.signOut({ scope: 'local' });
  }
}

async function openChapterDetail(
  page: Page,
  chapterNumber: number,
): Promise<void> {
  await buildingFor(page, chapterNumber, '可進入').click();
  const action = panelFor(page).getByRole('link', {
    name: '進入複習與進度',
  });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page).toHaveURL(`/app/chapters/${chapterId(chapterNumber)}`);
  await expect(
    page.getByRole('heading', {
      name: new RegExp(`^Chapter ${String(chapterNumber)}：`, 'u'),
    }),
  ).toBeVisible();
  await expect(page.getByLabel('章節進度')).toContainText(
    /精熟程度\s*(?:8\d|9\d|100)%/u,
  );
  await expect(page.getByLabel('章節進度')).toContainText(
    /複習完成\s*0 \/ \d+/u,
  );
}

async function finishCurrentChallenge(page: Page): Promise<void> {
  await page.getByRole('link', { name: '章節總挑戰' }).click();
  await page.waitForURL(/\/app\/quiz\/[0-9a-f-]{36}$/u);

  for (let position = 1; position <= 10; position += 1) {
    const progress = await page.getByLabel('挑戰進度').innerText();
    const progressMatch = /第 (\d+) \/ (\d+) 題/u.exec(progress);
    if (!progressMatch) throw new Error('CHAPTER_SEQUENCE_PROGRESS_INVALID');
    const currentPosition = Number(progressMatch[1]);
    const questionTotal = Number(progressMatch[2]);
    const prompt = (
      await page.locator('.question-card legend').innerText()
    ).trim();
    const correctAnswer = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!correctAnswer) throw new Error('CHAPTER_SEQUENCE_ANSWER_MISSING');
    await page.getByRole('radio', { name: correctAnswer }).check();
    await page.getByRole('button', { name: '送出答案' }).click();
    const continueButton = page.getByRole('button', {
      name: /我理解了，下一題|結算並查看結果/u,
    });
    await expect(continueButton).toBeVisible();
    const finishesChallenge = currentPosition === questionTotal;
    await continueButton.click();
    if (finishesChallenge) break;
    await expect(page.getByLabel('挑戰進度')).toContainText(
      `第 ${String(currentPosition + 1)} / ${String(questionTotal)} 題`,
    );
  }

  await expect(page).toHaveURL(/\/app\/quiz\/[0-9a-f-]{36}\/result$/u);
  await expect(page.getByRole('heading', { name: '挑戰完成' })).toBeVisible();
}

async function completeEveryReviewCard(page: Page): Promise<number> {
  let completionCount = 0;
  for (let pass = 0; pass < 100; pass += 1) {
    const collapsed = page.locator(
      'details.review-accordion:not([open]) summary',
    );
    for (let index = (await collapsed.count()) - 1; index >= 0; index -= 1) {
      await collapsed.nth(index).click();
    }

    const button = page.getByRole('button', { name: '完成複習' }).first();
    if (await button.isVisible().catch(() => false)) {
      const article = button.locator('xpath=ancestor::article[1]');
      await button.click();
      await expect(article.getByRole('status')).toHaveText('已完成複習');
      completionCount += 1;
      continue;
    }

    const nextPage = page
      .locator('.game-pager button[aria-label="下一頁"]:not([disabled])')
      .first();
    if (await nextPage.isEnabled().catch(() => false)) {
      await nextPage.click();
      continue;
    }
    break;
  }
  if (completionCount < 1) {
    throw new Error('CHAPTER_SEQUENCE_REVIEW_CARD_MISSING');
  }
  await expect(page.getByLabel('章節進度')).toContainText(
    new RegExp(
      `複習完成\\s*${String(completionCount)} / ${String(completionCount)}`,
      'u',
    ),
  );
  return completionCount;
}

async function runChapterTwoLiveBypass(
  page: Page,
  teacherPage: Page,
): Promise<Record<string, boolean>> {
  await openMap(page);
  await assertLockedChapter(page, 2);

  await signInTeacher(teacherPage, TEST_USERS.learningTeacher);
  await teacherPage.goto('/teacher/classes');
  const { joinCode: classroomCode } = await createClassroom(
    teacherPage,
    CLASSROOM_NAME,
  );
  await joinClassroomByCode(TEST_USERS.sequenceStudent, classroomCode);

  await teacherPage.goto('/teacher/live');
  const sectionSelect = teacherPage.getByLabel('1・選擇對戰單元');
  const labels = await sectionSelect.locator('option').allTextContents();
  const chapterTwoLabel = labels.find((label) => label.trim().startsWith('2-'));
  if (!chapterTwoLabel) {
    throw new Error('CHAPTER_SEQUENCE_LIVE_CHAPTER_2_SECTION_MISSING');
  }
  await sectionSelect.selectOption({ label: chapterTwoLabel });
  await teacherPage.getByRole('button', { name: '建立活動並開場' }).click();
  const presenter = teacherPage.getByLabel('投影模式');
  const liveCode = (await presenter.getByLabel('課堂代碼').innerText()).trim();

  await page.goto('/app/live/join');
  await page.getByLabel('課堂代碼').fill(liveCode);
  await page.getByRole('button', { name: '加入課堂' }).click();
  await expect(page.getByText('等待主持人開始…')).toBeVisible();
  await presenter.getByRole('button', { name: '開始第一題' }).click();
  await expect(page.locator('.question-card button').first()).toBeVisible();
  await page.locator('.question-card button').first().click();
  await expect(page.getByText(/答對了|答錯了/u).first()).toBeVisible();

  await openMap(page);
  await assertLockedChapter(page, 2);
  return {
    answer: true,
    chapter2_locked_after: true,
    chapter2_locked_before: true,
    entry: true,
  };
}

async function assertInteractiveBox(
  locator: Locator,
  viewportWidth: number,
): Promise<Readonly<{ height: number; width: number }>> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('CHAPTER_SEQUENCE_BOUNDING_BOX_MISSING');
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth);
  return { height: box.height, width: box.width };
}

async function measureMapViewport(
  page: Page,
  viewport: Readonly<{ height: number; label: string; width: number }>,
): Promise<ViewportMeasurement> {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMap(page);
  const map = mapFor(page);
  const buildings = map.getByRole('button');
  const buildingBoxes = [];
  for (let index = 0; index < CHAPTER_COUNT; index += 1) {
    buildingBoxes.push(
      await assertInteractiveBox(buildings.nth(index), viewport.width),
    );
  }

  const current = buildingFor(page, 1, '可進入');
  await current.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const action = panelFor(page).getByRole('link', {
    name: '進入複習與進度',
  });
  const actionBox = await assertInteractiveBox(action, viewport.width);
  await action.focus();
  const focusStyle = await action.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  const actionPosition = await action.boundingBox();
  const hudPosition = await page.locator('.hud-command').boundingBox();
  const focusVisible =
    focusStyle.outlineStyle !== 'none' &&
    focusStyle.outlineWidth > 0 &&
    actionPosition !== null &&
    (hudPosition === null ||
      actionPosition.y >= hudPosition.y + hudPosition.height);
  expect(focusVisible).toBe(true);
  await action.click();
  await expect(page.getByRole('link', { name: '章節總挑戰' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '學習地圖' })).toBeVisible();

  await assertLockedChapter(page, 2);
  const lockedBuilding = buildingFor(page, 2, '尚未解鎖').locator(
    'xpath=ancestor::li[1]',
  );
  const [artBox, cloudBox, signBox] = await Promise.all([
    lockedBuilding.locator('.chapter-map__building-art').boundingBox(),
    lockedBuilding.locator('.chapter-map__cloud').boundingBox(),
    lockedBuilding.locator('.chapter-map__building-label').boundingBox(),
  ]);
  if (!artBox || !cloudBox || !signBox) {
    throw new Error('CHAPTER_SEQUENCE_LOCKED_DECORATION_MISSING');
  }
  const cloudCoversBuilding = rectsOverlap(artBox, cloudBox);
  const cloudCoversSign = rectsOverlap(signBox, cloudBox);
  expect(cloudCoversBuilding).toBe(true);
  expect(cloudCoversSign).toBe(false);

  const animations = await Promise.all([
    lockedBuilding
      .locator('.chapter-map__cloud')
      .evaluate((element) => getComputedStyle(element).animationName),
    page
      .locator('.chapter-map__adventurer')
      .evaluate((element) => getComputedStyle(element).animationName),
  ]);
  expect(animations).toEqual(['none', 'none']);

  const scrollWidth = await page
    .locator('html')
    .evaluate((element) => element.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
  const information = [
    ...(await buildings.allTextContents()),
    (await panelFor(page).innerText()).replaceAll(/\s+/gu, ' ').trim(),
  ];
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  return {
    action_height: actionBox.height,
    action_width: actionBox.width,
    building_min_height: Math.min(...buildingBoxes.map((box) => box.height)),
    building_min_width: Math.min(...buildingBoxes.map((box) => box.width)),
    focus_visible: focusVisible,
    height: viewport.height,
    information,
    label: viewport.label,
    locked_cloud_covers_building: cloudCoversBuilding,
    locked_cloud_covers_sign: cloudCoversSign,
    reduced_motion_animation_none: animations.every((name) => name === 'none'),
    scroll_width: scrollWidth,
    viewport_width: viewport.width,
    width: viewport.width,
  };
}

test('Chapter 1 to 6 sequence phase gate', async ({
  baseURL,
  browser,
  browserName,
  page,
}, testInfo) => {
  test.setTimeout(900_000);
  if (browserName !== 'chromium') test.skip();
  if (process.env.PLAYWRIGHT_ACCEPTANCE !== 'on') {
    throw new Error('CHAPTER_SEQUENCE_ACCEPTANCE_MODE_REQUIRED');
  }
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (!evidenceRoot) throw new Error('CHAPTER_SEQUENCE_EVIDENCE_ROOT_REQUIRED');
  if (!baseURL) throw new Error('CHAPTER_SEQUENCE_BASE_URL_REQUIRED');
  await mkdir(join(evidenceRoot, 'reports'), { recursive: true });
  await mkdir(join(evidenceRoot, 'screenshots'), { recursive: true });

  const teacherContext = await browser.newContext({ baseURL });
  const teacherPage = await teacherContext.newPage();
  const studentHealth = attachBrowserHealth(page);
  const teacherHealth = attachBrowserHealth(teacherPage);

  await signInStudent(page, TEST_USERS.sequenceStudent);
  await expect(page.getByRole('heading', { name: '學習地圖' })).toBeVisible();

  const viewports = [
    { height: 720, label: 'desktop-landscape', width: 1280 },
    { height: 375, label: 'tablet-landscape', width: 812 },
    { height: 812, label: 'mobile-portrait', width: 375 },
  ] as const;
  const viewportMeasurements: ViewportMeasurement[] = [];
  for (const viewport of viewports) {
    viewportMeasurements.push(await measureMapViewport(page, viewport));
  }
  expect(viewportMeasurements[1]?.information).toEqual(
    viewportMeasurements[0]?.information,
  );
  expect(viewportMeasurements[2]?.information).toEqual(
    viewportMeasurements[0]?.information,
  );

  await page.setViewportSize({ width: 1280, height: 720 });
  await openMap(page);
  await page.screenshot({
    fullPage: true,
    path: join(evidenceRoot, 'screenshots/map-available-1280x720.png'),
  });
  await assertLockedChapter(page, 2);
  await page.screenshot({
    fullPage: true,
    path: join(evidenceRoot, 'screenshots/map-locked-1280x720.png'),
  });

  const liveBypass = await runChapterTwoLiveBypass(page, teacherPage);
  const completionCheckpoints: Record<string, unknown>[] = [];

  for (
    let currentChapter = 1;
    currentChapter <= CHAPTER_COUNT;
    currentChapter += 1
  ) {
    await openMap(page);
    await expect(buildingFor(page, currentChapter, '可進入')).toBeVisible();
    if (currentChapter < CHAPTER_COUNT) {
      await assertLockedChapter(page, currentChapter + 1);
      await assertLockedDeepLink(page, currentChapter + 1);
      await assertServerRejectsLockedChallenge(currentChapter + 1);
      await openMap(page);
    }

    await openChapterDetail(page, currentChapter);
    await finishCurrentChallenge(page);
    await page.goto(`/app/chapters/${chapterId(currentChapter)}`);
    const reviewCardsCompleted = await completeEveryReviewCard(page);

    await openMap(page);
    await expect(buildingFor(page, currentChapter, '已完成')).toBeVisible();
    if (currentChapter === 1) {
      await page.screenshot({
        fullPage: true,
        path: join(evidenceRoot, 'screenshots/map-completed-1280x720.png'),
      });
    }
    if (currentChapter < CHAPTER_COUNT) {
      await expect(
        buildingFor(page, currentChapter + 1, '可進入'),
      ).toBeVisible();
    }
    completionCheckpoints.push({
      chapter: currentChapter,
      current_state: 'completed',
      next_state: currentChapter < CHAPTER_COUNT ? 'available' : null,
      review_cards_completed: reviewCardsCompleted,
    });

    await page.reload();
    await expect(buildingFor(page, currentChapter, '已完成')).toBeVisible();
    if (currentChapter === 2 || currentChapter === 5) {
      await signOutViaHud(page);
      await expect(page).toHaveURL(/\/login$/u);
      await signInStudent(page, TEST_USERS.sequenceStudent);
      await expect(buildingFor(page, currentChapter, '已完成')).toBeVisible();
    }
  }

  await openMap(page);
  await expect(
    mapFor(page).getByRole('button', { name: /已完成$/u }),
  ).toHaveCount(CHAPTER_COUNT);
  await expect(buildingFor(page, 6, '已完成')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({
    fullPage: true,
    path: join(evidenceRoot, 'screenshots/map-all-complete-1280x720.png'),
  });

  await teacherContext.close();
  const healthResults = [studentHealth, teacherHealth].map((health) =>
    unexpectedBrowserHealth(health, 'chromium'),
  );
  for (const health of healthResults) {
    expect(health).toEqual({
      consoleErrors: [],
      failedRequests: [],
      pageErrors: [],
      serverErrors: [],
    });
  }
  await writeFile(
    join(evidenceRoot, 'reports/browser-health.json'),
    `${JSON.stringify({
      console_errors: 0,
      expected_failures: [],
      failed_requests: 0,
      page_errors: 0,
      server_errors: 0,
    })}\n`,
  );
  await writeFile(
    join(evidenceRoot, 'reports/phase-state.json'),
    `${JSON.stringify({
      completion_checkpoints: completionCheckpoints,
      fixture_email: FIXTURE_EMAIL,
      live_bypass: liveBypass,
      progression_mode: 'sequential',
      unavailable_state: 'not_applicable_after_six_chapter_readiness',
      viewport_measurements: viewportMeasurements,
    })}\n`,
  );
  await testInfo.attach('chapter-sequence-checkpoints', {
    body: JSON.stringify(completionCheckpoints),
    contentType: 'application/json',
  });
});
