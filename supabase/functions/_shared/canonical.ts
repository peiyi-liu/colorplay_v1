// supabase/functions/_shared/canonical.ts
// 與 DB admin_internal_canonical_hash byte-identical 的編碼(Codex 修訂 8):
// key 升冪(ASCII/"C" collation;命令欄位名全為 ASCII)、無空白、
// 值一律 JSON string(JSON.stringify 與 to_json(text) 對字串同標準跳脫,
// 非 ASCII 皆輸出原始 UTF-8)、null 輸出字面 null。
export function canonicalCommandJson(
  fields: Record<string, string | null>,
): string {
  const keys = Object.keys(fields).sort();
  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${
          fields[key] === null ? 'null' : JSON.stringify(fields[key])
        }`,
    )
    .join(',')}}`;
}

export async function canonicalCommandHashHex(
  fields: Record<string, string | null>,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalCommandJson(fields));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
