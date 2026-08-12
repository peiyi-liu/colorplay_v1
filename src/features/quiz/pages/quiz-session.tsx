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
  studentChapterMapKey,
  useStudentChapterMap,
} from '../../learning/hooks/use-chapter-map';
import { economyQueryKey } from '../../rewards/hooks/use-economy-summary';
import {
  createQuizRepository,
  QuizRepositoryError,
  type QuizRepository,
  type QuizSession,
} from '../api/quiz-repository';
import { BattleStage, type BattlePhase } from '../components/battle-stage';
import { Countdown } from '../components/countdown';
import { FeedbackCard } from '../components/feedback-card';
import { QuestionCard } from '../components/question-card';
import { QuizExitGuard } from '../components/quiz-exit-guard';
import { comboCount } from '../lib/combo';
import {
  feedbackFromQuestion,
  quizActionErrorMessage,
  type QuizActionError,
} from '../lib/quiz-session-view-model';

import './quiz-session.css';

const quizSessionQueryKey = (sessionId: string) =>
  ['quiz', 'session', sessionId] as const;

const requestId = () => globalThis.crypto.randomUUID();

const withoutNumberPrefix = (title: string) =>
  title.replace(
    /^\s*(?:第\s*)?\d+(?:\s*[-–—・.]\s*\d+)?(?:\s*章|節)?\s*[-–—・.]?\s*/u,
    '',
  );

type SubmissionAttempt = Readonly<{
  idempotencyKey: string;
  questionId: string;
  selectedId: string | null;
}>;

