import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { BLOOK_ART_CODES, BlookArt } from '../../../components/ui/blook-art';
import { Icon } from '../../../components/ui/icons';
import type { LiveParticipantName } from '../types';

import './live-projector.css';

type LiveProjectorHudProps = Readonly<{
  joinCode: string | null;
  muted: boolean;
  onExit: (() => void) | null;
  onStart: (() => void) | null;
  onToggleMute: () => void;
  participantCount: number;
  participants: readonly LiveParticipantName[];
  questionCount: number;
  transitionPending: boolean;
}>;

const portraitForParticipant = (displayName: string): string => {
  let hash = 0;
  for (const character of displayName) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return BLOOK_ART_CODES[hash % BLOOK_ART_CODES.length] ?? 'little_fox';
};

export function LiveProjectorHud({
  joinCode,
  muted,
  onExit,
  onStart,
  onToggleMute,
  participantCount,
  participants,
  questionCount,
  transitionPending,
}: LiveProjectorHudProps) {
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [startDialog, setStartDialog] = useState<'confirm' | 'empty' | null>(
    null,
  );
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const startDialogWasOpenRef = useRef(false);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const exitWasOpenRef = useRef(false);
  const participantEntries = useMemo(() => {
    const occurrences = new Map<string, number>();
    return participants.map((participant) => {
      const occurrence = occurrences.get(participant.displayName) ?? 0;
      occurrences.set(participant.displayName, occurrence + 1);
      return {
        key: `${participant.displayName}:${String(occurrence)}`,
        participant,
      };
    });
  }, [participants]);
  const participantKeys = useMemo(
    () => participantEntries.map((entry) => entry.key),
    [participantEntries],
  );
  const knownParticipantKeysRef = useRef(new Set(participantKeys));
  const [joiningParticipantKeys, setJoiningParticipantKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());

  useEffect(() => {
    if (startDialog) {
      startDialogWasOpenRef.current = true;
      return;
    }
    if (startDialogWasOpenRef.current) {
      startDialogWasOpenRef.current = false;
      startButtonRef.current?.focus();
    }
  }, [startDialog]);

  useEffect(() => {
    const addedKeys = participantKeys.filter(
      (key) => !knownParticipantKeysRef.current.has(key),
    );
    knownParticipantKeysRef.current = new Set(participantKeys);
    if (addedKeys.length === 0) return;

    setJoiningParticipantKeys(
      (current) => new Set([...current, ...addedKeys]),
    );
    const settleTimer = window.setTimeout(() => {
      setJoiningParticipantKeys(new Set());
    }, 1_950);
    return () => {
      window.clearTimeout(settleTimer);
    };
  }, [participantKeys]);

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

  const handleStartDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setStartDialog(null);
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
    <div className="live-projector">
      <header aria-label="Live 課堂狀態" className="live-projector__status-bar">
        <section className="live-projector__metric">
          <Icon name="book" size={28} />
          <span>
            <small>目前題目</small>
            <strong>等待開始</strong>
            <span>共 {questionCount} 題</span>
          </span>
        </section>
        <section className="live-projector__metric live-projector__metric--timer">
          <Icon name="clock" size={28} />
          <span>
            <small>作答倒數環</small>
            <strong aria-label="倒數尚未開始" className="live-projector__idle-ring">
              <span aria-hidden="true">—</span>
            </strong>
            <span>待開始</span>
          </span>
        </section>
        <section className="live-projector__metric">
          <Icon name="trophy" size={28} />
          <span>
            <small>即時排名</small>
            <strong>尚未產生</strong>
          </span>
        </section>
        <section className="live-projector__metric">
          <Icon name="users" size={28} />
          <span>
            <small>參與狀況</small>
            <strong>{participantCount} 人已加入</strong>
          </span>
        </section>
      </header>

      <div className="live-projector__stage">
        <div className="live-presenter__lobby">
          <p className="live-presenter__hint">輸入課堂代碼加入</p>
          <p aria-label="課堂代碼" className="live-presenter__code">
            {joinCode ?? '請回活動頁產生代碼'}
          </p>
          <p aria-live="polite" className="live-presenter__count">
            {participantCount} 位同學已加入
          </p>
          <ul
            aria-label="已加入同學"
            className="live-presenter__wall"
          >
            {participantEntries.map(({ key, participant }) => (
              <li
                aria-label={`${participant.displayName}已加入`}
                className="live-presenter__wall-chip"
                data-joining={
                  joiningParticipantKeys.has(key) ? 'true' : undefined
                }
                key={key}
              >
                <BlookArt
                  size={54}
                  stableCode={portraitForParticipant(participant.displayName)}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer aria-label="Live 課堂控制" className="live-projector__controls">
        {onStart ? (
          <button
            className="live-projector__control live-projector__control--primary"
            disabled={transitionPending}
            onClick={() => {
              if (participantCount === 0) {
                setStartDialog('empty');
                return;
              }
              setStartDialog('confirm');
            }}
            ref={startButtonRef}
            type="button"
          >
            <Icon name="arrow-right" size={24} />
            {transitionPending ? '處理中…' : '開始遊戲'}
          </button>
        ) : null}
        <button
          aria-label="音效"
          aria-pressed={muted}
          className="live-projector__control"
          onClick={onToggleMute}
          type="button"
        >
          <Icon name="megaphone" size={24} />
          <span>音效</span>
          <small>{muted ? '靜音' : '開啟'}</small>
        </button>
        {onExit ? (
          <button
            className="live-projector__control live-projector__control--danger"
            disabled={transitionPending}
            onClick={() => {
              setConfirmingExit(true);
            }}
            ref={exitButtonRef}
            type="button"
          >
            <Icon name="x" size={24} />
            退出
          </button>
        ) : null}
      </footer>

      {startDialog ? (
        <div
          aria-labelledby="live-projector-start-title"
          aria-modal="true"
          className="live-projector__exit-backdrop"
          onKeyDown={handleStartDialogKeyDown}
          role="alertdialog"
        >
          <div className="live-projector__exit-dialog">
            <Icon
              name={startDialog === 'empty' ? 'users' : 'arrow-right'}
              size={32}
            />
            <h2 id="live-projector-start-title">
              {startDialog === 'empty' ? '等待學生進入' : '立即開始'}
            </h2>
            <p>
              {startDialog === 'empty'
                ? '目前還沒有學生加入，請等待學生輸入課堂代碼後再開始。'
                : `${String(participantCount)} 位同學已加入，確定要開始第一題嗎？`}
            </p>
            <div
              className={
                startDialog === 'empty'
                  ? 'live-projector__dialog-actions--single'
                  : undefined
              }
            >
              <button
                autoFocus
                onClick={() => {
                  setStartDialog(null);
                }}
                type="button"
              >
                繼續等待
              </button>
              {startDialog === 'confirm' ? (
                <button
                  className="live-projector__confirm-start"
                  onClick={() => {
                    setStartDialog(null);
                    onStart?.();
                  }}
                  type="button"
                >
                  開始
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {confirmingExit ? (
        <div
          aria-labelledby="live-projector-exit-title"
          aria-modal="true"
          className="live-projector__exit-backdrop"
          onKeyDown={handleExitDialogKeyDown}
          role="alertdialog"
        >
          <div className="live-projector__exit-dialog">
            <Icon name="alert" size={32} />
            <h2 id="live-projector-exit-title">確定退出 Live 課堂？</h2>
            <p>退出會結束這場 Live 課堂，已加入的同學將無法繼續。</p>
            <div>
              <button
                autoFocus
                onClick={() => {
                  setConfirmingExit(false);
                }}
                type="button"
              >
                繼續課堂
              </button>
              <button
                className="live-projector__confirm-exit"
                onClick={() => {
                  setConfirmingExit(false);
                  onExit?.();
                }}
                type="button"
              >
                確定退出
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
