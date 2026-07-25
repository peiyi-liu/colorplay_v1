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
  const sectionSelect = teacherPage.getByLabel('1・選擇對戰單元');
  await sectionSelect.waitFor();
  // index 0 是「請選擇小節」placeholder；任一已發佈小節皆可用。
  await sectionSelect.selectOption({ index: 1 });
  await teacherPage.getByRole('button', { name: '建立活動並開場' }).click();
  const presenter = teacherPage.getByLabel('投影模式');
  // 開場即 startSession（draft→lobby）並導向 ?presenter=1。投影鎖定：進行
  // 中不可離開投影，之後的主持動作都走投影 footer 的操作列。
  const codePanel = presenter.getByLabel('課堂代碼');
  await codePanel.waitFor();
  const joinCode = (await codePanel.innerText()).trim();
  return { presenter, joinCode };
}
