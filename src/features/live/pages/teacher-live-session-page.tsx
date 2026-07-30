import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import type { Database } from '../../../types/database';
import {
  useLiveTransition,
  type LiveTransitionName,
} from '../hooks/use-live-commands';
import { useLiveSession } from '../hooks/use-live-session';
import type { LiveRepository } from '../types';
import { LivePresenter } from '../components/live-presenter';
import { actionCopy, transitionErrorCopy } from '../lib/live-action-copy';
import { hostConsoleView } from '../lib/live-phase-view';

/* owner 0730:主持台只保留投影幕模式——主控台檢視移除，
   進場即投影;取消/離開由 LivePresenter 內建流程處理。 */
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
  const navigate = useNavigate();
  const sessionId = suppliedSessionId ?? params.sessionId ?? '';
  const session = useLiveSession(sessionId, {
    ...(client ? { client } : {}),
    ...(repository ? { repository } : {}),
  });
  const transition = useLiveTransition(sessionId, repository);
  const [transitionError, setTransitionError] = useState<string>();

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

  // 取消挑戰確認後：離開投影並回 Live 主持頁（UAT 0727 #7）。
  const runCancel = () => {
    setTransitionError(undefined);
    transition.mutate(
      { expectedVersion: state.stateVersion, transition: 'cancel' },
      {
        onError: (error) => {
          setTransitionError(transitionErrorCopy(error.code));
        },
        onSuccess: () => {
          void navigate('/teacher/live');
        },
      },
    );
  };

  return (
    <>
      {transitionError ? <p role="alert">{transitionError}</p> : null}
      <LivePresenter
        footerActions={[
          ...view.hostActions
            .filter((entry) => entry.transition !== 'cancel')
            .map((entry) => ({
              id: entry.transition,
              label: actionCopy(entry.transition, 'projector').label,
              precedence: entry.precedence,
              run: () => {
                runTransition(entry.transition);
              },
            })),
          // 頒獎台「結算成績」→ 場次報表（DC 1562；UAT 0727 #7）。
          ...(state.state === 'completed'
            ? [
                {
                  id: 'settle-results',
                  label: '結算成績',
                  precedence: 'primary' as const,
                  run: () => {
                    void navigate(`/teacher/live/${sessionId}/report`);
                  },
                },
              ]
            : []),
        ]}
        onCancel={
          view.hostActions.some((entry) => entry.transition === 'cancel')
            ? () => {
                runCancel();
              }
            : null
        }
        onExit={() => {
          void navigate('/teacher/live');
        }}
        sessionId={sessionId}
        state={state}
        transitionPending={transition.isPending}
        {...(repository ? { repository } : {})}
      />
    </>
  );
}
