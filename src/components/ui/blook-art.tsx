/* Blook 角色圖以 stable_code 對應 owner 提供的 ref-image PNG。
   伺服器仍為目錄權威；emoji 欄位僅作未知代碼時的備援顯示。 */
const artPaths = {
  little_fox: '/assets/blooks/little_fox.png',
  lucky_cat: '/assets/blooks/lucky_cat.png',
  travel_frog: '/assets/blooks/travel_frog.png',
  wise_owl: '/assets/blooks/wise_owl.png',
  primary_lion: '/assets/blooks/primary_lion.png',
  rainbow_horse: '/assets/blooks/rainbow_horse.png',
  panda_painter: '/assets/blooks/panda_painter.png',
  koala_toner: '/assets/blooks/koala_toner.png',
  tiger_orange: '/assets/blooks/tiger_orange.png',
  octo_mixer: '/assets/blooks/octo_mixer.png',
  robo_blue: '/assets/blooks/robo_blue.png',
  pixel_sprite: '/assets/blooks/pixel_sprite.png',
  indigo_dragon: '/assets/blooks/indigo_dragon.png',
  peacock_teal: '/assets/blooks/peacock_teal.png',
  contrast_bee: '/assets/blooks/contrast_bee.png',
  cmyk_toucan: '/assets/blooks/cmyk_toucan.png',
  neon_axolotl: '/assets/blooks/neon_axolotl.png',
  chameleon_master: '/assets/blooks/chameleon_master.png',
  gradient_whale: '/assets/blooks/gradient_whale.png',
  grayscale_wolf: '/assets/blooks/grayscale_wolf.png',
} as const;

const artPathFor = (stableCode: string): string | undefined =>
  Object.hasOwn(artPaths, stableCode)
    ? artPaths[stableCode as keyof typeof artPaths]
    : undefined;

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

  return (
    <img
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      className="blook-art"
      decoding="async"
      height={size}
      loading="lazy"
      src={artPath}
      width={size}
    />
  );
}

export const BLOOK_ART_CODES = Object.keys(artPaths);
