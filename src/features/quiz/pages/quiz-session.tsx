import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { economyQueryKey } from '../../rewards/hooks/use-economy-summary';
import {
  createQuizRepository,
  QuizRepositoryError,
  type QuizQuestion,
  type QuizRepository,
  type QuizSession,
} from '../api/quiz-repository';
import { Countdown } from '../components/countdown';
import {
  FeedbackCard,
  type QuizFeedbackResult,
} from '../components/feedback-card';
import { QuestionCard } from '../components/question-card';

const quizSessionQueryKey = (sessionId: string) =>
  ['quiz', 'session', sessionId] as const;

const requestId = () => globalThis.crypto.randomUUID();

type SubmissionAttempt = Readonly<{
  idempotencyKey: string;
  questionId: string;
  selectedId: string | null;
}>;

type ActionError = Readonly<{
  kind: 'advance' | 'finalize' | 'submit';
  message: string;
}>;

const actionErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '答題服務暫時無法使用，請稍後重試。';

const feedbackFromQuestion = (
  question: QuizQuestion | undefined,
  totalScore: number,
): QuizFeedbackResult | undefined => {
  if (
    !question?.answerStatus ||
    !question.correctOptionId ||
    !question.explanation ||
    question.scoreDelta === null
  ) {
    return undefined;
  }
  const correctOption = question.options.find(
    ({ id }) => id === question.correctOptionId,
  );
  if (!correctOption) return undefined;
  return {
    answerStatus: question.answerStatus,
    correctOptionId: question.correctOptionId,
    correctOptionText: correctOption.text,
    explanation: question.explanation,
    scoreDelta: question.scoreDelta,
    selectedOptionId: question.selectedOptionId,
    totalScore,
  };
};

