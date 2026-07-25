import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import type { Database } from '../../../types/database';
import {
  useLiveDistribution,
  useLiveTransition,
  type LiveTransitionName,
} from '../hooks/use-live-commands';
import { useLiveSession } from '../hooks/use-live-session';
import type { LiveRepository, LiveSessionState } from '../types';
import { LivePresenter } from '../components/live-presenter';
import { actionCopy, transitionErrorCopy } from '../lib/live-action-copy';
import { hostConsoleView } from '../lib/live-phase-view';
import { LiveTeamScoreboard } from '../components/live-team-scoreboard';

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
  const [searchParams] = useSearchParams();
  // 一鍵開場後直接落在投影模式（等待室已由開場流程開啟）。
  const [presenting, setPresenting] = useState(
    searchParams.get('presenter') === '1',
  );

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
  const view = hostConsoleView(state);
  const primaryAction =
    view.hostActions.find((entry) => entry.precedence === 'primary') ?? null;
  const secondaryActions = view.hostActions.filter(
    (entry) => entry.precedence === 'secondary',
  );

  const runTransition = (name: LiveTransitionName) => {
    setTransitionError(undefined);
    transition.mutate(
      { expectedVersion: state.stateVersion, transition: name },
      {
        onError: (error) => {
          setTransitionError(transitionErrorCopy(error.code));
        },
      },
    );
  };

  return (
    <section
      aria-labelledby="host-console-title"
      className="live-console page-narrow"
    >
      <header>
        <p className="route-panel__eyebrow">ColorPlay Live 主持台</p>
        <h1 id="host-console-title">課堂挑戰主持</h1>
        <p>
          {state.participantCount} 位參與者・第 {state.currentPosition} /{' '}
          {state.questionCount} 題
        </p>
        {state.state !== 'cancelled' ? (
          <button
            onClick={() => {
              setPresenting(true);
            }}
            type="button"
          >
            投影模式
          </button>
        ) : null}
      </header>

      {presenting ? (
        <LivePresenter
          footerActions={view.hostActions
            .filter((entry) => entry.transition !== 'cancel')
            .map((entry) => ({
              id: entry.transition,
              label: actionCopy(entry.transition, 'projector').label,
              precedence: entry.precedence,
              run: () => {
                runTransition(entry.transition);
              },
            }))}
          onCancel={
            secondaryActions.some((entry) => entry.transition === 'cancel')
              ? () => {
                  runTransition('cancel');
                }
              : null
          }
          onExit={() => {
            setPresenting(false);
          }}
          sessionId={sessionId}
          state={state}
          transitionPending={transition.isPending}
          {...(repository ? { repository } : {})}
        />
      ) : null}

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

      {view.kind === 'paused' ? (
        <div role="status">
          <h2>已暫停</h2>
          <p>
            剩餘 {view.frozenSeconds}{' '}
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

      {primaryAction ? (
        <button
          className="primary-action"
          data-primary-action="true"
          disabled={transition.isPending}
          // A broadcast can swap the pending action between the moment the
          // host aims and the moment the click lands. Keying by transition
          // replaces the node instead of retargeting it in place, so a stale
          // click dies on the detached button rather than firing the new
          // action with a fresh version.
          key={primaryAction.transition}
          onClick={() => {
            runTransition(primaryAction.transition);
          }}
          type="button"
        >
          {transition.isPending
            ? '處理中…'
            : actionCopy(primaryAction.transition, 'hostConsole').label}
        </button>
      ) : null}

      {secondaryActions.map((secondaryAction) =>
        secondaryAction.transition === 'cancel' ? (
          <button
            disabled={transition.isPending}
            key={secondaryAction.transition}
            onClick={() => {
              setConfirmingCancel(true);
            }}
            type="button"
          >
            {actionCopy('cancel', 'hostConsole').label}
          </button>
        ) : (
          <button
            disabled={transition.isPending}
            key={secondaryAction.transition}
            onClick={() => {
              runTransition(secondaryAction.transition);
            }}
            type="button"
          >
            {actionCopy(secondaryAction.transition, 'hostConsole').label}
          </button>
        ),
      )}
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
