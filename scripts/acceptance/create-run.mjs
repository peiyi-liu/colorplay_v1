import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { platform, release } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';
import { promisify } from 'node:util';
import { countAcceptanceIds } from '../verify/count-acceptance.mjs';

const execFileAsync = promisify(execFile);
const evidenceDirectories = [
  'db',
  'network',
  'real-device',
  'reports',
  'screenshots',
  'traces',
  'videos',
];
const evidenceStatus = 'NOT VERIFIED';
const allowedSupabaseEnvironments = new Set(['local', 'staging']);
const ambiguousCredentialSegments = new Set([
  'apikey',
  'auth',
  'key',
  'oauth',
  'privatekey',
  'pwd',
  'secretkey',
  'servicekey',
]);
const credentialTermPattern =
  /(?:authori[sz]ation|credential|jwt|passphrase|passwd|password|secret|token)/u;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const bearerPattern = /\bBearer\s+\S+/iu;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u;
const namedAssignmentPattern =
  /(?:^|\s)([A-Za-z_][A-Za-z0-9_.-]*)\s*(?:=|:)\s*(?:"[^"]*"|'[^']*'|\S+)/giu;
const namedCliOptionPattern =
  /(?:^|\s)--?([A-Za-z][A-Za-z0-9_.-]*)(?:\s*(?:=|:)\s*|\s+)(?:"[^"]*"|'[^']*'|\S+)/giu;
const environmentAssignmentPattern =
  /(?:^|\s)(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/iu;
const rawSecretPatterns = [
  /\bsb_secret_[A-Za-z0-9_-]+\b/iu,
  /\bsk_(?:live|test)_[A-Za-z0-9_-]+\b/u,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]+\b/u,
  /\bgh[pousr]_[A-Za-z0-9_-]+\b/u,
  /\bgithub_pat_[A-Za-z0-9_-]+\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]+\b/u,
];
const versionIdentifierPattern = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/u;
const maximumVersionIdentifierLength = 128;
const cliOptions = new Set([
  '--app-url',
  '--dirty-worktree',
  '--environment',
  '--finished-at',
  '--git-sha',
  '--metadata-file',
  '--output-root',
  '--run-id',
  '--started-at',
]);
const metadataFields = new Set([
  'browser',
  'commands',
  'known_failures',
  'migration_version',
  'os',
  'real_devices',
  'seed_version',
  'viewports',
]);

function assertIsoTimestamp(value, fieldName) {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`EVIDENCE_INVALID_${fieldName}`);
  }
}

function normalizeCredentialNameSegments(value) {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function isCredentialBearingName(value) {
  const segments = normalizeCredentialNameSegments(value);
  return segments.some(
    (segment, index) =>
      credentialTermPattern.test(segment) ||
      ambiguousCredentialSegments.has(segment) ||
      (segment === 'service' && segments[index + 1] === 'role'),
  );
}

function containsCredentialSyntax(value) {
  for (const match of value.matchAll(namedCliOptionPattern)) {
    if (isCredentialBearingName(match[1])) return true;
  }
  for (const match of value.matchAll(namedAssignmentPattern)) {
    if (isCredentialBearingName(match[1])) return true;
  }
  return false;
}

function assertNoSensitiveValue(value) {
  if (typeof value === 'string') {
    if (
      emailPattern.test(value) ||
      bearerPattern.test(value) ||
      jwtPattern.test(value) ||
      containsCredentialSyntax(value) ||
      environmentAssignmentPattern.test(value) ||
      rawSecretPatterns.some((pattern) => pattern.test(value))
    ) {
      throw new Error('EVIDENCE_SENSITIVE_VALUE');
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) assertNoSensitiveValue(item);
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (isCredentialBearingName(key)) {
        throw new Error('EVIDENCE_SENSITIVE_VALUE');
      }
      assertNoSensitiveValue(nestedValue);
    }
  }
}

function normalizeVersionIdentifier(value, fieldName) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`EVIDENCE_INVALID_${fieldName}`);
  }
  assertNoSensitiveValue(value);
  if (
    value.length === 0 ||
    value.length > maximumVersionIdentifierLength ||
    !versionIdentifierPattern.test(value)
  ) {
    throw new Error(`EVIDENCE_INVALID_${fieldName}`);
  }
  return value;
}

function normalizeSupabaseEnvironment(value) {
  if (typeof value !== 'string' || !allowedSupabaseEnvironments.has(value)) {
    throw new Error('EVIDENCE_INVALID_SUPABASE_ENVIRONMENT');
  }
  return value;
}

function normalizeAppUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('EVIDENCE_INVALID_APP_URL');
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('EVIDENCE_INVALID_APP_URL');
  }

  return parsed.toString().replace(/\/$/u, '');
}

function normalizeRelativePath(value, fieldName) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)) {
    throw new Error(`EVIDENCE_INVALID_${fieldName}`);
  }

  const normalized = relative('.', value);
  if (
    normalized === '..' ||
    normalized.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new Error(`EVIDENCE_INVALID_${fieldName}`);
  }
  return normalized;
}

function normalizeBrowser(value) {
  const browser = value ?? { name: 'NOT CAPTURED', version: 'NOT CAPTURED' };
  if (
    typeof browser.name !== 'string' ||
    browser.name.length === 0 ||
    typeof browser.version !== 'string' ||
    browser.version.length === 0
  ) {
    throw new Error('EVIDENCE_INVALID_BROWSER');
  }
  return { name: browser.name, version: browser.version };
}

function normalizeOs(value) {
  const os = value ?? { name: platform(), version: release() };
  if (
    typeof os.name !== 'string' ||
    os.name.length === 0 ||
    typeof os.version !== 'string' ||
    os.version.length === 0
  ) {
    throw new Error('EVIDENCE_INVALID_OS');
  }
  return { name: os.name, version: os.version };
}

function normalizeViewports(value = []) {
  return value.map((viewport) => {
    if (
      !Number.isInteger(viewport.width) ||
      viewport.width <= 0 ||
      !Number.isInteger(viewport.height) ||
      viewport.height <= 0
    ) {
      throw new Error('EVIDENCE_INVALID_VIEWPORT');
    }
    return { height: viewport.height, width: viewport.width };
  });
}

function normalizeCommands(value = []) {
  return value.map((command) => {
    if (
      typeof command.command !== 'string' ||
      command.command.length === 0 ||
      !Number.isInteger(command.exit_code) ||
      typeof command.started_at !== 'string' ||
      !Number.isInteger(command.duration_ms) ||
      command.duration_ms < 0
    ) {
      throw new Error('EVIDENCE_INVALID_COMMAND');
    }
    assertIsoTimestamp(command.started_at, 'COMMAND_TIMESTAMP');
    return {
      command: command.command,
      duration_ms: command.duration_ms,
      exit_code: command.exit_code,
      report_path: normalizeRelativePath(
        command.report_path,
        'COMMAND_REPORT_PATH',
      ),
      started_at: command.started_at,
    };
  });
}

function normalizeKnownFailures(value = []) {
  const fields = [
    'id_or_area',
    'description',
    'user_impact',
    'workaround',
    'owner',
    'target',
  ];
  return value.map((failure) => {
    const normalized = {};
    for (const field of fields) {
      if (typeof failure[field] !== 'string') {
        throw new Error('EVIDENCE_INVALID_KNOWN_FAILURE');
      }
      normalized[field] = failure[field];
    }
    return normalized;
  });
}

function normalizeRealDevices(value = []) {
  return value.map((device) => {
    if (
      typeof device.evidence_id !== 'string' ||
      typeof device.device_model !== 'string' ||
      typeof device.os !== 'string' ||
      typeof device.browser !== 'string' ||
      typeof device.css_viewport !== 'string' ||
      typeof device.orientation !== 'string' ||
      typeof device.keyboard_visible !== 'boolean' ||
      typeof device.android_back_tested !== 'boolean' ||
      !Array.isArray(device.evidence_files)
    ) {
      throw new Error('EVIDENCE_INVALID_REAL_DEVICE');
    }

    return {
      android_back_tested: device.android_back_tested,
      browser: device.browser,
      css_viewport: device.css_viewport,
      device_model: device.device_model,
      evidence_files: device.evidence_files.map((file) =>
        normalizeRelativePath(file, 'REAL_DEVICE_EVIDENCE_PATH'),
      ),
      evidence_id: device.evidence_id,
      keyboard_visible: device.keyboard_visible,
      orientation: device.orientation,
      os: device.os,
    };
  });
}

async function readGitState(projectRoot) {
  const [{ stdout: shaOutput }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot }),
    execFileAsync('git', ['status', '--porcelain'], { cwd: projectRoot }),
  ]);
  return {
    dirtyWorktree: statusOutput.trim().length > 0,
    gitSha: shaOutput.trim(),
  };
}

