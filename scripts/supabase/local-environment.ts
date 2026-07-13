export type LocalAdminEnvironment = Readonly<{
  serviceRoleKey: string;
  url: string;
}>;

const localApiUrl = 'http://127.0.0.1:54321';
const localKeyPattern = /^[A-Za-z0-9._-]+$/u;

export const readLocalAdminEnvironment = (
  environment: NodeJS.ProcessEnv,
): LocalAdminEnvironment => {
  const url = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) throw new Error('LOCAL_ADMIN_ENV_MISSING');
  if (url !== localApiUrl || !localKeyPattern.test(serviceRoleKey)) {
    throw new Error('LOCAL_ADMIN_ENV_INVALID');
  }

  return { serviceRoleKey, url };
};