export function QuizSessionPage({
  repository: suppliedRepository,
}: Readonly<{ repository?: QuizRepository }>) {
  const { sessionId: routeSessionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const repository = useMemo(
    () =>
      suppliedRepository ??
      createQuizRepository(
        getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
      ),
    [suppliedRepository],
  );
  const isNewSession = routeSessionId === 'new';
  const templateId = searchParams.get('template');
  const [selection, setSelection] = useState<
    Readonly<{ optionId: string; questionId: string }> | undefined
  >();
  const [actionError, setActionError] = useState<ActionError>();
  const submissionStarted = useRef(false);
  const submissionAttempt = useRef<SubmissionAttempt | undefined>(undefined);
  const creationStarted = useRef(false);
  const creationRequestId = useRef<string | undefined>(undefined);

  const sessionQuery = useQuery<QuizSession, QuizRepositoryError>({
    enabled: Boolean(routeSessionId) && !isNewSession,
    queryFn: () => {
      if (!routeSessionId || isNewSession) {
        throw new QuizRepositoryError('SESSION_NOT_FOUND');
      }
      return repository.getSession(routeSessionId);
    },
    queryKey: quizSessionQueryKey(routeSessionId ?? 'missing'),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });

  const createMutation = useMutation({
    mutationFn: ({
      clientRequestId,
      selectedTemplateId,
    }: Readonly<{ clientRequestId: string; selectedTemplateId: string }>) =>
      repository.createSession(selectedTemplateId, clientRequestId),
    onSuccess: (createdSession) => {
      queryClient.setQueryData(
        quizSessionQueryKey(createdSession.sessionId),
        createdSession,
      );
      void navigate(`/app/quiz/${createdSession.sessionId}`, { replace: true });
    },
  });

  useEffect(() => {
    if (!isNewSession || !templateId || creationStarted.current) return;
    creationStarted.current = true;
    creationRequestId.current = requestId();
    createMutation.mutate({
      clientRequestId: creationRequestId.current,
      selectedTemplateId: templateId,
    });
  }, [createMutation, isNewSession, templateId]);

  const submitMutation = useMutation({
    mutationFn: ({
      idempotencyKey,
      questionId,
      selectedId,
    }: Readonly<{
      idempotencyKey: string;
      questionId: string;
      selectedId: string | null;
    }>) => repository.submitAnswer(questionId, selectedId, idempotencyKey),
  });
  const finalizeMutation = useMutation({
    mutationFn: (sessionId: string) => repository.finalizeSession(sessionId),
  });
  const activateMutation = useMutation({
    mutationFn: (sessionId: string) =>
      repository.activateNextQuestion(sessionId),
  });

  const session = sessionQuery.data;
  const firstUnansweredQuestion = session?.questions.find(
    ({ answerStatus }) => answerStatus === null,
  );
  const activeQuestion =
    firstUnansweredQuestion?.startedAt && firstUnansweredQuestion.deadlineAt
      ? firstUnansweredQuestion
      : undefined;
  const feedbackQuestion =
    session &&
    ((!firstUnansweredQuestion && session.answeredCount > 0) ||
      firstUnansweredQuestion?.startedAt === null)
      ? session.questions
          .filter(({ answerStatus }) => answerStatus !== null)
          .at(-1)
      : undefined;
  const feedbackResult = feedbackFromQuestion(
    feedbackQuestion,
    session?.totalScore ?? 0,
  );
  const displayedQuestion = feedbackQuestion ?? activeQuestion;
  const selectedOptionId =
    selection && selection.questionId === displayedQuestion?.sessionQuestionId
      ? selection.optionId
      : null;

  useEffect(() => {
    if (session?.status === 'completed') {
      void navigate(`/app/quiz/${session.sessionId}/result`, { replace: true });
    }
  }, [navigate, session]);

  const submit = async (selectedId: string | null) => {
    if (!activeQuestion || submissionStarted.current) return;
    submissionStarted.current = true;
    const previousAttempt = submissionAttempt.current;
    const attempt =
      previousAttempt?.questionId === activeQuestion.sessionQuestionId &&
      previousAttempt.selectedId === selectedId
        ? previousAttempt
        : {
            idempotencyKey: requestId(),
            questionId: activeQuestion.sessionQuestionId,
            selectedId,
          };
    submissionAttempt.current = attempt;
    setActionError(undefined);
    try {
      await submitMutation.mutateAsync(attempt);
      const refreshed = await sessionQuery.refetch();
      if (refreshed.isError) throw refreshed.error;
      submissionAttempt.current = undefined;
    } catch (error) {
      const refreshed = await sessionQuery.refetch();
      const reconciledQuestion = refreshed.data?.questions.find(
        ({ sessionQuestionId }) => sessionQuestionId === attempt.questionId,
      );
      if (reconciledQuestion?.answerStatus) {
        submissionAttempt.current = undefined;
        setActionError(undefined);
      } else {
        setActionError({ kind: 'submit', message: actionErrorMessage(error) });
      }
    } finally {
      submissionStarted.current = false;
    }
  };

  const continueAfterFeedback = async () => {
    if (!session || !displayedQuestion) return;
    setActionError(undefined);
    if (displayedQuestion.position === session.questionCount) {
      try {
        await finalizeMutation.mutateAsync(session.sessionId);
        await queryClient.invalidateQueries({ queryKey: economyQueryKey });
        void navigate(`/app/quiz/${session.sessionId}/result`);
      } catch (error) {
        setActionError({
          kind: 'finalize',
          message: actionErrorMessage(error),
        });
      }
      return;
    }
    try {
      const activatedSession = await activateMutation.mutateAsync(
        session.sessionId,
      );
      queryClient.setQueryData(
        quizSessionQueryKey(session.sessionId),
        activatedSession,
      );
      setSelection(undefined);
    } catch (error) {
      setActionError({ kind: 'advance', message: actionErrorMessage(error) });
    }
  };

  if (!routeSessionId || (isNewSession && !templateId)) {
    return (
      <section className="quiz-message-panel">
        <h1>無法開始挑戰</h1>
        <p role="alert">缺少可玩的章節資料，請返回章節頁重新選擇。</p>
        <Link className="primary-action" data-primary-action="true" to="/app">
          回章節
        </Link>
      </section>
    );
  }

  if (isNewSession && createMutation.isError) {
    return (
      <section className="quiz-message-panel">
        <h1>無法建立挑戰</h1>
        <p role="alert">{actionErrorMessage(createMutation.error)}</p>
        <button
          className="primary-action"
          data-primary-action="true"
          onClick={() => {
            if (!templateId || !creationRequestId.current) return;
            createMutation.reset();
            createMutation.mutate({
              clientRequestId: creationRequestId.current,
              selectedTemplateId: templateId,
            });
          }}
          type="button"
        >
          重新嘗試
        </button>
      </section>
    );
  }

  if (isNewSession || sessionQuery.isPending)
    return <RouteLoading withinMain />;

  if (sessionQuery.isError || !session) {
    return (
      <section className="quiz-message-panel">
        <h1>挑戰暫時中斷</h1>
        <p role="alert">
          {sessionQuery.error instanceof Error
            ? sessionQuery.error.message
            : '目前無法載入挑戰，請稍後重試。'}
        </p>
        <button
          className="primary-action"
          data-primary-action="true"
          onClick={() => void sessionQuery.refetch()}
          type="button"
        >
          重新載入
        </button>
      </section>
    );
  }

  if (!displayedQuestion?.deadlineAt) {
    return (
      <section className="quiz-message-panel">
        <h1>{session.chapterTitle}</h1>
        <p role="status">正在準備下一題…</p>
      </section>
    );
  }

  return (
    <section className="quiz-runner" aria-labelledby="quiz-runner-title">
      <header className="quiz-runner__header">
        <div>
          <p className="route-panel__eyebrow">限時挑戰</p>
          <h1 id="quiz-runner-title">{session.chapterTitle}</h1>
        </div>
        <div className="quiz-runner__status" aria-label="挑戰進度">
          <p>
            第 {String(displayedQuestion.position)} /{' '}
            {String(session.questionCount)} 題
          </p>
          <p>
            Quiz Score：
            {String(session.totalScore)}
          </p>
          <Countdown
            deadlineAt={displayedQuestion.deadlineAt}
            onExpire={() => void submit(null)}
            paused={feedbackResult !== undefined}
          />
        </div>
      </header>

      <QuestionCard
        isPending={submitMutation.isPending}
        locked={feedbackResult !== undefined || actionError?.kind === 'submit'}
        onSelect={(optionId) => {
          setSelection({
            optionId,
            questionId: displayedQuestion.sessionQuestionId,
          });
        }}
        onSubmit={() => void submit(selectedOptionId)}
        question={displayedQuestion}
        selectedOptionId={
          feedbackResult ? feedbackResult.selectedOptionId : selectedOptionId
        }
      />

      {actionError ? (
        <div className="quiz-action-error" role="alert">
          <p>{actionError.message}</p>
          {actionError.kind === 'submit' ? (
            <button
              className="primary-action"
              data-primary-action="true"
              disabled={submitMutation.isPending}
              onClick={() => {
                const attempt = submissionAttempt.current;
                if (attempt) void submit(attempt.selectedId);
              }}
              type="button"
            >
              重試送出
            </button>
          ) : null}
        </div>
      ) : null}

      {feedbackResult ? (
        <FeedbackCard
          isLastQuestion={displayedQuestion.position === session.questionCount}
          isPending={finalizeMutation.isPending || activateMutation.isPending}
          onContinue={() => void continueAfterFeedback()}
          result={feedbackResult}
        />
      ) : null}
    </section>
  );
}
