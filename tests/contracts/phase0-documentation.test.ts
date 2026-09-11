import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const governedFiles = [
  'CONTEXT.md',
  'docs/adr/0002-colorplay-new-integration-and-production-environments.md',
  'docs/deployment/environment-matrix.md',
  'docs/deployment/production-readiness.md',
  'docs/deployment/runbooks/backup.md',
  'docs/deployment/vercel.md',
  'docs/staging-runbook.md',
];

async function corpus() {
  return (
    await Promise.all(governedFiles.map((path) => readFile(path, 'utf8')))
  ).join('\n');
}

const PHASE_MENTION = /Phase\s?(\d+)/gu;
const COMPLETION_MARKER =
  /\b(complete|completed|executed|passed|released|production-ready)\b|已完成|已執行|已通過/giu;

// Attributes each completion-claim word to the nearest *preceding* PhaseN
// mention in the same sentence, rather than using a fixed character-distance
// window. A fixed window is either too tight (misses a claim reworded with
// extra padding text) or too loose (wrongly attributes an unrelated later
// phase's completion, e.g. "run Phase 8 ..., or claim ... Phase 0 complete").
// Attribution by nearest-preceding-mention has neither failure mode: padding
// between "Phase 8" and its own completion word never matters as long as no
// other PhaseN mention sits between them, and a genuinely different phase's
// completion word is correctly attributed to that closer phase instead.
function claimsPhase8Complete(text: string): boolean {
  const sentences = text.split(/(?<=[.!?。！？])\s+|\n{2,}/u);
  return sentences.some((sentence) => {
    for (const marker of sentence.matchAll(COMPLETION_MARKER)) {
      const markerIndex = marker.index;
      let nearestPhase: string | undefined;
      let nearestIndex = -1;
      for (const mention of sentence.matchAll(PHASE_MENTION)) {
        const mentionIndex = mention.index;
        const phase = mention[1];
        if (
          phase !== undefined &&
          mentionIndex <= markerIndex &&
          mentionIndex > nearestIndex
        ) {
          nearestIndex = mentionIndex;
          nearestPhase = phase;
        }
      }
      if (nearestPhase !== '8') continue;
      const between = sentence.slice(nearestIndex, markerIndex);
      if (/\bnot\b/iu.test(between)) continue;
      return true;
    }
    return false;
  });
}

describe('Phase 8 completion-claim detection', () => {
  const deniedCases: [string, string][] = [
    ['Chinese 已完成 completion claim', 'Phase 8 已完成。'],
    ['Chinese 已執行 completion claim', 'Phase 8 已執行。'],
    ['Chinese 已通過 completion claim', 'Phase 8 已通過。'],
    ['English complete claim', 'Phase 8 release proof is complete.'],
    ['English completed claim', 'Phase 8 acceptance completed successfully.'],
    ['English executed claim', 'Phase 8 release proof executed.'],
    ['English passed claim', 'Phase 8 gate passed.'],
    ['English released claim', 'Phase 8 artifact released.'],
    ['English production-ready claim', 'Phase 8 is production-ready.'],
    [
      'claim reworded with padding a fixed character-distance limit could miss',
      'Phase 8 release proof, after extensive validation across every environment and every reviewer sign-off completed earlier this quarter for the whole team, is complete.',
    ],
  ];

  const allowedCases: [string, string][] = [
    ['deferred-to-Phase-8 framing', '0B work is deferred to Phase 8.'],
    ['explicit not-complete framing', 'Phase 8 is not complete.'],
    [
      'deferred sentinel framing',
      'NOT VERIFIED — deferred to Phase 0B / Phase 8.',
    ],
    [
      'unrelated Phase 0 completion in the same sentence as a Phase 8 mention',
      'Do not run Phase 8 release proof, or claim all of Phase 0 complete.',
    ],
  ];

  it.each(deniedCases)('flags %s', (_label, sentence) => {
    expect(claimsPhase8Complete(sentence)).toBe(true);
  });

  it.each(allowedCases)('allows %s', (_label, sentence) => {
    expect(claimsPhase8Complete(sentence)).toBe(false);
  });
});

describe('Phase 0 operational documentation', () => {
  it('removes stale and unsafe deployment guidance', async () => {
    const text = await corpus();

    expect(text).not.toMatch(/HEAD:main|--confirm-wipe/u);
    expect(text).not.toMatch(/Vercel Preview maps to Staging/u);
    expect(text).not.toMatch(/main.*creates a Production deployment/iu);
    expect(text).not.toMatch(/https:\/\/[^\s`]+\.vercel\.app\/\*\*/u);
    expect(text).not.toMatch(/\b(?:sbp|vcp)_[（(A-Za-z0-9_-]+/u);
    expect(text).not.toMatch(/LocalOnly-[A-Za-z0-9!_-]+/u);
    // A bare `/Phase 8/` ban would also forbid the legitimate "0B work is
    // deferred to Phase 8" framing. Only forbid a completion claim actually
    // attributable to Phase 8 (see claimsPhase8Complete above), which would
    // misstate deferred work as already executed or done.
    expect(claimsPhase8Complete(text)).toBe(false);
  });

  it('documents the approved release and recovery boundaries', async () => {
    const text = await corpus();

    // Current canonical entry points for the 2026-09-11 Phase 0A/0B rebaseline,
    // not the single-track Phase 0 spec/plan they supersede.
    expect(text).toContain(
      'docs/superpowers/specs/2026-09-11-phase-0a-0b-rebaseline-decision.md',
    );
    expect(text).toContain(
      'docs/superpowers/plans/2026-09-11-phase-0a-staging-foundation-closeout.md',
    );
    expect(text).toContain('two-slot');
    expect(text).toContain('GitHub `production` Environment');
    expect(text).toContain('main` does not automatically deploy Production');
    expect(text).toContain('VITE_SUPABASE_URL');
    expect(text).toContain('VITE_SUPABASE_ANON_KEY');
    expect(text).toContain('Object Lock');
    expect(text).toContain('30-day');
    expect(text).toContain('RPO 24 hours');
    expect(text).toContain('RTO 8 hours');
    expect(text).toContain('vercel deploy --prebuilt --prod --skip-domain');
    expect(text).toContain('vercel promote');
    expect(text).toContain('three consecutive');
    expect(text).toContain('HTTP 200');
    expect(text).toContain('READY');
    expect(text).toContain('production-recovery');
    expect(text).not.toContain('production-backup-recovery');
  });

  it('states that hosted Phase 0 execution is still gated', async () => {
    const text = await corpus();

    expect(text).toContain('LOCAL IMPLEMENTATION ONLY');
    expect(text).toContain('HOSTED CONFIGURATION NOT EXECUTED');
    expect(text).toContain('OWNER GATE 0');
  });
});
