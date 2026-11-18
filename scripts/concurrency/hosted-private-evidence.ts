import fs from 'node:fs/promises';
import { constants, type BigIntStats } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { functionalStages } from './functional-receipt';
import { admissionLocalLegIds } from './hosted-admission-contracts';
const invalid = (): never => {
  throw Error('LOCAL_PREDECESSOR_INVALID');
};
const requireValue = (ok: unknown): void => {
  if (!ok) invalid();
};
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
/** Reject duplicate decoded property keys before any unchanged evidence parser. */
export const parsePrivateEvidenceJson = (raw: string): unknown => {
  let at = 0,
    nodes = 0;
  const space = () => {
    while (/\s/u.test(raw[at] ?? '') && at < raw.length) at++;
  };
  const string = (): string => {
    const start = at++;
    let escaped = false;
    while (at < raw.length) {
      const c = raw[at++];
      if (c === '"' && !escaped)
        return z.string().parse(JSON.parse(raw.slice(start, at)));
      if (c === '\\' && !escaped) escaped = true;
      else escaped = false;
    }
    return invalid();
  };
  const value = (depth: number): void => {
    requireValue(depth <= 64 && ++nodes <= 200000);
    space();
    const c = raw[at];
    if (c === '"') {
      string();
      return;
    }
    if (c === '{' || c === '[') {
      at++;
      space();
      const end = c === '{' ? '}' : ']',
        keys = new Set<string>();
      if (raw[at] === end) {
        at++;
        return;
      }
      for (;;) {
        space();
        if (c === '{') {
          requireValue(raw[at] === '"');
          const key = string();
          requireValue(!keys.has(key));
          keys.add(key);
          space();
          requireValue(raw[at++] === ':');
        }
        value(depth + 1);
        space();
        if (raw[at] === end) {
          at++;
          return;
        }
        requireValue(raw[at++] === ',');
      }
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(
        raw.slice(at),
      );
    requireValue(token);
    at += token?.[0].length ?? 0;
  };
  value(0);
  space();
  requireValue(at === raw.length);
  return JSON.parse(raw) as unknown;
};
const stamp = (s: BigIntStats) => [
  s.dev,
  s.ino,
  s.uid,
  s.mode,
  s.nlink,
  s.size,
  s.mtimeNs,
  s.ctimeNs,
];

const maximumFor = (name: string): number => {
  if (
    [
      'local-predecessor.json',
      'capacity/manifest.json',
      'functional/functional-result.json',
      'functional/functional-result-candidate.json',
      'functional/functional-request.json',
    ].includes(name)
  )
    return 131072;
  if (name === 'functional/functional-process-close.json') return 32768;
  if (
    functionalStages.some(
      (stage) =>
        name ===
        `functional/stage-${stage.replaceAll('_', '-')}-confirmed.json`,
    )
  )
    return 16384;
  for (const leg of admissionLocalLegIds) {
    const base = `capacity/${leg}/`;
    if (name === base + 'capacity-process-close.json') return 16384;
    if (name === base + 'capacity-request.json') return 65536;
    if (
      ['capacity-result.json', 'capacity-result-candidate.json'].some(
        (file) => name === base + file,
      )
    )
      return 262144;
  }
  return invalid();
};
/** Only the fixed Local predecessor evidence names. No arbitrary IO port. */
export const openHostedPrivateEvidence = async (evidenceRoot: string) => {
  let bytesRead = 0;
  const snapshots = new Map<string, BigIntStats>();
  const uid = process.getuid?.();
  requireValue(uid !== undefined && resolve(evidenceRoot) === evidenceRoot);
  const inspect = async (path: string, directory: boolean) => {
    requireValue((await fs.realpath(path)) === path);
    const s = await fs.lstat(path, { bigint: true });
    requireValue(
      s.uid === BigInt(uid ?? -1) &&
        (s.mode & 0o777n) === (directory ? 0o700n : 0o600n) &&
        (directory ? s.isDirectory() : s.isFile() && s.nlink === 1n),
    );
    const before = snapshots.get(path);
    if (before) requireValue(isDeepStrictEqual(stamp(before), stamp(s)));
    else snapshots.set(path, s);
    return s;
  };
  await inspect(evidenceRoot, true);
  const read = async (
    name: string,
    maximum: number,
    expected: string,
  ): Promise<string> => {
    requireValue(
      maximum === maximumFor(name) && /^[a-f0-9]{64}$/u.test(expected),
    );
    requireValue(
      snapshots.size < 128 &&
        name
          .split('/')
          .every((piece) => piece !== '' && piece !== '.' && piece !== '..'),
    );
    const path = join(evidenceRoot, name);
    requireValue(path.startsWith(evidenceRoot + '/'));
    let parent = dirname(path);
    const parents: string[] = [];
    while (parent !== evidenceRoot) {
      requireValue(parent.startsWith(evidenceRoot + '/'));
      parents.unshift(parent);
      parent = dirname(parent);
    }
    for (const folder of parents) await inspect(folder, true);
    const before = await inspect(path, false);
    requireValue(before.size <= BigInt(maximum));
    const fd = await fs.open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const opened = await fd.stat({ bigint: true });
      requireValue(isDeepStrictEqual(stamp(before), stamp(opened)));
      const body = Buffer.alloc(maximum + 1);
      let size = 0;
      while (size < body.length) {
        const n = await fd.read(body, size, body.length - size, null);
        if (n.bytesRead === 0) break;
        size += n.bytesRead;
      }
      bytesRead += size;
      requireValue(size <= maximum && bytesRead <= 12 * 1024 ** 2);
      const raw = body.subarray(0, size);
      requireValue(hash(raw) === expected);
      const text = raw.toString('utf8');
      requireValue(Buffer.from(text, 'utf8').equals(raw));
      requireValue(
        isDeepStrictEqual(
          stamp(opened),
          stamp(await fd.stat({ bigint: true })),
        ),
      );
      await inspect(path, false);
      parsePrivateEvidenceJson(text);
      return text;
    } finally {
      await fd.close();
    }
  };

  return {
    read,
    complete: async () => {
      for (const [path, before] of snapshots) {
        const after = await fs.lstat(path, { bigint: true });
        requireValue(
          isDeepStrictEqual(stamp(before), stamp(after)) &&
            (await fs.realpath(path)) === path,
        );
      }
    },
  };
};
