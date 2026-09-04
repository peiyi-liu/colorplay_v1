import type { Locator, Page } from '@playwright/test';

// 執行全站設計重構計畫 Task 12（教師 Live 六畫面 DC 收尾）：主持發射台共用
// 互動——教師「選單元→建立活動並開場」一路點到投影模式，回傳投影 locator
// 與六碼課堂代碼。原本 tests/e2e/live-smoke.spec.ts 與
// scripts/design-audit/capture-screens.mjs 各自重複同一組選擇器，抽成這裡
// 讓兩邊都 import 同一份（同 auth.ts／classrooms.ts 慣例：只做「操作＋等待
// 到期望狀態」，不含 expect() 斷言——登入本身的機制與斷言分離讓這裡可以同時
// 被兩種呼叫者共用）。
//
// 呼叫端需先登入教師帳號並停在教師工作區可導覽的狀態，且該教師底下要有
// 至少一個班級（開場一鍵掛在 classrooms.data[0]）與至少一個已發佈小節，
// 否則「建立活動並開場」會因缺班級/小節而無法送出。

export type LiveSessionLaunch = Readonly<{
  presenter: Locator;
  joinCode: string;
}>;

export async function launchLiveSessionFromTeacherHome(
  teacherPage: Page,
): Promise<LiveSessionLaunch> {
  await teacherPage.goto('/teacher/live');
  const sectionOption = teacherPage
    .locator('.teacher-live-create__section-list label')
    .first();
  try {
    await sectionOption.waitFor({ timeout: 15_000 });
  } catch {
    const pageText = (await teacherPage.locator('body').innerText())
      .replace(/\s+/gu, ' ')
      .slice(0, 500);
    throw new Error(
      `LIVE_LAUNCH_PAGE_NOT_READY: ${teacherPage.url()} :: ${pageText}`,
    );
  }
  // 任一已發佈小節皆可用；原生 radio 由 label 繪製可見選項。
  await sectionOption.click();
  if (!(await sectionOption.getByRole('radio').isChecked())) {
    throw new Error('LIVE_LAUNCH_SECTION_NOT_SELECTED');
  }
  await teacherPage.getByRole('button', { name: '建立課堂' }).click();
  const presenter = teacherPage.getByLabel('投影模式');
  // 開場即 startSession（draft→lobby）並導向 ?presenter=1。投影鎖定：進行
  // 中不可離開投影，之後的主持動作都走投影 footer 的操作列。
  const codePanel = presenter.getByLabel('課堂代碼');
  await codePanel.waitFor();
  const joinCode = (await codePanel.innerText()).trim();
  return { presenter, joinCode };
}
