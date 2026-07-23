/* 全站唯一 icon 來源:24×24 outline SVG(stroke 1.8, currentColor)。
   設計系統(design-system/colorplay/MASTER.md)禁止 emoji 圖示。 */
import type { ReactElement, SVGProps } from 'react';

const paths: Record<string, ReactElement> = {
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1-2-2c0-1.1.9-2 2-2h6.5a2.5 2.5 0 0 0 2.5-2.5C21 6 17 3 12 3Z" />
      <circle cx="7.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  'lock-open': (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 7.6-1.7" />
    </>
  ),
  pencil: (
    <>
      <path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z" />
      <path d="m12.5 7.5 4 4" />
    </>
  ),
  cloud: (
    <path d="M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 8.6 3.8 3.8 0 0 1 17.2 18H7Z" />
  ),
  alert: (
    <>
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  'grad-cap': (
    <>
      <path d="m12 4 10 4.5L12 13 2 8.5 12 4Z" />
      <path d="M6.5 10.8V15c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.2" />
      <path d="M22 8.5V14" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 5h16v14H4V5Z" />
      <path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14.5" r="4.5" />
      <path d="m8.7 11 -3.2-7h4.1L12 8.7 14.4 4h4.1l-3.2 7" />
    </>
  ),
  'chart-line': (
    <>
      <path d="M4 4v16h16" />
      <path d="m7 14 4-4 3 3 5-6" />
    </>
  ),
  'chart-bar': (
    <>
      <path d="M4 4v16h16" />
      <path d="M8.5 16.5v-5" />
      <path d="M12.5 16.5v-8" />
      <path d="M16.5 16.5v-3" />
    </>
  ),
  bolt: <path d="M13 2 4.5 13.5h5L11 22l8.5-11.5h-5L13 2Z" />,
  map: (
    <>
      <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H4.5v1a3.5 3.5 0 0 0 3.5 3.5" />
      <path d="M16 5.5h3.5v1a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v3.5" />
      <path d="M8.5 20h7" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.75" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  flame: (
    <path d="M12 21c3.9 0 6.5-2.5 6.5-6 0-2.4-1.3-4.4-2.7-6-.6 1-1.3 1.7-2.1 2C13.4 8.6 13 5.5 10 3c.3 2.6-1 4-2.5 5.7C6.2 10.2 5.5 12 5.5 15c0 3.5 2.6 6 6.5 6Z" />
  ),
  sprout: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3.5-2.5-6-6.5-6C5.5 10.5 8 13 12 13Z" />
      <path d="M12 10.5c0-3 2-5.5 6.5-5.5 0 3.5-2.5 6-6.5 6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  crown: <path d="m4 8 4 3.5L12 5l4 6.5L20 8l-1.5 10h-13L4 8Z" />,
  megaphone: (
    <>
      <path d="M4 10v4h3l7 4V6l-7 4H4Z" />
      <path d="M17.5 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
  star: (
    <path d="m12 4 2.35 4.9 5.4.72-3.95 3.75.99 5.33L12 16.1l-4.79 2.6.99-5.33L4.25 9.62l5.4-.72L12 4Z" />
  ),
  sparkles: (
    <>
      <path d="M12 4.5 13.8 9l4.7 1.8-4.7 1.8L12 17l-1.8-4.4L5.5 10.8 10.2 9 12 4.5Z" />
      <path d="M19 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" />
    </>
  ),
  gem: (
    <>
      <path d="M7 4h10l4 5.5L12 20 3 9.5 7 4Z" />
      <path d="M3 9.5h18" />
      <path d="m8.5 9.5 3.5 10 3.5-10" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9" />
      <path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 2.9 6 1.4 6 4.1 0 1.3-1.3 2.2-3 2.2-1.3 0-2.4-.5-3-1.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 5.5a3.5 3.5 0 0 1 0 6.6" />
      <path d="M17.5 14.9c1.8.7 3 2.2 3 4.6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4.5" />
      <path d="m7.5 8.5 4.5-4 4.5 4" />
      <path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17.5H7.5A2.5 2.5 0 0 0 5 22V4.5Z" />
      <path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H19" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="8" width="17" height="11.5" rx="2" />
      <path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2" />
      <path d="M3.5 12.5h17" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m10.5 6.5-5.5 5.5 5.5 5.5" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m13.5 6.5 5.5 5.5-5.5 5.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export const ICON_NAMES = Object.keys(paths);

type IconProps = {
  name: IconName;
  /** px;預設 20 */
  size?: number;
  /** 提供時以 img 語意輸出;未提供時對輔助科技隱藏 */
  label?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'children'>;

export function Icon({ name, size = 20, label, ...rest }: IconProps) {
  const glyph = paths[name];
  if (!glyph) return null;
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      fill="none"
      height={size}
      role={label ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
    >
      {glyph}
    </svg>
  );
}
