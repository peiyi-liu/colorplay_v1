import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { createClassroom } from './helpers/classrooms';
import { launchLiveSessionFromTeacherHome } from './helpers/live';
import {
  attachDiagnostics,
  buildLiveJoinEvidence,
  joinLiveThroughUi,
  liveSessionIdFromUrl,
  type PageDiagnostics,
} from './helpers/staging-capacity-browser';
import {
  assertNoClassroomCollision,
  cleanupSyntheticRun,
} from './helpers/staging-capacity-cleanup';
import {
  capacityStageFailureCode,
  CapacityHarnessError,
  createServiceClient,
  createSyntheticAccounts,
  managementQuery,
  publicErrorCode,
  readCapacityConfig,
  readReleaseMarker,
  summarizeAuthStageTimings,
  summarizeDurations,
  type CapacityAccount,
  type CreatedResources,
} from './helpers/staging-capacity';
import {
  answerOneRound,
  authoritativeAnswerCount,
  fixedTeacherId,
  joinClassroomThroughEdge,
  loginAll,
} from './helpers/staging-capacity-journey';
import {
  CAPACITY_CLEANUP_TIMEOUT_MS,
  CAPACITY_TEST_TIMEOUT_MS,
  createCapacityStageRunner,
  runWithCapacityTimeout,
} from './helpers/staging-capacity-stage-runner';

const STUDENT_COUNT = 39;
const ROUND_COUNT = 3;
const ANSWER_P95_BUDGET_MS = 800;

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(
  process.env.COLORPLAY_CAPACITY_CONFIRM !== 'STAGING_1_PLUS_39_ONLY',
  'Explicit Staging capacity confirmation is required.',
);

