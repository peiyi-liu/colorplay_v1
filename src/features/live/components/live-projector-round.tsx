import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { Icon } from '../../../components/ui/icons';
import {
  OPTION_ORDER,
  SHAPE_SYMBOLS,
} from '../../../components/ui/option-button';
import { useLiveStandings } from '../hooks/use-live-commands';
import { tick, type LiveClockTick } from '../lib/live-clock';
import type { LiveRepository, LiveSessionState } from '../types';

import './live-projector-round.css';

export type ProjectorFooterAction = Readonly<{
  id: string;
  label: string;
  precedence: 'primary' | 'secondary';
  run: () => void;
}>;

type FeedbackStep = 'statistics' | 'explanation' | 'ranking';

const optionStyle = (index: number) => {
  const order = OPTION_ORDER[index % 4] ?? OPTION_ORDER[0];
  return { shape: SHAPE_SYMBOLS[order.shape], variant: order.variant };
};

function CountdownRing({
  deadlineAt,
  openedAt,
  serverTime,
  onExpire,
  onSecond,
}: Readonly<{
  deadlineAt: string | null;
  openedAt: string | null;
  serverTime: string;
  onExpire: () => void;
  onSecond: (clock: LiveClockTick) => void;
}>) {
  const [clock, setClock] = useState(() => ({
    fetchedAt: Date.now(),
    now: Date.now(),
  }));
  const lastDeadlineRef = useRef<string | null>(null);
  const lastSecondRef = useRef<number | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock((previous) => ({ ...previous, now: Date.now() }));
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const result = tick(
    { question: { deadlineAt, openedAt }, serverTime, state: 'question_open' },
    clock.now,
    clock.fetchedAt,
  );
  const seconds = result.secondsLeft;

  useEffect(() => {
    if (lastDeadlineRef.current !== deadlineAt) {
      lastDeadlineRef.current = deadlineAt;
      lastSecondRef.current = null;
      expiredRef.current = false;
    }
    if (seconds === null || seconds === lastSecondRef.current) return;
    lastSecondRef.current = seconds;
    onSecond(result);
    if (seconds === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
    }
  }, [deadlineAt, onExpire, onSecond, result, seconds]);

  if (seconds === null) return <strong>等待同步</strong>;
  const circumference = 2 * Math.PI * 20;
  return (
    <div aria-label="剩餘秒數" className="live-round__timer" role="timer">
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <circle className="live-round__timer-track" cx="24" cy="24" r="20" />
        <circle
          className="live-round__timer-fill"
          cx="24"
          cy="24"
          r="20"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - result.fraction)}
        />
      </svg>
      <strong>{seconds}</strong>
    </div>
  );
}

function StatusBar({
  state,
  feedbackStep,
  onExpire,
  onSecond,
}: Readonly<{
  state: LiveSessionState;
  feedbackStep: FeedbackStep;
  onExpire: () => void;
  onSecond: (clock: LiveClockTick) => void;
}>) {
  const question = state.question;
  const isQuestion = state.state === 'question_open';
  const isPaused = state.state === 'paused';
  return (
    <header aria-label="Live 課堂狀態" className="live-projector__status-bar">
      <section className="live-projector__metric">
        <Icon name="book" size={28} />
        <span>
          <small>目前題目</small>
          <strong>
            第 {state.currentPosition} / {state.questionCount} 題
          </strong>
        </span>
      </section>
      <section className="live-projector__metric live-projector__metric--timer">
        <Icon name="clock" size={28} />
        <span>
          <small>作答倒數環</small>
          {isQuestion && question ? (
            <CountdownRing
              deadlineAt={question.deadlineAt}
              onExpire={onExpire}
              onSecond={onSecond}
              openedAt={question.openedAt}
              serverTime={state.serverTime}
            />
          ) : (
            <strong>
              {isPaused
                ? `暫停 ${String(tick(state, 0, 0).secondsLeft ?? 0)} 秒`
                : '作答結束'}
            </strong>
          )}
        </span>
      </section>
      <section className="live-projector__metric">
        <Icon name="trophy" size={28} />
        <span>
          <small>即時排名</small>
          <strong>
            {feedbackStep === 'ranking' ? '排名已更新' : '本題結束後更新'}
          </strong>
        </span>
      </section>
      <section className="live-projector__metric">
        <Icon name="users" size={28} />
        <span>
          <small>參與狀況</small>
          <strong>
            已作答 {state.answeredCount ?? 0} / {state.participantCount}
          </strong>
        </span>
      </section>
    </header>
  );
}

