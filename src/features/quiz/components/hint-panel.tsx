import { useState } from 'react';

import { HintCallout } from '../../../components/ui/hint-callout';
import type {
  LearningRepository,
  QuestionHintView,
} from '../../learning/api/learning-repository';
import { useRequestHint } from '../../learning/hooks/use-learning';

/**
 * Tiered hints for the active formal question. Levels unlock strictly in
 * order and all content comes from the trusted command; a replayed level
 * returns the recorded content, so refresh never double-counts events.
 * Mount with a key of the session question id so state resets per question.
 */
export function HintPanel({
  locked,
  repository,
  sessionQuestionId,
}: Readonly<{
  locked: boolean;
  repository?: LearningRepository;
  sessionQuestionId: string;
}>) {
  const request = useRequestHint(repository);
  const [hints, setHints] = useState<readonly QuestionHintView[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [message, setMessage] = useState<string>();
  const nextLevel = hints.length + 1;
  const canRequest = !locked && !exhausted && nextLevel <= 3;

  if (locked && hints.length === 0) return null;

  return (
    <section aria-label="提示" className="quiz-hints">
      {hints.map((hint) => (
        <HintCallout key={hint.hintLevel} tier={hint.hintLevel === 1 ? 1 : 2}>
          提示 {hint.hintLevel}：{hint.content}
        </HintCallout>
      ))}
      {canRequest ? (
        <button
          disabled={request.isPending}
          onClick={() => {
            setMessage(undefined);
            request.mutate(
              { hintLevel: nextLevel, sessionQuestionId },
              {
                onError: (error) => {
                  if (
                    error.code === 'HINT_UNAVAILABLE' ||
                    error.code === 'HINT_CLOSED'
                  ) {
                    setExhausted(true);
                  }
                  setMessage(error.message);
                },
                onSuccess: (hint) => {
                  setHints((previous) => [...previous, hint]);
                },
              },
            );
          }}
          type="button"
        >
          {request.isPending
            ? '提示載入中…'
            : `索取提示（第 ${String(nextLevel)} 層）`}
        </button>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
