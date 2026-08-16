export const EM_DASH = '—';

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? EM_DASH : `${value.toFixed(1)}%`;

const chineseDigits = [
  '零',
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
] as const;

const formatChineseInteger = (value: number): string => {
  if (!Number.isInteger(value) || value <= 0 || value >= 100)
    return String(value);
  if (value < 10) return chineseDigits[value] ?? String(value);
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  const tensLabel = tens === 1 ? '' : (chineseDigits[tens] ?? String(tens));
  const onesLabel = ones === 0 ? '' : (chineseDigits[ones] ?? String(ones));
  return `${tensLabel}十${onesLabel}`;
};

export const formatChapterLabel = (
  sortOrder: number,
  title: string,
): string => {
  const cleanTitle = title
    .replace(/^第\s*(?:\d+|[零一二三四五六七八九十]+)\s*章\s*/u, '')
    .trim();
  return `第${formatChineseInteger(sortOrder)}章 ${cleanTitle}`;
};

export const formatSubtopicLabel = (
  code: string | null | undefined,
  title: string | null | undefined,
): string => {
  const cleanTitle = title?.trim() ?? '';
  const publicCode = code?.match(/(?:^|sheet-)(\d+-\d+)(?:-all)?$/u)?.[1];
  if (!publicCode) return cleanTitle || EM_DASH;
  if (cleanTitle.startsWith(publicCode)) return cleanTitle;
  return cleanTitle ? `${publicCode} ${cleanTitle}` : publicCode;
};