function QuestionPanel({ state }: Readonly<{ state: LiveSessionState }>) {
  const question = state.question;
  if (!question) return <p role="status">正在同步題目…</p>;
  return (
    <section aria-labelledby="live-round-question" className="live-round__question">
      <p>第 {state.currentPosition} / {state.questionCount} 題</p>
      <h2 id="live-round-question">{question.prompt}</h2>
      <ul aria-label="答案選項" className="live-round__options">
        {question.publicOptions.map((option, index) => {
          const style = optionStyle(index);
          return (
            <li
              aria-label={`${option.key}. ${option.text ?? ''}`}
              className={`live-round__option live-round__option--${style.variant}`}
              key={option.id}
            >
              <strong>{option.key}.</strong>
              <span aria-hidden="true">{style.shape}</span>
              <span>{option.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatisticsPanel({ state }: Readonly<{ state: LiveSessionState }>) {
  const question = state.question;
  if (!question || state.optionCounts === undefined) {
    return <p role="status">正在同步作答統計…</p>;
  }
  const denominator = state.optionCounts.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  const rows = [
    ...question.publicOptions.map((option, index) => ({
      count: state.optionCounts?.find((entry) => entry.optionId === option.id)?.count ?? 0,
      id: option.id,
      isCorrect: state.correctOptionId === option.id,
      label: `${option.key}. ${option.text ?? ''}`,
      ...optionStyle(index),
    })),
    ...(state.optionCounts.find((entry) => entry.optionId === null)?.count
      ? [{
          count: state.optionCounts.find((entry) => entry.optionId === null)?.count ?? 0,
          id: 'timeout',
          isCorrect: false,
          label: '逾時／未選擇',
          shape: '—',
          variant: 'muted',
        }]
      : []),
  ];
  return (
    <section aria-labelledby="live-round-statistics" className="live-round__statistics">
      <h2 id="live-round-statistics">作答統計</h2>
      <p>統計將在 5 秒後自動進入本題解析</p>
      <div aria-label="作答分布文字圖表" className="live-round__distribution">
        {rows.map((row) => {
          const percent = denominator > 0 ? Math.round((row.count / denominator) * 100) : 0;
          return (
            <div
              aria-label={row.isCorrect ? `正確答案：${row.label}` : row.label}
              className={`live-round__distribution-row live-round__distribution-row--${row.variant}${row.isCorrect ? ' live-round__distribution-row--correct' : ''}`}
              key={row.id}
            >
              <strong>
                <span aria-hidden="true">{row.shape}</span>{' '}
                {row.isCorrect ? '✓ 正確答案：' : ''}{row.label}
              </strong>
              <span aria-hidden="true" className="live-round__distribution-track">
                <span style={{ width: `${String(percent)}%` }} />
              </span>
              <span>{row.count} 人／{percent}%</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ExplanationPanel({
  state,
  onShowRanking,
}: Readonly<{ state: LiveSessionState; onShowRanking: () => void }>) {
  const correct = state.question?.publicOptions.find(
    (option) => option.id === state.correctOptionId,
  );
  const explanation = state.explanation?.trim();
  return (
    <section aria-labelledby="live-round-explanation" className="live-round__explanation">
      <div className="live-round__scroll">
        <div className="live-round__scroll-body">
          <h2 id="live-round-explanation">本題解析</h2>
          <p className="live-round__scroll-question">{state.question?.prompt}</p>
          <p><strong>正確答案：</strong>{correct ? `${correct.key}. ${correct.text ?? ''}` : '尚未提供'}</p>
          <p>{explanation && explanation.length > 0 ? explanation : '本題沒有提供解析。'}</p>
        </div>
        <button className="live-round__ranking-button" onClick={onShowRanking} type="button">
          <Icon name="trophy" size={22} />
          即時排名
        </button>
      </div>
    </section>
  );
}

function RankingPanel({
  isError,
  isPending,
  rows,
}: Readonly<{
  isError: boolean;
  isPending: boolean;
  rows: readonly Readonly<{ displayName: string; rank: number; score: number }>[];
}>) {
  if (isPending) return <p role="status">正在同步即時排名…</p>;
  if (isError) return <p role="alert">即時排名暫時無法載入，請稍後再試。</p>;
  if (rows.length === 0) return <p role="status">目前還沒有可顯示的排名。</p>;
  const podium = [...rows.filter((entry) => entry.rank <= 3)].sort(
    (left, right) => left.rank - right.rank,
  );
  const remaining = rows.filter((entry) => entry.rank > 3);
  return (
    <section aria-labelledby="live-round-ranking" className="live-round__ranking">
      <h2 id="live-round-ranking">即時排名</h2>
      <ol aria-label="即時排名前三名" className="live-round__podium">
        {podium.map((entry) => (
          <li
            className={`live-round__rank live-round__rank--${String(entry.rank)}`}
            data-rank={entry.rank}
            key={`${String(entry.rank)}:${entry.displayName}`}
          >
            <Icon name={entry.rank === 1 ? 'crown' : 'medal'} size={28} />
            <strong>第 {entry.rank} 名</strong>
            <span>{entry.displayName}</span>
            <span>{entry.score} 分</span>
          </li>
        ))}
      </ol>
      {remaining.length > 0 ? (
        <ol aria-label="即時排名其他名次" className="live-round__ranking-list">
          {remaining.map((entry) => (
            <li
              className="live-round__rank"
              data-rank={entry.rank}
              key={`${String(entry.rank)}:${entry.displayName}`}
            >
              <strong>第 {entry.rank} 名</strong>
              <span>{entry.displayName}</span>
              <span>{entry.score} 分</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function LiveProjectorRound({
  footerActions,
  muted,
  onCancel,
  onFinalCountdown,
  onToggleMute,
  repository,
  sessionId,
  state,
  transitionPending,
}: Readonly<{
  footerActions: readonly ProjectorFooterAction[];
  muted: boolean;
  onCancel: (() => void) | null;
  onFinalCountdown: () => void;
  onToggleMute: () => void;
  repository?: LiveRepository;
  sessionId: string;
  state: LiveSessionState;
  transitionPending: boolean;
}>) {
  const [feedback, setFeedback] = useState<Readonly<{ step: FeedbackStep; version: number }>>({
    step: 'statistics',
    version: state.stateVersion,
  });
  const [confirmingExit, setConfirmingExit] = useState(false);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const exitWasOpenRef = useRef(false);
  if (feedback.version !== state.stateVersion) {
    setFeedback({ step: 'statistics', version: state.stateVersion });
  }
  const feedbackStep = state.state === 'question_feedback' ? feedback.step : 'statistics';
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.state !== 'question_feedback' || feedbackStep !== 'statistics') return;
    const timer = window.setTimeout(() => {
      setFeedback({ step: 'explanation', version: state.stateVersion });
    }, 5_000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [feedbackStep, state.state, state.stateVersion]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [feedbackStep, state.state]);

  useEffect(() => {
    if (confirmingExit) {
      exitWasOpenRef.current = true;
      return;
    }
    if (exitWasOpenRef.current) {
      exitWasOpenRef.current = false;
      exitButtonRef.current?.focus();
    }
  }, [confirmingExit]);

  const standings = useLiveStandings(
    sessionId,
    { enabled: state.state === 'question_feedback', stateVersion: state.stateVersion },
    repository,
  );
  const action = (id: string) => footerActions.find((entry) => entry.id === id);
  const pauseAction = action(state.state === 'paused' ? 'resumeSession' : 'pauseSession');
  const closeAction = action('closeQuestion');
  const nextAction = action('advance') ?? action('finalize');
  const nextEnabled = feedbackStep === 'ranking' && nextAction !== undefined;
  const handleExitDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setConfirmingExit(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="live-projector live-round" data-feedback-step={feedbackStep}>
      <StatusBar
        feedbackStep={feedbackStep}
        onExpire={() => { closeAction?.run(); }}
        onSecond={(clock) => { if (clock.isFinalCountdown) onFinalCountdown(); }}
        state={state}
      />
      <main
        className={`live-round__stage${feedbackStep === 'explanation' ? ' live-round__stage--explanation' : ''}`}
        ref={headingRef}
        tabIndex={-1}
      >
        {state.state === 'question_open' || state.state === 'paused' ? <QuestionPanel state={state} /> : null}
        {state.state === 'paused' ? <p className="live-round__paused" role="status">作答時間已暫停</p> : null}
        {state.state === 'question_feedback' && feedbackStep === 'statistics' ? <StatisticsPanel state={state} /> : null}
        {state.state === 'question_feedback' && feedbackStep === 'explanation' ? (
          <ExplanationPanel onShowRanking={() => { setFeedback({ step: 'ranking', version: state.stateVersion }); }} state={state} />
        ) : null}
        {state.state === 'question_feedback' && feedbackStep === 'ranking' ? (
          <RankingPanel
            isError={standings.isError}
            isPending={standings.isPending}
            rows={standings.data?.standings ?? []}
          />
        ) : null}
      </main>
      <footer aria-label="Live 課堂控制" className="live-round__controls">
        <button disabled={!pauseAction || transitionPending} onClick={() => { pauseAction?.run(); }} type="button">
          <Icon name="clock" size={22} />{pauseAction?.label ?? '暫停時間'}
        </button>
        <button disabled={!closeAction || transitionPending} onClick={() => { closeAction?.run(); }} type="button">
          <Icon name="check" size={22} />結束作答
        </button>
        <button className={nextEnabled ? 'live-round__next live-round__next--active' : 'live-round__next'} disabled={!nextEnabled || transitionPending} onClick={() => { nextAction?.run(); }} type="button">
          <Icon name="arrow-right" size={22} />{nextAction?.id === 'finalize' ? '結算成績' : '下一題'}
        </button>
        <button aria-label="音效" aria-pressed={muted} onClick={onToggleMute} type="button">
          <Icon name="megaphone" size={22} />音效 <small>{muted ? '靜音' : '開啟'}</small>
        </button>
        <button disabled={!onCancel || state.state === 'paused' || transitionPending} onClick={() => { setConfirmingExit(true); }} ref={exitButtonRef} type="button">
          <Icon name="x" size={22} />退出
        </button>
      </footer>
      {confirmingExit && onCancel ? (
        <div aria-labelledby="live-round-exit-title" aria-modal="true" className="live-projector__exit-backdrop" onKeyDown={handleExitDialogKeyDown} role="alertdialog">
          <div className="live-projector__exit-dialog">
            <h2 id="live-round-exit-title">確定退出 Live 課堂？</h2>
            <p>退出會結束這場 Live 課堂。</p>
            <div>
              <button autoFocus onClick={() => { setConfirmingExit(false); }} type="button">繼續課堂</button>
              <button className="live-projector__confirm-exit" onClick={() => { setConfirmingExit(false); onCancel(); }} type="button">確定退出</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
