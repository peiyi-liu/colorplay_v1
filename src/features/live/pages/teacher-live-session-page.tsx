import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import type { Database } from '../../../types/database';
import {
  useLiveDistribution,
  useLiveTransition,
  type LiveTransitionName,
} from '../hooks/use-live-commands';
import { useLiveSession } from '../hooks/use-live-session';
import type { LiveRepository, LiveSessionState } from '../types';
import { LiveTeamScoreboard } from '../components/live-team-scoreboard';

const transitionErrorMessage = (code: string) =>
  code === 'STATE_CONFLICT'
    ? '另一個主持分頁已推進狀態，畫面已同步為最新。'
    : code === 'INVALID_TRANSITION'
      ? '目前狀態不允許這個操作。'
      : '操作暫時無法完成，請稍後重試。';

const hostAction = (
  state: LiveSessionState,
): { label: string; transition: LiveTransitionName } | null => {
  if (state.state === 'draft')
    return { label: '開啟等待室', transition: 'startSession' };
  if (state.state === 'lobby')
    return { label: '開始第一題', transition: 'openQuestion' };
  if (state.state === 'question_open')
    return { label: '收題並公布答案', transition: 'closeQuestion' };
  if (state.state === 'paused')
    return { label: '繼續作答', transition: 'resumeSession' };
  if (state.state === 'question_feedback') {
    return state.currentPosition < state.questionCount
      ? { label: '下一題', transition: 'advance' }
      : { label: '結算成績', transition: 'finalize' };
  }
  return null;
};

function HostDistribution({
  sessionId,
  state,
  repository,
}: Readonly<{
  sessionId: string;
  state: LiveSessionState;
  repository?: LiveRepository;
}>) {
  const distribution = useLiveDistribution(
    sessionId,
    {
      answeredCount: state.answeredCount ?? 0,
      enabled: state.state === 'question_open',
    },
    repository,
  );
  const question = state.question;
  if (!question || distribution.isPending || distribution.isError) return null;

  return (
    <div aria-label="即時作答分布">
      <h3>即時作答分布（僅主持人可見）</h3>
      <ul>
        {question.publicOptions.map((option) => {
          const count =
            distribution.data.options.find(
              (entry) => entry.optionId === option.id,
            )?.count ?? 0;
          return (
            <li key={option.id}>
              {option.key}. {option.text}（{count} 人）
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TeacherLiveSessionPage({
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
  const transition = useLiveTransition(sessionId, repository);
  const [transitionError, setTransitionError] = useState<string>();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (session.isPending) return <RouteLoading withinMain />;
  if (session.isError) {
    return (
      <section className="route-panel">
        <h1>Live 主持台</h1>
        <p role="alert">找不到這場課堂挑戰，或你不是主持人。</p>
        <Link className="primary-action" to="/teacher/live">
          回 Live 活動
        </Link>
      </section>
    );
  }

  const state = session.data;
  const action = hostAction(state);

  const runTransition = (name: LiveTransitionName) => {
    setTransitionError(undefined);
    transition.mutate(
      { expectedVersion: state.stateVersion, transition: name },
      {
        onError: (error) => {
          setTransitionError(transitionErrorMessage(error.code));
        },
      },
    );
  };

  return (
    <section aria-labelledby="host-console-title" className="w-full max-w-3xl">
      <header>
        <p className="route-panel__eyebrow">ColorPlay Live 主持台</p>
        <h1 id="host-console-title">課堂挑戰主持</h1>
        <p>
          {state.participantCount} 位參與者・第 {state.currentPosition} /{' '}
          {state.questionCount} 題
        </p>
      </header>

      {state.state === 'lobby' ? (
        <p role="status">等待室開啟中，學生輸入課堂代碼即可加入。</p>
      ) : null}

      {state.question && state.state === 'question_open' ? (
        <div>
          <h2>{state.question.prompt}</h2>
          <p aria-live="polite">
            已作答 {state.answeredCount ?? 0} / {state.participantCount}
          </p>
          <HostDistribution
            sessionId={sessionId}
            state={state}
            {...(repository ? { repository } : {})}
          />
        </div>
      ) : null}

      {state.state === 'paused' ? (
        <div role="status">
          <h2>已暫停</h2>
          <p>
            剩餘 {Math.ceil((state.pausedRemainingMs ?? 0) / 1000)}{' '}
            秒已凍結，按「繼續作答」恢復倒數。
          </p>
          {state.question ? <p>{state.question.prompt}</p> : null}
        </div>
      ) : null}

      {state.state === 'question_feedback' && state.question ? (
        <div>
          <h2>本題分布</h2>
          <ul>
            {state.question.publicOptions.map((option) => {
              const count =
                state.optionCounts?.find(
                  (entry) => entry.optionId === option.id,
                )?.count ?? 0;
              return (
                <li key={option.id}>
                  {state.correctOptionId === option.id ? '✓ ' : ''}
                  {option.key}. {option.text}（{count} 人）
                </li>
              );
            })}
          </ul>
        </div>
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
          <h2>最終排名</h2>
          <ol aria-label="前三名">
            {(state.podium ?? []).map((entry) => (
              <li key={entry.rank}>
                第 {entry.rank} 名 {entry.displayName}（{entry.score} 分）
              </li>
            ))}
          </ol>
          <Link to={`/teacher/live/${sessionId}/report`}>查看場次報表</Link>
          <Link className="primary-action" to="/teacher/live">
            回 Live 活動
          </Link>
        </div>
      ) : null}

      {state.state === 'cancelled' ? (
        <p role="status">這場挑戰已取消。</p>
      ) : null}

      {action ? (
        <button
          className="primary-action"
          data-primary-action="true"
          disabled={transition.isPending}
          // A broadcast can swap the pending action between the moment the
          // host aims and the moment the click lands. Keying by transition
          // replaces the node instead of retargeting it in place, so a stale
          // click dies on the detached button rather than firing the new
          // action with a fresh version.
          key={action.transition}
          onClick={() => {
            runTransition(action.transition);
          }}
          type="button"
        >
          {transition.isPending ? '處理中…' : action.label}
        </button>
      ) : null}

      {state.state === 'question_open' ? (
        <button
          disabled={transition.isPending}
          onClick={() => {
            runTransition('pauseSession');
          }}
          type="button"
        >
          暫停
        </button>
      ) : null}

      {action && state.state !== 'completed' && state.state !== 'cancelled' ? (
        <button
          disabled={transition.isPending}
          onClick={() => {
            setConfirmingCancel(true);
          }}
          type="button"
        >
          取消挑戰
        </button>
      ) : null}
      {transitionError ? <p role="alert">{transitionError}</p> : null}

      {confirmingCancel ? (
        <div
          aria-labelledby="cancel-live-title"
          aria-modal="true"
          role="dialog"
        >
          <h2 id="cancel-live-title">取消這場課堂挑戰？</h2>
          <p>取消後不會發放任何獎勵，學生會看到挑戰已結束。</p>
          <button
            disabled={transition.isPending}
            onClick={() => {
              setConfirmingCancel(false);
            }}
            type="button"
          >
            返回
          </button>
          <button
            className="primary-action"
            disabled={transition.isPending}
            onClick={() => {
              setConfirmingCancel(false);
              runTransition('cancel');
            }}
            type="button"
          >
            確認取消
          </button>
        </div>
      ) : null}
    </section>
  );
}
