import { Icon } from '../../../components/ui/icons';
import {
  OPTION_ORDER,
  SHAPE_SYMBOLS,
} from '../../../components/ui/option-button';
import { useEffect, useRef, useState } from 'react';

import { useLiveStandings } from '../hooks/use-live-commands';
import {
  createPresenterAudio,
  type PresenterAudio,
} from '../lib/presenter-audio';
import {
  cueFor,
  type ProjectorPhaseKind,
} from '../lib/live-audio-cue';
import { tick, type LiveClockTick } from '../lib/live-clock';
import { projectorView } from '../lib/live-phase-view';
import type {
  LiveRepository,
  LiveSessionState,
  LiveStandingEntry,
} from '../types';

const MUTE_STORAGE_KEY = 'live-presenter-muted';

export const presenterJoinCodeKey = (sessionId: string) =>
  `live-join-code:${sessionId}`;

const readStoredJoinCode = (sessionId: string): string | null => {
  try {
    return window.sessionStorage.getItem(presenterJoinCodeKey(sessionId));
  } catch {
    return null;
  }
};

const readStoredMute = (): boolean => {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

function CountdownRing({
  deadlineAt,
  openedAt,
  serverTime,
  onSecond,
}: Readonly<{
  deadlineAt: string | null;
  openedAt: string | null;
  serverTime: string;
  onSecond: (tickResult: LiveClockTick) => void;
}>) {
  const [clock, setClock] = useState(() => ({
    fetchedAt: Date.now(),
    now: Date.now(),
  }));
  useEffect(() => {
    const timer = setInterval(() => {
      setClock((previous) => ({ ...previous, now: Date.now() }));
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const tickResult = tick(
    { question: { deadlineAt, openedAt }, serverTime, state: 'question_open' },
    clock.now,
    clock.fetchedAt,
  );
  const seconds = tickResult.secondsLeft;
  const lastSecondRef = useRef<number | null>(null);
  useEffect(() => {
    if (seconds === null || seconds === lastSecondRef.current) return;
    lastSecondRef.current = seconds;
    onSecond(tickResult);
  }, [seconds, onSecond, tickResult]);
  if (seconds === null) return null;

  const circumference = 2 * Math.PI * 54;

  return (
    <div aria-label="剩餘秒數" className="live-presenter__ring" role="timer">
      <svg aria-hidden="true" viewBox="0 0 120 120">
        <circle className="live-presenter__ring-track" cx="60" cy="60" r="54" />
        <circle
          className="live-presenter__ring-fill"
          cx="60"
          cy="60"
          r="54"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - tickResult.fraction)}
        />
      </svg>
      <span className="live-presenter__ring-number">{seconds}</span>
    </div>
  );
}

function StandingsBoard({
  sessionId,
  state,
  repository,
}: Readonly<{
  sessionId: string;
  state: LiveSessionState;
  repository?: LiveRepository;
}>) {
  const standings = useLiveStandings(
    sessionId,
    {
      enabled: state.state === 'question_feedback',
      stateVersion: state.stateVersion,
    },
    repository,
  );
  const entries = standings.data?.standings;
  // Each feedback round is snapshotted once (state adjusted during render,
  // per the previous-props pattern) so the arrows compare against the
  // previous round and stay stable across re-renders within a round.
  const [board, setBoard] = useState<Readonly<{
    rows: readonly Readonly<{ arrow: string; entry: LiveStandingEntry }>[];
    version: number;
  }> | null>(null);
  if (entries && board?.version !== state.stateVersion) {
    const previousRanks = new Map(
      (board?.rows ?? []).map((row) => [row.entry.displayName, row.entry.rank]),
    );
    setBoard({
      rows: entries.map((entry) => {
        const before = previousRanks.get(entry.displayName);
        return {
          arrow:
            before === undefined || before === entry.rank
              ? '—'
              : before > entry.rank
                ? '↑'
                : '↓',
          entry,
        };
      }),
      version: state.stateVersion,
    });
  }

  if (!board || board.rows.length === 0) return null;
  return (
    <section aria-label="目前排行榜" className="live-presenter__standings">
      <h3>目前 Top 5</h3>
      <ol>
        {board.rows.map(({ arrow, entry }) => (
          <li key={entry.displayName + String(entry.rank)}>
            <span aria-hidden="true" className="live-presenter__arrow">
              {arrow}
            </span>
            第 {entry.rank} 名 {entry.displayName}（{entry.score} 分）
          </li>
        ))}
      </ol>
    </section>
  );
}

export type ProjectorFooterAction = Readonly<{
  id: string;
  label: string;
  precedence: 'primary' | 'secondary';
  run: () => void;
}>;

export function LivePresenter({
  sessionId,
  state,
  footerActions,
  onCancel,
  onExit,
  transitionPending,
  repository,
  audio,
}: Readonly<{
  sessionId: string;
  state: LiveSessionState;
  footerActions: readonly ProjectorFooterAction[];
  onCancel?: (() => void) | null;
  onExit: () => void;
  transitionPending: boolean;
  repository?: LiveRepository;
  audio?: PresenterAudio;
}>) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [muted, setMuted] = useState(readStoredMute);
  const [engine] = useState<PresenterAudio>(
    () => audio ?? createPresenterAudio(),
  );

  useEffect(() => {
    engine.setMuted(muted);
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Non-critical preference; ignore private-mode failures.
    }
  }, [engine, muted]);

  const view = projectorView(state);
  const phase = view.kind;
  // Cue 只在真實轉場發聲（重連 previous 為 null → 靜默）；
  // Ambient Loop 是 Phase 屬性，進入 lobby（含重連）即恢復。
  const previousPhaseRef = useRef<ProjectorPhaseKind | null>(null);
  useEffect(() => {
    const cue = cueFor(previousPhaseRef.current, phase);
    previousPhaseRef.current = phase;
    if (cue === 'reveal') engine.playReveal();
    if (cue === 'fanfare') engine.playFanfare();
    if (view.ambientLoop === 'lobby') {
      engine.startLobbyLoop();
      return () => {
        engine.stopLobbyLoop();
      };
    }
    return undefined;
  }, [engine, phase, view.ambientLoop]);
  // Closing the projector releases the AudioContext — re-entering builds a
  // fresh engine, and browsers cap the number of live contexts.
  useEffect(
    () => () => {
      engine.dispose();
    },
    [engine],
  );

  const joinCode = readStoredJoinCode(sessionId);
  const question = state.question;

  return (
    <div
      aria-label="投影模式"
      aria-modal="true"
      className="live-presenter"
      role="dialog"
    >
      <header className="live-presenter__bar">
        <p>
          {phase === 'lobby'
            ? '等待室'
            : `第 ${String(state.currentPosition)} / ${String(state.questionCount)} 題`}
        </p>
        <div>
          <button
            aria-pressed={muted}
            onClick={() => {
              setMuted((previous) => !previous);
            }}
            type="button"
          >
            {muted ? '已靜音' : '音效開啟'}
          </button>
          {onCancel &&
          phase !== 'podium' &&
          phase !== 'cancelled' ? (
            confirmingCancel ? (
              <>
                <button
                  onClick={() => {
                    setConfirmingCancel(false);
                  }}
                  type="button"
                >
                  返回
                </button>
                <button
                  className="live-presenter__cancel"
                  onClick={() => {
                    setConfirmingCancel(false);
                    onCancel();
                  }}
                  type="button"
                >
                  確認取消挑戰
                </button>
              </>
            ) : (
              <button
                className="live-presenter__cancel"
                onClick={() => {
                  setConfirmingCancel(true);
                }}
                type="button"
              >
                取消挑戰
              </button>
            )
          ) : null}
          {phase === 'podium' || phase === 'cancelled' ? (
            <button onClick={onExit} type="button">
              離開投影
            </button>
          ) : null}
        </div>
      </header>

      {phase === 'lobby' ? (
        <div className="live-presenter__lobby">
          <p className="live-presenter__hint">輸入課堂代碼加入</p>
          <p aria-label="課堂代碼" className="live-presenter__code">
            {joinCode ?? '請回活動頁產生代碼'}
          </p>
          <p aria-live="polite" className="live-presenter__count">
            {state.participantCount} 位同學已加入
          </p>
          <ul aria-label="已加入同學" className="live-presenter__wall">
            {(state.participants ?? []).map((participant, index) => (
              <li
                className="live-presenter__wall-chip"
                key={participant.displayName + String(index)}
              >
                {participant.displayName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {question && (phase === 'question' || phase === 'paused') ? (
        <div className="live-presenter__question">
          <h2>{question.prompt}</h2>
          {phase === 'paused' ? (
            <p className="live-presenter__paused" role="status">
              已暫停（剩餘 {tick(state, 0, 0).secondsLeft}{' '}
              秒已凍結）
            </p>
          ) : (
            <CountdownRing
              deadlineAt={question.deadlineAt}
              onSecond={(clockTick) => {
                if (clockTick.isFinalCountdown) engine.tick();
              }}
              openedAt={question.openedAt}
              serverTime={state.serverTime}
            />
          )}
          <p aria-live="polite" className="live-presenter__answered">
            已作答 {state.answeredCount ?? 0} / {state.participantCount}
          </p>
          <ul aria-label="答案選項" className="live-presenter__options">
            {question.publicOptions.map((option, index) => {
              const order = OPTION_ORDER[index % 4] ?? OPTION_ORDER[0];
              const style = {
                shape: SHAPE_SYMBOLS[order.shape],
                variant: order.variant,
              };
              return (
                <li
                  className={`live-presenter__option live-presenter__option--${style.variant}`}
                  key={option.id}
                >
                  <span aria-hidden="true">{style.shape}</span> {option.key}.{' '}
                  {option.text}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {question && phase === 'reveal' ? (
        <div className="live-presenter__feedback">
          <h2>{question.prompt}</h2>
          <div aria-label="作答分布長條圖" className="live-presenter__chart">
            {question.publicOptions.map((option, index) => {
              const order = OPTION_ORDER[index % 4] ?? OPTION_ORDER[0];
              const style = {
                shape: SHAPE_SYMBOLS[order.shape],
                variant: order.variant,
              };
              const count =
                state.optionCounts?.find(
                  (entry) => entry.optionId === option.id,
                )?.count ?? 0;
              const maxCount = Math.max(
                1,
                ...question.publicOptions.map(
                  (candidate) =>
                    state.optionCounts?.find(
                      (entry) => entry.optionId === candidate.id,
                    )?.count ?? 0,
                ),
              );
              const isCorrect = state.correctOptionId === option.id;
              return (
                <div
                  className={`live-presenter__chart-row${isCorrect ? ' live-presenter__chart-row--correct' : ''}`}
                  key={option.id}
                >
                  <span
                    className={`live-presenter__chart-label${
                      isCorrect ? ' live-presenter__chart-label--correct' : ''
                    }`}
                  >
                    <span aria-hidden="true">{style.shape}</span>{' '}
                    {isCorrect ? '✓ ' : ''}
                    {option.key}. {option.text}
                  </span>
                  <span
                    aria-hidden="true"
                    className="live-presenter__chart-track"
                  >
                    <span
                      className={`live-presenter__chart-fill live-presenter__chart-fill--${style.variant}${
                        isCorrect ? ' live-presenter__chart-fill--correct' : ''
                      }`}
                      style={{
                        width: `${String(Math.round((count / maxCount) * 100))}%`,
                      }}
                    />
                  </span>
                  <span className="live-presenter__chart-count">
                    {count} 人
                  </span>
                </div>
              );
            })}
          </div>
          <StandingsBoard
            sessionId={sessionId}
            state={state}
            {...(repository ? { repository } : {})}
          />
        </div>
      ) : null}

      {phase === 'podium' ? (
        <div className="live-presenter__podium-stage">
          <h2>最終頒獎台</h2>
          <ol aria-label="頒獎台" className="live-presenter__podium">
            {(state.podium ?? []).map((entry) => (
              <li
                className={`live-presenter__podium-step live-presenter__podium-step--${String(entry.rank)}`}
                key={entry.rank}
              >
                <span className="live-presenter__podium-rank">
                  {entry.rank === 1 ? (
                    <Icon name="crown" size={28} />
                  ) : (
                    <Icon name="medal" size={24} />
                  )}
                </span>
                <span>{entry.displayName}</span>
                <span>{entry.score} 分</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <footer className="live-presenter__controls">
        {footerActions
          .filter((entry) => entry.precedence === 'secondary')
          .map((entry) => (
            <button
              disabled={transitionPending}
              key={entry.id}
              onClick={entry.run}
              type="button"
            >
              {entry.label}
            </button>
          ))}
        {footerActions
          .filter((entry) => entry.precedence === 'primary')
          .map((entry) => (
            <button
              className="primary-action"
              disabled={transitionPending}
              key={entry.id}
              onClick={entry.run}
              type="button"
            >
              {transitionPending ? '處理中…' : entry.label}
            </button>
          ))}
      </footer>
    </div>
  );
}
