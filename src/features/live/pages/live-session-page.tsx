import { Icon } from '../../../components/ui/icons';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import {
  OptionButton,
  type OptionShape,
  type OptionVariant,
} from '../../../components/ui/option-button';
import type { Database } from '../../../types/database';
import {
  useLiveMyStanding,
  useSubmitLiveAnswer,
} from '../hooks/use-live-commands';
import { useLiveSession } from '../hooks/use-live-session';
import { LiveTeamScoreboard } from '../components/live-team-scoreboard';
import {
  encouragementFor,
  optionAccessibleName,
} from '../lib/standing-feedback';
import type { LiveRepository, LiveSessionState } from '../types';

const OPTION_VARIANTS: readonly OptionVariant[] = [
  'rose',
  'sky',
  'amber',
  'emerald',
];
const OPTION_SHAPES: readonly OptionShape[] = [
  'triangle',
  'square',
  'circle',
  'diamond',
];

export const remainingSeconds = (
  deadlineAt: string | null,
  serverTime: string,
  now: number,
  fetchedAt: number,
): number | null => {
  if (!deadlineAt) return null;
  const serverOffset = new Date(serverTime).getTime() - fetchedAt;
  const serverNow = now + serverOffset;
  return Math.max(
    0,
    Math.ceil((new Date(deadlineAt).getTime() - serverNow) / 1000),
  );
};

function Countdown({
  deadlineAt,
  serverTime,
}: Readonly<{ deadlineAt: string | null; serverTime: string }>) {
  const [clock, setClock] = useState<Readonly<{
    anchor: string;
    fetchedAt: number;
    now: number;
  }> | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      setClock((previous) =>
        previous?.anchor === serverTime
          ? { ...previous, now: Date.now() }
          : { anchor: serverTime, fetchedAt: Date.now(), now: Date.now() },
      );
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [serverTime]);
  const remaining =
    clock?.anchor === serverTime
      ? remainingSeconds(deadlineAt, serverTime, clock.now, clock.fetchedAt)
      : null;
  if (remaining === null) return null;
  return (
    <p aria-live="polite">
      剩餘 <strong>{remaining}</strong> 秒（以伺服器時間為準）
    </p>
  );
}

function QuestionPhase({
  sessionId,
  state,
  repository,
}: Readonly<{
  sessionId: string;
  state: LiveSessionState;
  repository?: LiveRepository;
}>) {
  const submit = useSubmitLiveAnswer(sessionId, repository);
  const keysRef = useRef(new Map<string, string>());
  const [submitError, setSubmitError] = useState<string>();
  const [streak, setStreak] = useState(0);
  const question = state.question;
  if (!question) return null;
  const answered = state.myAnswer?.answered === true;
  const screenOnly = state.questionDisplay === 'screen_only';

  const idempotencyKeyFor = (questionId: string): string => {
    const existing = keysRef.current.get(questionId);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    keysRef.current.set(questionId, fresh);
    return fresh;
  };

  return (
    <div>
      <p>
        第 {question.position} / {state.questionCount} 題
      </p>
      <Countdown
        deadlineAt={question.deadlineAt}
        serverTime={state.serverTime}
      />
      <fieldset
        className="question-card"
        disabled={answered || submit.isPending}
      >
        <legend>
          {screenOnly ? '題目在投影幕上，選出你的答案！' : question.prompt}
        </legend>
        <div
          className={`live-options${screenOnly ? ' live-options--screen-only' : ''}`}
          role="group"
          aria-label="答案選項"
        >
          {question.publicOptions.map((option, index) => (
            <OptionButton
              key={option.id}
              variant={OPTION_VARIANTS[index % 4] ?? 'rose'}
              shape={OPTION_SHAPES[index % 4] ?? 'triangle'}
              onClick={() => {
                setSubmitError(undefined);
                submit.mutate(
                  {
                    idempotencyKey: idempotencyKeyFor(question.questionId),
                    selectedOptionId: option.id,
                    sessionQuestionId: question.questionId,
                  },
                  {
                    onError: () => {
                      setSubmitError('作答未送出，請再試一次。');
                    },
                    onSuccess: (receipt) => {
                      setStreak(receipt.streak);
                    },
                  },
                );
              }}
            >
              {screenOnly ? (
                // 純形狀置中：格子上只有 OptionButton 的形狀符號，文字僅供
                // 螢幕閱讀器。
                <span className="sr-only">
                  {optionAccessibleName(index, option.key)}
                </span>
              ) : (
                `${option.key}. ${option.text ?? ''}`
              )}
            </OptionButton>
          ))}
        </div>
      </fieldset>
      {answered ? <p role="status">已收到你的答案，等待其他同學…</p> : null}
      {streak >= 2 ? (
        <p className="live-streak-badge" role="status">
          <Icon name="flame" size={16} /> 連擊 x{streak}!
        </p>
      ) : null}
      {submitError ? <p role="alert">{submitError}</p> : null}
    </div>
  );
}

