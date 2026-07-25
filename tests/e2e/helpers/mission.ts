import type { Page } from '@playwright/test';

// 共用 mission（課後任務實戰／精熟關卡）互動。目前只有
// scripts/design-audit/capture-screens.mjs 用到，但和 auth.ts／quiz.ts／
// classrooms.ts 放在同一個共用模組目錄下，供未來的 mission e2e spec 直接
// 重用，避免它日後又長出一份重複的選擇器序列。
const missionSessionUrlPattern = /\/app\/missions\/[0-9a-f-]{36}$/u;

export async function startMissionFromSelectPage(page: Page): Promise<void> {
  await page.goto('/app/missions');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '展開小節任務' }).first().click();
  await page.waitForURL(missionSessionUrlPattern);
}
