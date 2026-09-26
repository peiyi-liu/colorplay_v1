import { describe, expect, it } from 'vitest';

import { evaluateChapter3Readiness } from '../../scripts/acceptance/finalize-content-studio-ch3.mjs';

const packageManifest = {
  chapter: 'chapter-3',
  content_counts: {
    Chapter: 1,
    Course: 1,
    CR: 1,
    LT: 3,
    Media: 8,
    QB: 3,
    Question: 233,
    RC: 8,
    Section: 3,
    Subtopic: 3,
  },
  media: Array.from({ length: 8 }, () => ({})),
  unresolved_errors: 0,
  unresolved_warnings: 0,
};
const database = {
  chapter: 'chapter-3',
  integrity: {
    duplicate_stable_codes: 0,
    option_violations: 0,
    routing_violations: 0,
  },
  media: { current_manifest_mappings: 0, verified_assets: 0 },
  migration_head: '20260926000800',
  published_counts: {
    Chapter: 1,
    Course: 1,
    CR: 1,
    CRQuestion: 62,
    LT: 3,
    LTQuestion: 60,
    QB: 3,
    QBQuestion: 111,
    RC: 8,
    Section: 3,
    Subtopic: 3,
  },
};

describe('Content Studio Chapter 3 finalizer', () => {
  it('accepts the exact canonical package and Local published baseline', () => {
    expect(
      evaluateChapter3Readiness({ database, packageManifest }),
    ).toMatchObject({
      decision: 'PASS',
      package_media_count: 8,
    });
  });

  it('fails closed on a count mismatch or unresolved warning', () => {
    expect(() =>
      evaluateChapter3Readiness({
        database,
        packageManifest: {
          ...packageManifest,
          content_counts: { ...packageManifest.content_counts, Question: 232 },
        },
      }),
    ).toThrow('CONTENT_STUDIO_CH3_READINESS_FAILED');
    expect(() =>
      evaluateChapter3Readiness({
        database,
        packageManifest: { ...packageManifest, unresolved_warnings: 1 },
      }),
    ).toThrow('CONTENT_STUDIO_CH3_READINESS_FAILED');
  });
});
