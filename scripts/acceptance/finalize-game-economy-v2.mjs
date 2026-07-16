import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { inflateSync } from 'node:zlib';
import process from 'node:process';

const execFileAsync = promisify(execFile);

export const ACCEPTANCE_IDS = Object.freeze([
  'AC-GAME-001',
  'AC-GAME-002',
  'AC-GAME-003',
  'AC-GAME-004',
  'AC-GAME-005',
  'AC-GAME-006',
  'AC-GAME-007',
  'AC-SEC-001',
  'AC-SEC-002',
]);

const COMMAND_LABELS = Object.freeze([
  'pnpm format:check',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm test:db',
  'pnpm exec supabase db reset --local',
  'pnpm exec tsx scripts/supabase/seed-auth.ts',
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Game Economy v2 phase gate'",
]);

const sensitivePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\bBearer\s+[A-Za-z0-9._~-]+/iu,
  /LocalOnly-[A-Za-z0-9!_-]+/u,
  /SUPABASE_SERVICE_ROLE_KEY/u,
  /\bservice_role\b/iu,
  /(?:postgres(?:ql)?|mysql):\/\/[^\s]+:[^@\s]+@/iu,
];
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const webmSignature = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const webmTextElementIds = [
  Buffer.from([0x7b, 0xa9]),
  Buffer.from([0x4d, 0x80]),
  Buffer.from([0x57, 0x41]),
  Buffer.from([0x53, 0x6e]),
  Buffer.from([0x22, 0xb5, 0x9c]),
  Buffer.from([0x25, 0x86, 0x88]),
  Buffer.from([0x45, 0xa3]),
  Buffer.from([0x44, 0x87]),
];

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const listFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
};

const relativeEvidencePath = (root, path) => {
  const output = relative(root, path).split(sep).join('/');
  if (!output || output.startsWith('../') || output.includes('/../')) {
    throw new Error('GAME_ECONOMY_INVALID_EVIDENCE_PATH');
  }
  return output;
};

const requireNonEmpty = async (paths) => {
  for (const path of paths) {
    let size;
    try {
      size = (await stat(path)).size;
    } catch {
      throw new Error('GAME_ECONOMY_REQUIRED_EVIDENCE_MISSING');
    }
    if (size === 0) {
      throw new Error('GAME_ECONOMY_REQUIRED_EVIDENCE_MISSING');
    }
  }
};

const containsSensitiveValue = (buffer) => {
  const source = buffer.toString('utf8');
  return sensitivePatterns.some((pattern) => pattern.test(source));
};

const startsWith = (source, expected) =>
  source.length >= expected.length &&
  source.subarray(0, expected.length).equals(expected);

