import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';
import type { PublicEnv } from '../config/public-env';

let singleton: SupabaseClient<Database> | undefined;

export function getBrowserSupabaseClient(
  env: PublicEnv,
): SupabaseClient<Database> {
  // sessionStorage：關閉分頁／瀏覽器即結束登入（owner 要求的自動登出），
  // 同分頁重新整理仍可復原 session（E2E-004 refresh recovery）。
  singleton ??= createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { storage: window.sessionStorage },
  });
  return singleton;
}
