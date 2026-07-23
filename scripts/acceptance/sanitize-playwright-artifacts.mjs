import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  copyFile,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const redactions = [
  [/(?:Bearer\s+)[A-Za-z0-9._~-]+/gu, 'Bearer [REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[REDACTED_JWT]'],
  [/LocalOnly-[A-Za-z0-9!_-]+/gu, '[REDACTED_LOCAL_FIXTURE]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[REDACTED_EMAIL]'],
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

function redact(buffer) {
  let text = buffer.toString('utf8');
  let changed = false;
  for (const [pattern, replacement] of redactions) {
    const next = text.replace(pattern, replacement);
    changed ||= next !== text;
    text = next;
  }
  return changed ? Buffer.from(text, 'utf8') : buffer;
}

async function sanitizeTrace(source, destination) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'colorplay-trace-'));
  try {
    await execFileAsync('unzip', ['-qq', source, '-d', temporaryDirectory]);
    for (const file of await listFiles(temporaryDirectory)) {
      const original = await readFile(file);
      const sanitized = redact(original);
      if (!sanitized.equals(original)) await writeFile(file, sanitized);
    }
    await rm(destination, { force: true });
    await execFileAsync('zip', ['-q', '-r', destination, '.'], {
      cwd: temporaryDirectory,
    });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function main() {
  const [runDirectoryInput, label] = process.argv.slice(2);
  if (!runDirectoryInput || !label || !/^[a-z0-9-]+$/u.test(label)) {
    throw new Error('PHASE_1_SANITIZER_ARGUMENTS_INVALID');
  }
  const runDirectory = resolve(runDirectoryInput);
  const rawDirectory = join(runDirectory, 'playwright');
  const tracesDirectory = join(runDirectory, 'traces');
  const videosDirectory = join(runDirectory, 'videos');
  await Promise.all([
    mkdir(tracesDirectory, { recursive: true }),
    mkdir(videosDirectory, { recursive: true }),
  ]);

  const files = await listFiles(rawDirectory);
  const traces = files.filter((file) => basename(file) === 'trace.zip');
  const videos = files.filter((file) => file.endsWith('.webm'));
  if (traces.length === 0 || videos.length === 0) {
    throw new Error('PHASE_1_RAW_BROWSER_EVIDENCE_MISSING');
  }

  for (const [index, trace] of traces.entries()) {
    await sanitizeTrace(
      trace,
      join(tracesDirectory, `${label}-${String(index + 1)}.zip`),
    );
  }
  for (const [index, video] of videos.entries()) {
    await copyFile(
      video,
      join(videosDirectory, `${label}-${String(index + 1)}.webm`),
    );
  }
  await rm(rawDirectory, { force: true, recursive: true });
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'PHASE_1_SANITIZER_FAILED'}\n`,
  );
  process.exitCode = 1;
}
