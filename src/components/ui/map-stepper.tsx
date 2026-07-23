type MapStepperProps = Readonly<{
  total: number;
  currentIndex: number;
  unlockedCount: number;
  onJump: (index: number) => void;
}>;

/** 精熟學習地圖：節點＋進度線；未解鎖節點不可跳（GGAME map）。 */
export function MapStepper({
  total,
  currentIndex,
  unlockedCount,
  onJump,
}: MapStepperProps) {
  const progressPercent =
    total > 1
      ? (Math.min(unlockedCount - 1, total - 1) / (total - 1)) * 100
      : 0;
  return (
    <div className="ui-map">
      <div className="ui-map__line" aria-hidden="true" />
      <div
        className="ui-map__line ui-map__line--progress"
        aria-hidden="true"
        style={{ width: `${String(Math.max(0, progressPercent))}%` }}
      />
      {Array.from({ length: total }, (_, index) => (
        <button
          key={index}
          type="button"
          className={`ui-map__node${index === currentIndex ? ' ui-map__node--current' : ''}`}
          disabled={index >= unlockedCount}
          aria-current={index === currentIndex ? 'step' : undefined}
          onClick={() => {
            onJump(index);
          }}
        >
          {index + 1}
        </button>
      ))}
    </div>
  );
}
