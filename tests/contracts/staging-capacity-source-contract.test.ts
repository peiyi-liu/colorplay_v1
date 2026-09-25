import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Staging capacity source contract', () => {
  it('drives browser Auth and Live UI without manual Realtime auth', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'tests/e2e/staging-capacity.spec.ts'),
      'utf8',
    );
    const browserHelperSource = await readFile(
      resolve(process.cwd(), 'tests/e2e/helpers/staging-capacity-browser.ts'),
      'utf8',
    );
    const journeySource = await readFile(
      resolve(process.cwd(), 'tests/e2e/helpers/staging-capacity-journey.ts'),
      'utf8',
    );
    expect(journeySource).toContain('signInTeacher');
    expect(journeySource).toContain('signInStudent');
    expect(journeySource).toContain('FIXED_TEACHER');
    expect(journeySource).toMatch(/functions\.invoke\(\s*'join-classroom'/u);
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
    expect(browserHelperSource).toContain(
      'error instanceof errors.TimeoutError',
    );
    expect(browserHelperSource).toContain(
      'liveJoinRefs.size < MAX_SAFE_REALTIME_EVENTS',
    );
    expect(browserHelperSource).toContain('liveJoinRefs.delete(frame.ref)');
    expect(browserHelperSource).toContain("value !== 'connecting'");
    expect(source).toContain('buildLiveJoinEvidence(');
    expect(browserHelperSource).toContain('live_join_clients: clients');
    expect(browserHelperSource).toContain('live_join_summary:');
    expect(browserHelperSource).toContain('subscription_status_sequence');
    expect(browserHelperSource).toContain('live_join_realtime:');
    expect(source).toContain("stageRunner.run('host_roster'");
    expect(source).toContain("stageRunner.run('round_answer'");
    expect(source).toContain('result.failure_stage = currentStage');
    expect(source).toContain('await stageRunner.settlePendingOperation()');
    expect(source).toContain('CAPACITY_CLEANUP_TIMEOUT_MS');
    expect(source).toContain('cleanupAbortController.signal');
    expect(source).toContain('runAbortController.signal');
    expect(source).toContain("'cleanup'");
    expect(source).toContain("'finished'");
    expect(source).toContain('const cleanupService = createServiceClient');
    expect(source).not.toContain('realtime.setAuth');
    expect(journeySource).not.toContain('realtime.setAuth');
    expect(source).not.toContain("rpc('join_classroom'");
    expect(journeySource).not.toContain("rpc('join_classroom'");
  });
});
