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
import {
  createQuizRepository,
  QuizRepositoryError,
  type QuizAnswerResult,
  type QuizRepository,
  type QuizSession,
} from '../api/quiz-repository';
import { Countdown } from '../components/countdown';
import { FeedbackCard } from '../components/feedback-card';
import { QuestionCard } from '../components/question-card';

const quizSessionQueryKey = (sessionId: string) =>
  ['quiz', 'session', sessionId] as const;

const requestId = () => globalThis.crypto.randomUUID();

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
  const [feedback, setFeedback] = useState<
    Readonly<{ questionId: string; result: QuizAnswerResult }> | undefined
  >();
  const submissionStarted = useRef(false);
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

  const session = sessionQuery.data;
  const activeQuestion = session?.questions.find(
    (question) =>
      question.answerStatus === null &&
      question.startedAt !== null &&
      question.deadlineAt !== null,
  );
  const feedbackQuestion = feedback
    ? session?.questions.find(
        ({ sessionQuestionId }) => sessionQuestionId === feedback.questionId,
      )
    : undefined;
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
    try {
      const result = await submitMutation.mutateAsync({
        idempotencyKey: requestId(),
        questionId: activeQuestion.sessionQuestionId,
        selectedId,
      });
      await sessionQuery.refetch();
      setFeedback({
        questionId: activeQuestion.sessionQuestionId,
        result,
      });
    } finally {
      submissionStarted.current = false;
    }
  };

  const continueAfterFeedback = async () => {
    if (!session || !displayedQuestion) return;
    if (displayedQuestion.position === session.questionCount) {
      await finalizeMutation.mutateAsync(session.sessionId);
      void navigate(`/app/quiz/${session.sessionId}/result`);
      return;
    }
    setFeedback(undefined);
    setSelection(undefined);
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

  if (isNewSession || sessionQuery.isPending)
    return <RouteLoading withinMain />;

  const visibleError =
    createMutation.error ??
    sessionQuery.error ??
    submitMutation.error ??
    finalizeMutation.error;
  if (visibleError || sessionQuery.isError || !session) {
    return (
      <section className="quiz-message-panel">
        <h1>挑戰暫時中斷</h1>
        <p role="alert">
          {visibleError instanceof Error
            ? visibleError.message
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
            {String(feedback?.result.totalScore ?? session.totalScore)}
          </p>
          <Countdown
            deadlineAt={displayedQuestion.deadlineAt}
            onExpire={() => void submit(null)}
            paused={feedback !== undefined}
          />
        </div>
      </header>

      <QuestionCard
        isPending={submitMutation.isPending}
        locked={feedback !== undefined}
        onSelect={(optionId) => {
          setSelection({
            optionId,
            questionId: displayedQuestion.sessionQuestionId,
          });
        }}
        onSubmit={() => void submit(selectedOptionId)}
        question={displayedQuestion}
        selectedOptionId={
          feedback ? feedback.result.selectedOptionId : selectedOptionId
        }
      />

      {feedback ? (
        <FeedbackCard
          isLastQuestion={displayedQuestion.position === session.questionCount}
          isPending={finalizeMutation.isPending}
          onContinue={() => void continueAfterFeedback()}
          result={feedback.result}
        />
      ) : null}
    </section>
  );
}
