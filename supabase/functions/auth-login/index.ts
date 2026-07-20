import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  ACCOUNT_PATTERN,
  CLASS_CODE_PATTERN,
  normalizeAccount,
  normalizeClassCode,
  sha256Hex,
} from '../_shared/account.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// 防列舉：帳號不存在、角色不符、班級不符、密碼錯誤一律同一回應。
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

  const { account, password, portal, classCode } = payload;
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role')
    .eq('login_account', normalizedAccount)
    .maybeSingle();
  if (profileError || !profile) return invalidCredentials();
  if (profile.role !== portalValue) return invalidCredentials();

  if (portalValue === 'teacher') {
    if (typeof classCode !== 'string') return invalidCredentials();
    const normalizedCode = normalizeClassCode(classCode);
    if (!CLASS_CODE_PATTERN.test(normalizedCode)) return invalidCredentials();

    const codeHash = `\\x${await sha256Hex(normalizedCode)}`;
    const { data: classrooms, error: classroomError } = await admin
      .from('classrooms')
      .select('id, join_code_hash')
      .eq('owner_teacher_id', profile.id)
      .eq('status', 'active');
    if (classroomError) return invalidCredentials();
    const ownsClassroom = (classrooms ?? []).some(
      (row) => row.join_code_hash === codeHash,
    );
    if (!ownsClassroom) return invalidCredentials();
  }

  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(profile.id);
  const email = userData?.user?.email;
  if (userError || !email) return invalidCredentials();

  const grant = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!grant.ok) return invalidCredentials();

  const session = await grant.json();
  return jsonResponse(200, { session });
});
