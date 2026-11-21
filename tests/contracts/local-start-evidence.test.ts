import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('actual test-db caller preserves failed start and leaves encrypted evidence instead of discarding the canary', () => {
  const result = JSON.parse(
    execFileSync(
      'python3',
      ['-B', 'tests/contracts/helpers/local-start-evidence-fixture.py'],
      {
        encoding: 'utf8',
      },
    ),
  ) as {
    exitCode: number;
    startCalls: number;
    cipherExists: boolean;
    rawPublic: boolean;
  };
  expect(result.exitCode).toBe(7);
  expect(result.startCalls).toBe(1);
  expect(result.rawPublic).toBe(false);
  expect(result.cipherExists).toBe(true);
});

it('two existing CI jobs upload only the exact current encrypted path, never raw or an entire directory', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const start = readFileSync('scripts/test-db.sh', 'utf8');
  expect(
    start.match(
      /python3 -B scripts\/supabase\/start-local-with-evidence\.py/gu,
    ),
  ).toHaveLength(1);
  expect(start).not.toContain('pnpm exec supabase start >/dev/null');
  expect(
    workflow.match(
      /python3 -B scripts\/supabase\/start-local-with-evidence\.py/gu,
    ),
  ).toHaveLength(1);
  expect(
    workflow.match(/Install age for encrypted Local start evidence/gu),
  ).toHaveLength(2);
  const uploads = workflow
    .split('      - name: Upload encrypted Local start failure')
    .slice(1);
  expect(uploads).toHaveLength(2);
  for (const section of uploads) {
    const step = section.split(/\n\n {2}[a-z]/u)[0];
    expect(step).toContain(
      "failure() && steps.local-start.outputs.local_start_cipher == 'true'",
    );
    expect(step).toContain(
      "hashFiles('artifacts/ci-local-start/start-failure.age') != ''",
    );
    expect(step).toContain(
      'actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4',
    );
    expect(step).toContain(
      'path: artifacts/ci-local-start/start-failure.age\n',
    );
    expect(step).toMatch(/^\s+retention-days: 1$/mu);
    expect(step).not.toMatch(/path:.*(?:\*|\.json|raw|temp)/u);
  }
  expect(workflow).not.toContain('continue-on-error');
});

it.each([
  'test_success_is_silent_preserves_argv_cwd_env_and_does_not_require_age',
  'test_nonzero_keeps_one_start_exit_context_modes_and_private_cleanup',
  'test_signal_is_original_shell_status',
  'test_command_missing_is_127_and_permission_is_126_without_raw_error',
  'test_oversize_both_pipes_drain_fully_but_capture_is_at_most_eight_mib',
  'test_encryption_or_private_store_failure_never_changes_failed_exit',
  'test_unknown_context_does_not_serialize_environment_or_claim_evidence',
  'test_stale_cipher_never_sets_upload_readiness_or_gets_overwritten',
  'test_main_rejects_recipient_override_before_start',
  'test_real_age_roundtrip_and_tamper_reject_using_only_owned_test_keys',
])('isolated wrapper contract: %s', (name) => {
  const result = spawnSync(
    'python3',
    [
      '-B',
      'tests/contracts/helpers/local-start-evidence-fixture.py',
      'case',
      name,
    ],
    { encoding: 'utf8' },
  );
  expect(result.stdout).not.toContain('synthetic-sensitive-start-canary');
  expect(result.stderr).toContain('Ran 1 test');
  expect(result.status, result.stderr).toBe(0);
});