export function QuizSessionPage({
  repository: suppliedRepository,
}: Readonly<{
  repository?: QuizRepository;
}>) {
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
  const [actionError, setActionError] = useState<QuizActionError>();
  const [attacking, setAttacking] = useState(false);
  const submissionStarted = useRef(false);
  const submissionAttempt = useRef<SubmissionAttempt | undefined>(undefined);
  const creationStarted = useRef(false);
  const creationRequestId = useRef<string | undefined>(undefined);
  const allowQuizNavigation = useRef(false);

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

  const lockedCreation =
    createMutation.isError &&
    createMutation.error instanceof QuizRepositoryError &&
    createMutation.error.code === 'CHAPTER_LOCKED';
  const chapterMap = useStudentChapterMap(undefined, lockedCreation);
  const lockedChapter =
    lockedCreation && templateId
      ? chapterMap.data?.chapters.find(
          (chapter) => chapter.templateId === templateId,
        )
      : undefined;

  useEffect(() => {
    if (!lockedChapter) return;
    void navigate(
      `/app?chapter=${encodeURIComponent(lockedChapter.chapterId)}&reason=locked`,
      { replace: true },
    );
  }, [lockedChapter, navigate]);

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
  const lastAnsweredQuestion = session?.questions
    .filter(({ answerStatus }) => answerStatus !== null)
    .at(-1);
  const feedbackQuestion =
    session &&
    ((!firstUnansweredQuestion && lastAnsweredQuestion) ||
      firstUnansweredQuestion?.startedAt === null)
      ? lastAnsweredQuestion
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
  const battlePhase: BattlePhase = feedbackResult
    ? feedbackResult.answerStatus === 'correct'
      ? 'hit'
      : feedbackResult.answerStatus === 'incorrect'
        ? 'miss'
        : 'enemyStrike'
    : attacking
      ? 'attacking'
      : 'idle';
  const chapterLabel = `第 ${String(session?.chapterSortOrder ?? '')} 章・${withoutNumberPrefix(session?.chapterTitle ?? '')}`;
  const challengeLabel =
    session?.challengeKind === 'section' &&
    session.sectionSortOrder !== null &&
    session.sectionTitle
      ? `${String(session.chapterSortOrder)}-${String(session.sectionSortOrder)}・${withoutNumberPrefix(session.sectionTitle)}`
      : '章節總挑戰';

  useEffect(() => {
    if (session?.status === 'completed') {
      allowQuizNavigation.current = true;
      void navigate(`/app/quiz/${session.sessionId}/result`, { replace: true });
    } else if (session?.status === 'abandoned') {
      allowQuizNavigation.current = true;
      void navigate('/app', { replace: true });
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
    if (selectedId !== null) setAttacking(true);
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
        setActionError({
          kind: 'submit',
          message: quizActionErrorMessage(error),
        });
      }
    } finally {
      submissionStarted.current = false;
      setAttacking(false);
    }
  };

  const continueAfterFeedback = async () => {
    if (!session || !displayedQuestion) return;
    setActionError(undefined);
    if (displayedQuestion.position === session.questionCount) {
      try {
        const finalResult = await finalizeMutation.mutateAsync(
          session.sessionId,
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: economyQueryKey }),
          queryClient.invalidateQueries({ queryKey: studentChapterMapKey }),
        ]);
        allowQuizNavigation.current = true;
        void navigate(`/app/quiz/${session.sessionId}/result`, {
          state: {
            fromFinalize: true,
            ...(finalResult.assignmentAttempt
              ? { assignmentAttempt: finalResult.assignmentAttempt }
              : {}),
          },
        });
      } catch (error) {
        setActionError({
          kind: 'finalize',
          message: quizActionErrorMessage(error),
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
      setActionError({
        kind: 'advance',
        message: quizActionErrorMessage(error),
      });
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
    if (lockedCreation) {
      if (chapterMap.isPending || lockedChapter) {
        return <RouteLoading withinMain />;
      }
      return (
        <section className="quiz-message-panel">
          <h1>無法建立挑戰</h1>
          <p role="alert">章節狀態暫時無法確認</p>
          <Link className="primary-action" to="/app">
            回學習地圖
          </Link>
        </section>
      );
    }
    return (
      <section className="quiz-message-panel">
        <h1>無法建立挑戰</h1>
        <p role="alert">{quizActionErrorMessage(createMutation.error)}</p>
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
      <>
        <QuizExitGuard
          active={session.status === 'in_progress'}
          allowNavigationRef={allowQuizNavigation}
          repository={repository}
          sessionId={session.sessionId}
        />
        <section className="quiz-message-panel">
          <h1>{session.chapterTitle}</h1>
          <p role="status">正在準備下一題…</p>
        </section>
      </>
    );
  }

  return (
    <>
      <QuizExitGuard
        active={session.status === 'in_progress'}
        allowNavigationRef={allowQuizNavigation}
        repository={repository}
        sessionId={session.sessionId}
      />
      <section
        className="quiz-runner quiz-runner--battle-v2 scene-night battle-scene"
        aria-labelledby="quiz-runner-title"
      >
        <header className="quiz-runner__header">
          <div className="quiz-runner__title-group">
            <h1 id="quiz-runner-title">{chapterLabel}</h1>
            <p>{challengeLabel}</p>
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
              startedAt={displayedQuestion.startedAt}
            />
          </div>
        </header>

        <BattleStage
          comboCount={comboCount(session.questions)}
          phase={battlePhase}
          questionSeed={displayedQuestion.stableCode}
        />

        <div className="quiz-runner__question-dock">
          {session.gameRulesVersion === '2026-07-progress-1' ? (
            <p role="status">
              補救練習模式：答對可解決錯題並回復精熟；不發 Token，XP 以 20%
              計，原始成績不變。
            </p>
          ) : null}

          <QuestionCard
            isPending={submitMutation.isPending}
            locked={
              feedbackResult !== undefined || actionError?.kind === 'submit'
            }
            onSelect={(optionId) => {
              setSelection({
                optionId,
                questionId: displayedQuestion.sessionQuestionId,
              });
            }}
            onSubmit={() => void submit(selectedOptionId)}
            question={displayedQuestion}
            selectedOptionId={
              feedbackResult
                ? feedbackResult.selectedOptionId
                : selectedOptionId
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
              isLastQuestion={
                displayedQuestion.position === session.questionCount
              }
              isPending={
                finalizeMutation.isPending || activateMutation.isPending
              }
              onContinue={() => void continueAfterFeedback()}
              result={feedbackResult}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}
