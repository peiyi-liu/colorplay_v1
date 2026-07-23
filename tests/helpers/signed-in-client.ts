import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';

type Credentials = Readonly<{ email: string; password: string }>;

const readLocalPublicEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('LOCAL_PUBLIC_ENV_MISSING');

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== 'http:' ||
    parsedUrl.hostname !== '127.0.0.1' ||
    parsedUrl.port !== '54321'
  ) {
    throw new Error('LOCAL_PUBLIC_ENV_INVALID');
  }

  return { anonKey, url } as const;
};

export async function signedInClient(
  credentials: Credentials,
): Promise<SupabaseClient<Database>> {
  const { anonKey, url } = readLocalPublicEnvironment();
  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword(credentials);

  if (error) throw new Error('LOCAL_SIGN_IN_FAILED');
  return client;
}