function replaceSummarySection(markdown, heading, nextHeading, body) {
  const sectionStart = markdown.indexOf(heading);
  const nextSectionStart = markdown.indexOf(nextHeading, sectionStart);
  if (sectionStart < 0 || nextSectionStart < 0) {
    throw new Error('EVIDENCE_TEMPLATE_INVALID');
  }
  return `${markdown.slice(0, sectionStart)}${heading}\n\n${body}\n\n${markdown.slice(nextSectionStart)}`;
}

function renderSummary(manifest, evidenceTemplate) {
  const commandRows = manifest.commands.length
    ? manifest.commands.map(
        (command) =>
          `| \`${command.command.replaceAll('|', '\\|')}\` | ${String(command.exit_code)} | ${command.started_at} | ${String(command.duration_ms)} | ${command.report_path ?? ''} |`,
      )
    : ['| — | — | — | — | — |'];
  const acceptanceRows = manifest.acceptance.map(
    (criterion) =>
      `| ${criterion.id} | ${criterion.status} | — | — | — | — | No evidence attached |`,
  );
  const knownFailureRows = manifest.known_failures.length
    ? manifest.known_failures.map(
        (failure) =>
          `| ${failure.id_or_area} | ${failure.description} | ${failure.user_impact} | ${failure.workaround} | ${failure.owner} | ${failure.target} |`,
      )
    : ['| — | None recorded | — | — | — | — |'];
  const realDeviceRows = manifest.real_devices.length
    ? manifest.real_devices.map(
        (device) =>
          `| ${device.evidence_id} | ${device.device_model} | ${device.os} | ${device.browser} | ${device.css_viewport} | ${device.orientation} | ${String(device.keyboard_visible)} | ${String(device.android_back_tested)} | ${device.evidence_files.join(', ')} |`,
      )
    : [
        '| — | NOT CAPTURED | NOT CAPTURED | NOT CAPTURED | NOT CAPTURED | NOT CAPTURED | false | false | — |',
      ];
  const metadataSection = `| Field | Value |
|---|---|
| Run ID | ${manifest.run_id} |
| Git SHA | ${manifest.git_sha} |
| Worktree clean | ${String(!manifest.dirty_worktree)} |
| Branch | NOT CAPTURED |
| App URL | ${manifest.app_url} |
| Supabase environment | ${manifest.supabase_environment} |
| Supabase project/ref | NOT CAPTURED |
| Migration version | ${manifest.migration_version ?? 'NOT CAPTURED'} |
| Seed version | ${manifest.seed_version ?? 'NOT CAPTURED'} |
| Game rules version | NOT CAPTURED |
| Started at UTC | ${manifest.started_at} |
| Finished at UTC | ${manifest.finished_at} |
| OS | ${manifest.os.name} ${manifest.os.version} |
| Browser + version | ${manifest.browser.name} ${manifest.browser.version} |
| Real device(s) | ${manifest.real_devices.length === 0 ? 'NOT CAPTURED' : String(manifest.real_devices.length)} |
| Operator / agent | NOT CAPTURED |
| Viewports | ${manifest.viewports.map(({ height, width }) => `${String(width)}×${String(height)}`).join(', ') || 'NOT CAPTURED'} |`;
  const commandsSection = `| Command | Exit code | Started | Duration (ms) | Report path |
|---|---:|---|---:|---|
${commandRows.join('\n')}`;
  const overallSection = `| Status | Count |
|---|---:|
| PASS | ${String(manifest.status_counts.PASS)} |
| FAIL | ${String(manifest.status_counts.FAIL)} |
| NOT VERIFIED | ${String(manifest.status_counts['NOT VERIFIED'])} |
| NOT APPLICABLE | ${String(manifest.status_counts['NOT APPLICABLE'])} |

**Release decision:** ${manifest.release_decision}

**Blocking reason(s):**

- ${String(manifest.status_counts['NOT VERIFIED'])} normative acceptance criteria have no attached evidence.`;
  const matrixSection = `Every normative acceptance ID has a row. No criterion without attached evidence is marked PASS.

| AC ID | Status | Automated test | Screenshot/sequence | Trace/video | DB/network proof | Notes |
|---|---|---|---|---|---|---|
${acceptanceRows.join('\n')}`;
  const realDeviceSection = `| Evidence ID | Device model | OS | Browser/version | CSS viewport | Orientation | Keyboard visible | Android Back tested | File path |
|---|---|---|---|---|---|---|---|---|
${realDeviceRows.join('\n')}

A missing real Android device result means \`AC-UI-012\` is \`NOT VERIFIED\`, not PASS. A desktop emulator does not fill this table.`;
  const knownFailuresSection = `| ID / area | Description | User impact | Workaround | Owner | Target |
|---|---|---|---|---|---|
${knownFailureRows.join('\n')}`;

  let summary = evidenceTemplate
    .replace('# Acceptance Evidence Template', '# Acceptance Evidence Summary')
    .replace(
      /^>.*$/mu,
      '> Generated from the canonical template. Empty evidence remains NOT VERIFIED.',
    );
  summary = replaceSummarySection(
    summary,
    '## 1. Run Metadata',
    '## 2. Commands',
    metadataSection,
  );
  summary = replaceSummarySection(
    summary,
    '## 2. Commands',
    '## 3. Overall Result',
    commandsSection,
  );
  summary = replaceSummarySection(
    summary,
    '## 3. Overall Result',
    '## 4. Criterion Evidence Matrix',
    overallSection,
  );
  summary = replaceSummarySection(
    summary,
    '## 4. Criterion Evidence Matrix',
    '## 5. Required Screenshot Inventory',
    matrixSection,
  );
  summary = replaceSummarySection(
    summary,
    '## 11. Real Device Inventory',
    '## 12. Known Failures / Not Verified',
    realDeviceSection,
  );
  summary = replaceSummarySection(
    summary,
    '## 12. Known Failures / Not Verified',
    '## 13. Reviewer Sign-off',
    knownFailuresSection,
  );
  return summary.endsWith('\n') ? summary : `${summary}\n`;
}

