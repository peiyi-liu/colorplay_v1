import { performance } from 'node:perf_hooks';

import {
  errors,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import type { CapacityCredentials } from '../../tests/e2e/helpers/staging-capacity';
import {
  attachDiagnostics,
  joinLiveThroughUi,
  sessionTokensFromPage,
} from '../../tests/e2e/helpers/staging-capacity-browser';
import { signInStudent, signInTeacher } from '../../tests/e2e/helpers/auth';
import { createSdkLiveActor, type LiveActor } from './capacity-actors';
import {
  failCapacity,
  requireLocalExecution,
  type CapacityConfig,
} from './capacity-config';
import { settleCapacityOperations } from './capacity-lifecycle';
import type { CapacitySecrets } from './capacity-local-client';
import type { ActorEvidence } from './capacity-receipt';
import {
  createBrowserJoinDiagnostics,
  emptyBrowserJoinSnapshot,
} from '../../tests/e2e/helpers/live-browser-join-diagnostics';
import { liveDiagnosticsForPage } from '../../tests/e2e/helpers/live-connection-diagnostics';
import { isLiveBroadcast } from './capacity-live-broadcast';

export const restrictBrowserToLocal = async (
  context: BrowserContext,
  config: CapacityConfig,
) => {
  requireLocalExecution(config);
  await context.grantPermissions(['local-network-access'], {
    origin: new URL(config.appUrl).origin,
  });
  const origins = [
    new URL(config.appUrl).origin,
    new URL(config.supabaseUrl).origin,
  ];
  await context.route('**/*', async (route) => {
    if (!origins.includes(new URL(route.request().url()).origin)) {
      await route.abort('blockedbyclient');
      return;
    }
    // continue() only intercepts a redirect chain's first URL. Fetch with
    // redirects disabled and never hand a redirect response to the browser.
    try {
      const response = await route.fetch({
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 20_000,
      });
      try {
        if (response.status() >= 300 && response.status() < 400)
          await route.abort('blockedbyclient');
        else await route.fulfill({ response });
      } finally {
        await response.dispose();
      }
    } catch {
      await route.abort('failed').catch(() => undefined);
    }
  });
  await context.routeWebSocket(/.*/u, async (route) => {
    const socket = new URL(route.url());
    const backend = new URL(config.supabaseUrl);
    if (
      socket.hostname === backend.hostname &&
      socket.port === backend.port &&
      socket.protocol === 'ws:'
    )
      route.connectToServer();
    else await route.close();
  });
};

export const createBrowserLiveActor = async (
  browser: Browser,
  config: CapacityConfig,
  secrets: CapacitySecrets,
  credentials: CapacityCredentials,
  signal: AbortSignal,
  evidence: ActorEvidence,
  registerContext: (context: BrowserContext) => void,
): Promise<
  LiveActor & { page: Page; assertBrowserHealth: () => Promise<void> }
> => {
  const context = await browser.newContext({
    baseURL: config.appUrl,
    serviceWorkers: 'block',
  });
  registerContext(context);
  await restrictBrowserToLocal(context, config);
  const page = await context.newPage();
  // This companion uses the browser's same session. It performs fixture/RPC
  // reads for this one actor; it is not another identity or subscription.
  const base = createSdkLiveActor(
    config,
    secrets,
    credentials,
    signal,
    evidence,
  );
  const diagnostics = await attachDiagnostics(page);
  const observations = evidence.browserJoinDiagnostics ?? {
    join: emptyBrowserJoinSnapshot(evidence.index),
    subscribe: emptyBrowserJoinSnapshot(evidence.index),
  };
  evidence.browserJoinDiagnostics = observations;
  const counts = () => ({
    consoleErrors: diagnostics.consoleErrors.length,
    pageErrors: diagnostics.pageErrors.length,
    serverErrors: diagnostics.serverErrors.length,
  });
  const subscriptionDiagnostics = createBrowserJoinDiagnostics(evidence.index);
  page.on('request', (request) => {
    if (
      new URL(request.url()).origin === new URL(config.supabaseUrl).origin &&
      typeof evidence.requests === 'number'
    )
      evidence.requests += 1;
  });
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/realtime/v1/websocket')) return;
    socket.on('framereceived', ({ payload }) => {
      if (isLiveBroadcast(payload)) base.broadcast();
    });
  });
  const actor: LiveActor & {
    page: Page;
    assertBrowserHealth: () => Promise<void>;
  } = {
    ...base.actor,
    page,
    login: () =>
      base.measure('login', async () => {
        const uiCredentials = {
          email: credentials.account,
          password: credentials.password,
        };
        if (credentials.role === 'teacher')
          await signInTeacher(page, uiCredentials);
        else await signInStudent(page, uiCredentials);
        await base.restoreSession(
          await sessionTokensFromPage(page, config.supabaseUrl),
        );
        if (evidence.uiProof !== 'not_applicable')
          evidence.uiProof.login = true;
      }),
    joinLive: (code) =>
      base.measure('live_join', async () => {
        const [result] = await joinLiveThroughUi([page], code, {
          actorIndex: evidence.index,
          observe: (snapshot) => {
            observations.join = snapshot;
          },
          counts,
        });
        if (result?.outcome !== 'connected')
          return failCapacity('LIVE_CAPACITY_BROWSER_JOIN_FAILED');
        const id = /\/app\/live\/([0-9a-f-]{36})/iu.exec(
          new URL(page.url()).pathname,
        )?.[1];
        if (!id) return failCapacity('LIVE_CAPACITY_BROWSER_SESSION_INVALID');
        if (evidence.uiProof !== 'not_applicable') evidence.uiProof.join = true;
        return id;
      }),
    subscribe: (sessionId) =>
      base.measure('subscribe', async () => {
        const live = liveDiagnosticsForPage.get(page);
        if (live?.generation() === 0) live.beginGeneration(evidence.index);
        const generation = live?.generation();
        const attempt = subscriptionDiagnostics.begin(
          (snapshot) => {
            observations.subscribe = snapshot;
          },
          () => ({
            events:
              generation !== undefined && live?.generation() === generation
                ? live.events()
                : undefined,
            counts: counts(),
          }),
        );
        let outcome: 'connected' | 'realtime_timeout' | 'ui_error' = 'ui_error';
        let ack: boolean | undefined;
        try {
          if (credentials.role === 'teacher') {
            attempt.start('navigation');
            await page.goto(`/teacher/live/${sessionId}?presenter=1`);
            attempt.passed();
            if (evidence.uiProof !== 'not_applicable')
              evidence.uiProof.join = true;
          }
          const readinessStarted = performance.now();
          const host = credentials.role === 'teacher';
          attempt.start(host ? 'presenter_ready' : 'connection');
          const readiness = host
            ? page
                .getByRole('region', { name: 'Live 投影模式', exact: true })
                .getByRole('button', { name: '開始遊戲', exact: true })
            : page.getByText('連線正常');
          await readiness.waitFor({ timeout: 20_000, state: 'visible' });
          attempt.passed();
          attempt.start('subscription_ack');
          if (host) {
            const remaining = Math.max(
              0,
              20_000 - (performance.now() - readinessStarted),
            );
            ack = await diagnostics.waitForSubscriptionAck(
              remaining,
              signal,
              'HOST_PROGRESS',
            );
          } else {
            const realtime = await diagnostics.realtime();
            ack = realtime.subscriptionStatusSequence.includes('SUBSCRIBED');
          }
          if (!ack) return failCapacity('LIVE_CAPACITY_BROWSER_ACK_UNOBSERVED');
          attempt.passed();
          outcome = 'connected';
          evidence.status = 'connected';
        } catch (error) {
          if (
            error instanceof errors.TimeoutError &&
            (observations.subscribe.steps.at(-1)?.step === 'connection' ||
              observations.subscribe.steps.at(-1)?.step === 'presenter_ready')
          )
            outcome = 'realtime_timeout';
          throw error;
        } finally {
          attempt.finish(outcome, undefined, ack);
        }
      }),
    submitAnswer: async (state) => {
      try {
        const options = page
          .getByRole('group', { name: '答案選項' })
          .getByRole('button');
        await options.first().waitFor({ state: 'visible', timeout: 20_000 });
        const response = page.waitForResponse(
          (candidate) =>
            candidate.request().method() === 'POST' &&
            new URL(candidate.url()).pathname ===
              '/rest/v1/rpc/submit_live_answer',
          { timeout: 20_000 },
        );
        // UI readiness and click auto-wait are outside the HTTP latency SLO.
        // Both the click and its response must settle before returning.
        const completed = await settleCapacityOperations<number | undefined>([
          async () => {
            const received = await response;
            if (!received.ok() || (await received.finished()) !== null)
              return failCapacity('LIVE_CAPACITY_BROWSER_ANSWER_FAILED');
            const responseEnd = received.request().timing().responseEnd;
            if (!Number.isFinite(responseEnd) || responseEnd < 0)
              return failCapacity(
                'LIVE_CAPACITY_BROWSER_ANSWER_TIMING_INVALID',
              );
            return responseEnd;
          },
          async () => {
            await options
              .nth(
                (evidence.index - 1) %
                  (state.question?.publicOptions.length ?? 4),
              )
              .click();
            return undefined;
          },
        ]);
        const elapsedMs = completed[0];
        if (elapsedMs === undefined)
          return failCapacity('LIVE_CAPACITY_BROWSER_ANSWER_TIMING_INVALID');
        evidence.timings.push({
          stage: 'answer',
          elapsedMs,
          sample: evidence.timings.some((entry) => entry.stage === 'answer')
            ? 'subsequent'
            : 'first',
        });
        if (evidence.uiProof !== 'not_applicable')
          evidence.uiProof.answerRounds += 1;
      } catch {
        evidence.status = 'failed';
        return failCapacity('LIVE_CAPACITY_BROWSER_ANSWER_FAILED');
      }
    },
    openRound: async (_sessionId, first) => {
      const presenter = page.getByLabel('投影模式');
      if (first) {
        await presenter.getByRole('button', { name: '開始遊戲' }).click();
        await presenter
          .getByRole('alertdialog', { name: '立即開始' })
          .getByRole('button', { name: '開始', exact: true })
          .click();
      } else {
        await presenter.getByRole('button', { name: '即時排名' }).click();
        await presenter.getByRole('button', { name: '下一題' }).click();
      }
    },
    assertBrowserHealth: async () => {
      const realtime = await diagnostics.realtime();
      if (
        diagnostics.consoleErrors.length ||
        diagnostics.pageErrors.length ||
        diagnostics.serverErrors.length ||
        realtime.errorCount ||
        realtime.closeCount ||
        realtime.disconnectCount
      )
        return failCapacity('LIVE_CAPACITY_BROWSER_HEALTH_FAILED');
    },
    close: () =>
      settleCapacityOperations([
        () => context.close(),
        () => base.actor.close(),
      ]).then(() => undefined),
  };
  return actor;
};
