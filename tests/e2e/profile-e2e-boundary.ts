const localSupabaseOrigin = 'http://127.0.0.1:54321';
const ownProfileSelect = 'id,display_name,role,timezone';

type PublicEnvironment = Readonly<Record<string, string | undefined>>;

export function readLocalProfileEnvironment(environment: PublicEnvironment) {
  const url = environment.SUPABASE_URL;
  const anonKey = environment.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('TASK_14_LOCAL_PUBLIC_ENV_MISSING');
  if (environment.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('TASK_14_SERVICE_ROLE_MUST_BE_UNSET');
  }

  if (url !== localSupabaseOrigin) {
    throw new Error('TASK_14_LOCAL_PUBLIC_ENV_INVALID');
  }
  if (
    environment.VITE_SUPABASE_URL !== url ||
    environment.VITE_SUPABASE_ANON_KEY !== anonKey
  ) {
    throw new Error('TASK_14_BROWSER_PUBLIC_ENV_MISMATCH');
  }

  return { anonKey, url } as const;
}

export function isLocalOwnProfileResponseUrl(responseUrl: string): boolean {
  const url = new URL(responseUrl);
  return (
    url.origin === localSupabaseOrigin &&
    url.pathname === '/rest/v1/profiles' &&
    url.searchParams.get('select') === ownProfileSelect
  );
}
