/**
 * 內容匯入器共用工具：CSV 解析、決定性 UUID、SQL 字面值。
 * 由 import-questions.mjs 與 import-review-cards.mjs 共用。
 */
import { createHash } from 'node:crypto';

export function deterministicUuid(kind, key) {
  const hex = createHash('md5')
    .update(`colorplay:${kind}:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function stableHash(value) {
  return createHash('md5').update(value).digest('hex').slice(0, 12);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function sqlText(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
