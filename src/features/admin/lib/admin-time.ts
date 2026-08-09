// AGENTS.md:「時間存 UTC 顯示 `Asia/Taipei`」。稽核/健康頁若用瀏覽器預設時區,
// 海外裝置會查錯區間、也會把事故時間顯示成別的時刻 —— 對稽核來說是實質錯誤。
// 台北自 1945 年起固定 UTC+8 且無日光節約,直接用固定 offset 即可,不必做
// Intl 來回換算。
const TAIPEI_TIME_ZONE = 'Asia/Taipei';
const TAIPEI_UTC_OFFSET = '+08:00';

/** 顯示用:任何 UTC timestamp 一律以 Asia/Taipei 呈現。 */
export function formatAdminTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('zh-TW', { timeZone: TAIPEI_TIME_ZONE });
}

/**
 * `<input type="datetime-local">` 的值沒有時區資訊,`new Date(value)` 會用
 * **瀏覽器**時區解讀。稽核查詢的區間必須是台北時間,所以明確補上 +08:00。
 */
export function taipeiLocalToIso(value: string): string | null {
  if (value === '') return null;
  // datetime-local 可能是 `YYYY-MM-DDTHH:mm` 或含秒
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const parsed = new Date(`${withSeconds}${TAIPEI_UTC_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
