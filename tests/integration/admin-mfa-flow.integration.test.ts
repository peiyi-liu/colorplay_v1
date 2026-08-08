// tests/integration/admin-mfa-flow.integration.test.ts
// 場景:bootstrap(service)→ begin-enrollment(需 5 分鐘內 password amr)
// → confirm-enrollment → challenge 建 session → 直呼 GoTrue verify 不產生 session
// → 錯碼 5 次 → MFA_LOCKED。需要 service key 與 edge runtime,由
// scripts/test-db.sh 的帶 key 區段執行。
import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe('admin-mfa edge flow', () => {
  const email = `admin.mfa.flow.${Date.now()}@colorplay.test`;
  const password = 'LocalOnly-AdminMfa1!';
  let userId = '';
  let accessToken = '';
  let secret = '';
  let factorId = '';
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  async function invokeMfa(body: Record<string, unknown>) {
    const response = await fetch(`${url}/functions/v1/admin-mfa`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  }

  beforeAll(async () => {
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    userId = created.data.user!.id;
    await service.rpc('svc_admin_bootstrap_identity', {
      p_user_id: userId,
      p_runbook_operation_id: crypto.randomUUID(),
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    accessToken = signIn.data.session!.access_token;
  });

  it('enrolls, confirms, then creates the single privileged session', async () => {
    const begin = await invokeMfa({ action: 'begin-enrollment' });
    expect(begin.status).toBe(200);
    factorId = begin.json.factorId;
    secret = begin.json.totpSecret;

    const code = () =>
      new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
    const confirm = await invokeMfa({
      action: 'confirm-enrollment',
      factorId,
      code: code(),
    });
    expect(confirm.json.outcome).toBe('ok');

    const challenge = await invokeMfa({
      action: 'challenge',
      factorId,
      code: code(),
    });
    expect(challenge.json.outcome).toBe('ok');

    const state = await client.rpc('get_admin_session_state');
    expect((state.data as { state: string }).state).toBe('privileged');
  });

  it('direct GoTrue verify alone never yields a privileged session', async () => {
    // spec §5.3:連 service_role 都不能直接寫 admin_sessions(僅 svc
    // functions 可寫)——先把這個邊界變成正向斷言,再走合法 service path
    // (factor incident isolation)撤銷全部 sessions。
    const directWrite = await service
      .from('admin_sessions')
      .update({
        revoked_at: new Date().toISOString(),
        revoke_reason: 'test_reset',
      })
      .eq('admin_user_id', userId)
      .is('revoked_at', null);
    expect(directWrite.error).not.toBeNull();
    const isolate = await service.rpc('svc_admin_isolate_factor_incident', {
      p_admin_user_id: userId,
      p_correlation_id: 'admin-mfa-flow-test-reset',
    });
    expect(isolate.error).toBeNull();
    const code = new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
    const challenge = await client.auth.mfa.challenge({ factorId });
    const verify = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.data!.id,
      code,
    });
    expect(verify.error).toBeNull();
    const state = await client.rpc('get_admin_session_state');
    expect((state.data as { state: string }).state).not.toBe('privileged');
  });

  it('locks after five consecutive failures', async () => {
    for (let index = 0; index < 5; index += 1) {
      await invokeMfa({ action: 'challenge', factorId, code: '000000' });
    }
    const locked = await invokeMfa({
      action: 'challenge',
      factorId,
      code: '000000',
    });
    expect(locked.json.code).toBe('MFA_LOCKED');
  });
});
