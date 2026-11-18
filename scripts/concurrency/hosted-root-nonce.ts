import fs from 'node:fs/promises';
import { constants, type BigIntStats } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { isDeepStrictEqual, types } from 'node:util';
import type {
  ReadonlyDeep,
  ReservationBinding,
  RootAdmissionPorts,
} from './hosted-admission-contracts';
import {
  assertNonceData,
  decodeNonceRecord,
  encodeNonceRecord,
  nonceArmSchema,
  nonceBindingSchema,
  nonceInputSchema,
  nonceRecordBytes,
  nonceReservationSchema,
  type RootNonceInput,
  type RootNonceOpen,
} from './hosted-root-nonce-contracts';

const isMissing = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  !types.isProxy(error) &&
  Object.getOwnPropertyDescriptor(error, 'code')?.value === 'ENOENT';
const requireValue = (value: unknown): void => {
  if (!value) throw Error('ROOT_NONCE_INVALID');
};
const same = (a: BigIntStats, b: BigIntStats) =>
  a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.mode === b.mode;
const quietClose = async (file: fs.FileHandle | undefined) => {
  try {
    await file?.close();
  } catch {
    /* No port/success is returned after a close error. */
  }
};
const failure = (): RootNonceOpen =>
  Object.freeze({ status: 'UNKNOWN', executionAuthority: 'NONE' });

/** Local monotonic nonce storage only. Neither files nor this port grant Hosted authority.
 * No release, expiry reuse, restore, lease rehydration or automatic resume exists.
 * Root must supply a non-ephemeral trusted root; malicious same-UID/root changes,
 * filesystem rollback/cloning and hardware durability are outside this boundary.
 */
