import type { ReactNode } from 'react';

export type OptionVariant = 'rose' | 'sky' | 'amber' | 'emerald';
export type OptionShape = 'triangle' | 'square' | 'circle' | 'diamond';
export type OptionState = 'idle' | 'locked' | 'correct' | 'wrong';

const SHAPE_SYMBOLS: Record<OptionShape, string> = {
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
      {isLocked ? <span aria-hidden="true">🔒</span> : null}
      {state === 'correct' ? <span aria-hidden="true">✓</span> : null}
      {state === 'wrong' ? <span aria-hidden="true">✕</span> : null}
    </button>
  );
}
