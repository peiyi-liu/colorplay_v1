import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const governedFiles = [
  'CONTEXT.md',
  'docs/adr/0002-colorplay-new-integration-and-production-environments.md',
  'docs/deployment/environment-matrix.md',
  'docs/deployment/production-readiness.md',
  'docs/deployment/vercel.md',
  'docs/staging-runbook.md',
];

async function corpus() {
  return (
    await Promise.all(governedFiles.map((path) => readFile(path, 'utf8')))
  ).join('\n');
}

describe('Phase 0 operational documentation', () => {
  it('removes stale and unsafe deployment guidance', async () => {
    const text = await corpus();

    expect(text).not.toMatch(/HEAD:main|--confirm-wipe/u);
    expect(text).not.toMatch(/Vercel Preview maps to Staging/u);
    expect(text).not.toMatch(/main.*creates a Production deployment/iu);
    expect(text).not.toMatch(/https:\/\/[^\s`]+\.vercel\.app\/\*\*/u);
    expect(text).not.toMatch(/\b(?:sbp|vcp)_[（(A-Za-z0-9_-]+/u);
    expect(text).not.toMatch(/LocalOnly-[A-Za-z0-9!_-]+/u);
    expect(text).not.toMatch(/Phase 8/u);
  });

  it('documents the approved release and recovery boundaries', async () => {
    const text = await corpus();

    expect(text).toContain(
      'docs/superpowers/specs/2026-08-05-phase-0-environment-release-foundation-design.md',
    );
    expect(text).toContain(
      'docs/superpowers/plans/2026-08-06-phase-0-environment-release-foundation.md',
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
  });

  it('states that hosted Phase 0 execution is still gated', async () => {
    const text = await corpus();

    expect(text).toContain('LOCAL IMPLEMENTATION ONLY');
    expect(text).toContain('HOSTED CONFIGURATION NOT EXECUTED');
    expect(text).toContain('OWNER GATE 0');
  });
});
