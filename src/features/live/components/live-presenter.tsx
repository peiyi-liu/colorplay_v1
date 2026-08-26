import { Icon } from '../../../components/ui/icons';
import { useEffect, useRef, useState } from 'react';

import {
  createPresenterAudio,
  type PresenterAudio,
} from '../lib/presenter-audio';
import {
  cueFor,
  type ProjectorPhaseKind,
} from '../lib/live-audio-cue';
import { projectorView } from '../lib/live-phase-view';
import type { LiveRepository, LiveSessionState } from '../types';
import { LiveProjectorHud } from './live-projector-hud';
import {
  LiveProjectorRound,
  type ProjectorFooterAction,
} from './live-projector-round';

export type { ProjectorFooterAction } from './live-projector-round';

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

  return (
    <div
      aria-label="Live 投影模式"
      className="live-presenter"
      data-projector-phase={phase}
      role="region"
    >
      {phase === 'lobby' ? (
        <LiveProjectorHud
          joinCode={joinCode}
          muted={muted}
          onExit={onCancel ?? null}
          onStart={
            footerActions.find((entry) => entry.id === 'openQuestion')?.run ??
            null
          }
          onToggleMute={() => {
            setMuted((previous) => !previous);
          }}
          participantCount={state.participantCount}
          participants={state.participants ?? []}
          questionCount={state.questionCount}
          transitionPending={transitionPending}
        />
      ) : phase === 'question' || phase === 'paused' || phase === 'reveal' ? (
        <LiveProjectorRound
          footerActions={footerActions}
          muted={muted}
          onCancel={onCancel ?? null}
          onFinalCountdown={() => {
            engine.tick();
          }}
          onToggleMute={() => {
            setMuted((previous) => !previous);
          }}
          sessionId={sessionId}
          state={state}
          transitionPending={transitionPending}
          {...(repository ? { repository } : {})}
        />
      ) : (
        <>
          <header className="live-presenter__bar">
            <p>
              第 {String(state.currentPosition)} / {String(state.questionCount)} 題
            </p>
            <button onClick={onExit} type="button">
              離開投影
            </button>
          </header>

          {phase === 'podium' ? (
        <div className="live-presenter__podium-stage">
          <span
            aria-hidden="true"
            className="podium-fireworks podium-fireworks--left"
          />
          <span
            aria-hidden="true"
            className="podium-fireworks podium-fireworks--right"
          />
          <h2>最終頒獎台</h2>
          <ol aria-label="頒獎台" className="live-presenter__podium">
            {(state.podium ?? []).map((entry) => (
              <li
                className={`live-presenter__podium-step live-presenter__podium-step--${String(entry.rank)}`}
                key={entry.rank}
              >
                {entry.rank === 1 ? (
                  <span aria-hidden="true" className="podium-gems" />
                ) : null}
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
          ) : (
            <div className="live-presenter__cancelled">
              <h2>Live 課堂已結束</h2>
            </div>
          )}

          <footer className="live-presenter__controls">
            {footerActions.map((entry) => (
              <button
                className={entry.precedence === 'primary' ? 'primary-action' : undefined}
                disabled={transitionPending}
                key={entry.id}
                onClick={entry.run}
                type="button"
              >
                {transitionPending ? '處理中…' : entry.label}
              </button>
            ))}
          </footer>
        </>
      )}
    </div>
  );
}
