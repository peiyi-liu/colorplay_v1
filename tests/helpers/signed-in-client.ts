import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';

type Credentials = Readonly<{ email: string; password: string }>;

const STAGING_SUPABASE_HOSTNAME = 'onkxnkzeixpezetkmocf.supabase.co';

const isLocalUrl = (parsedUrl: URL) =>
  parsedUrl.protocol === 'http:' &&
  parsedUrl.hostname === '127.0.0.1' &&
  parsedUrl.port === '54321' &&
  parsedUrl.pathname === '/' &&
  parsedUrl.search === '' &&
  parsedUrl.hash === '' &&
  !parsedUrl.username &&
  !parsedUrl.password;

const isAcceptedStagingUrl = (parsedUrl: URL) =>
  process.env.PLAYWRIGHT_ACCEPTANCE === 'on' &&
  process.env.COLORPLAY_DEPLOYMENT_ENVIRONMENT === 'staging' &&
  parsedUrl.protocol === 'https:' &&
  parsedUrl.hostname === STAGING_SUPABASE_HOSTNAME &&
  parsedUrl.port === '' &&
  parsedUrl.pathname === '/' &&
  parsedUrl.search === '' &&
  parsedUrl.hash === '' &&
  !parsedUrl.username &&
  !parsedUrl.password;

const readPublicEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('LOCAL_PUBLIC_ENV_MISSING');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('LOCAL_PUBLIC_ENV_INVALID');
  }

  if (!isLocalUrl(parsedUrl) && !isAcceptedStagingUrl(parsedUrl)) {
    throw new Error('LOCAL_PUBLIC_ENV_INVALID');
  }

  return { anonKey, url } as const;
};

export async function signedInClient(
  credentials: Credentials,
): Promise<SupabaseClient<Database>> {
  const { anonKey, url } = readPublicEnvironment();

  let client: SupabaseClient<Database>;
  try {
    client = createClient<Database>(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword(credentials);
    if (error) throw error;
  } catch {
    throw new Error('LOCAL_SIGN_IN_FAILED');
  }

  return client;
}
