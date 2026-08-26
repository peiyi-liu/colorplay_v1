import { useEffect, useState } from 'react';

import { Icon } from '../../../components/ui/icons';
import type { LiveConnectionStatus } from '../hooks/use-live-session';
import { tick } from '../lib/live-clock';
import type { LiveSessionState } from '../types';

function CountdownRing({ state }: Readonly<{ state: LiveSessionState }>) {
  const [fetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const clock = tick(state, now, fetchedAt);
  if (clock.secondsLeft === null) return null;
  const radius = 19;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      aria-label="剩餘秒數"
      className={`live-student-countdown${clock.isFinalCountdown ? ' live-student-countdown--urgent' : ''}`}
      role="timer"
    >
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <circle className="live-student-countdown__track" cx="24" cy="24" r={radius} />
        <circle
          className="live-student-countdown__progress"
          cx="24"
          cy="24"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clock.fraction)}
        />
      </svg>
      <strong>{clock.secondsLeft}</strong>
    </span>
  );
}

const CONNECTION_COPY: Record<LiveConnectionStatus, string> = {
  connected: '連線正常',
  connecting: '連線中…',
  disconnected: '連線中斷',
};

export function StudentLiveStatusBar({
  connectionStatus,
  state,
}: Readonly<{
  connectionStatus: LiveConnectionStatus;
  state: LiveSessionState;
}>) {
  const showQuestion = state.currentPosition > 0;
  return (
    <header className="live-student-status-bar">
      <h1 id="live-session-title">
        <Icon name="swords" size={24} />
        課堂挑戰
      </h1>
      <p className="live-student-status-bar__question">
        <Icon name="target" size={18} />
        {showQuestion
          ? `第 ${String(state.currentPosition)} / ${String(state.questionCount)} 題`
          : '等待開始'}
      </p>
      <p
        className="live-student-status-bar__connection"
        data-state={connectionStatus}
        role="status"
      >
        <span aria-hidden="true" />
        {CONNECTION_COPY[connectionStatus]}
      </p>
      {state.state === 'question_open' ? (
        <CountdownRing
          key={`${state.question?.questionId ?? ''}:${state.serverTime}`}
          state={state}
        />
      ) : null}
      <p className="live-student-status-bar__online">
        <Icon name="users" size={18} />
        {state.participantCount} 人在線
      </p>
    </header>
  );
}
