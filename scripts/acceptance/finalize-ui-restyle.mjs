// UI Restyle phase gate 收尾：驗證證據齊備並寫 manifest。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import console from 'node:console';
import process from 'node:process';

const phaseRoot = process.argv[2];
if (!phaseRoot) {
  console.error('UI_RESTYLE_PHASE_ROOT_MISSING');
  process.exit(1);
}

const commands = readFileSync(join(phaseRoot, 'reports/commands.tsv'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => line.split('\t'))
  .map(([label, startedAt, durationMs, report, exitCode]) => ({
    duration_ms: Number(durationMs),
    exit_code: Number(exitCode),
    label,
    report,
    started_at: startedAt,
  }));

const failed = commands.filter((command) => command.exit_code !== 0);
if (failed.length > 0) {
  console.error(
    `UI_RESTYLE_COMMANDS_FAILED:${failed.map((c) => c.label).join(',')}`,
  );
  process.exit(1);
}

const screenshots = readdirSync(join(phaseRoot, 'screenshots'))
  .filter((name) => name.endsWith('.png'))
  .sort();

// 三 viewport × 核心畫面（app）＋GGAME 參考並列圖。
const requiredPrefixes = [
  'ui-restyle-login',
  'ui-restyle-lobby',
  'ui-restyle-mission',
  'ui-restyle-shop',
  'ui-restyle-teacher',
  'ui-restyle-reference',
];
const missing = requiredPrefixes.filter(
  (prefix) => !screenshots.some((name) => name.startsWith(prefix)),
);
if (missing.length > 0) {
  console.error(`UI_RESTYLE_SCREENSHOTS_MISSING:${missing.join(',')}`);
  process.exit(1);
}

const run = JSON.parse(readFileSync(join(phaseRoot, 'run.json'), 'utf8'));

writeFileSync(
  join(phaseRoot, 'manifest.json'),
  `${JSON.stringify(
    {
      acceptance_ids: run.acceptance_ids,
      commands,
      git_sha: run.git_sha,
      pending_human_evidence: [
        'AC-UI-010 real OS software keyboard',
        'AC-UI-012 Android hardware back',
      ],
      phase: run.phase,
      screenshots,
    },
    null,
    2,
  )}\n`,
);
console.log('UI_RESTYLE_MANIFEST_READY');
