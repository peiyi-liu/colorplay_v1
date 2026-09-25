import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCleanupSql } from '../e2e/helpers/staging-capacity-cleanup';
import {
  buildLiveJoinEvidence,
  collectLiveJoinAttempts,
  decodeSafeRealtimeFrame,
  failureCodeForLiveJoinResults,
  summarizeLiveJoinOutcomes,
  type LiveJoinResult,
} from '../e2e/helpers/staging-capacity-browser';
import {
  buildStudentAccountPlan,
  capacityStageFailureCode,
  CapacityHarnessError,
  createSyntheticAccounts,
  parseAuthServerTiming,
  percentile,
  publicErrorCode,
  readCapacityConfig,
  summarizeDurations,
  summarizeAuthStageTimings,
  type CapacityAccount,
} from '../e2e/helpers/staging-capacity';

const VALID_ENV = {
  COLORPLAY_CAPACITY_APP_URL: 'https://staging.colorplayapp.com',
  COLORPLAY_CAPACITY_CONFIRM: 'STAGING_1_PLUS_39_ONLY',
  COLORPLAY_CAPACITY_EXPECTED_SHA: 'a'.repeat(40),
  COLORPLAY_CAPACITY_RUN_ID: 'c40-contract-test',
  STAGING_EXPECTED_SUPABASE_PROJECT_REF: 'onkxnkzeixpezetkmocf',
  STAGING_SUPABASE_ACCESS_TOKEN: 'synthetic-access-token',
  STAGING_SUPABASE_ANON_KEY: 'synthetic-public-key',
  STAGING_SUPABASE_PROJECT_REF: 'onkxnkzeixpezetkmocf',
  STAGING_SUPABASE_SECRET_KEY: 'synthetic-secret-key',
  STAGING_SUPABASE_URL: 'https://onkxnkzeixpezetkmocf.supabase.co',
} satisfies NodeJS.ProcessEnv;

const account = (id: string): CapacityAccount => ({
  account: 'cpcontract01',
  displayName: '容量學生 01',
  email: 'cpcontract01@capacity.colorplay.invalid',
  id,
  password: 'SyntheticA1',
  role: 'student',
});