function PersonalStanding({
  sessionId,
  state,
  repository,
}: Readonly<{
  sessionId: string;
  state: LiveSessionState;
  repository?: LiveRepository;
}>) {
  const standing = useLiveMyStanding(
    sessionId,
    {
      enabled: state.state === 'question_feedback' && !state.isHost,
      stateVersion: state.stateVersion,
    },
    repository,
  );
  if (!standing.data) return null;
  const mine = standing.data;
  return (
    <div className="live-standing-card" role="status">
      <p className="live-standing-card__rank">
        目前第 <strong>{mine.rank}</strong> 名
        <span className="live-standing-card__total">
          ／共 {mine.participantCount} 人
        </span>
      </p>
      <p className="live-standing-card__score">累積 {mine.score} 分</p>
      <p className="live-standing-card__cheer">{encouragementFor(mine)}</p>
    </div>
  );
}

/** 雙螢幕模式的題間結果：全屏綠/紅底、白色勾叉、本題加分與目前排名。 */
function FullscreenResult({
  sessionId,
  state,
  repository,
}: Readonly<{
  sessionId: string;
  state: LiveSessionState;
  repository?: LiveRepository;
}>) {
  const standing = useLiveMyStanding(
    sessionId,
    {
      enabled: state.state === 'question_feedback' && !state.isHost,
      stateVersion: state.stateVersion,
    },
    repository,
  );
  const feedback = state.myFeedback;
  const correct = feedback?.answerStatus === 'correct';
  return (
    <div
      className={`live-result-screen live-result-screen--${
        correct ? 'correct' : 'wrong'
      }`}
      role="status"
    >
      <span aria-hidden="true" className="live-result-screen__icon">
        {correct ? '✓' : '✕'}
      </span>
      <p className="live-result-screen__status">
        {correct
          ? '答對了！'
          : feedback?.answerStatus === 'timeout'
            ? '未作答'
            : '答錯了'}
      </p>
      <p className="live-result-screen__delta">
        本題 +{feedback?.scoreDelta ?? 0} 分
      </p>
      {standing.data ? (
        <p className="live-result-screen__rank">
          目前第 {standing.data.rank} 名
        </p>
      ) : null}
    </div>
  );
}

