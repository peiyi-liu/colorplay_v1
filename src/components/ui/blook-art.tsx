/* Blook 角色圖以 stable_code 對應 owner 提供的來源圖，執行期供應 responsive WebP。
   伺服器仍為目錄權威；emoji 欄位僅作未知代碼時的備援顯示。 */
export const BLOOK_ART_CODES = [
  'little_fox',
  'lucky_cat',
  'travel_frog',
  'wise_owl',
  'primary_lion',
  'rainbow_horse',
  'panda_painter',
  'koala_toner',
  'tiger_orange',
  'octo_mixer',
  'robo_blue',
  'pixel_sprite',
  'indigo_dragon',
  'peacock_teal',
  'contrast_bee',
  'cmyk_toucan',
  'neon_axolotl',
  'chameleon_master',
  'gradient_whale',
  'grayscale_wolf',
] as const;

const artCodes = new Set<string>(BLOOK_ART_CODES);

const artPathFor = (stableCode: string): string | undefined =>
  artCodes.has(stableCode) ? `/assets/blooks/${stableCode}` : undefined;

export function BlookArt({
  stableCode,
  emoji,
  size = 64,
  label,
}: {
  stableCode: string;
  emoji?: string | undefined;
  size?: number;
  label?: string | undefined;
}) {
  const artPath = artPathFor(stableCode);
  if (!artPath) {
    return (
      <span
        aria-hidden={label ? undefined : true}
        aria-label={label}
        style={{ fontSize: size * 0.75, lineHeight: 1 }}
      >
        {emoji ?? '?'}
      </span>
    );
  }

  const primarySource = `${artPath}-128.webp`;
  return (
    <img
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      className="blook-art"
      decoding="async"
      height={size}
      loading="lazy"
      sizes={`${String(size)}px`}
      src={primarySource}
      srcSet={`${primarySource} 128w, ${artPath}-256.webp 256w`}
      width={size}
    />
  );
}
