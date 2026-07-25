type ProgressBarProps = Readonly<{
  value: number;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  label: string;
  /** 'sm' = 章節複習頁小節迷你條(DC 584:64px×4px);省略維持預設 8px 高度。 */
  size?: 'sm';
}>;

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** 細長進度條（狀態以文字 label 傳達，不只靠顏色）。 */
export function ProgressBar({ value, tone, label, size }: ProgressBarProps) {
  const clamped = clamp(value);
  return (
    <div
      className={`ui-progress ui-progress--${tone}${size === 'sm' ? ' ui-progress--sm' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="ui-progress__fill"
        style={{ width: `${String(clamped)}%` }}
      />
    </div>
  );
}