function FeedbackPhase({
  sessionId,
  state,
  repository,
}: Readonly<{
  sessionId: string;
  state: LiveSessionState;
  repository?: LiveRepository;
}>) {
  const question = state.question;
  if (!question) return null;
  const feedback = state.myFeedback;
  const headline = (
    <h2>
      {feedback
        ? feedback.answerStatus === 'correct'
          ? `✓ 答對了！+${String(feedback.scoreDelta)} 分`
          : feedback.answerStatus === 'timeout'
            ? '未作答（逾時）'
            : '✗ 答錯了'
        : '本題結束'}
    </h2>
  );
  return (
    <div>
      {headline}
      <p>{question.prompt}</p>
      <ul className="live-distribution">
        {question.publicOptions.map((option) => {
          const count =
            state.optionCounts?.find((entry) => entry.optionId === option.id)
              ?.count ?? 0;
          const total = (state.optionCounts ?? []).reduce(
            (sum, entry) => sum + entry.count,
            0,
          );
          const isCorrect = state.correctOptionId === option.id;
          return (
            <li key={option.id}>
              <span>
                {isCorrect ? '✓ ' : ''}
                {option.key}. {option.text}（{count} 人）
              </span>
              <span aria-hidden="true" className="live-distribution__track">
                <span
                  className={`live-distribution__fill${isCorrect ? ' live-distribution__fill--correct' : ''}`}
                  style={{
                    width: `${String(total > 0 ? Math.round((count / total) * 100) : 0)}%`,
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {state.explanation ? (
        <div className="live-explanation">
          <strong>教師引導解析:</strong>
          <p>{state.explanation}</p>
        </div>
      ) : null}
      <PersonalStanding
        sessionId={sessionId}
        state={state}
        {...(repository ? { repository } : {})}
      />
      <p role="status">等待主持人進入下一題…</p>
    </div>
  );
}

export function LiveSessionPage({
  sessionId: suppliedSessionId,
  repository,
  client,
}: Readonly<{
  sessionId?: string;
  repository?: LiveRepository;
  client?: SupabaseClient<Database>;
}>) {
  const params = useParams();
  const sessionId = suppliedSessionId ?? params.sessionId ?? '';
  const session = useLiveSession(sessionId, {
    ...(client ? { client } : {}),
    ...(repository ? { repository } : {}),
  });

  if (session.isPending) return <RouteLoading withinMain />;
  if (session.isError) {
    return (
      <section className="route-panel">
        <h1>課堂挑戰</h1>
        <p role="alert">找不到這場課堂挑戰，或你不是參與者。</p>
        <Link className="primary-action" to="/app/live/join">
          重新輸入代碼
        </Link>
      </section>
    );
  }

  const state = session.data;

  // 雙螢幕模式的題間結果佔滿整個畫面：不顯示 ColorPlay Live／課堂挑戰標題。
  if (
    state.state === 'question_feedback' &&
    state.questionDisplay === 'screen_only' &&
    !state.isHost &&
    !state.waitingForNext
  ) {
    return (
      <FullscreenResult
        sessionId={sessionId}
        state={state}
        {...(repository ? { repository } : {})}
      />
    );
  }

  return (
    <section
      aria-labelledby="live-session-title"
      className="live-session-shell w-full max-w-2xl"
    >
      <header>
        <p className="route-panel__eyebrow">ColorPlay Live</p>
        <h1 id="live-session-title">課堂挑戰</h1>
      </header>

      {state.state === 'lobby' ? (
        <div role="status">
          <h2>等待主持人開始…</h2>
          <p>目前 {state.participantCount} 位同學在等待室。</p>
        </div>
      ) : null}

      {state.waitingForNext ? (
        <div className="live-waiting" role="status">
          <h2>已加入這場挑戰！</h2>
          <p>這一題已經開始，下一題開始時你就會自動進場。</p>
        </div>
      ) : null}

      {state.state === 'question_open' && !state.waitingForNext ? (
        <QuestionPhase
          sessionId={sessionId}
          state={state}
          {...(repository ? { repository } : {})}
        />
      ) : null}

      {state.state === 'paused' && !state.waitingForNext ? (
        <div role="status">
          <h2>暫停中</h2>
          <p>
            主持人已暫停，剩餘{' '}
            {Math.ceil((state.pausedRemainingMs ?? 0) / 1000)}{' '}
            秒已凍結，恢復後繼續倒數。
          </p>
          {state.question?.prompt ? <p>{state.question.prompt}</p> : null}
        </div>
      ) : null}

      {state.state === 'question_feedback' && !state.waitingForNext ? (
        <FeedbackPhase
          sessionId={sessionId}
          state={state}
          {...(repository ? { repository } : {})}
        />
      ) : null}

      {state.state === 'question_feedback' || state.state === 'completed' ? (
        <LiveTeamScoreboard
          sessionId={sessionId}
          state={state}
          {...(repository ? { repository } : {})}
        />
      ) : null}

      {state.state === 'completed' ? (
        <div>
          <h2>挑戰結束！</h2>
          {state.myResult ? (
            <p role="status">
              你的成績：{state.myResult.score} 分，第{' '}
              {state.myResult.rank ?? '—'} 名
            </p>
          ) : null}
          <ol aria-label="前三名">
            {(state.podium ?? []).map((entry) => (
              <li key={entry.rank}>
                第 {entry.rank} 名 {entry.displayName}（{entry.score} 分）
              </li>
            ))}
          </ol>
          <Link className="primary-action" to="/app">
            回章節
          </Link>
        </div>
      ) : null}

      {state.state === 'cancelled' ? (
        <div role="status">
          <h2>這場挑戰已被取消。</h2>
          <Link className="primary-action" to="/app">
            回章節
          </Link>
        </div>
      ) : null}
    </section>
  );
}
