import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { expect, test, type Page, type Response } from '@playwright/test';

import { TEST_USER_ACCOUNTS, TEST_USERS } from '../fixtures/users';
import { signInStudent, signInTeacher, type Credentials } from './helpers/auth';
import { createClassroom } from './helpers/classrooms';
import { launchLiveSessionFromTeacherHome } from './helpers/live';
import {
  attachDiagnostics,
  sessionTokensFromPage,
  type PageDiagnostics,
} from './helpers/staging-capacity-browser';
import {
  assertNoClassroomCollision,
  cleanupSyntheticRun,
} from './helpers/staging-capacity-cleanup';
import {
  CapacityHarnessError,
  createServiceClient,
  createSessionClient,
  createSyntheticAccounts,
  managementQuery,
  publicErrorCode,
  readCapacityConfig,
  readReleaseMarker,
  summarizeDurations,
  type CapacityAccount,
  type CreatedResources,
  writeSafeJson,
} from './helpers/staging-capacity';

const STUDENT_COUNT = 39;
const ROUND_COUNT = 3;
const ANSWER_P95_BUDGET_MS = 800;

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(
  process.env.COLORPLAY_CAPACITY_CONFIRM !== 'STAGING_1_PLUS_39_ONLY',
  'Explicit Staging capacity confirmation is required.',
);

const FIXED_TEACHER = {
  account: TEST_USER_ACCOUNTS.teacher.account,
  credentials: TEST_USERS.teacher,
} as const;

const now = () => performance.now();

const time = async <T>(operation: () => Promise<T>) => {
  const startedAt = now();
  const value = await operation();
  return { durationMs: now() - startedAt, value };
};

const loginAll = async (
  pages: readonly Page[],
  teacher: Credentials,
  students: readonly CapacityAccount[],
) => {
  const teacherPage = pages[0];
  if (!teacherPage)
    throw new CapacityHarnessError('CAPACITY_TEACHER_PAGE_MISSING');
  return Promise.all([
    time(() => signInTeacher(teacherPage, teacher)),
    ...pages.slice(1).map((page, index) => {
      const account = students[index];
      if (!account)
        throw new CapacityHarnessError('CAPACITY_ACCOUNT_PAGE_MISMATCH');
      return time(() =>
        signInStudent(page, {
          email: account.account,
          password: account.password,
        }),
      );
    }),
  ]);
};

const fixedTeacherId = async (
  page: Page,
  service: ReturnType<typeof createServiceClient>,
) => {
  const config = readCapacityConfig();
  const client = createSessionClient(config);
  const tokens = await sessionTokensFromPage(page);
  const { error: sessionError } = await client.auth.setSession(tokens);
  if (sessionError)
    throw new CapacityHarnessError('CAPACITY_TEACHER_SESSION_FAILED');
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

const joinClassroomThroughEdge = async (
  pages: readonly Page[],
  accounts: readonly CapacityAccount[],
  joinCode: string,
) => {
  const config = readCapacityConfig();
  return Promise.all(
    pages.map(async (page, pageIndex) => {
      const account = accounts[pageIndex];
      if (account?.role !== 'student') {
        throw new CapacityHarnessError('CAPACITY_STUDENT_ACCOUNT_MISSING');
      }
      const client = createSessionClient(config);
      const tokens = await sessionTokensFromPage(page);
      const { error: sessionError } = await client.auth.setSession(tokens);
      if (sessionError)
        throw new CapacityHarnessError('CAPACITY_SESSION_RESTORE_FAILED');
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

const joinLiveThroughUi = async (pages: readonly Page[], joinCode: string) =>
  Promise.all(
    pages.map((page) =>
      time(async () => {
        await page.goto('/app/live/join');
        await page.getByLabel('輸入 6 位加入代碼').fill(joinCode);
        await page.getByRole('button', { name: '加入課堂' }).click();
        await expect(page.getByText('等待主持人開始…')).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByText('連線正常')).toBeVisible({
          timeout: 20_000,
        });
      }),
    ),
  );

const answerResponse = (page: Page): Promise<Response> =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/rest/v1/rpc/submit_live_answer'),
    { timeout: 20_000 },
  );

const answerOneRound = async (studentPages: readonly Page[]) =>
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
      if (!response.ok())
        throw new CapacityHarnessError('CAPACITY_ANSWER_HTTP_FAILED');
      const responseEnd = response.request().timing().responseEnd;
      if (responseEnd < 0)
        throw new CapacityHarnessError('CAPACITY_ANSWER_TIMING_MISSING');
      return responseEnd;
    }),
  );

