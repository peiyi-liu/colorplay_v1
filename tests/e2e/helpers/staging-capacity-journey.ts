import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { expect, type Page, type Response } from '@playwright/test';

import { TEST_USER_ACCOUNTS, TEST_USERS } from '../../fixtures/users';
import { signInStudent, signInTeacher } from './auth';
import {
  CapacityHarnessError,
  createSessionClient,
  managementQuery,
  readCapacityConfig,
  type CapacityAccount,
  type createServiceClient,
} from './staging-capacity';
import { sessionTokensFromPage } from './staging-capacity-browser';

const FIXED_TEACHER = {
  account: TEST_USER_ACCOUNTS.teacher.account,
  credentials: TEST_USERS.teacher,
} as const;

const time = async <T>(operation: () => Promise<T>) => {
  const startedAt = performance.now();
  const value = await operation();
  return { durationMs: performance.now() - startedAt, value };
};

export const loginAll = async (
  pages: readonly Page[],
  students: readonly CapacityAccount[],
) => {
  const teacherPage = pages[0];
  if (!teacherPage) {
    throw new CapacityHarnessError('CAPACITY_TEACHER_PAGE_MISSING');
  }
  return Promise.all([
    time(() => signInTeacher(teacherPage, FIXED_TEACHER.credentials)),
    ...pages.slice(1).map((page, index) => {
      const account = students[index];
      if (!account) {
        throw new CapacityHarnessError('CAPACITY_ACCOUNT_PAGE_MISMATCH');
      }
      return time(() =>
        signInStudent(page, {
          email: account.account,
          password: account.password,
        }),
      );
    }),
  ]);
};

export const fixedTeacherId = async (
  page: Page,
  service: ReturnType<typeof createServiceClient>,
  signal?: AbortSignal,
) => {
  const config = readCapacityConfig();
  const client = createSessionClient(config, signal);
  const tokens = await sessionTokensFromPage(page);
  const { error: sessionError } = await client.auth.setSession(tokens);
  if (sessionError) {
    throw new CapacityHarnessError('CAPACITY_TEACHER_SESSION_FAILED');
  }
  const { data, error } = await client.auth.getUser();
  if (error || data.user.email !== FIXED_TEACHER.credentials.email) {
    throw new CapacityHarnessError('CAPACITY_TEACHER_PREFLIGHT_FAILED');
  }
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('login_account, role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (
    profileError ||
    profile?.role !== 'teacher' ||
    profile.login_account !== FIXED_TEACHER.account
  ) {
    throw new CapacityHarnessError('CAPACITY_TEACHER_PREFLIGHT_FAILED');
  }
  return data.user.id;
};

export const joinClassroomThroughEdge = async (
  pages: readonly Page[],
  accounts: readonly CapacityAccount[],
  joinCode: string,
  signal?: AbortSignal,
) => {
  const config = readCapacityConfig();
  return Promise.all(
    pages.map(async (page, pageIndex) => {
      const account = accounts[pageIndex];
      if (account?.role !== 'student') {
        throw new CapacityHarnessError('CAPACITY_STUDENT_ACCOUNT_MISSING');
      }
      const client = createSessionClient(config, signal);
      const tokens = await sessionTokensFromPage(page);
      const { error: sessionError } = await client.auth.setSession(tokens);
      if (sessionError) {
        throw new CapacityHarnessError('CAPACITY_SESSION_RESTORE_FAILED');
      }
      return time(async () => {
        const response: unknown = await client.functions.invoke(
          'join-classroom',
          {
            body: { joinCode, requestId: randomUUID() },
          },
        );
        if (
          typeof response !== 'object' ||
          response === null ||
          !('error' in response) ||
          response.error !== null
        ) {
          throw new CapacityHarnessError('CAPACITY_CLASSROOM_JOIN_FAILED');
        }
      });
    }),
  );
};

const answerResponse = (page: Page): Promise<Response> =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/rest/v1/rpc/submit_live_answer'),
    { timeout: 20_000 },
  );

export const answerOneRound = async (studentPages: readonly Page[]) =>
  Promise.all(
    studentPages.map(async (page, index) => {
      await expect(page.getByText('連線正常')).toBeVisible();
      const options = page
        .getByRole('group', { name: '答案選項' })
        .getByRole('button');
      await expect(options.first()).toBeVisible({ timeout: 20_000 });
      const responsePromise = answerResponse(page);
      await options.nth(index % 4).click();
      const response = await responsePromise;
      if (!response.ok()) {
        throw new CapacityHarnessError('CAPACITY_ANSWER_HTTP_FAILED');
      }
      const responseEnd = response.request().timing().responseEnd;
      if (responseEnd < 0) {
        throw new CapacityHarnessError('CAPACITY_ANSWER_TIMING_MISSING');
      }
      return responseEnd;
    }),
  );

export const authoritativeAnswerCount = async (
  sessionId: string,
  position: number,
  signal?: AbortSignal,
) => {
  const config = readCapacityConfig();
  const rows = await managementQuery(
    config,
    `select count(*)::int as answer_count,
            count(distinct answer.participant_id)::int as participant_count
       from public.live_answers as answer
       join public.live_session_questions as question
         on question.id = answer.session_question_id
      where question.session_id = '${sessionId}'::uuid
        and question.position = ${String(position)};`,
    signal,
  );
  const row = rows[0];
  return {
    answerCount: Number(row?.answer_count ?? -1),
    participantCount: Number(row?.participant_count ?? -1),
  };
};
