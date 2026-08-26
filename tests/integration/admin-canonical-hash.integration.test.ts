// tests/integration/admin-canonical-hash.integration.test.ts
// 直接 import 生產 Edge 模組(Codex 修訂三-3:測試不得自帶演算法副本;
// 生產編碼漂移時本測試必然失敗)。canonical.ts 只用 Web 標準 API
// (TextEncoder、crypto.subtle),Node 20+/vitest 原生可執行。
// 固定向量涵蓋:Unicode 繁中、引號、null、uuid 字串、email 字串。
// (trim/lowercase 等值正規化住在 admin-command 的政策層,不在本編碼器;
// 其 parity 由 saga 測試的 normalization 案端到端驗證。)
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { canonicalCommandHashHex } from '../../supabase/functions/_shared/canonical';

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

  return { serviceKey, url } as const;
};

const { serviceKey, url } = readLocalEnvironment();

const asStr = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const VECTORS: Record<string, string | null>[] = [
  {
    reason: '目標帳號已離職需要停用',
    target_principal_id: '11111111-1111-1111-1111-111111111111',
  },
  {
    invited_email: 'admin.new@colorplay.test',
    reason: '含 Unicode ✓ 與「引號」的理由字串',
  },
  {
    column: 'full_name',
    domain: 'users',
    purpose: '客訴單 #123 需要核對姓名',
    resource: 'profiles',
    row_id: '22222222-2222-2222-2222-222222222222',
  },
  { operation_id: '33333333-3333-3333-3333-333333333333', reason: null },
  // Task 13A-4:opaque row token 形態。token 是 base64url,大小寫與
  // `-`/`_` 都有意義,任何一端「整理」過就會在這裡失敗。
  {
    column: 'token_balance',
    domain: 'rewards',
    purpose: '稽核需要核對錢包餘額明細',
    resource: 'wallets',
    row_token:
      'eyJ1c2VyX2lkIjoiY2MwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIn0',
  },
];

describe('canonical request hash parity (Edge <-> DB)', () => {
  it('DB recomputation equals TS canonical hash for every vector', async () => {
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    for (const vector of VECTORS) {
      const expected = await canonicalCommandHashHex(vector);
      const db = await service.rpc('svc_admin_canonical_hash_hex', {
        p_fields: vector,
      });
      expect(db.error).toBeNull();
      expect(asStr(db.data)).toBe(expected);
    }
  });
});
