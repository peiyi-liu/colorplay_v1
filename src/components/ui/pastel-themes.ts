/** 淡彩卡片系統的六組章節主題(owner 0728 晚間淡彩批)。
 *  色值只存在 tokens.css(--pastel-<theme>-*),元件以 data-theme 掛載,
 *  這裡僅維護主題名稱與序號對應,避免 hex 散落元件。 */
export const pastelThemes = [
  'blue',
  'purple',
  'yellow',
  'green',
  'coral',
  'cyan',
] as const;

export type PastelTheme = (typeof pastelThemes)[number];

/** 依章節/徽章序號循環取得主題(1 章=blue、2 章=purple…7 章回到 blue)。 */
export const pastelThemeForIndex = (index: number): PastelTheme =>
  pastelThemes[
    ((index % pastelThemes.length) + pastelThemes.length) % pastelThemes.length
  ] ?? 'blue';
