/* Blook 自製 SVG 角色(2026-07-22 視覺改版):以 stable_code 對應扁平幾何角色。
   伺服器仍為目錄權威;emoji 欄位僅作未知代碼時的備援顯示。 */
import type { ReactElement } from 'react';

/* 共用五官:圓眼與微笑,置於 64×64 座標系。 */
const eyes = (cx1: number, cx2: number, cy: number): ReactElement => (
  <>
    <circle cx={cx1} cy={cy} fill="#14161f" r="2.6" />
    <circle cx={cx2} cy={cy} fill="#14161f" r="2.6" />
    <circle cx={cx1 + 1} cy={cy - 1} fill="#ffffff" r="0.9" />
    <circle cx={cx2 + 1} cy={cy - 1} fill="#ffffff" r="0.9" />
  </>
);

const smile = (x: number, y: number): ReactElement => (
  <path
    d={`M${String(x - 4)} ${String(y)}q4 3.6 8 0`}
    fill="none"
    stroke="#14161f"
    strokeLinecap="round"
    strokeWidth="1.8"
  />
);

const art: Record<string, ReactElement> = {
  little_fox: (
    <>
      <path d="M14 24 10 10l12 6Z" fill="#e5960a" />
      <path d="M50 24l4-14-12 6Z" fill="#e5960a" />
      <rect fill="#e5960a" height="34" rx="14" width="44" x="10" y="18" />
      <path
        d="M32 52c-9 0-15-5-15-12 0-5 6-9 15-9s15 4 15 9c0 7-6 12-15 12Z"
        fill="#fdf3e0"
      />
      {eyes(24, 40, 33)}
      <path d="M29.5 41.5 32 44l2.5-2.5Z" fill="#14161f" />
    </>
  ),
  lucky_cat: (
    <>
      <path d="M15 22 12 9l11 7Z" fill="#f6f4ee" />
      <path d="M49 22l3-13-11 7Z" fill="#f6f4ee" />
      <path
        d="M15 22 12 9l11 7Z"
        fill="none"
        stroke="#d64533"
        strokeWidth="1.6"
      />
      <path
        d="M49 22l3-13-11 7Z"
        fill="none"
        stroke="#d64533"
        strokeWidth="1.6"
      />
      <rect fill="#f6f4ee" height="34" rx="14" width="44" x="10" y="17" />
      {eyes(24, 40, 31)}
      {smile(32, 38)}
      <rect fill="#d64533" height="5" rx="2.5" width="30" x="17" y="47" />
      <circle cx="32" cy="49.5" fill="#ffd600" r="4" />
    </>
  ),
  travel_frog: (
    <>
      <circle cx="21" cy="16" fill="#2f9e63" r="7" />
      <circle cx="43" cy="16" fill="#2f9e63" r="7" />
      <circle cx="21" cy="15" fill="#ffffff" r="3.4" />
      <circle cx="43" cy="15" fill="#ffffff" r="3.4" />
      <circle cx="21.8" cy="15" fill="#14161f" r="1.7" />
      <circle cx="43.8" cy="15" fill="#14161f" r="1.7" />
      <rect fill="#2f9e63" height="32" rx="14" width="46" x="9" y="20" />
      <path d="M18 40q14 9 28 0v6q-14 8-28 0Z" fill="#def2e6" />
      {smile(32, 34)}
    </>
  ),
  wise_owl: (
    <>
      <path d="M14 18 10 8l10 5Z" fill="#b26e05" />
      <path d="M50 18l4-10-10 5Z" fill="#b26e05" />
      <rect fill="#b26e05" height="36" rx="15" width="46" x="9" y="16" />
      <circle cx="23" cy="31" fill="#fbefd8" r="8.5" />
      <circle cx="41" cy="31" fill="#fbefd8" r="8.5" />
      <circle
        cx="23"
        cy="31"
        fill="none"
        r="8.5"
        stroke="#14161f"
        strokeWidth="1.8"
      />
      <circle
        cx="41"
        cy="31"
        fill="none"
        r="8.5"
        stroke="#14161f"
        strokeWidth="1.8"
      />
      <path d="M31.5 31h1" stroke="#14161f" strokeWidth="1.8" />
      <circle cx="23" cy="31" fill="#14161f" r="3" />
      <circle cx="41" cy="31" fill="#14161f" r="3" />
      <path d="M29 42l3 4 3-4Z" fill="#e5960a" />
    </>
  ),
  primary_lion: (
    <>
      <path d="M32 6a22 22 0 0 1 19 11l-11 7Z" fill="#d64533" />
      <path d="M51 17a22 22 0 0 1 3 15l-14-2Z" fill="#ffd600" />
      <path d="M54 32a22 22 0 0 1-8 17l-8-11Z" fill="#3056d8" />
      <path d="M46 49a22 22 0 0 1-28 0l14-11Z" fill="#d64533" />
      <path d="M18 49a22 22 0 0 1-8-17l14 6Z" fill="#ffd600" />
      <path d="M10 32a22 22 0 0 1 3-15l11 9Z" fill="#3056d8" />
      <path d="M13 17A22 22 0 0 1 32 6l-3 18Z" fill="#ffd600" />
      <circle cx="32" cy="33" fill="#fbefd8" r="14" />
      {eyes(26, 38, 30)}
      <path d="M29 37.5 32 40l3-2.5Z" fill="#14161f" />
      {smile(32, 43)}
    </>
  ),
  rainbow_horse: (
    <>
      <rect fill="#f6f4ee" height="34" rx="14" width="42" x="8" y="20" />
      <path d="M46 20c8 0 12 5 12 11h-6c0-4-2-6-6-6Z" fill="#f6f4ee" />
      <path d="M20 20c0-6 3-10 8-12l1 6c-3 1-4 3-4 6Z" fill="#d2418e" />
      <path d="M27 16c1-5 5-8 10-8v6c-4 0-6 1-7 4Z" fill="#e5960a" />
      <path d="M35 14c3-3 8-4 12-2l-3 5c-3-1-5-1-7 1Z" fill="#3056d8" />
      {eyes(22, 36, 33)}
      {smile(29, 42)}
      <path
        d="M14 24c-3 8-3 16 0 22"
        fill="none"
        stroke="#0e98a5"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </>
  ),
  panda_painter: (
    <>
      <circle cx="17" cy="18" fill="#14161f" r="7" />
      <circle cx="47" cy="18" fill="#14161f" r="7" />
      <rect fill="#f6f4ee" height="34" rx="15" width="46" x="9" y="18" />
      <ellipse cx="23" cy="32" fill="#14161f" rx="6" ry="7" />
      <ellipse cx="41" cy="32" fill="#14161f" rx="6" ry="7" />
      <circle cx="24" cy="31" fill="#ffffff" r="2.2" />
      <circle cx="42" cy="31" fill="#ffffff" r="2.2" />
      <path d="M29 41 32 44l3-3Z" fill="#14161f" />
      <path d="M12 14 30 8l2 6-18 6Z" fill="#3056d8" />
      <circle cx="31" cy="11" fill="#3056d8" r="3.4" />
    </>
  ),
  koala_toner: (
    <>
      <circle cx="14" cy="24" fill="#8a90a2" r="10" />
      <circle cx="50" cy="24" fill="#8a90a2" r="10" />
      <circle cx="14" cy="24" fill="#f9e2ef" r="5" />
      <circle cx="50" cy="24" fill="#f9e2ef" r="5" />
      <rect fill="#c2c7d3" height="32" rx="14" width="40" x="12" y="20" />
      {eyes(25, 39, 32)}
      <ellipse cx="32" cy="40" fill="#14161f" rx="4" ry="5" />
    </>
  ),
  tiger_orange: (
    <>
      <path d="M15 21 12 10l10 6Z" fill="#e5960a" />
      <path d="M49 21l3-11-10 6Z" fill="#e5960a" />
      <rect fill="#e5960a" height="34" rx="14" width="44" x="10" y="17" />
      <path d="M20 17l4 8-8-1Z" fill="#14161f" />
      <path d="M44 17l-4 8 8-1Z" fill="#14161f" />
      <path
        d="M10 34h6M48 34h6"
        stroke="#14161f"
        strokeLinecap="round"
        strokeWidth="3"
      />
      {eyes(24, 40, 31)}
      <path d="M29 38.5 32 41l3-2.5Z" fill="#14161f" />
      {smile(32, 44)}
    </>
  ),
  octo_mixer: (
    <>
      <path
        d="M32 8c11 0 19 8 19 18v10H13V26c0-10 8-18 19-18Z"
        fill="#d2418e"
      />
      <path d="M13 36h6v8a3 3 0 0 1-6 0Z" fill="#d2418e" />
      <path d="M23 36h6v11a3 3 0 0 1-6 0Z" fill="#b23425" />
      <path d="M35 36h6v11a3 3 0 0 1-6 0Z" fill="#b23425" />
      <path d="M45 36h6v8a3 3 0 0 1-6 0Z" fill="#d2418e" />
      {eyes(25, 39, 26)}
      {smile(32, 32)}
    </>
  ),
  robo_blue: (
    <>
      <path
        d="M32 4v8"
        stroke="#14161f"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="32" cy="4.5" fill="#d64533" r="2.8" />
      <rect fill="#3056d8" height="30" rx="9" width="44" x="10" y="12" />
      <rect fill="#e0e7fb" height="14" rx="7" width="32" x="16" y="20" />
      <circle cx="25" cy="27" fill="#14161f" r="3" />
      <circle cx="39" cy="27" fill="#14161f" r="3" />
      <rect fill="#2542ad" height="10" rx="4" width="30" x="17" y="46" />
      <path
        d="M24 51h16"
        stroke="#e0e7fb"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </>
  ),
  pixel_sprite: (
    <>
      <path
        d="M20 12h24v6h6v6h6v16h-6v6h-6v6H26v-6h-6v-6h-6V24h6v-6h6Z"
        fill="#7b48ce"
      />
      <rect fill="#ede4f9" height="7" width="7" x="23" y="26" />
      <rect fill="#ede4f9" height="7" width="7" x="35" y="26" />
      <rect fill="#14161f" height="4" width="4" x="25" y="28" />
      <rect fill="#14161f" height="4" width="4" x="37" y="28" />
      <path d="M25 41h14v4H25Z" fill="#14161f" />
    </>
  ),
  indigo_dragon: (
    <>
      <path d="M18 16 12 6l10 4Z" fill="#ffd600" />
      <path d="M46 16l6-10-10 4Z" fill="#ffd600" />
      <rect fill="#3c4254" height="36" rx="15" width="46" x="9" y="14" />
      <path d="M9 30c-4 1-6 4-5 8 3-1 5-3 5-3Z" fill="#3c4254" />
      <path d="M20 14c2-5 6-8 12-8s10 3 12 8Z" fill="#2542ad" />
      {eyes(24, 40, 29)}
      <path
        d="M22 40q10 6 20 0"
        fill="none"
        stroke="#ffd600"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="18" cy="37" fill="#d64533" r="1.8" />
      <circle cx="46" cy="37" fill="#d64533" r="1.8" />
    </>
  ),
  peacock_teal: (
    <>
      <circle cx="12" cy="22" fill="#0e98a5" r="8" />
      <circle cx="32" cy="14" fill="#0e98a5" r="8" />
      <circle cx="52" cy="22" fill="#0e98a5" r="8" />
      <circle cx="12" cy="22" fill="#ffd600" r="3" />
      <circle cx="32" cy="14" fill="#ffd600" r="3" />
      <circle cx="52" cy="22" fill="#ffd600" r="3" />
      <rect fill="#0b7480" height="30" rx="13" width="36" x="14" y="24" />
      {eyes(26, 38, 36)}
      <path d="M29 43l3 3.6 3-3.6Z" fill="#e5960a" />
    </>
  ),
  contrast_bee: (
    <>
      <path
        d="M18 10c3-4 8-4 10 0M46 10c-3-4-8-4-10 0"
        fill="none"
        stroke="#14161f"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <rect fill="#ffd600" height="36" rx="15" width="46" x="9" y="14" />
      <path d="M9 26h46v8H9Z" fill="#14161f" />
      <path d="M12 42h40c-2 5-7 8-20 8s-18-3-20-8Z" fill="#14161f" />
      {eyes(24, 40, 21)}
      <path
        d="M26 46q6 3 12 0"
        fill="none"
        stroke="#ffd600"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </>
  ),
  cmyk_toucan: (
    <>
      <rect fill="#14161f" height="34" rx="15" width="38" x="7" y="16" />
      <circle cx="22" cy="30" fill="#ffffff" r="7" />
      <circle cx="23.5" cy="30" fill="#14161f" r="2.8" />
      <path d="M34 22h14a10 10 0 0 1 10 10v2H34Z" fill="#0e98a5" />
      <path d="M34 30h24v2a10 10 0 0 1-2 4H34Z" fill="#d2418e" />
      <path d="M34 36h22a10 10 0 0 1-8 6H34Z" fill="#ffd600" />
      <path d="M34 22v20" stroke="#14161f" strokeWidth="1.6" />
    </>
  ),
  neon_axolotl: (
    <>
      <path d="M12 24c-4-2-6-6-4-10 3 1 6 4 6 4Z" fill="#f472b6" />
      <path d="M52 24c4-2 6-6 4-10-3 1-6 4-6 4Z" fill="#f472b6" />
      <path d="M8 34c-4 0-6-3-6-6 3-1 6 1 6 1Z" fill="#f472b6" />
      <path d="M56 34c4 0 6-3 6-6-3-1-6 1-6 1Z" fill="#f472b6" />
      <rect fill="#f9e2ef" height="34" rx="15" width="44" x="10" y="18" />
      {eyes(24, 40, 32)}
      {smile(32, 39)}
      <circle cx="17" cy="38" fill="#f472b6" r="2.4" />
      <circle cx="47" cy="38" fill="#f472b6" r="2.4" />
    </>
  ),
  chameleon_master: (
    <>
      <path
        d="M32 12c12 0 20 9 20 20 0 4-1 8-3 11H15c-2-3-3-7-3-11 0-11 8-20 20-20Z"
        fill="#2f9e63"
      />
      <path d="M32 12c12 0 20 9 20 20 0 4-1 8-3 11H32Z" fill="#d2418e" />
      <circle cx="22" cy="30" fill="#def2e6" r="6.5" />
      <circle cx="42" cy="30" fill="#f9e2ef" r="6.5" />
      <circle cx="23" cy="30" fill="#14161f" r="2.6" />
      <circle cx="41" cy="30" fill="#14161f" r="2.6" />
      <path
        d="M46 43c6 0 9-4 8-9-2 3-5 4-5 4"
        fill="none"
        stroke="#b23425"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
      {smile(30, 38)}
    </>
  ),
  gradient_whale: (
    <>
      <path
        d="M50 14c1-4 4-6 8-6-1 4-3 6-3 6s3 1 5 4c-4 1-8-1-8-1Z"
        fill="#2542ad"
      />
      <path
        d="M10 34c0-12 10-20 22-20s22 8 22 20c0 8-6 14-14 16H24c-8-2-14-8-14-16Z"
        fill="#3056d8"
      />
      <path
        d="M10 34h44c0 8-6 14-14 16H24c-8-2-14-8-14-16Z"
        fill="#0ea5e9"
        opacity="0.55"
      />
      {eyes(24, 40, 30)}
      {smile(32, 37)}
      <path
        d="M28 20c1-3 3-5 4-5s3 2 4 5"
        fill="none"
        stroke="#e0e7fb"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </>
  ),
  grayscale_wolf: (
    <>
      <path d="M14 22 9 8l12 7Z" fill="#3c4254" />
      <path d="M50 22l5-14-12 7Z" fill="#3c4254" />
      <rect fill="#646b7e" height="34" rx="14" width="44" x="10" y="18" />
      <path
        d="M32 52c-8 0-13-4-13-10 0-4 5-7 13-7s13 3 13 7c0 6-5 10-13 10Z"
        fill="#e2e5ec"
      />
      {eyes(24, 40, 31)}
      <path d="M28.5 40.5 32 43.5l3.5-3Z" fill="#14161f" />
    </>
  ),
};

/* 未知代碼(例如日後目錄再擴充)退回 emoji 顯示。 */
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
  const glyph = art[stableCode];
  if (!glyph) {
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
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      height={size}
      role={label ? 'img' : undefined}
      viewBox="0 0 64 64"
      width={size}
    >
      {glyph}
    </svg>
  );
}

export const BLOOK_ART_CODES = Object.keys(art);
