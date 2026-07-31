import { useEffect, useRef, useState } from 'react';

const remainingSeconds = (deadlineAt: string, now: number) =>
  Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000));

const atbFraction = (startedAt: string, deadlineAt: string, now: number) => {
  const start = new Date(startedAt).getTime();
  const deadline = new Date(deadlineAt).getTime();
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(deadline) ||
    deadline <= start
  ) {
    return 0;
  }
  return Math.min(1, Math.max(0, (deadline - now) / (deadline - start)));
};

export function Countdown({
  deadlineAt,
  onExpire,
  paused,
  startedAt,
}: Readonly<{
  deadlineAt: string;
  onExpire: () => void;
  paused: boolean;
  startedAt?: string | null;
}>) {
  const [now, setNow] = useState(Date.now);
  const expiredDeadline = useRef<string | null>(null);
  const seconds = remainingSeconds(deadlineAt, now);

  useEffect(() => {
    if (paused) return;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, [paused]);

  useEffect(() => {
    if (paused || seconds > 0 || expiredDeadline.current === deadlineAt) return;
    expiredDeadline.current = deadlineAt;
    onExpire();
  }, [deadlineAt, onExpire, paused, seconds]);

  return (
    <div className="atb">
      {startedAt ? (
        <div className="atb__track" aria-hidden="true">
          <div
            className="atb__fill"
            style={{
              transform: `scaleX(${String(atbFraction(startedAt, deadlineAt, now))})`,
            }}
          />
        </div>
      ) : null}
      <p className="quiz-countdown" role="timer" aria-live="off">
        {paused
          ? '已作答'
          : seconds === 0
            ? '時間到'
            : `剩餘 ${String(seconds)} 秒`}
      </p>
    </div>
  );
}
