import { createClient } from 'npm:@supabase/supabase-js@2';

import { ACCOUNT_PATTERN, normalizeAccount } from '../_shared/account.ts';
import { readRuntimeSupabaseApiKeys } from '../_shared/api-keys.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const { publishableKey, secretKey } = readRuntimeSupabaseApiKeys((name) =>
  Deno.env.get(name),
);

// 防列舉：帳號不存在、角色不符、密碼錯誤一律同一回應。
const invalidCredentials = () =>
  jsonResponse(401, { error: 'AUTH_INVALID_CREDENTIALS' });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'INVALID_JSON' });
  }

  const { account, password, portal } = payload;
  if (
    typeof account !== 'string' ||
    typeof password !== 'string' ||
    password.length === 0 ||
    password.length > 128
  ) {
    return invalidCredentials();
  }
  const portalValue = portal === 'teacher' ? 'teacher' : 'student';
  const normalizedAccount = normalizeAccount(account);
  if (!ACCOUNT_PATTERN.test(normalizedAccount)) {
    return invalidCredentials();
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  });

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role')
    .eq('login_account', normalizedAccount)
    .maybeSingle();
  if (profileError || !profile) return invalidCredentials();
  // admin 經教師入口登入(spec §3.1);防列舉:所有失敗一律同一回應
  if (
    profile.role !== portalValue &&
    !(portalValue === 'teacher' && profile.role === 'admin')
  ) {
    return invalidCredentials();
  }

  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(profile.id);
  const email = userData?.user?.email;
  if (userError || !email) return invalidCredentials();

  const grant = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!grant.ok) return invalidCredentials();

  const session = await grant.json();
  return jsonResponse(200, { session });
});
