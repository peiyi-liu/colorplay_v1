import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';
import type { PublicEnv } from '../config/public-env';

let singleton: SupabaseClient<Database> | undefined;

export function getBrowserSupabaseClient(
  env: PublicEnv,
): SupabaseClient<Database> {
  singleton ??= createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  return singleton;
}