const scanPngMetadata = (source) => {
  if (!startsWith(source, pngSignature)) {
    throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
  }

  let offset = pngSignature.length;
  let sawEnd = false;
  while (offset < source.length) {
    if (offset + 12 > source.length) {
      throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
    }
    const length = source.readUInt32BE(offset);
    const type = source.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > source.length) {
      throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
    }
    const data = source.subarray(dataStart, dataEnd);

    if (type === 'tEXt' && containsSensitiveValue(data)) return true;
    if (type === 'zTXt') {
      const separator = data.indexOf(0);
      if (separator < 0 || separator + 2 > data.length) {
        throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
      }
      const keyword = data.subarray(0, separator);
      let text;
      try {
        text = inflateSync(data.subarray(separator + 2));
      } catch {
        throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
      }
      if (containsSensitiveValue(keyword) || containsSensitiveValue(text)) {
        return true;
      }
    }
    if (type === 'iTXt') {
      const keywordEnd = data.indexOf(0);
      if (keywordEnd < 0 || keywordEnd + 3 > data.length) {
        throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
      }
      const compressionFlag = data[keywordEnd + 1];
      let cursor = keywordEnd + 3;
      const languageEnd = data.indexOf(0, cursor);
      if (languageEnd < 0) {
        throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
      }
      cursor = languageEnd + 1;
      const translatedKeywordEnd = data.indexOf(0, cursor);
      if (translatedKeywordEnd < 0) {
        throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
      }
      const metadata = data.subarray(0, translatedKeywordEnd);
      const encodedText = data.subarray(translatedKeywordEnd + 1);
      let text = encodedText;
      if (compressionFlag === 1) {
        try {
          text = inflateSync(encodedText);
        } catch {
          throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
        }
      } else if (compressionFlag !== 0) {
        throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
      }
      if (containsSensitiveValue(metadata) || containsSensitiveValue(text)) {
        return true;
      }
    }

    offset = chunkEnd;
    if (type === 'IEND') {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
  return false;
};

const readEbmlSize = (source, offset) => {
  const first = source[offset];
  if (first === undefined || first === 0) return undefined;
  let width = 1;
  let marker = 0x80;
  while (width <= 8 && (first & marker) === 0) {
    width += 1;
    marker >>= 1;
  }
  if (width > 8 || offset + width > source.length) return undefined;
  let value = first & (marker - 1);
  for (let index = 1; index < width; index += 1) {
    value = value * 256 + source[offset + index];
  }
  return Number.isSafeInteger(value) ? { value, width } : undefined;
};

const scanWebmMetadata = (source) => {
  if (!startsWith(source, webmSignature)) {
    throw new Error('GAME_ECONOMY_INVALID_BINARY_EVIDENCE');
  }

  for (const id of webmTextElementIds) {
    let offset = source.indexOf(id, webmSignature.length);
    while (offset >= 0) {
      const size = readEbmlSize(source, offset + id.length);
      if (size) {
        const valueStart = offset + id.length + size.width;
        const valueEnd = valueStart + size.value;
        if (
          valueEnd <= source.length &&
          containsSensitiveValue(source.subarray(valueStart, valueEnd))
        ) {
          return true;
        }
      }
      offset = source.indexOf(id, offset + 1);
    }
  }
  return false;
};

const appearsTextual = (source) => {
  if (source.includes(0)) return false;
  const decoded = source.toString('utf8');
  if (decoded.includes('\uFFFD')) return false;
  let controls = 0;
  for (const character of decoded) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code < 0x20 &&
      character !== '\n' &&
      character !== '\r' &&
      character !== '\t'
    ) {
      controls += 1;
    }
  }
  return controls === 0;
};

