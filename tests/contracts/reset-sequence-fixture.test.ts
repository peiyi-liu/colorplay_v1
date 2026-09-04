import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { TEST_USER_ROLES, TEST_USERS } from '../fixtures/users';

const execFileAsync = promisify(execFile);
const wrapperPath = 'scripts/maintenance/reset-sequence-fixture.sh';
const sqlPath = 'scripts/maintenance/reset-sequence-fixture.sql';

describe('sequence fixture reset safety contract', () => {
  it('registers one dedicated student fixture', () => {
    expect(TEST_USERS.sequenceStudent).toEqual({
      email: 'sequence.student@colorplay.test',
      password: 'LocalOnly-SequenceStudent1!',
    });
    expect(TEST_USER_ROLES.sequenceStudent).toBe('student');
  });

  it('rejects invocations other than the two explicit modes', async () => {
    await expect(
      execFileAsync('bash', [wrapperPath, '--unknown']),
    ).rejects.toMatchObject({ code: 64 });
    await expect(
      execFileAsync('bash', [wrapperPath, '--execute', 'wrong-token']),
    ).rejects.toMatchObject({ code: 64 });
  });

  it('pins the exact target and fail-closed reset boundaries', async () => {
    const [wrapper, sql] = await Promise.all([
      readFile(wrapperPath, 'utf8'),
      readFile(sqlPath, 'utf8'),
    ]);
    const combined = `${wrapper}\n${sql}`;

    expect(wrapper).toContain("mode='--dry-run'");
    expect(wrapper).toContain('RESET_SEQUENCE_FIXTURE_2026_08');
    expect(wrapper).toContain('pg_dump');
    expect(wrapper.indexOf('pg_dump')).toBeLessThan(
      wrapper.indexOf('run_reset_sql true'),
    );
    expect(sql).toContain("email = 'sequence.student@colorplay.test'");
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('session_replication_role = replica');
    expect(sql).toContain('session_replication_role = origin');
    expect(sql).toContain('\\if :{?execute_reset}');

    expect(combined).not.toMatch(/\b(?:like|ilike)\b/iu);
    expect(combined).not.toContain('@colorplay.test%');
    for (const table of [
      'auth.users',
      'profiles',
      'blooks',
      'courses',
      'chapters',
      'sections',
      'subtopics',
      'questions',
      'review_cards',
    ]) {
      expect(combined).not.toMatch(
        new RegExp(
          `delete\\s+from\\s+(?:public\\.)?${table.replace('.', '\\.')}`,
          'iu',
        ),
      );
    }
  });
});
