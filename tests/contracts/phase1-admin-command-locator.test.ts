// tests/contracts/phase1-admin-command-locator.test.ts
// Task 13A-4:admin-command 的 exactly one-of 定址、opaque row token 的
// 原樣轉送,以及「進不了 hash 的欄位到不了 DB」。
import { describe, expect, it } from 'vitest';

import { canonicalCommandHashHex } from '../../supabase/functions/_shared/canonical';
import {
  buildHashFields,
  buildRpcArgs,
  COMMAND_POLICIES,
  type CommandPolicy,
  resolveLocator,
} from '../../supabase/functions/_shared/command-policies';

// 政策表以命令名索引,查不到就是測試自己寫錯命令名,直接爆而不是靜默略過
const policyFor = (command: string): CommandPolicy => {
  const policy = COMMAND_POLICIES[command];
  if (!policy) throw new Error(`unknown command policy: ${command}`);
  return policy;
};

const reveal = policyFor('admin_reveal_field');
const deactivate = policyFor('deactivate_admin');

// server 簽發的 token 是 base64url,大小寫有意義
const TOKEN = 'eyJpZCI6IjBjMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDBjMSJ9';
const BASE_REVEAL_ARGS = {
  column: 'full_name',
  domain: 'users',
  purpose: '客訴處理需要核對使用者全名',
  resource: 'profiles',
};

const resolved = (args: Record<string, unknown>) => {
  const resolution = resolveLocator(reveal, args);
  if (!resolution.ok) throw new Error('expected a resolvable locator');
  return resolution.locator;
};

describe('admin-command locator resolution', () => {
  it('accepts exactly one locator', () => {
    expect(resolved({ ...BASE_REVEAL_ARGS, row_id: 'abc' })?.arg).toBe(
      'row_id',
    );
    expect(resolved({ ...BASE_REVEAL_ARGS, row_token: TOKEN })?.arg).toBe(
      'row_token',
    );
  });

  it('rejects both locators at once', () => {
    expect(
      resolveLocator(reveal, {
        ...BASE_REVEAL_ARGS,
        row_id: 'abc',
        row_token: TOKEN,
      }),
    ).toEqual({ ok: false });
  });

  it('rejects a request with no locator at all', () => {
    expect(resolveLocator(reveal, BASE_REVEAL_ARGS)).toEqual({ ok: false });
  });

  it('treats an empty locator string as absent', () => {
    expect(
      resolveLocator(reveal, { ...BASE_REVEAL_ARGS, row_token: '' }),
    ).toEqual({ ok: false });
  });

  it('leaves commands without locators untouched', () => {
    const resolution = resolveLocator(deactivate, {
      target_principal_id: 'AB-CD',
      reason: '目標帳號已離職需要停用',
    });
    expect(resolution).toEqual({ ok: true, locator: null });
  });
});

describe('admin-command canonical hash fields', () => {
  it('passes the opaque token through verbatim', () => {
    const args = { ...BASE_REVEAL_ARGS, row_token: TOKEN };
    const fields = buildHashFields(reveal, resolved(args), args);
    // 不小寫化、不 trim、不解碼 —— 任何「整理」都等於 Edge 在重建定址編碼
    expect(fields.row_token).toBe(TOKEN);
    expect(fields).not.toHaveProperty('row_id');
  });

  it('still lowercases the uuid locator', () => {
    const args = {
      ...BASE_REVEAL_ARGS,
      row_id: 'CC000000-0000-0000-0000-000000000001',
    };
    const fields = buildHashFields(reveal, resolved(args), args);
    expect(fields.row_id).toBe('cc000000-0000-0000-0000-000000000001');
  });

  it('hashes the two locator forms differently for the same row', async () => {
    const tokenArgs = { ...BASE_REVEAL_ARGS, row_token: TOKEN };
    const uuidArgs = {
      ...BASE_REVEAL_ARGS,
      row_id: 'cc000000-0000-0000-0000-000000000001',
    };
    const tokenHash = await canonicalCommandHashHex(
      buildHashFields(reveal, resolved(tokenArgs), tokenArgs),
    );
    const uuidHash = await canonicalCommandHashHex(
      buildHashFields(reveal, resolved(uuidArgs), uuidArgs),
    );
    expect(tokenHash).not.toBe(uuidHash);
  });

  it('is independent of the order the client sent its args in', async () => {
    const forward = {
      column: 'full_name',
      domain: 'users',
      purpose: '客訴處理需要核對使用者全名',
      resource: 'profiles',
      row_token: TOKEN,
    };
    const reversed = {
      row_token: TOKEN,
      resource: 'profiles',
      purpose: '客訴處理需要核對使用者全名',
      domain: 'users',
      column: 'full_name',
    };
    expect(
      await canonicalCommandHashHex(
        buildHashFields(reveal, resolved(forward), forward),
      ),
    ).toBe(
      await canonicalCommandHashHex(
        buildHashFields(reveal, resolved(reversed), reversed),
      ),
    );
  });

  it('strips only ASCII spaces from purpose, matching DB btrim', () => {
    const args = {
      ...BASE_REVEAL_ARGS,
      purpose: '  需要核對全名的理由\n',
      row_token: TOKEN,
    };
    const fields = buildHashFields(reveal, resolved(args), args);
    expect(fields.purpose).toBe('需要核對全名的理由\n');
  });
});

describe('admin-command rpc argument allowlist', () => {
  it('forwards only the hashed fields plus the chosen locator', () => {
    const args = { ...BASE_REVEAL_ARGS, row_token: TOKEN };
    expect(buildRpcArgs(reveal, resolved(args), args)).toEqual({
      p_column: 'full_name',
      p_domain: 'users',
      p_purpose: '客訴處理需要核對使用者全名',
      p_resource: 'profiles',
      p_row_token: TOKEN,
    });
  });

  it('drops args that never entered the canonical hash', () => {
    // 未進 hash 的欄位若能抵達 RPC,receipt 綁定的語意就與實際執行的
    // 請求不一致 —— 那是 §6.2 授權模型的破口,不是便利功能。
    const args = {
      ...BASE_REVEAL_ARGS,
      row_token: TOKEN,
      receipt_id: 'attacker-supplied',
      idempotency_key: 'attacker-supplied',
      row_id: undefined,
      unexpected: 'x',
    };
    const rpcArgs = buildRpcArgs(reveal, resolved(args), args);
    expect(rpcArgs).not.toHaveProperty('p_receipt_id');
    expect(rpcArgs).not.toHaveProperty('p_idempotency_key');
    expect(rpcArgs).not.toHaveProperty('p_unexpected');
    expect(rpcArgs).not.toHaveProperty('p_row_id');
  });

  it('never forwards the unused locator', () => {
    const args = {
      ...BASE_REVEAL_ARGS,
      row_id: 'cc000000-0000-0000-0000-000000000001',
    };
    const rpcArgs = buildRpcArgs(reveal, resolved(args), args);
    expect(rpcArgs).toHaveProperty('p_row_id');
    expect(rpcArgs).not.toHaveProperty('p_row_token');
  });
});
