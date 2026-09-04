export function StudentBackButton({
  ariaLabel,
  onBack,
}: Readonly<{
  ariaLabel: string;
  onBack: () => void;
}>) {
  return (
    <button
      aria-label={ariaLabel}
      className="student-route-back"
      onClick={onBack}
      type="button"
    >
      <span aria-hidden="true" className="student-route-back__arrow">
        ←
      </span>
      <span>返回</span>
    </button>
  );
}
