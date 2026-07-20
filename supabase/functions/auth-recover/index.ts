import { createClient } from 'npm:@supabase/supabase-js@2';

import { ACCOUNT_PATTERN, normalizeAccount } from '../_shared/account.ts';
import { ALLOWED_ORIGINS, corsHeaders, jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// 防列舉：無論帳號／Email 是否配對成功，一律回相同訊息。
const genericSuccess = () => jsonResponse(200, { ok: true });

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

  const { account, email } = payload;
  if (
    typeof account !== 'string' ||
    typeof email !== 'string' ||
    email.length === 0 ||
    email.length > 254
  ) {
    return genericSuccess();
  }
  const normalizedAccount = normalizeAccount(account);
  if (!ACCOUNT_PATTERN.test(normalizedAccount)) return genericSuccess();

  const origin = request.headers.get('Origin') ?? '';
  const redirectBase = (ALLOWED_ORIGINS as readonly string[]).includes(origin)
    ? origin
    : 'https://colorplay-staging.vercel.app';

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('login_account', normalizedAccount)
    .maybeSingle();
  if (!profile) return genericSuccess();

  const { data: userData } = await admin.auth.admin.getUserById(profile.id);
  const userEmail = userData?.user?.email;
  if (!userEmail || userEmail.toLowerCase() !== email.trim().toLowerCase()) {
    return genericSuccess();
  }

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });
  await anonClient.auth.resetPasswordForEmail(userEmail, {
    redirectTo: `${redirectBase}/reset-password`,
  });

  return genericSuccess();
});
