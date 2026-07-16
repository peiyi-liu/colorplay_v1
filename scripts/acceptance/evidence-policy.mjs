import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { inflateSync } from 'node:zlib';

const execFileAsync = promisify(execFile);

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

export function containsSensitiveValue(source) {
  const text = source.toString('utf8');
  return sensitivePatterns.some((pattern) => pattern.test(text));
}

export async function requireNonEmptyEvidence(paths) {
  for (const path of paths) {
    let size;
    try {
      size = (await stat(path)).size;
    } catch {
      throw new Error('EVIDENCE_REQUIRED_MISSING');
    }
    if (size === 0) throw new Error('EVIDENCE_REQUIRED_MISSING');
  }
}

const startsWith = (source, expected) =>
  source.length >= expected.length &&
  source.subarray(0, expected.length).equals(expected);

const scanPngMetadata = (source) => {
  if (!startsWith(source, pngSignature)) {
    throw new Error('EVIDENCE_INVALID_BINARY');
  }

  let offset = pngSignature.length;
  let sawEnd = false;
  while (offset < source.length) {
    if (offset + 12 > source.length) {
      throw new Error('EVIDENCE_INVALID_BINARY');
    }
    const length = source.readUInt32BE(offset);
    const type = source.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > source.length) {
      throw new Error('EVIDENCE_INVALID_BINARY');
    }
    const data = source.subarray(dataStart, dataEnd);

    if (type === 'tEXt' && containsSensitiveValue(data)) return true;
    if (type === 'zTXt') {
      const separator = data.indexOf(0);
      if (separator < 0 || separator + 2 > data.length) {
        throw new Error('EVIDENCE_INVALID_BINARY');
      }
      const keyword = data.subarray(0, separator);
      let text;
      try {
        text = inflateSync(data.subarray(separator + 2));
      } catch {
        throw new Error('EVIDENCE_INVALID_BINARY');
      }
      if (containsSensitiveValue(keyword) || containsSensitiveValue(text)) {
        return true;
      }
    }
    if (type === 'iTXt') {
      const keywordEnd = data.indexOf(0);
      if (keywordEnd < 0 || keywordEnd + 3 > data.length) {
        throw new Error('EVIDENCE_INVALID_BINARY');
      }
      const compressionFlag = data[keywordEnd + 1];
      let cursor = keywordEnd + 3;
      const languageEnd = data.indexOf(0, cursor);
      if (languageEnd < 0) throw new Error('EVIDENCE_INVALID_BINARY');
      cursor = languageEnd + 1;
      const translatedKeywordEnd = data.indexOf(0, cursor);
      if (translatedKeywordEnd < 0) {
        throw new Error('EVIDENCE_INVALID_BINARY');
      }
      const metadata = data.subarray(0, translatedKeywordEnd);
      const encodedText = data.subarray(translatedKeywordEnd + 1);
      let text = encodedText;
      if (compressionFlag === 1) {
        try {
          text = inflateSync(encodedText);
        } catch {
          throw new Error('EVIDENCE_INVALID_BINARY');
        }
      } else if (compressionFlag !== 0) {
        throw new Error('EVIDENCE_INVALID_BINARY');
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
  if (!sawEnd) throw new Error('EVIDENCE_INVALID_BINARY');
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
    throw new Error('EVIDENCE_INVALID_BINARY');
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

const assertRelativePathSafe = (root, path) => {
  const output = relative(root, path).split(sep).join('/');
  if (!output || output.startsWith('../') || output.includes('/../')) {
    throw new Error('EVIDENCE_INVALID_PATH');
  }
  return output;
};

export async function assertEvidenceSafe({ evidencePaths, root, tracePaths }) {
  const traceSet = new Set(tracePaths);
  for (const path of evidencePaths) {
    const relativePath = assertRelativePathSafe(root, path);
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
    if (sensitive) throw new Error('EVIDENCE_SENSITIVE');
    if (containsSensitiveValue(Buffer.from(relativePath))) {
      throw new Error('EVIDENCE_SENSITIVE');
    }
  }
}
