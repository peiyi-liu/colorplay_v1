import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// 釘住 UI Restyle gate runner 的組成與順序（含跨 phase e2e 電池——本 phase
// 起的 runner 慣例）。
const runner = readFileSync('scripts/acceptance/run-ui-restyle.sh', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

describe('ui restyle phase gate contract', () => {
  it('maps the phase script to the runner', () => {
    expect(packageJson).toContain(
      '"phase:ui-restyle": "bash scripts/acceptance/run-ui-restyle.sh"',
    );
  });

  it('excludes the gate spec from the daily battery', () => {
    expect(packageJson).toContain('UI Restyle phase gate');
  });

  it.each([
    'pnpm format:check',
    'pnpm lint',
    'pnpm typecheck',
    'pnpm test',
    'pnpm test:coverage',
    'pnpm build',
    'token-hex-scan',
    'supabase db reset --local',
    'pnpm test:db',
  ])('runs %s before the browser stages', (label) => {
    expect(runner).toContain(label);
  });

  it('runs the full cross-phase e2e regression battery before the gate spec', () => {
    const batteryIndex = runner.indexOf('e2e-regression-battery');
    const gateIndex = runner.indexOf("--grep='UI Restyle phase gate'");
    expect(batteryIndex).toBeGreaterThan(0);
    expect(gateIndex).toBeGreaterThan(batteryIndex);
  });

  it('resets the database before the db battery (phase 6 convention)', () => {
    const resetIndex = runner.indexOf('supabase db reset --local');
    const dbIndex = runner.indexOf('pnpm test:db');
    expect(resetIndex).toBeGreaterThan(0);
    expect(dbIndex).toBeGreaterThan(resetIndex);
  });

  it('finalizes through the ui-restyle manifest writer', () => {
    expect(runner).toContain('finalize-ui-restyle.mjs');
  });
});
