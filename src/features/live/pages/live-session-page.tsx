import { Icon } from '../../../components/ui/icons';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import {
  OPTION_ORDER,
  OptionButton,
} from '../../../components/ui/option-button';
import type { Database } from '../../../types/database';
import { StudentLiveStatusBar } from '../components/student-live-status-bar';
import {
  useLiveMyStanding,
  useSubmitLiveAnswer,
} from '../hooks/use-live-commands';
import { useLiveSession } from '../hooks/use-live-session';
import {
  encouragementFor,
  optionAccessibleName,
} from '../lib/standing-feedback';
import { participantView } from '../lib/live-phase-view';
import type { LiveRepository, LiveSessionState } from '../types';
import './live-session-page.css';

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
  const [submission, setSubmission] = useState<Readonly<{
    questionId: string;
    selectedOptionId?: string;
    error?: string;
  }>>();
  const [streak, setStreak] = useState(0);
  const question = state.question;
  if (!question) return null;
  const currentSubmission =
    submission?.questionId === question.questionId ? submission : undefined;
  const selectedOptionId = currentSubmission?.selectedOptionId;
  const submitError = currentSubmission?.error;
  const answered = state.myAnswer?.answered === true;
  const screenOnly = state.questionDisplay === 'screen_only';
  const selectionLocked =
    answered || submit.isPending || selectedOptionId !== undefined;

  const idempotencyKeyFor = (questionId: string): string => {
    const existing = keysRef.current.get(questionId);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    keysRef.current.set(questionId, fresh);
    return fresh;
  };

  return (
    <div className="live-student-question-phase">
      <fieldset
        className="live-student-question-card"
        disabled={selectionLocked}
      >
        <legend>
          {selectedOptionId || answered ? (
            <span role="status">
              {submit.isPending ? '答案送出中…' : '答案已送出，等待揭曉…'}
            </span>
          ) : screenOnly ? (
            <>
              <Icon label="投影機" name="projector" size={32} />
              <span>請看投影幕作答</span>
            </>
          ) : (
            question.prompt
          )}
        </legend>
        <div
          className={`live-options${screenOnly ? ' live-options--screen-only' : ''}`}
          role="group"
          aria-label="答案選項"
        >
          {question.publicOptions.map((option, index) => (
            <OptionButton
              key={option.id}
              variant={(OPTION_ORDER[index % 4] ?? OPTION_ORDER[0]).variant}
              shape={(OPTION_ORDER[index % 4] ?? OPTION_ORDER[0]).shape}
              state={selectedOptionId === option.id ? 'selected' : 'idle'}
              disabled={selectionLocked}
              {...(screenOnly
                ? { ariaLabel: optionAccessibleName(index, option.key) }
                : {})}
              onClick={() => {
                setSubmission({
                  questionId: question.questionId,
                  selectedOptionId: option.id,
                });
                submit.mutate(
                  {
                    idempotencyKey: idempotencyKeyFor(question.questionId),
                    selectedOptionId: option.id,
                    sessionQuestionId: question.questionId,
                  },
                  {
                    onError: () => {
                      setSubmission({
                        error: '作答未送出，請再試一次。',
                        questionId: question.questionId,
                      });
                    },
                    onSuccess: (receipt) => {
                      setStreak(receipt.streak);
                    },
                  },
                );
              }}
            >
              {screenOnly ? (
                <span aria-hidden="true" className="live-option-key">
                  {option.key}
                </span>
              ) : (
                `${option.key}. ${option.text ?? ''}`
              )}
            </OptionButton>
          ))}
        </div>
      </fieldset>
      {streak >= 2 ? (
        <p className="live-streak-badge" role="status">
          <Icon name="flame" size={16} /> 連擊 x{streak}!
        </p>
      ) : null}
      {submitError ? (
        <p className="live-student-submit-error" role="alert">
          {submitError}
        </p>
      ) : null}
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
  const view = participantView(state);

  // 雙螢幕模式的題間結果佔滿整個畫面：不顯示 ColorPlay Live／課堂挑戰標題。
  if (view.kind === 'screen-only-result') {
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
      className="live-session-shell scene-night live-guild-raid live-student-arena"
    >
      <StudentLiveStatusBar
        connectionStatus={session.connectionStatus}
        state={state}
      />

      {(() => {
        switch (view.kind) {
          case 'lobby':
            return (
              <div className="live-student-lobby" role="status">
                <h2>等待主持人開始…</h2>
                <p>已進入等待室，主持人開始後將自動進入作答。</p>
              </div>
            );
          case 'waiting-for-next':
            return (
              <div className="live-waiting" role="status">
                <span aria-hidden="true" className="camp-fire" />
                <h2>已加入這場挑戰！</h2>
                <p>這一題已經開始，下一題開始時你就會自動進場。</p>
              </div>
            );
          case 'question':
            return (
              <QuestionPhase
                sessionId={sessionId}
                state={state}
                {...(repository ? { repository } : {})}
              />
            );
          case 'paused':
            return (
              <div role="status">
                <h2>暫停中</h2>
                <p>
                  主持人已暫停，剩餘 {view.frozenSeconds}{' '}
                  秒已凍結，恢復後繼續倒數。
                </p>
                {view.prompt ? <p>{view.prompt}</p> : null}
              </div>
            );
          case 'reveal':
            return (
              <FeedbackPhase
                sessionId={sessionId}
                state={state}
                {...(repository ? { repository } : {})}
              />
            );
          case 'completed':
            return (
              <div>
                <h2>挑戰結束！</h2>
                {view.myResult ? (
                  <p role="status">
                    你的成績：{view.myResult.score} 分，第{' '}
                    {view.myResult.rank ?? '—'} 名
                  </p>
                ) : null}
                <ol aria-label="前三名">
                  {view.podium.map((entry) => (
                    <li key={entry.rank}>
                      第 {entry.rank} 名 {entry.displayName}（{entry.score}{' '}
                      分）
                    </li>
                  ))}
                </ol>
                <Link className="primary-action" to="/app">
                  回章節
                </Link>
              </div>
            );
          case 'cancelled':
            return (
              <div role="status">
                <h2>這場挑戰已被取消。</h2>
                <Link className="primary-action" to="/app">
                  回章節
                </Link>
              </div>
            );
          default: {
            const exhausted: never = view;
            return exhausted;
          }
        }
      })()}
    </section>
  );
}
