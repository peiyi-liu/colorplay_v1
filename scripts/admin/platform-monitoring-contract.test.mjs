import { describe, it, expect } from 'vitest';
import {
  normalizeHttpMetric,
  normalizeBackup,
  validateTarget,
} from '../../supabase/functions/_shared/platform-monitoring-contract.mjs';
describe('trusted platform observations', () => {
  it('distinguishes absent telemetry from a measured zero failure rate', () => {
    expect(
      normalizeHttpMetric({
        sample_count: 0,
        valid_status_count: 0,
        failed_count: 0,
        p95_ms: null,
      }).status,
    ).toBe('unknown');
    expect(
      normalizeHttpMetric({
        sample_count: 10,
        valid_status_count: 10,
        failed_count: 0,
        p95_ms: null,
      }),
    ).toMatchObject({ status: 'ok', p95_ms: null });
    expect(
      normalizeHttpMetric({
        sample_count: 10,
        valid_status_count: 10,
        failed_count: 2,
        p95_ms: 120,
      }),
    ).toMatchObject({ status: 'attention', failed_count: 2, p95_ms: 120 });
    expect(() =>
      normalizeHttpMetric({
        sample_count: 10,
        valid_status_count: 10,
        failed_count: 11,
      }),
    ).toThrow();
  });
  it('rejects production for the authorized Staging collector', () => {
    expect(() => validateTarget('xdjumzdqyexpyndanwkp')).toThrow();
    expect(validateTarget('onkxnkzeixpezetkmocf')).toBe('onkxnkzeixpezetkmocf');
  });
  it('requires a completed and recent backup rather than inferring recovery readiness', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    expect(normalizeBackup({ backups: [] }, now).status).toBe('unknown');
    expect(
      normalizeBackup(
        {
          backups: [
            { status: 'COMPLETED', inserted_at: '2026-09-05T01:00:00Z' },
          ],
        },
        now,
      ).status,
    ).toBe('ok');
    expect(
      normalizeBackup(
        {
          backups: [
            { status: 'COMPLETED', inserted_at: '2026-09-03T01:00:00Z' },
          ],
        },
        now,
      ).status,
    ).toBe('attention');
  });
});

it('does not report zero failure when HTTP status coverage is incomplete', () => {
  expect(
    normalizeHttpMetric({
      sample_count: 10,
      valid_status_count: 7,
      failed_count: 0,
      p95_ms: null,
    }),
  ).toMatchObject({ status: 'unknown', failed_count: null });
});
