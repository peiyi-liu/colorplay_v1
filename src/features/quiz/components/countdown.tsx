import { useEffect, useRef, useState } from 'react';

const remainingSeconds = (deadlineAt: string, now: number) =>
  Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000));

export function Countdown({
  deadlineAt,
  onExpire,
  paused,
}: Readonly<{
  deadlineAt: string;
  onExpire: () => void;
  paused: boolean;
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
    <p className="quiz-countdown" role="timer" aria-live="off">
      {paused ? '已作答' : seconds === 0 ? '時間到' : `剩餘 ${String(seconds)} 秒`}
    </p>
  );
}
