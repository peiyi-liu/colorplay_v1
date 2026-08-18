// supabase/functions/_shared/command-policies.ts
// 命令政策表與請求正規化(spec §8.1、§6.2)。抽出成獨立模組的理由:
// admin-command/index.ts 在載入時就 Deno.serve,無法被單元測試 import;
// 定址選擇與 canonical hash 欄位建構是安全語意的核心,必須可直接測。

export interface CommandLocator {
  /** client args 的鍵名,同時也是 RPC 參數名(加上 p_ 前綴) */
  arg: string;
  /** canonical request hash 的欄位名 */
  hashField: string;
}

export interface CommandPolicy {
  rpc: string;
  freshTotp: boolean;
  /** 固定欄位:同時是 hash 欄位與允許轉送的 RPC 參數 */
  hashFields: string[];
  /** exactly one-of 的定址形態;未定義代表該命令沒有定址參數 */
  locators?: CommandLocator[];
}

// hashFields 與 Task 7 各 RPC 的 canonical hash 欄位集合完全一致
// (reason/purpose 也綁進 hash;Codex 修訂 8)。
export const COMMAND_POLICIES: Record<string, CommandPolicy> = {
  issue_admin_invitation: {
    rpc: 'issue_admin_invitation',
    freshTotp: true,
    hashFields: ['invited_email', 'reason'],
  },
  revoke_admin_invitation: {
    rpc: 'revoke_admin_invitation',
    freshTotp: true,
    hashFields: ['invitation_id', 'reason'],
  },
  deactivate_admin: {
    rpc: 'deactivate_admin',
    freshTotp: true,
    hashFields: ['target_principal_id', 'reason'],
  },
  reactivate_admin: {
    rpc: 'reactivate_admin',
    freshTotp: true,
    hashFields: ['target_principal_id', 'reason'],
  },
  reset_admin_mfa: {
    rpc: 'reset_admin_mfa',
    freshTotp: true,
    hashFields: ['target_principal_id', 'reason'],
  },
  revoke_admin_session: {
    rpc: 'revoke_admin_session',
    freshTotp: true,
    hashFields: ['session_id', 'reason'],
  },
  // reveal 的兩種定址形態(spec §1.3、§7):row_id 只適用具 id 欄的表;
  // row_token 是 admin_list_resource 為每列簽發的 opaque token,Edge 只
  // 原樣轉送與原樣入 hash —— 不解碼、不重建 canonical JSON、不改寫成
  // row_id。兩形態的 hash 欄位名不同,因此 receipt 天然不可跨形態重用。
  admin_reveal_field: {
    rpc: 'admin_reveal_field',
    freshTotp: true,
    hashFields: ['column', 'domain', 'purpose', 'resource'],
    locators: [
      { arg: 'row_id', hashField: 'row_id' },
      { arg: 'row_token', hashField: 'row_token' },
    ],
  },
  reconcile_admin_security_operation: {
    rpc: 'reconcile_admin_security_operation',
    freshTotp: true,
    hashFields: ['operation_id', 'reason'],
  },
};

// uuid 經 ::text 一律輸出小寫連字號,Edge 端先行小寫對齊(修訂 8)。
// row_token 刻意**不在**此集合:base64url 大小寫有意義,一旦小寫化就會
// 與 server 簽發的 token 逐字不符,hash 必然對不上。
const UUID_HASH_FIELDS = new Set([
  'target_principal_id',
  'session_id',
  'invitation_id',
  'operation_id',
  'row_id',
]);

// DB 端 btrim(單參數)僅剝 0x20,不可用 JS trim()(會多剝 \n/\t 等,
// 尾端含換行的 reason 會 hash mismatch 使命令永久失敗)。
const trimAsciiSpaces = (value: string): string =>
  value.replace(/^ +/, '').replace(/ +$/, '');

const isProvided = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  return !(typeof value === 'string' && value === '');
};

export type LocatorResolution =
  { ok: true; locator: CommandLocator | null } | { ok: false };

/**
 * exactly one-of 定址驗證。零個或兩個以上一律拒絕 —— 兩個都給時無法判斷
 * 該綁哪一種 hash,放行等於讓 client 選擇授權語意。
 */
export function resolveLocator(
  policy: CommandPolicy,
  args: Record<string, unknown>,
): LocatorResolution {
  if (!policy.locators) return { ok: true, locator: null };
  const provided = policy.locators.filter((locator) =>
    isProvided(args[locator.arg]),
  );
  const [only] = provided;
  if (provided.length !== 1 || only === undefined) return { ok: false };
  return { ok: true, locator: only };
}

/**
 * canonical request hash 的欄位集合。鍵的排序由 canonical.ts 負責,因此
 * client 送出的 args property 順序不影響結果(冪等不被順序破壞)。
 */
export function buildHashFields(
  policy: CommandPolicy,
  locator: CommandLocator | null,
  args: Record<string, unknown>,
): Record<string, string | null> {
  const sources: { hashField: string; arg: string }[] = policy.hashFields.map(
    (field) => ({ hashField: field, arg: field }),
  );
  if (locator) sources.push({ hashField: locator.hashField, arg: locator.arg });

  const fields: Record<string, string | null> = {};
  for (const source of sources) {
    const raw = args[source.arg];
    if (raw === null || raw === undefined) {
      fields[source.hashField] = null;
      continue;
    }
    let value = String(raw);
    if (source.hashField === 'reason' || source.hashField === 'purpose') {
      value = trimAsciiSpaces(value);
    }
    if (source.hashField === 'invited_email') {
      value = trimAsciiSpaces(value).toLowerCase();
    }
    if (UUID_HASH_FIELDS.has(source.hashField)) value = value.toLowerCase();
    fields[source.hashField] = value;
  }
  return fields;
}

/**
 * 轉送給 RPC 的參數。只允許政策認得的欄位加上這次選中的定址參數 ——
 * 未進 hash 的欄位一律不得抵達 DB,否則 receipt 綁定的語意就會與實際
 * 執行的請求不一致。orchestration 受控參數(receipt_id/idempotency_key)
 * 由呼叫端最後覆寫。
 */
export function buildRpcArgs(
  policy: CommandPolicy,
  locator: CommandLocator | null,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set(policy.hashFields);
  if (locator) allowed.add(locator.arg);
  const rpcArgs: Record<string, unknown> = {};
  for (const name of allowed) {
    if (name in args) rpcArgs[`p_${name}`] = args[name];
  }
  return rpcArgs;
}
