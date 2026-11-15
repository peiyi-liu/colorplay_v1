import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
export const ROOT_RUNTIME_DIRECTORY = resolve(
  import.meta.dirname,
  '../../../live-recovery-runtime/whole-site-261115',
);
export const functionalHelperNames = [
  'functional-preflight.py',
  'canonical-baseline.py',
  'media-readback.py',
] as const;
export const capacityHelperNames = [
  'capacity-root-readonly.py',
  'capacity-registration-readback.py',
  'capacity-retention-readback.py',
  'capacity-preflight-readback.py',
] as const;
export const linuxExecutableNames = [
  ...functionalHelperNames,
  ...capacityHelperNames,
  'execution-profile-preflight.py',
  'linux-host-sample.py',
  'backend-cgroup-sample.py',
] as const;
export const linuxLibraryNames = [
  'linux_proc.py',
  'linux_cgroup.py',
  'linux_runtime_common.py',
] as const;
export const linuxClosureNames = [
  ...linuxExecutableNames,
  ...linuxLibraryNames,
] as const;
export const linuxScopeHelperNames = [
  ...functionalHelperNames,
  'execution-profile-preflight.py',
  'linux-host-sample.py',
  'backend-cgroup-sample.py',
  ...linuxLibraryNames,
] as const;
export type RootExecutable =
  (typeof linuxExecutableNames)[number] | 'host-sample.py' | 'vm-sample.py';
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const linuxScopeHelpersSchema = z.strictObject({
  'functional-preflight.py': digest,
  'canonical-baseline.py': digest,
  'media-readback.py': digest,
  'execution-profile-preflight.py': digest,
  'linux-host-sample.py': digest,
  'backend-cgroup-sample.py': digest,
  'linux_proc.py': digest,
  'linux_cgroup.py': digest,
  'linux_runtime_common.py': digest,
});
export const profileRuntimeDescriptorSchema = z.strictObject({
  helperClosureSha256: digest,
});
export const helperClosureSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  executionProfileSha256: digest,
  files: linuxScopeHelpersSchema.extend({
    'capacity-root-readonly.py': digest,
    'capacity-registration-readback.py': digest,
    'capacity-retention-readback.py': digest,
    'capacity-preflight-readback.py': digest,
  }),
});
export const rootBytesSha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export type RootHelperClosure = z.infer<typeof helperClosureSchema>;
export interface RootHelperAuthority {
  readonly closure: Readonly<RootHelperClosure>;
  readonly sha256: string;
}
const ready = new WeakSet<RootHelperAuthority>();
export const rootHelperFailure = (): never => {
  throw new Error('ROOT_HELPER_INVALID');
};
/** The caller must supply the independently approved closure bytes hash and
 * hashes computed from owned, bounded, non-symlink files, not a scope claim. */
export const approveRootHelperClosure = (
  text: string,
  expectedSha256: string,
  revision: string,
  profile: string,
  observed: Readonly<Record<string, string>>,
): RootHelperAuthority => {
  if (
    Buffer.byteLength(text) > 32768 ||
    rootBytesSha256(text) !== expectedSha256
  )
    return rootHelperFailure();
  const closure = helperClosureSchema.parse(JSON.parse(text));
  if (
    closure.sourceRevision !== revision ||
    closure.executionProfileSha256 !== profile ||
    linuxClosureNames.some((name) => observed[name] !== closure.files[name]) ||
    Object.keys(observed).length !== linuxClosureNames.length
  )
    return rootHelperFailure();
  Object.freeze(closure.files);
  Object.freeze(closure);
  const authority = Object.freeze({ closure, sha256: expectedSha256 });
  ready.add(authority);
  return authority;
};
export const requireRootHelperAuthority = (
  authority: RootHelperAuthority | undefined,
) => {
  if (!authority || !ready.has(authority)) return rootHelperFailure();
  return authority;
};