function parseCliPairs(argumentsList) {
  const parsed = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      !cliOptions.has(option) ||
      value === undefined ||
      value.startsWith('--') ||
      parsed.has(option)
    ) {
      throw new Error('EVIDENCE_INVALID_ARGUMENTS');
    }
    parsed.set(option, value);
  }
  return parsed;
}

function parseDirtyWorktree(value) {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('EVIDENCE_INVALID_DIRTY_WORKTREE');
}

async function readMetadataFile(metadataPath) {
  if (metadataPath === undefined) return {};

  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch {
    throw new Error('EVIDENCE_INVALID_METADATA');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('EVIDENCE_INVALID_METADATA');
  }
  if (Object.keys(metadata).some((field) => !metadataFields.has(field))) {
    throw new Error('EVIDENCE_INVALID_METADATA');
  }
  return metadata;
}

export async function parseCreateRunArguments(argumentsList) {
  if (argumentsList.length % 2 !== 0) {
    throw new Error('EVIDENCE_INVALID_ARGUMENTS');
  }

  const parsed = parseCliPairs(argumentsList);
  const metadata = await readMetadataFile(parsed.get('--metadata-file'));
  return {
    appUrl: parsed.get('--app-url'),
    browser: metadata.browser,
    commands: metadata.commands,
    dirtyWorktree: parseDirtyWorktree(parsed.get('--dirty-worktree')),
    finishedAt: parsed.get('--finished-at'),
    gitSha: parsed.get('--git-sha'),
    knownFailures: metadata.known_failures,
    migrationVersion: metadata.migration_version,
    os: metadata.os,
    outputRoot: parsed.get('--output-root'),
    realDevices: metadata.real_devices,
    runId: parsed.get('--run-id'),
    seedVersion: metadata.seed_version,
    startedAt: parsed.get('--started-at'),
    supabaseEnvironment: parsed.get('--environment'),
    viewports: metadata.viewports,
  };
}

