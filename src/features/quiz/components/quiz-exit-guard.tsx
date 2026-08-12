import { useEffect, useRef, useState, type RefObject } from 'react';
import { useBlocker } from 'react-router-dom';

import type { QuizRepository } from '../api/quiz-repository';
import './quiz-exit-guard.css';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '目前無法離開挑戰，請稍後再試。';

export function QuizExitGuard({
  active,
  allowNavigationRef,
  repository,
  sessionId,
}: Readonly<{
  active: boolean;
  allowNavigationRef?: RefObject<boolean>;
  repository: QuizRepository;
  sessionId: string;
}>) {
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [error, setError] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active &&
      allowNavigationRef?.current !== true &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash),
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (blocker.state !== 'blocked' || !dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.close();
      dialog.showModal();
    }
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    };
  }, [blocker.state]);

  if (blocker.state !== 'blocked') return null;

  return (
    <dialog
      aria-labelledby="quiz-exit-dialog-title"
      className="quiz-exit-dialog"
      onCancel={(event) => {
        event.preventDefault();
        setError(undefined);
        blocker.reset();
      }}
      open
      ref={dialogRef}
    >
      <h2 id="quiz-exit-dialog-title">要離開挑戰嗎？</h2>
      <p>離開後本次作答將作廢，下次必須重新開始。</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="quiz-exit-dialog__actions">
        <button
          className="secondary-action"
          disabled={isAbandoning}
          onClick={() => {
            setError(undefined);
            blocker.reset();
          }}
          type="button"
        >
          繼續作答
        </button>
        <button
          className="primary-action"
          data-primary-action="true"
          disabled={isAbandoning}
          onClick={() => {
            setError(undefined);
            setIsAbandoning(true);
            void repository
              .abandonSession(sessionId)
              .then(() => {
                blocker.proceed();
              })
              .catch((caught: unknown) => {
                setError(errorMessage(caught));
                setIsAbandoning(false);
              });
          }}
          type="button"
        >
          {isAbandoning ? '正在離開…' : '離開並重新挑戰'}
        </button>
      </div>
    </dialog>
  );
}
