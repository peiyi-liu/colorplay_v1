// 帳號制認證共同規則（ADR 0003 定案版）。前端 zod 提供即時提示，
// 此處為權威判定：所有 Edge Function 一律以本檔為準。

export const ACCOUNT_PATTERN = /^[a-z0-9]{3,20}$/;

export const normalizeAccount = (value: string): string =>
  value.trim().toLowerCase();

// 6–12 碼、至少一個小寫與一個大寫、不含空白。
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])\S{6,12}$/;

export const CLASS_CODE_PATTERN = /^[0-9A-F]{16}$/;

export const normalizeClassCode = (value: string): string =>
  value.trim().toUpperCase().replace(/-/g, '');

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const EMOJI_PATTERN = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/u;

// 起始不雅字清單（owner 可持續擴充）；以小寫比對包含關係。
const BANNED_NICKNAME_TERMS = [
  '幹',
  '媽的',
  '他媽',
  '她媽',
  '操你',
  '肏',
  '靠北',
  '靠腰',
  '白癡',
  '白痴',
  '智障',
  '腦殘',
  '婊',
  '賤',
  '雞掰',
  '機掰',
  '龜兒子',
  '王八蛋',
  '混蛋',
  '去死',
  '死全家',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'pussy',
  'whore',
  'slut',
];

export type NicknameVerdict =
  | { ok: true; nickname: string }
  | {
      ok: false;
      reason: 'NICKNAME_LENGTH' | 'NICKNAME_EMOJI' | 'NICKNAME_BANNED';
    };

export function validateNickname(raw: string): NicknameVerdict {
  const nickname = raw.trim();
  if (nickname.length < 2 || nickname.length > 16) {
    return { ok: false, reason: 'NICKNAME_LENGTH' };
  }
  if (EMOJI_PATTERN.test(nickname)) {
    return { ok: false, reason: 'NICKNAME_EMOJI' };
  }
  const lowered = nickname.toLowerCase();
  if (BANNED_NICKNAME_TERMS.some((term) => lowered.includes(term))) {
    return { ok: false, reason: 'NICKNAME_BANNED' };
  }
  return { ok: true, nickname };
}
