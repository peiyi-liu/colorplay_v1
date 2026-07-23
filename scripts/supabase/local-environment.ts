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
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;

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