export async function createEvidenceRun(options) {
  const projectRoot = options.projectRoot ?? process.cwd();
  const startedAt = options.startedAt ?? new Date().toISOString();
  const finishedAt = options.finishedAt ?? startedAt;
  assertIsoTimestamp(startedAt, 'STARTED_AT');
  assertIsoTimestamp(finishedAt, 'FINISHED_AT');
  if (Date.parse(finishedAt) < Date.parse(startedAt)) {
    throw new Error('EVIDENCE_INVALID_TIME_RANGE');
  }

  const migrationVersion = normalizeVersionIdentifier(
    options.migrationVersion,
    'MIGRATION_VERSION',
  );
  const seedVersion = normalizeVersionIdentifier(
    options.seedVersion,
    'SEED_VERSION',
  );
  const supabaseEnvironment = normalizeSupabaseEnvironment(
    options.supabaseEnvironment,
  );
  assertNoSensitiveValue({
    app_url: options.appUrl,
    browser: options.browser,
    commands: options.commands,
    known_failures: options.knownFailures,
    migration_version: migrationVersion,
    os: options.os,
    real_devices: options.realDevices,
    seed_version: seedVersion,
    supabase_environment: supabaseEnvironment,
    viewports: options.viewports,
  });

  const capturedGitState =
    options.gitSha === undefined || options.dirtyWorktree === undefined
      ? await readGitState(projectRoot)
      : undefined;
  const gitSha = options.gitSha ?? capturedGitState?.gitSha;
  const dirtyWorktree =
    options.dirtyWorktree ?? capturedGitState?.dirtyWorktree;
  if (
    typeof gitSha !== 'string' ||
    !/^[0-9a-f]{7,64}$/u.test(gitSha) ||
    typeof dirtyWorktree !== 'boolean'
  ) {
    throw new Error('EVIDENCE_INVALID_GIT_STATE');
  }

  const runId =
    options.runId ??
    `${startedAt.replaceAll(/[-:.TZ]/gu, '').slice(0, 14)}-${gitSha.slice(0, 7)}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(runId)) {
    throw new Error('EVIDENCE_INVALID_RUN_ID');
  }

  const browser = normalizeBrowser(options.browser);
  const os = normalizeOs(options.os);
  const viewports = normalizeViewports(options.viewports);
  const commands = normalizeCommands(options.commands);
  const knownFailures = normalizeKnownFailures(options.knownFailures);
  const realDevices = normalizeRealDevices(options.realDevices);
  const appUrl = normalizeAppUrl(options.appUrl);

  const acceptanceMarkdown = await readFile(
    options.acceptancePath ??
      join(projectRoot, 'acceptance/ACCEPTANCE_CRITERIA.md'),
    'utf8',
  );
  const evidenceTemplate = await readFile(
    options.evidenceTemplatePath ??
      join(projectRoot, 'acceptance/EVIDENCE_TEMPLATE.md'),
    'utf8',
  );
  const acceptanceIds = countAcceptanceIds(acceptanceMarkdown);
  if (acceptanceIds.length !== 84) {
    throw new Error(
      `EVIDENCE_ACCEPTANCE_COUNT_MISMATCH:${String(acceptanceIds.length)}`,
    );
  }

  const acceptance = acceptanceIds.map((id) => ({
    automated_test: null,
    db_network_proof: [],
    evidence_files: [],
    id,
    notes: 'No evidence attached to this run.',
    screenshots: [],
    status: evidenceStatus,
    traces_videos: [],
  }));
  const manifest = {
    acceptance,
    app_url: appUrl,
    browser,
    commands,
    dirty_worktree: dirtyWorktree,
    finished_at: finishedAt,
    git_sha: gitSha,
    known_failures: knownFailures,
    migration_version: migrationVersion,
    os,
    real_devices: realDevices,
    release_decision: 'BLOCKED',
    run_id: runId,
    schema_version: 1,
    seed_version: seedVersion,
    started_at: startedAt,
    status_counts: {
      FAIL: 0,
      'NOT APPLICABLE': 0,
      'NOT VERIFIED': acceptanceIds.length,
      PASS: 0,
    },
    supabase_environment: supabaseEnvironment,
    viewports,
  };
  assertNoSensitiveValue(manifest);

  const outputRoot =
    options.outputRoot ?? join(projectRoot, 'artifacts/acceptance');
  const runDirectory = join(outputRoot, runId);
  await Promise.all(
    evidenceDirectories.map((directory) =>
      mkdir(join(runDirectory, directory), { recursive: true }),
    ),
  );
  await Promise.all([
    writeFile(
      join(runDirectory, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      join(runDirectory, 'summary.md'),
      renderSummary(manifest, evidenceTemplate),
      'utf8',
    ),
  ]);

  return { manifest, runDirectory };
}

async function main() {
  const options = await parseCreateRunArguments(process.argv.slice(2));
  const { runDirectory } = await createEvidenceRun(options);
  process.stdout.write(`${runDirectory}\n`);
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  try {
    await main();
  } catch (error) {
    const message =
      error instanceof Error && error.message.startsWith('EVIDENCE_')
        ? error.message
        : 'EVIDENCE_RUN_FAILED';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
