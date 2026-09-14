import { expect, type Page } from '@playwright/test';

import {
  LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL,
  readRunScopedLearningFixtureCredentialFile,
} from '../../../scripts/staging/provision-learning-experience-fixture.mjs';
import { TEST_USERS } from '../../fixtures/users';
import type { Credentials } from './auth.ts';

// Task 0A-2 run-scoped Hosted fixture resolution, extracted so contract
// tests can import and actually execute this logic (importing
// learning-experience.spec.ts itself into Vitest throws -- Playwright's
// test() rejects being called outside its own runner).
export async function resolveLearningStudentCredentials(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Credentials> {
  if (env.PLAYWRIGHT_REQUIRE_RUN_SCOPED_LEARNING_FIXTURE !== 'on') {
    return TEST_USERS.learningStudent;
  }
  const credentialPath = env.LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE;
  if (!credentialPath) {
    throw new Error(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  }
  return readRunScopedLearningFixtureCredentialFile(credentialPath);
}

// Mirrors the handle_new_auth_user trigger's display_name derivation
// (supabase/migrations/20260713000100_create_profiles.sql): the fixed
// fixture and every run-scoped identity resolve through the same formula.
export function learningStudentDisplayNameFromEmail(email: string): string {
  return email.split('@')[0]?.slice(0, 30) ?? '';
}

export function classroomRunLabel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return `${env.GITHUB_RUN_ID ?? 'local'}-${env.GITHUB_RUN_ATTEMPT ?? String(process.pid)}`;
}

export const signIn = async (
  page: Page,
  credentials: Credentials,
  navigationName: '主要導覽' | '教師導覽',
): Promise<void> => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('navigation', { name: navigationName }),
  ).toBeVisible();
  // Wait for the chapter query to settle before the caller navigates away,
  // so browser health never records a navigation-aborted manifest fetch.
  await expect(page.getByRole('heading', { name: '學習地圖' })).toBeVisible();
};
