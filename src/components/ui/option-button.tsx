import type { ReactNode } from 'react';

import { Icon } from './icons';

export type OptionVariant = 'rose' | 'sky' | 'amber' | 'emerald';
export type OptionShape = 'triangle' | 'square' | 'circle' | 'diamond';
export type OptionState = 'idle' | 'locked' | 'correct' | 'wrong';

// GGAME 四選項的固定順序：index → 色與形狀的唯一來源。投影幕與學生
// 裝置都由此導出——順序若在任一側獨立改動，課堂上會出現「投影與手機
// 形狀不同」。glyph 由 SHAPE_SYMBOLS 導出。
export const OPTION_ORDER = [
  { shape: 'triangle', variant: 'rose' },
  { shape: 'square', variant: 'sky' },
  { shape: 'circle', variant: 'amber' },
  { shape: 'diamond', variant: 'emerald' },
] as const satisfies readonly Readonly<{
  variant: OptionVariant;
  shape: OptionShape;
}>[];

export const SHAPE_SYMBOLS: Record<OptionShape, string> = {
  triangle: '▲',
  square: '■',
  circle: '●',
  diamond: '◆',
};

type OptionButtonProps = Readonly<{
  variant: OptionVariant;
  shape: OptionShape;
  state?: OptionState;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}>;

/** GGAME 四色答題選項鈕：形狀符號＋狀態圖示，狀態不只靠顏色。 */
export function OptionButton({
  variant,
  shape,
  state = 'idle',
  disabled = false,
  onClick,
  children,
}: OptionButtonProps) {
  const isLocked = state === 'locked';
  return (
    <button
      type="button"
      className={`ui-option ui-option--${variant} ui-option--state-${state}`}
      disabled={disabled || isLocked}
      onClick={onClick}
    >
      <span aria-hidden="true">{SHAPE_SYMBOLS[shape]}</span>
      <span className="ui-option__label">{children}</span>
      {isLocked ? (
        <span aria-hidden="true">
          <Icon name="lock" size={16} />
        </span>
      ) : null}
      {state === 'correct' ? <span aria-hidden="true">✓</span> : null}
      {state === 'wrong' ? <span aria-hidden="true">✕</span> : null}
    </button>
  );
}
