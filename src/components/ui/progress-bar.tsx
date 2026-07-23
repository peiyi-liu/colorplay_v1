type ProgressBarProps = Readonly<{
  value: number;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  label: string;
}>;

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** 細長進度條（狀態以文字 label 傳達，不只靠顏色）。 */
export function ProgressBar({ value, tone, label }: ProgressBarProps) {
  const clamped = clamp(value);
  return (
    <div
      className={`ui-progress ui-progress--${tone}`}
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
