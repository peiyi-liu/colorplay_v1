export type LocalAdminEnvironment = Readonly<{
  serviceRoleKey: string;
  url: string;
}>;

const localApiUrl = 'http://127.0.0.1:54321';
const localKeyPattern = /^[A-Za-z0-9._-]+$/u;

// Admin seeding defaults to the local stack only. Seeding a hosted project
// requires the explicit SEED_REMOTE_CONFIRM opt-in naming the exact project
// ref, so a leftover remote URL in the environment can never be seeded by
// accident.
export const readLocalAdminEnvironment = (
  environment: NodeJS.ProcessEnv,
): LocalAdminEnvironment => {
  const url = environment.SUPABASE_URL;
  const serviceRoleKey =
    environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) throw new Error('LOCAL_ADMIN_ENV_MISSING');
  if (!localKeyPattern.test(serviceRoleKey)) {
    throw new Error('LOCAL_ADMIN_ENV_INVALID');
  }
  const remoteConfirm = environment.SEED_REMOTE_CONFIRM;
  const allowedRemoteUrl = remoteConfirm
    ? `https://${remoteConfirm}.supabase.co`
    : undefined;
  if (url !== localApiUrl && url !== allowedRemoteUrl) {
    throw new Error('LOCAL_ADMIN_ENV_INVALID');
  }

  return { serviceRoleKey, url };
};

// Admin identities are a materially different risk class from the demo
// teacher/student fixtures: bootstrapping one grants role='admin' plus a
// self-service-enrollable TOTP factor. spec §12 restricts Admin fixtures to
// genuinely local seeding — the SEED_REMOTE_CONFIRM opt-in above exists for
// the rest of the demo dataset and must never extend to Admin provisioning.
export const isStrictlyLocalAdminUrl = (url: string): boolean =>
  url === localApiUrl;

// Excluding Admin labels from a non-local seed run only stops *this* run
// from creating/promoting them — it says nothing about whether an earlier
// (pre-fix) run already left known-password Admin accounts live on that
// project. The caller must fail closed rather than silently reporting
// success when any of these emails is already present.
export const findPresentAdminFixtureEmails = (
  existingEmails: ReadonlyMap<string, unknown>,
  adminFixtureEmails: readonly string[],
): string[] => adminFixtureEmails.filter((email) => existingEmails.has(email));
