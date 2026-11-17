import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import {
  validateExecutionProfile,
  linuxExecutionProfileSchema,
  requireExecutionProfile,
} from './execution-profile';
import {
  ROOT_RUNTIME_DIRECTORY,
  profileRuntimeDescriptorSchema,
  rootBytesSha256,
  linuxClosureNames,
  approveRootHelperClosure,
  rootHelperFailure,
  type RootExecutable,
  type RootHelperAuthority,
} from './root-helper-contracts';
export interface ProfileRuntimeIo {
  platform?: string;
  read(path: string, maximum: number): Promise<string>;
  execute?(
    helper: RootExecutable,
    args: readonly string[],
    input: unknown,
    signal: AbortSignal,
    authority?: RootHelperAuthority,
  ): Promise<unknown>;
}
export type ProfileVerificationPhase =
  'PROFILE_META' | 'CLOSURE_META' | 'HELPER_BATCH';
export type ProfileVerificationObserver = (
  phase: ProfileVerificationPhase,
  state: 'ENTERED' | 'COMPLETED' | 'FAILED',
) => void;
const replySchema = z.strictObject({
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  challenge: z.string().regex(/^[a-f0-9]{32}$/u),
  observed: linuxExecutionProfileSchema.pick({
    host: true,
    identity: true,
    backend: true,
  }),
});
export const loadExecutionProfileRuntime = async (
  input: {
    sourceRevision: string;
    profileSha256: string | undefined;
    descriptor: unknown;
    databaseIdentitySha256: string;
    helperHashes: Readonly<Record<string, string>>;
  },
  io: ProfileRuntimeIo,
  signal: AbortSignal,
) => {
  const platform = io.platform ?? process.platform;
  const isAborted = () => signal.aborted;
  if (input.profileSha256 === undefined) {
    if (input.descriptor !== undefined || platform !== 'darwin')
      return rootHelperFailure();
    return undefined;
  }
  if (platform !== 'linux' || !io.execute || isAborted())
    return rootHelperFailure();
  const descriptor = profileRuntimeDescriptorSchema.parse(input.descriptor);
  const profileBytes = await io.read(
    join(ROOT_RUNTIME_DIRECTORY, 'execution-profile.json'),
    32768,
  );
  if (rootBytesSha256(profileBytes) !== input.profileSha256)
    return rootHelperFailure();
  const closureBytes = await io.read(
    join(ROOT_RUNTIME_DIRECTORY, 'execution-profile-helper-closure.json'),
    32768,
  );
  const inspect = async (observer?: ProfileVerificationObserver) => {
    let observable = observer !== undefined;
    const emit = (
      phase: ProfileVerificationPhase,
      state: 'ENTERED' | 'COMPLETED' | 'FAILED',
    ) => {
      if (!observable) return;
      try {
        observer?.(phase, state);
      } catch {
        observable = false;
      }
    };
    if (isAborted()) return rootHelperFailure();
    const metadata = async (
      phase: 'PROFILE_META' | 'CLOSURE_META',
      name: string,
      valid: (value: string) => boolean,
    ) => {
      emit(phase, 'ENTERED');
      try {
        const value = await io.read(join(ROOT_RUNTIME_DIRECTORY, name), 32768);
        if (!valid(value)) return rootHelperFailure();
        emit(phase, 'COMPLETED');
        return value;
      } catch (error) {
        emit(phase, 'FAILED');
        throw error;
      }
    };
    const metadataResults = await Promise.allSettled([
      metadata(
        'PROFILE_META',
        'execution-profile.json',
        (value) => rootBytesSha256(value) === input.profileSha256,
      ),
      metadata(
        'CLOSURE_META',
        'execution-profile-helper-closure.json',
        (value) => value === closureBytes,
      ),
    ] as const);
    for (const result of metadataResults)
      if (result.status === 'rejected') throw result.reason;
    emit('HELPER_BATCH', 'ENTERED');
    try {
      const results = await Promise.allSettled(
        linuxClosureNames.map(
          async (name) =>
            await io.read(join(ROOT_RUNTIME_DIRECTORY, name), 131072),
        ),
      );
      const observed: Record<string, string> = {};
      for (const [index, result] of results.entries()) {
        const name = linuxClosureNames[index];
        if (!name || result.status !== 'fulfilled') return rootHelperFailure();
        observed[name] = rootBytesSha256(result.value);
      }
      const closure = approveRootHelperClosure(
        closureBytes,
        descriptor.helperClosureSha256,
        input.sourceRevision,
        input.profileSha256 ?? rootHelperFailure(),
        observed,
      );
      for (const [name, hash] of Object.entries(input.helperHashes))
        if (
          !(name in closure.closure.files) ||
          Reflect.get(closure.closure.files, name) !== hash
        )
          return rootHelperFailure();
      if (isAborted()) return rootHelperFailure();
      emit('HELPER_BATCH', 'COMPLETED');
      return closure;
    } catch (error) {
      emit('HELPER_BATCH', 'FAILED');
      throw error;
    }
  };
  const closure = await inspect(),
    challenge = randomBytes(16).toString('hex');
  let text: unknown;
  try {
    text = await io.execute(
      'execution-profile-preflight.py',
      [input.sourceRevision, input.profileSha256, challenge],
      null,
      signal,
      closure,
    );
  } finally {
    await inspect();
  }
  const reply = replySchema.parse(
    typeof text === 'string' ? JSON.parse(text) : text,
  );
  if (
    reply.sourceRevision !== input.sourceRevision ||
    reply.challenge !== challenge
  )
    return rootHelperFailure();
  const authority = validateExecutionProfile(profileBytes, {
    expectedSha256: input.profileSha256,
    observed: reply.observed,
  });
  requireExecutionProfile(
    input.profileSha256,
    authority,
    input.databaseIdentitySha256,
  );
  return Object.freeze({ authority, closure, verify: inspect });
};
export type ProfileRuntime = Awaited<
  ReturnType<typeof loadExecutionProfileRuntime>
>;