export const createHostedRootNonce = async (
  input: RootNonceInput,
): Promise<RootNonceOpen> => {
  let root: RootNonceInput;
  try {
    assertNonceData(input);
    root = nonceInputSchema.parse(input);
  } catch {
    return failure();
  }
  const uid = process.getuid?.();
  if (uid === undefined || resolve(root.storeRoot) !== root.storeRoot)
    return failure();
  const armPath = join(root.storeRoot, root.nonceSha256 + '.intent.json');
  const recordPath = join(
    root.storeRoot,
    root.nonceSha256 + '.reservation.json',
  );
  const expectedArm = nonceArmSchema.parse({
    schemaVersion: 1,
    kind: 'ROOT_NONCE_ATTEMPT',
    authority: 'NON_AUTHORITY',
    nonceSha256: root.nonceSha256,
    approvalSha256: root.approvalSha256,
  });
  let pinned: BigIntStats | undefined;
  const ancestors = async () => {
    let path: string = sep;
    const result = new Map<string, BigIntStats>();
    const parts = root.storeRoot.split(sep).filter(Boolean);
    requireValue(parts.length > 0 && parts.length <= 64);
    for (const part of parts) {
      path = join(path, part);
      const s = await fs.lstat(path, { bigint: true });
      requireValue(s.isDirectory() && !s.isSymbolicLink());
      result.set(path, s);
    }
    requireValue(
      result.size <= 64 &&
        (await fs.realpath(root.storeRoot)) === root.storeRoot,
    );
    const s = result.get(root.storeRoot);
    requireValue(s?.uid === BigInt(uid) && (s.mode & 0o7777n) === 0o700n);
    return result;
  };
  const openRoot = async () => {
    const before = await ancestors();
    const dir = await fs.open(
      root.storeRoot,
      constants.O_RDONLY |
        constants.O_DIRECTORY |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
    );
    try {
      const actual = await dir.stat({ bigint: true });
      const named = before.get(root.storeRoot);
      if (!named) throw Error('ROOT_NONCE_INVALID');
      requireValue(same(named, actual) && (!pinned || same(pinned, actual)));
      const check = async () => {
        const after = await ancestors();
        requireValue(before.size === after.size);
        for (const [path, s] of before) {
          const named = after.get(path);
          if (!named) throw Error('ROOT_NONCE_INVALID');
          requireValue(same(s, named));
        }
        requireValue(same(actual, await dir.stat({ bigint: true })));
      };
      await check();
      return { dir, actual, check };
    } catch (error) {
      await quietClose(dir);
      throw error;
    }
  };
  const regular = (s: BigIntStats) => {
    requireValue(
      s.isFile() &&
        s.uid === BigInt(uid) &&
        (s.mode & 0o7777n) === 0o600n &&
        s.nlink === 1n &&
        s.size <= BigInt(nonceRecordBytes),
    );
  };
  const checkFile = async (
    file: fs.FileHandle,
    path: string,
    expected?: BigIntStats,
  ) => {
    const s = await file.stat({ bigint: true });
    regular(s);
    const named = await fs.lstat(path, { bigint: true });
    regular(named);
    requireValue(
      same(s, named) &&
        s.size === named.size &&
        (!expected || same(expected, s)),
    );
    return s;
  };
  const read = async (path: string) => {
    let file: fs.FileHandle | undefined;
    try {
      const named = await fs.lstat(path, { bigint: true });
      regular(named);
      file = await fs.open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const before = await checkFile(file, path, named);
      const bytes = Buffer.alloc(nonceRecordBytes + 1);
      let length = 0;
      while (length < bytes.length) {
        const row = await file.read(bytes, length, bytes.length - length, null);
        if (row.bytesRead === 0) break;
        length += row.bytesRead;
      }
      const after = await checkFile(file, path, before);
      requireValue(
        length > 0 &&
          length <= nonceRecordBytes &&
          BigInt(length) === before.size &&
          before.size === after.size &&
          before.mtimeNs === after.mtimeNs &&
          before.ctimeNs === after.ctimeNs,
      );
      const value = decodeNonceRecord(bytes.subarray(0, length));
      await file.close();
      file = undefined;
      return value;
    } finally {
      await quietClose(file);
    }
  };
  const write = async (
    path: string,
    value: unknown,
    directory: Awaited<ReturnType<typeof openRoot>>,
  ) => {
    const bytes = encodeNonceRecord(value);
    let file: fs.FileHandle | undefined;
    try {
      await directory.check();
      file = await fs.open(
        path,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK,
        0o600,
      );
      const initial = await checkFile(file, path);
      await file.writeFile(bytes);
      await file.sync();
      const written = await checkFile(file, path, initial);
      requireValue(written.size === BigInt(bytes.length));
      await directory.dir.sync();
      await directory.check();
      const settled = await checkFile(file, path, written);
      requireValue(
        settled.size === written.size &&
          settled.mtimeNs === written.mtimeNs &&
          settled.ctimeNs === written.ctimeNs,
      );
      await file.close();
      file = undefined;
    } finally {
      await quietClose(file);
    }
  };
  let directory: Awaited<ReturnType<typeof openRoot>> | undefined;
  try {
    directory = await openRoot();
    pinned = directory.actual;
    try {
      await fs.lstat(armPath);
    } catch (error) {
      if (!isMissing(error)) throw error;
      // Reject an orphan record before arming; absence alone never proves deployment state.
      try {
        await fs.lstat(recordPath);
        return failure();
      } catch (missing) {
        if (!isMissing(missing)) throw missing;
      }
      await write(armPath, expectedArm, directory);
      await directory.dir.close();
      directory = undefined;
      let state: 'ARMED' | 'WRITING' | 'RESERVED' | 'UNKNOWN' = 'ARMED';
      let accepted: ReadonlyDeep<ReservationBinding> | undefined;
      const isWriting = () => state === 'WRITING';
      const reserveOnce: RootAdmissionPorts['reserveOnce'] = async (
        binding,
      ) => {
        if (state === 'UNKNOWN') return { status: 'UNKNOWN' };
        if (state === 'WRITING') {
          state = 'UNKNOWN';
          return { status: 'UNKNOWN' };
        }
        const previous = state;
        state = 'WRITING';
        let current: Awaited<ReturnType<typeof openRoot>> | undefined;
        try {
          assertNonceData(binding);
          const parsed = nonceBindingSchema.parse(binding);
          requireValue(
            parsed.nonceSha256 === root.nonceSha256 &&
              parsed.approvalSha256 === root.approvalSha256,
          );
          current = await openRoot();
          requireValue(
            isDeepStrictEqual(
              nonceArmSchema.parse(await read(armPath)),
              expectedArm,
            ),
          );
          if (previous === 'RESERVED') {
            const saved = nonceReservationSchema.parse(await read(recordPath));
            requireValue(
              isDeepStrictEqual(saved.binding, parsed) &&
                isDeepStrictEqual(accepted, parsed),
            );
            await current.check();
            await current.dir.close();
            current = undefined;
            if (!isWriting()) return { status: 'UNKNOWN' };
            state = 'RESERVED';
            return { status: 'ALREADY_RESERVED' };
          }
          await write(
            recordPath,
            {
              schemaVersion: 1,
              kind: 'ROOT_NONCE_RESERVATION',
              authority: 'NON_AUTHORITY',
              binding: parsed,
            },
            current,
          );
          await current.check();
          await current.dir.close();
          current = undefined;
          if (!isWriting()) return { status: 'UNKNOWN' };
          accepted = parsed;
          state = 'RESERVED';
          return { status: 'RESERVED' };
        } catch {
          state = 'UNKNOWN';
          return { status: 'UNKNOWN' };
        } finally {
          await quietClose(current?.dir);
        }
      };
      return Object.freeze({
        status: 'READY',
        executionAuthority: 'NONE',
        reserveOnce,
      });
    }
    requireValue(
      isDeepStrictEqual(nonceArmSchema.parse(await read(armPath)), expectedArm),
    );
    const record = nonceReservationSchema.parse(await read(recordPath));
    requireValue(
      record.binding.nonceSha256 === root.nonceSha256 &&
        record.binding.approvalSha256 === root.approvalSha256,
    );
    await directory.check();
    await directory.dir.close();
    directory = undefined;
    return Object.freeze({
      status: 'ALREADY_RESERVED',
      executionAuthority: 'NONE',
    });
  } catch {
    return failure();
  } finally {
    await quietClose(directory?.dir);
  }
};