const liveJoinResult = (
  outcome: LiveJoinResult['outcome'],
): LiveJoinResult => ({
  durationMs: outcome === 'ui_error' ? null : 1_000,
  lobbyMs:
    outcome === 'connected' || outcome === 'realtime_timeout' ? 600 : null,
  outcome,
  realtimeMs: outcome === 'connected' ? 400 : null,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Staging capacity harness contract', () => {
  it('fails closed for Production or an incorrect confirmation', () => {
    expect(() =>
      readCapacityConfig({
        ...VALID_ENV,
        COLORPLAY_CAPACITY_APP_URL: 'https://colorplayapp.com',
      }),
    ).toThrow('CAPACITY_TARGET_INVALID');
    expect(() =>
      readCapacityConfig({
        ...VALID_ENV,
        COLORPLAY_CAPACITY_CONFIRM: 'yes',
      }),
    ).toThrow('CAPACITY_TARGET_INVALID');
  });

  it('plans 39 students to run with one fixed preflighted teacher', () => {
    const accounts = buildStudentAccountPlan('c40-contract-test');
    expect(accounts).toHaveLength(39);
    expect(accounts.filter((entry) => entry.role === 'student')).toHaveLength(
      39,
    );
    expect(new Set(accounts.map((entry) => entry.account))).toHaveLength(39);
    expect(new Set(accounts.map((entry) => entry.password))).toHaveLength(39);
  });

  it('uses nearest-rank p95 and reports the maximum', () => {
    expect(percentile([100, 200, 300, 400], 95)).toBe(400);
    expect(summarizeDurations([100.4, 200.5, 300.6, 400.1])).toEqual({
      count: 4,
      max_ms: 400,
      p50_ms: 201,
      p95_ms: 400,
    });
  });

  it('parses only the four allowlisted auth-login timing stages', () => {
    expect(
      parseAuthServerTiming(
        'profile;dur=12.4, auth-user;dur=20, password-grant;dur=31.6, total;dur=65.2',
      ),
    ).toEqual({
      auth_user_ms: 20,
      password_grant_ms: 31.6,
      profile_ms: 12.4,
      total_ms: 65.2,
    });
    expect(() =>
      parseAuthServerTiming(
        'profile;dur=12, auth-user;dur=20, password-grant;dur=31, total;dur=65, account;dur=1',
      ),
    ).toThrow('CAPACITY_LOGIN_TIMING_INVALID');
    expect(() => parseAuthServerTiming(undefined)).toThrow(
      'CAPACITY_LOGIN_TIMING_INVALID',
    );
  });

  it('summarizes auth-login stages independently from full page login', () => {
    expect(
      summarizeAuthStageTimings([
        {
          auth_user_ms: 20,
          password_grant_ms: 30,
          profile_ms: 10,
          total_ms: 65,
        },
        {
          auth_user_ms: 40,
          password_grant_ms: 50,
          profile_ms: 20,
          total_ms: 115,
        },
      ]),
    ).toEqual({
      auth_user: { count: 2, max_ms: 40, p50_ms: 20, p95_ms: 40 },
      password_grant: { count: 2, max_ms: 50, p50_ms: 30, p95_ms: 50 },
      profile: { count: 2, max_ms: 20, p50_ms: 10, p95_ms: 20 },
      total: { count: 2, max_ms: 115, p50_ms: 65, p95_ms: 115 },
    });
  });

  it('preserves explicit harness codes and safely classifies Playwright failures by stage', () => {
    expect(capacityStageFailureCode('host_roster')).toBe(
      'CAPACITY_HOST_ROSTER_FAILED',
    );
    expect(
      publicErrorCode(
        new CapacityHarnessError('CAPACITY_ROUND_GATE_FAILED'),
        'CAPACITY_HOST_ROSTER_FAILED',
      ),
    ).toBe('CAPACITY_ROUND_GATE_FAILED');
    expect(
      publicErrorCode(
        new Error('locator timed out with sensitive page details'),
        'CAPACITY_HOST_ROSTER_FAILED',
      ),
    ).toBe('CAPACITY_HOST_ROSTER_FAILED');
    expect(publicErrorCode(new Error('unknown'))).toBe(
      'CAPACITY_HARNESS_FAILED',
    );
  });

  it('collects every anonymous Live join outcome after one client fails', async () => {
    let finalAttemptCompleted = false;
    const results = await collectLiveJoinAttempts([
      () => Promise.resolve(liveJoinResult('connected')),
      () => Promise.reject(new Error('sensitive account and token details')),
      () => Promise.resolve(liveJoinResult('realtime_timeout')),
      async () => {
        await Promise.resolve();
        finalAttemptCompleted = true;
        return liveJoinResult('lobby_timeout');
      },
    ]);

    expect(finalAttemptCompleted).toBe(true);
    expect(results).toEqual([
      liveJoinResult('connected'),
      liveJoinResult('ui_error'),
      liveJoinResult('realtime_timeout'),
      liveJoinResult('lobby_timeout'),
    ]);
    expect(summarizeLiveJoinOutcomes(results)).toEqual({
      connected: 1,
      lobby_timeout: 1,
      realtime_timeout: 1,
      total: 4,
      ui_error: 1,
    });
    expect(failureCodeForLiveJoinResults(results)).toBe(
      'CAPACITY_LIVE_JOIN_FAILED',
    );
    const evidence = buildLiveJoinEvidence(
      results,
      results.map((_entry, index) => ({
        closeCount: index === 2 ? 1 : 0,
        connectionStateSequence:
          index === 0 ? ['connecting', 'connected'] : ['connecting'],
        disconnectCount: 0,
        errorCount: 0,
        lastConnectionState: index === 0 ? 'connected' : 'connecting',
        socketCount: 1,
        subscriptionStatusSequence:
          index === 0 ? (['SUBSCRIBED'] as const) : [],
      })),
    );
    expect(evidence.failureCode).toBe('CAPACITY_LIVE_JOIN_FAILED');
    expect(evidence.result.live_join_summary).toEqual({
      connected: 1,
      lobby_timeout: 1,
      realtime_timeout: 1,
      total: 4,
      ui_error: 1,
    });
    expect(evidence.result.live_join_clients).toHaveLength(4);
    expect(evidence.result.live_join_clients[0]).toMatchObject({
      client_index: 1,
      connection_state_sequence: ['connecting', 'connected'],
      outcome: 'connected',
      subscription_status_sequence: ['SUBSCRIBED'],
    });
    expect(JSON.stringify(results)).not.toContain('sensitive');
    expect(JSON.stringify(evidence)).not.toContain('sensitive');
  });

  it('allowlists Realtime frame metadata without retaining payloads or tokens', () => {
    const decoded = decodeSafeRealtimeFrame(
      JSON.stringify({
        event: 'phx_join',
        payload: { access_token: 'secret-token-must-not-survive' },
        ref: 'safe-ref',
        topic: 'realtime:private:live-session:synthetic-session',
      }),
    );
    expect(decoded).toEqual({
      event: 'phx_join',
      isLiveTopic: true,
      ref: 'safe-ref',
      replyStatus: null,
    });
    expect(JSON.stringify(decoded)).not.toContain('secret-token');
    expect(
      decodeSafeRealtimeFrame(
        JSON.stringify({
          event: 'broadcast',
          payload: { answer: 'must-not-survive' },
          ref: null,
          topic: 'realtime:private:live-session:synthetic-session',
        }),
      ),
    ).toBeNull();
  });

  it('builds exact-id cleanup with identity limiter removal', () => {
    const sql = buildCleanupSql(
      [account('11111111-1111-4111-8111-111111111111')],
      '55555555-5555-4555-8555-555555555555',
      {
        activityId: '22222222-2222-4222-8222-222222222222',
        classroomId: '33333333-3333-4333-8333-333333333333',
        classroomName: "容量基準 c40-contract-test'quoted",
        sessionId: '44444444-4444-4444-8444-444444444444',
      },
    );
    expect(sql).toContain(
      "live_session.host_teacher_id = '55555555-5555-4555-8555-555555555555'::uuid",
    );
    expect(sql).toContain("name = '容量基準 c40-contract-test''quoted'");
    expect(sql).toContain("scope = 'identity'");
    expect(sql).not.toContain("scope = 'ip'");
  });

  it('reconciles an Auth user when create response is ambiguous', async () => {
    let fetchCall = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        fetchCall += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify(
              fetchCall === 1
                ? []
                : [
                    {
                      capacity_account: 'cpde1aae8401',
                      capacity_run_id: 'c40-contract-test',
                      email: 'cpde1aae8401@capacity.colorplay.invalid',
                      id: '11111111-1111-4111-8111-111111111111',
                    },
                  ],
            ),
            { status: 200 },
          ),
        );
      }),
    );
    let createCall = 0;
    const service = {
      auth: {
        admin: {
          createUser: vi.fn(() => {
            createCall += 1;
            return Promise.resolve(
              createCall === 1
                ? { data: { user: null }, error: new Error('response lost') }
                : {
                    data: {
                      user: {
                        id: `11111111-1111-4111-8111-${String(createCall).padStart(12, '0')}`,
                      },
                    },
                    error: null,
                  },
            );
          }),
        },
      },
      from: vi.fn(() => ({
        update: vi.fn(
          (
            payload: Readonly<{ full_name: string; login_account: string }>,
          ) => ({
            eq: vi.fn((_column: string, id: string) => ({
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { ...payload, id, role: 'student' },
                    error: null,
                  }),
                ),
              })),
            })),
          }),
        ),
      })),
    };
    const config = readCapacityConfig(VALID_ENV);
    const created = await createSyntheticAccounts(
      config,
      service as never,
      config.runId,
    );

    expect(created).toHaveLength(39);
    expect(created[0]?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(fetchCall).toBe(2);
  });

  it('drives browser Auth and Live UI without manual Realtime auth', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'tests/e2e/staging-capacity.spec.ts'),
      'utf8',
    );
    const browserHelperSource = await readFile(
      resolve(process.cwd(), 'tests/e2e/helpers/staging-capacity-browser.ts'),
      'utf8',
    );
    expect(source).toContain('signInTeacher');
    expect(source).toContain('signInStudent');
    expect(source).toContain('FIXED_TEACHER');
    expect(source).toMatch(/functions\.invoke\(\s*'join-classroom'/u);
    expect(source).toContain('launchLiveSessionFromTeacherHome');
    expect(browserHelperSource).toContain("getByText('連線正常')");
    expect(source).toContain(
      'result.auth_login = summarizeAuthStageTimings(authTimings)',
    );
    expect(source).toContain('CAPACITY_LOGIN_TIMING_COUNT_INVALID');
    expect(browserHelperSource).toContain('CAPACITY_LIVE_LOBBY_FAILED');
    expect(browserHelperSource).toContain('CAPACITY_LIVE_REALTIME_FAILED');
    expect(browserHelperSource).toContain('collectLiveJoinAttempts');
    expect(browserHelperSource).toContain('decodeSafeRealtimeFrame');
    expect(source).toContain('buildLiveJoinEvidence(');
    expect(browserHelperSource).toContain('live_join_clients: clients');
    expect(browserHelperSource).toContain('live_join_summary:');
    expect(browserHelperSource).toContain('subscription_status_sequence');
    expect(browserHelperSource).toContain('live_join_realtime:');
    expect(source).toContain("enterStage('host_roster')");
    expect(source).toContain("enterStage('round_answer')");
    expect(source).toContain('result.failure_stage = currentStage');
    expect(source).not.toContain('realtime.setAuth');
    expect(source).not.toContain("rpc('join_classroom'");
  });
});
