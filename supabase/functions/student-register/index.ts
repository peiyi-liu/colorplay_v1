import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  ACCOUNT_PATTERN,
  CLASS_CODE_PATTERN,
  normalizeAccount,
  normalizeClassCode,
  PASSWORD_PATTERN,
  sha256Hex,
  validateNickname,
} from '../_shared/account.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const failure = (status: number, error: string) =>
  jsonResponse(status, { error });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED');

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return failure(400, 'INVALID_JSON');
  }

  const { fullName, nickname, classCode, account, password } = payload;
  if (
    typeof fullName !== 'string' ||
    typeof nickname !== 'string' ||
    typeof classCode !== 'string' ||
    typeof account !== 'string' ||
    typeof password !== 'string'
  ) {
    return failure(400, 'REGISTER_INVALID_INPUT');
  }

  const trimmedFullName = fullName.trim();
  if (trimmedFullName.length < 1 || trimmedFullName.length > 40) {
    return failure(400, 'REGISTER_INVALID_INPUT');
  }
  const nicknameVerdict = validateNickname(nickname);
  if (!nicknameVerdict.ok) return failure(400, nicknameVerdict.reason);

  const normalizedAccount = normalizeAccount(account);
  if (!ACCOUNT_PATTERN.test(normalizedAccount)) {
    return failure(400, 'REGISTER_INVALID_INPUT');
  }
  if (!PASSWORD_PATTERN.test(password)) return failure(400, 'WEAK_PASSWORD');

  const normalizedCode = normalizeClassCode(classCode);
  if (!CLASS_CODE_PATTERN.test(normalizedCode)) {
    return failure(400, 'INVALID_CLASSROOM_CODE');
  }

  // 必須帶 OTP 驗證後的使用者 session。
  const authHeader = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userResult, error: userError } =
    await userClient.auth.getUser();
  const user = userResult?.user;
  if (userError || !user) return failure(401, 'AUTH_REQUIRED');
  if (!user.email_confirmed_at) return failure(403, 'EMAIL_NOT_VERIFIED');

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 帳號唯一（自己重複送出視為同帳號覆寫）。
  const { data: existingAccount, error: accountError } = await admin
    .from('profiles')
    .select('id')
    .eq('login_account', normalizedAccount)
    .maybeSingle();
  if (accountError) return failure(500, 'REGISTER_FAILED');
  if (existingAccount && existingAccount.id !== user.id) {
    return failure(409, 'ACCOUNT_TAKEN');
  }

  // 班級序號 → classroom（與 join_classroom 相同的 sha256 比對）。
  const codeHash = `\\x${await sha256Hex(normalizedCode)}`;
  const { data: classroom, error: classroomError } = await admin
    .from('classrooms')
    .select('id')
    .eq('status', 'active')
    .eq('join_code_hash', codeHash)
    .maybeSingle();
  if (classroomError) return failure(500, 'REGISTER_FAILED');
  if (!classroom) return failure(400, 'INVALID_CLASSROOM_CODE');

  const { data: membership, error: membershipError } = await admin
    .from('classroom_members')
    .select('classroom_id')
    .eq('classroom_id', classroom.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError) return failure(500, 'REGISTER_FAILED');

  if (!membership) {
    // 以學生本人身分走既有 RPC，保留角色檢查與審計語意。
    const { error: joinError } = await userClient.rpc('join_classroom', {
      p_join_code: normalizedCode,
      p_request_id: crypto.randomUUID(),
    });
    if (joinError) {
      return joinError.message.includes('INVALID_CLASSROOM_CODE')
        ? failure(400, 'INVALID_CLASSROOM_CODE')
        : failure(500, 'REGISTER_FAILED');
    }
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(
    user.id,
    { password },
  );
  if (passwordError) return failure(500, 'REGISTER_FAILED');

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      display_name: nicknameVerdict.nickname,
      full_name: trimmedFullName,
      login_account: normalizedAccount,
    })
    .eq('id', user.id);
  if (profileError) {
    return profileError.code === '23505'
      ? failure(409, 'ACCOUNT_TAKEN')
      : failure(500, 'REGISTER_FAILED');
  }

  return jsonResponse(200, { ok: true });
});