const authoritativeAnswerCount = async (
  sessionId: string,
  position: number,
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
  );
  const row = rows[0];
  return {
    answerCount: Number(row?.answer_count ?? -1),
    participantCount: Number(row?.participant_count ?? -1),
  };
};

const sessionIdFromUrl = (url: string) => {
  const match = /^\/teacher\/live\/([0-9a-f-]{36})$/iu.exec(
    new URL(url).pathname,
  );
  if (!match?.[1])
    throw new CapacityHarnessError('CAPACITY_LIVE_SESSION_ID_MISSING');
  return match[1];
};

test.describe('Staging 1+39 capacity harness', () => {
  test('40 browsers use official Auth, Edge join, Realtime, and three Live rounds', async ({
    browser,
  }) => {
    test.setTimeout(12 * 60_000);

    const config = readCapacityConfig();
    const service = createServiceClient(config);
    const accounts: CapacityAccount[] = [];
    const resources: CreatedResources = {};
    const contexts = [];
    const diagnostics: PageDiagnostics[] = [];
    let teacherId: string | undefined;
    const result: Record<string, unknown> = {
      environment: 'staging',
      evidence_scope: 'supplemental_staging_capacity_baseline',
      expected_sha: config.expectedSha,
      production_touched: false,
      replaces_ac_live_012: false,
      run_id: config.runId,
      verdict: 'INCOMPLETE',
    };
    let failureCode: string | undefined;

    try {
      await readReleaseMarker(config);
      await createSyntheticAccounts(
        config,
        service,
        config.runId,
        (account) => {
          accounts.push(account);
        },
      );
      if (
        accounts.length !== STUDENT_COUNT ||
        accounts.some((account) => account.id.length === 0)
      ) {
        throw new CapacityHarnessError('CAPACITY_ACCOUNT_COUNT_INVALID');
      }
      for (let index = 0; index < STUDENT_COUNT + 1; index += 1) {
        const context = await browser.newContext({ baseURL: config.appUrl });
        contexts.push(context);
        const page = await context.newPage();
        diagnostics.push(await attachDiagnostics(page));
      }
      const pages = contexts
        .map((context) => context.pages()[0])
        .filter((page): page is Page => page !== undefined);
      if (pages.length !== 40)
        throw new CapacityHarnessError('CAPACITY_BROWSER_COUNT_INVALID');

      const logins = await loginAll(pages, FIXED_TEACHER.credentials, accounts);
      result.login = summarizeDurations(
        logins.map((entry) => entry.durationMs),
      );

      const teacherPage = pages[0];
      if (!teacherPage)
        throw new CapacityHarnessError('CAPACITY_TEACHER_PAGE_MISSING');
      teacherId = await fixedTeacherId(teacherPage, service);
      await teacherPage.goto('/teacher/classes');
      const classroomName = `容量基準 ${config.runId}`;
      resources.classroomName = classroomName;
      await assertNoClassroomCollision(config, teacherId, classroomName);
      const classroom = await createClassroom(teacherPage, classroomName);
      resources.classroomId = classroom.classroomId;

      const classroomJoins = await joinClassroomThroughEdge(
        pages.slice(1),
        accounts,
        classroom.joinCode,
      );
      result.classroom_join = summarizeDurations(
        classroomJoins.map((entry) => entry.durationMs),
      );

      const launch = await launchLiveSessionFromTeacherHome(
        teacherPage,
        classroom.classroomId,
      );
      resources.sessionId = sessionIdFromUrl(teacherPage.url());
      const [sessionRow] = await managementQuery(
        config,
        `select live_activity_id from public.live_sessions where id = '${resources.sessionId}'::uuid;`,
      );
      if (typeof sessionRow?.live_activity_id !== 'string') {
        throw new CapacityHarnessError('CAPACITY_LIVE_ACTIVITY_ID_MISSING');
      }
      resources.activityId = sessionRow.live_activity_id;

      const liveJoins = await joinLiveThroughUi(
        pages.slice(1),
        launch.joinCode,
      );
      result.live_join = summarizeDurations(
        liveJoins.map((entry) => entry.durationMs),
      );
      await expect(
        launch.presenter.getByText(`${String(STUDENT_COUNT)} 位同學已加入`),
      ).toBeVisible({ timeout: 20_000 });

      await launch.presenter.getByRole('button', { name: '開始遊戲' }).click();
      const startDialog = launch.presenter.getByRole('alertdialog', {
        name: '立即開始',
      });
      await startDialog
        .getByRole('button', { name: '開始', exact: true })
        .click();

      const rounds: Record<string, unknown>[] = [];
      for (let position = 1; position <= ROUND_COUNT; position += 1) {
        const durations = await answerOneRound(pages.slice(1));
        await expect(
          launch.presenter.getByRole('heading', { name: '本題解析' }),
        ).toBeVisible({ timeout: 20_000 });
        const authoritative = await authoritativeAnswerCount(
          resources.sessionId,
          position,
        );
        const timing = summarizeDurations(durations);
        rounds.push({ ...authoritative, position, timing });
        if (
          authoritative.answerCount !== STUDENT_COUNT ||
          authoritative.participantCount !== STUDENT_COUNT ||
          timing.p95_ms > ANSWER_P95_BUDGET_MS
        ) {
          throw new CapacityHarnessError('CAPACITY_ROUND_GATE_FAILED');
        }
        if (position < ROUND_COUNT) {
          await launch.presenter
            .getByRole('button', { name: '即時排名' })
            .click();
          await launch.presenter
            .getByRole('button', { name: '下一題' })
            .click();
        }
      }
      result.rounds = rounds;

      const disconnectCounts = await Promise.all(
        diagnostics.map((entry) => entry.disconnects()),
      );
      const realtimeDiagnostics = diagnostics.map((entry) => entry.realtime());
      const diagnosticSummary = {
        browser_clients_with_realtime: realtimeDiagnostics.filter(
          (entry) => entry.socketCount > 0,
        ).length,
        console_error_count: diagnostics.reduce(
          (sum, entry) => sum + entry.consoleErrors.length,
          0,
        ),
        disconnect_count: disconnectCounts.reduce(
          (sum, count) => sum + count,
          0,
        ),
        page_error_count: diagnostics.reduce(
          (sum, entry) => sum + entry.pageErrors.length,
          0,
        ),
        server_error_count: diagnostics.reduce(
          (sum, entry) => sum + entry.serverErrors.length,
          0,
        ),
        websocket_close_count: realtimeDiagnostics.reduce(
          (sum, entry) => sum + entry.closeCount,
          0,
        ),
        websocket_error_count: realtimeDiagnostics.reduce(
          (sum, entry) => sum + entry.errorCount,
          0,
        ),
      };
      result.diagnostics = diagnosticSummary;
      if (
        diagnosticSummary.browser_clients_with_realtime !== 40 ||
        Object.entries(diagnosticSummary).some(
          ([key, count]) =>
            key !== 'browser_clients_with_realtime' && count !== 0,
        )
      ) {
        throw new CapacityHarnessError('CAPACITY_BROWSER_DIAGNOSTIC_FAILED');
      }
      result.realtime = {
        browser_clients: 40,
        disconnect_count: diagnosticSummary.disconnect_count,
        host_participant_projection: STUDENT_COUNT,
        socket_error_count: diagnosticSummary.websocket_error_count,
        student_connected_statuses: STUDENT_COUNT,
      };
      result.verdict = 'PASS';
    } catch (error) {
      failureCode = publicErrorCode(error);
      result.failure_code = failureCode;
      result.verdict = 'FAIL';
    } finally {
      const contextCloseResults = await Promise.allSettled(
        contexts.map((context) => context.close()),
      );
      const contextCloseErrorCount = contextCloseResults.filter(
        (entry) => entry.status === 'rejected',
      ).length;
      result.context_close_error_count = contextCloseErrorCount;
      if (contextCloseErrorCount !== 0) {
        result.verdict = 'FAIL';
        failureCode = 'CAPACITY_CONTEXT_CLOSE_FAILED';
        result.failure_code = failureCode;
      }
      try {
        result.cleanup = await cleanupSyntheticRun(
          config,
          service,
          accounts,
          teacherId,
          resources,
        );
        result.cleanup_verified = true;
        result.shared_ip_limiter_policy = 'preserved_shared_operational_state';
      } catch (error) {
        result.cleanup_error = publicErrorCode(error);
        result.cleanup_verified = false;
        failureCode = 'CAPACITY_CLEANUP_FAILED';
        result.verdict = 'FAIL';
        result.failure_code = failureCode;
      }
      await writeSafeJson(config.resultPath, result);
    }

    expect(result.cleanup_verified).toBe(true);
    expect(failureCode, `Result: ${config.resultPath}`).toBeUndefined();
    expect(result.verdict).toBe('PASS');
  });
});