test.describe('Staging 1+39 capacity harness', () => {
  test('40 browsers use official Auth, Edge join, Realtime, and three Live rounds', async ({
    browser,
  }) => {
    test.setTimeout(CAPACITY_TEST_TIMEOUT_MS);

    const config = readCapacityConfig();
    const runAbortController = new AbortController();
    const service = createServiceClient(config, runAbortController.signal);
    const accounts: CapacityAccount[] = [];
    const resources: CreatedResources = {};
    const contexts: BrowserContext[] = [];
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
    const stageRunner = createCapacityStageRunner({
      onCheckpointError: () => {
        const count = Number(result.checkpoint_error_count ?? 0);
        result.checkpoint_error_count = count + 1;
      },
      onTimeout: () => {
        runAbortController.abort();
      },
      result,
      resultPath: config.resultPath,
    });

    try {
      await stageRunner.run('release_marker', () =>
        readReleaseMarker(config, runAbortController.signal),
      );
      await stageRunner.run('account_setup', async () => {
        await createSyntheticAccounts(
          config,
          service,
          config.runId,
          (account) => {
            accounts.push(account);
          },
          runAbortController.signal,
        );
        if (
          accounts.length !== STUDENT_COUNT ||
          accounts.some((account) => account.id.length === 0)
        ) {
          throw new CapacityHarnessError('CAPACITY_ACCOUNT_COUNT_INVALID');
        }
      });
      const pages = await stageRunner.run('browser_setup', async () => {
        for (let index = 0; index < STUDENT_COUNT + 1; index += 1) {
          const context = await browser.newContext({ baseURL: config.appUrl });
          contexts.push(context);
          const page = await context.newPage();
          diagnostics.push(await attachDiagnostics(page));
        }
        const createdPages = contexts
          .map((context) => context.pages()[0])
          .filter((page): page is Page => page !== undefined);
        if (createdPages.length !== 40) {
          throw new CapacityHarnessError('CAPACITY_BROWSER_COUNT_INVALID');
        }
        return createdPages;
      });

      await stageRunner.run('login', async () => {
        const logins = await loginAll(pages, accounts);
        result.login = summarizeDurations(
          logins.map((entry) => entry.durationMs),
        );
        const authTimings = (
          await Promise.all(
            diagnostics.slice(1).map((entry) => entry.authTimings()),
          )
        ).flat();
        if (authTimings.length !== STUDENT_COUNT) {
          throw new CapacityHarnessError('CAPACITY_LOGIN_TIMING_COUNT_INVALID');
        }
        result.auth_login = summarizeAuthStageTimings(authTimings);
      });

      const teacherPage = pages[0];
      if (!teacherPage) {
        throw new CapacityHarnessError('CAPACITY_TEACHER_PAGE_MISSING');
      }
      const verifiedTeacherId = await stageRunner.run('teacher_preflight', () =>
        fixedTeacherId(teacherPage, service, runAbortController.signal),
      );
      teacherId = verifiedTeacherId;
      const classroom = await stageRunner.run('classroom_create', async () => {
        await teacherPage.goto('/teacher/classes');
        const classroomName = `容量基準 ${config.runId}`;
        resources.classroomName = classroomName;
        await assertNoClassroomCollision(
          config,
          verifiedTeacherId,
          classroomName,
          runAbortController.signal,
        );
        const createdClassroom = await createClassroom(
          teacherPage,
          classroomName,
        );
        resources.classroomId = createdClassroom.classroomId;
        return createdClassroom;
      });

      await stageRunner.run('classroom_join', async () => {
        const classroomJoins = await joinClassroomThroughEdge(
          pages.slice(1),
          accounts,
          classroom.joinCode,
          runAbortController.signal,
        );
        result.classroom_join = summarizeDurations(
          classroomJoins.map((entry) => entry.durationMs),
        );
      });

      const { launch, sessionId } = await stageRunner.run(
        'live_launch',
        async () => {
          const launched = await launchLiveSessionFromTeacherHome(
            teacherPage,
            classroom.classroomId,
          );
          const createdSessionId = liveSessionIdFromUrl(teacherPage.url());
          resources.sessionId = createdSessionId;
          const [sessionRow] = await managementQuery(
            config,
            `select live_activity_id from public.live_sessions where id = '${createdSessionId}'::uuid;`,
            runAbortController.signal,
          );
          if (typeof sessionRow?.live_activity_id !== 'string') {
            throw new CapacityHarnessError('CAPACITY_LIVE_ACTIVITY_ID_MISSING');
          }
          resources.activityId = sessionRow.live_activity_id;
          return { launch: launched, sessionId: createdSessionId };
        },
      );

      await stageRunner.run('live_join', async () => {
        const liveJoins = await joinLiveThroughUi(
          pages.slice(1),
          launch.joinCode,
        );
        const liveRealtimeDiagnostics = await Promise.all(
          diagnostics.slice(1).map((entry) => entry.realtime()),
        );
        const liveJoinEvidence = buildLiveJoinEvidence(
          liveJoins,
          liveRealtimeDiagnostics,
        );
        Object.assign(result, liveJoinEvidence.result);
        if (liveJoinEvidence.failureCode !== undefined) {
          throw new CapacityHarnessError(liveJoinEvidence.failureCode);
        }
      });
      await stageRunner.run('host_roster', () =>
        expect(
          launch.presenter.getByText(`${String(STUDENT_COUNT)} 位同學已加入`),
        ).toBeVisible({ timeout: 20_000 }),
      );
      await stageRunner.run('live_start', async () => {
        await launch.presenter
          .getByRole('button', { name: '開始遊戲' })
          .click();
        const startDialog = launch.presenter.getByRole('alertdialog', {
          name: '立即開始',
        });
        await startDialog
          .getByRole('button', { name: '開始', exact: true })
          .click();
      });

      const rounds: Record<string, unknown>[] = [];
      for (let position = 1; position <= ROUND_COUNT; position += 1) {
        result.round_position = position;
        const durations = await stageRunner.run('round_answer', () =>
          answerOneRound(pages.slice(1)),
        );
        const authoritative = await stageRunner.run(
          'round_reveal',
          async () => {
            await expect(
              launch.presenter.getByRole('heading', { name: '本題解析' }),
            ).toBeVisible({ timeout: 20_000 });
            return authoritativeAnswerCount(
              sessionId,
              position,
              runAbortController.signal,
            );
          },
        );
        await stageRunner.run('round_gate', () => {
          const timing = summarizeDurations(durations);
          rounds.push({ ...authoritative, position, timing });
          if (
            authoritative.answerCount !== STUDENT_COUNT ||
            authoritative.participantCount !== STUDENT_COUNT ||
            timing.p95_ms > ANSWER_P95_BUDGET_MS
          ) {
            throw new CapacityHarnessError('CAPACITY_ROUND_GATE_FAILED');
          }
        });
        if (position < ROUND_COUNT) {
          await stageRunner.run('round_transition', async () => {
            await launch.presenter
              .getByRole('button', { name: '即時排名' })
              .click();
            await launch.presenter
              .getByRole('button', { name: '下一題' })
              .click();
          });
        }
      }
      result.rounds = rounds;

      await stageRunner.run('browser_diagnostics', async () => {
        const disconnectCounts = await Promise.all(
          diagnostics.map((entry) => entry.disconnects()),
        );
        const realtimeDiagnostics = await Promise.all(
          diagnostics.map((entry) => entry.realtime()),
        );
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
      });
      result.verdict = 'PASS';
    } catch (error) {
      const currentStage = stageRunner.currentStage();
      result.failure_stage = currentStage;
      failureCode = publicErrorCode(
        error,
        capacityStageFailureCode(currentStage),
      );
      result.failure_code = failureCode;
      result.verdict = 'FAIL';
      await stageRunner.checkpoint('failed');
    } finally {
      await stageRunner.checkpoint('cleanup');
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
        await stageRunner.settlePendingOperation();
      } catch (error) {
        const settleCode = publicErrorCode(
          error,
          'CAPACITY_OPERATION_SETTLE_FAILED',
        );
        result.operation_settle_error = settleCode;
        result.verdict = 'FAIL';
        failureCode = settleCode;
        result.failure_code = failureCode;
      }
      const cleanupAbortController = new AbortController();
      try {
        const cleanupService = createServiceClient(
          config,
          cleanupAbortController.signal,
        );
        const cleanupPromise = cleanupSyntheticRun(
          config,
          cleanupService,
          accounts,
          teacherId,
          resources,
          cleanupAbortController.signal,
        );
        result.cleanup = await runWithCapacityTimeout(
          () => cleanupPromise,
          CAPACITY_CLEANUP_TIMEOUT_MS,
          () => {
            cleanupAbortController.abort();
          },
        );
        result.cleanup_verified = true;
        result.shared_ip_limiter_policy = 'preserved_shared_operational_state';
      } catch (error) {
        const rawCode = publicErrorCode(error);
        const cleanupCode =
          rawCode === 'CAPACITY_STAGE_TIMEOUT'
            ? 'CAPACITY_CLEANUP_TIMEOUT'
            : rawCode;
        result.cleanup_error = cleanupCode;
        result.cleanup_verified = false;
        failureCode = cleanupCode;
        result.verdict = 'FAIL';
        result.failure_code = failureCode;
      }
      await stageRunner.checkpoint('finished');
    }

    expect(result.cleanup_verified).toBe(true);
    expect(failureCode, `Result: ${config.resultPath}`).toBeUndefined();
    expect(result.verdict).toBe('PASS');
  });
});
