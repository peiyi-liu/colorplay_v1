import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { describe, expect, it } from 'vitest';

const readLocalEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) throw new Error('LOCAL_ENV_MISSING');

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== 'http:' ||
    parsedUrl.hostname !== '127.0.0.1' ||
    parsedUrl.port !== '54321'
  ) {
    throw new Error('LOCAL_ENV_INVALID');
  }

  return { anonKey, serviceKey, url } as const;
};

const { anonKey, serviceKey, url } = readLocalEnvironment();

const email = `mfa.capability.${String(Date.now())}@colorplay.test`;
const password = 'LocalOnly-MfaCapability1!';

interface AmrEntry {
  method: string;
  timestamp: number;
}

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`MISSING_${label}`);
  }
  return value;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split('.');
  if (!payload) throw new Error('JWT_PAYLOAD_MISSING');
  const parsed: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  );
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('JWT_PAYLOAD_INVALID');
  }
  return parsed as Record<string, unknown>;
}

function totpCode(secret: string): string {
  return new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
}

describe('GoTrue MFA capability proof gate (spec §14.5)', () => {
  it('proves enroll/challenge/verify, admin factor APIs, session_id and amr claims', async () => {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const userId = requireValue(created.data.user, 'CREATED_USER').id;

    try {
      const client = createClient(url, anonKey, {
        auth: { persistSession: false },
      });
      const signIn = await client.auth.signInWithPassword({ email, password });
      expect(signIn.error).toBeNull();
      const session = requireValue(signIn.data.session, 'SESSION');

      // 事實 3:JWT 有 session_id 與 amr password timestamp(5 分鐘 primary re-auth 依據)
      const payload = decodeJwtPayload(session.access_token);
      expect(typeof payload.session_id).toBe('string');
      const amrRaw = payload.amr;
      expect(Array.isArray(amrRaw)).toBe(true);
      const amr = (Array.isArray(amrRaw) ? amrRaw : []) as AmrEntry[];
      expect(amr.some((e) => e.method === 'password' && e.timestamp > 0)).toBe(
        true,
      );

      // 事實 1:user-scoped enroll 回傳 TOTP secret;challenge+verify 成功
      const enroll = await client.auth.mfa.enroll({ factorType: 'totp' });
      expect(enroll.error).toBeNull();
      const enrollData = requireValue(enroll.data, 'ENROLL_DATA');
      if (!('totp' in enrollData)) throw new Error('ENROLL_NOT_TOTP');
      const factorId = enrollData.id;
      const secret = enrollData.totp.secret;
      expect(secret.length).toBeGreaterThan(0);

      const challenge = await client.auth.mfa.challenge({ factorId });
      expect(challenge.error).toBeNull();
      const challengeId = requireValue(challenge.data, 'CHALLENGE_DATA').id;
      const verify = await client.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode(secret),
      });
      expect(verify.error).toBeNull();

      // 事實 4:verify 後 AAL 提升
      const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      expect(aal.data?.currentLevel).toBe('aal2');

      // 事實 2:admin API 可列出與刪除 factor(reset saga step 2 依據)
      const listed = await admin.auth.admin.mfa.listFactors({ userId });
      expect(listed.error).toBeNull();
      const listedFactors = requireValue(listed.data, 'LISTED_FACTORS').factors;
      const verified = listedFactors.filter((f) => f.status === 'verified');
      expect(verified.map((f) => f.id)).toEqual([factorId]);

      const removed = await admin.auth.admin.mfa.deleteFactor({
        userId,
        id: factorId,
      });
      expect(removed.error).toBeNull();
      const relisted = await admin.auth.admin.mfa.listFactors({ userId });
      const relistedFactors = requireValue(
        relisted.data,
        'RELISTED_FACTORS',
      ).factors;
      expect(
        relistedFactors.filter((f) => f.status === 'verified'),
      ).toHaveLength(0);
    } finally {
      const deleted = await admin.auth.admin.deleteUser(userId);
      expect(deleted.error).toBeNull();
    }
  });
});