const scanTraceArchive = async (tracePath) => {
  const source = await readFile(tracePath);
  if (source.subarray(0, 2).toString('binary') !== 'PK') {
    return containsSensitiveValue(source);
  }

  const temporary = await mkdtemp(join(tmpdir(), 'colorplay-trace-scan-'));
  try {
    await execFileAsync('unzip', ['-qq', tracePath, '-d', temporary]);
    for (const path of await listFiles(temporary)) {
      const entry = await readFile(path);
      if (appearsTextual(entry) && containsSensitiveValue(entry)) return true;
    }
    return false;
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
};

const assertSensitiveEvidenceAbsent = async (root, paths, tracePaths) => {
  const traceSet = new Set(tracePaths);
  for (const path of paths) {
    const source = await readFile(path);
    let sensitive;
    if (traceSet.has(path)) {
      sensitive = await scanTraceArchive(path);
    } else if (extname(path).toLowerCase() === '.png') {
      sensitive = scanPngMetadata(source);
    } else if (extname(path).toLowerCase() === '.webm') {
      sensitive = scanWebmMetadata(source);
    } else {
      sensitive = containsSensitiveValue(source);
    }
    if (sensitive) throw new Error('GAME_ECONOMY_SENSITIVE_EVIDENCE');
    if (containsSensitiveValue(Buffer.from(relativeEvidencePath(root, path)))) {
      throw new Error('GAME_ECONOMY_SENSITIVE_EVIDENCE');
    }
  }
};

const parseCommands = async (root) => {
  const commandsPath = join(root, 'reports/commands.tsv');
  const rows = (await readFile(commandsPath, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean);
  if (rows.length !== COMMAND_LABELS.length) {
    throw new Error('GAME_ECONOMY_REQUIRED_EVIDENCE_MISSING');
  }

  const commands = [];
  for (const [index, row] of rows.entries()) {
    const [label, startedAt, durationSource, report, exitSource, ...extra] =
      row.split('\t');
    const durationMs = Number(durationSource);
    const exitCode = Number(exitSource);
    if (
      extra.length > 0 ||
      label !== COMMAND_LABELS[index] ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(startedAt ?? '') ||
      !Number.isSafeInteger(durationMs) ||
      durationMs < 0 ||
      exitCode !== 0 ||
      !report?.startsWith('reports/')
    ) {
      throw new Error('GAME_ECONOMY_COMMAND_REPORT_INVALID');
    }
    const reportPath = resolve(root, report);
    if (dirname(reportPath) !== resolve(root, 'reports')) {
      throw new Error('GAME_ECONOMY_COMMAND_REPORT_INVALID');
    }
    await requireNonEmpty([reportPath]);
    commands.push({
      duration_ms: durationMs,
      exit_code: 0,
      label,
      report,
      started_at: startedAt,
    });
  }
  return commands;
};

const assertSourceState = (run) => {
  if (
    !isPlainObject(run) ||
    run.phase !== 'game-economy-v2' ||
    !/^[0-9a-f]{40}$/u.test(run.git_sha ?? '') ||
    run.dirty_worktree !== false ||
    run.supabase_environment !== 'local' ||
    JSON.stringify(run.acceptance_ids) !== JSON.stringify(ACCEPTANCE_IDS)
  ) {
    throw new Error('GAME_ECONOMY_INVALID_SOURCE_STATE');
  }
};

const assertBrowserHealth = (health) => {
  if (
    !isPlainObject(health) ||
    health.console_errors !== 0 ||
    health.page_errors !== 0 ||
    health.failed_requests !== 0 ||
    health.server_errors !== 0
  ) {
    throw new Error('GAME_ECONOMY_BROWSER_HEALTH_FAILED');
  }
};

export async function finalizeGameEconomy(runDirectory) {
  const root = resolve(runDirectory);
  const run = await readJson(join(root, 'run.json'));
  assertSourceState(run);

  const commands = await parseCommands(root);
  const [screenshots, videos, traces, reports] = await Promise.all(
    ['screenshots', 'videos', 'traces', 'reports'].map((directory) =>
      listFiles(join(root, directory)),
    ),
  );
  const requiredScreenshotNames = ['375x812', '768x1024', '1440x900'];
  if (
    screenshots.length < 3 ||
    videos.length < 1 ||
    traces.length < 1 ||
    !requiredScreenshotNames.every((name) =>
      screenshots.some((path) => path.includes(name)),
    )
  ) {
    throw new Error('GAME_ECONOMY_REQUIRED_EVIDENCE_MISSING');
  }
  await requireNonEmpty([...screenshots, ...videos, ...traces, ...reports]);

  const browserHealth = await readJson(
    join(root, 'reports/browser-health.json'),
  );
  assertBrowserHealth(browserHealth);

  const evidencePaths = [
    join(root, 'run.json'),
    ...screenshots,
    ...videos,
    ...traces,
    ...reports.filter((path) => !path.endsWith('/manifest.json')),
  ];
  await assertSensitiveEvidenceAbsent(root, evidencePaths, traces);

  const sortedRelative = (paths) =>
    paths.map((path) => relativeEvidencePath(root, path)).sort();
  const manifest = {
    acceptance_ids: [...ACCEPTANCE_IDS],
    artifacts: {
      reports: sortedRelative(reports),
      screenshots: sortedRelative(screenshots),
      traces: sortedRelative(traces),
      videos: sortedRelative(videos),
    },
    browser_health: {
      console_errors: 0,
      failed_requests: 0,
      page_errors: 0,
    },
    commands,
    decision: 'PASS',
    dirty_worktree: false,
    git_sha: run.git_sha,
    phase: 'game-economy-v2',
    schema_version: 1,
    supabase_environment: 'local',
  };
  await writeFile(
    join(root, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  const runDirectory = process.argv[2];
  if (!runDirectory) {
    process.stderr.write('GAME_ECONOMY_FINALIZER_ARGUMENT_REQUIRED\n');
    process.exitCode = 1;
  } else {
    try {
      await finalizeGameEconomy(runDirectory);
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'GAME_ECONOMY_FINALIZER_FAILED'}\n`,
      );
      process.exitCode = 1;
    }
  }
}
