import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import {
  type AssessmentQuestionRow,
  type AssessmentSource,
  type AnalyticsFilters,
  type AssignmentSummaryRow,
  type ChapterCompletionRow,
  type ClassroomSummary,
  type ClassroomOverview,
  createTeacherContentRepository,
  type DateRangeFilters,
  type ImportCommitReport,
  type LiveReportRow,
  type LiveHistoryPage,
  type PublishReceipt,
  type QuestionAnalysisRow,
  type QuestionDetail,
  type TeacherQuestionAnswer,
  type QuestionDraftPayload,
  type ReviewCardDraftPayload,
  type SubtopicMasteryRow,
  type SubtopicOption,
  type TeacherCardRow,
  type TeacherContentError,
  type TeacherContentRepository,
  type TeacherQuestionRow,
} from '../api/teacher-content-repository';
import type { ImportQuestionRow, ImportReviewCardRow } from '../api/xlsx-codec';

export const teacherContentKeys = {
  assessmentQuestions: (
    classroomId: string,
    filters: AnalyticsFilters,
    source: AssessmentSource,
  ) =>
    [
      'teacher-content',
      'assessment-questions',
      classroomId,
      filters,
      source,
    ] as const,
  assignmentSummary: (classroomId: string, filters: DateRangeFilters) =>
    ['teacher-content', 'assignment-summary', classroomId, filters] as const,
  cards: ['teacher-content', 'cards'] as const,
  chapterCompletion: (classroomId: string, chapterId?: string | null) =>
    ['teacher-content', 'chapter-completion', classroomId, chapterId] as const,
  classroomSummary: (classroomId: string, filters: AnalyticsFilters) =>
    ['teacher-content', 'classroom-summary', classroomId, filters] as const,
  classroomOverview: (classroomId: string, filters: AnalyticsFilters) =>
    ['teacher-content', 'classroom-overview', classroomId, filters] as const,
  liveHistory: (classroomId: string, filters: DateRangeFilters, page: number) =>
    ['teacher-content', 'live-history', classroomId, filters, page] as const,
  liveReport: (classroomId: string, filters: DateRangeFilters) =>
    ['teacher-content', 'live-report', classroomId, filters] as const,
  questionAnalysis: (classroomId: string, filters: AnalyticsFilters) =>
    ['teacher-content', 'question-analysis', classroomId, filters] as const,
  questionDetail: (classroomId: string, stableCode: string) =>
    ['teacher-content', 'question-detail', classroomId, stableCode] as const,
  questionAnswer: (classroomId: string, stableCode: string) =>
    ['teacher-content', 'question-answer', classroomId, stableCode] as const,
  questions: ['teacher-content', 'questions'] as const,
  subtopicMastery: (classroomId: string, filters: AnalyticsFilters) =>
    ['teacher-content', 'subtopic-mastery', classroomId, filters] as const,
  subtopics: ['teacher-content', 'subtopics'] as const,
};

const resolveRepository = (
  repository?: TeacherContentRepository,
): TeacherContentRepository =>
  repository ??
  createTeacherContentRepository(
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
  );

const retryRead = (failureCount: number, error: TeacherContentError) =>
  error.code === 'UNAVAILABLE' && failureCount < 2;

export function useTeacherQuestions(
  repository?: TeacherContentRepository,
): UseQueryResult<readonly TeacherQuestionRow[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    queryFn: () => resolved.listQuestions(),
    queryKey: teacherContentKeys.questions,
    retry: retryRead,
  });
}

export function useTeacherCards(
  repository?: TeacherContentRepository,
): UseQueryResult<readonly TeacherCardRow[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    queryFn: () => resolved.listCards(),
    queryKey: teacherContentKeys.cards,
    retry: retryRead,
  });
}

export function useTeacherSubtopics(
  repository?: TeacherContentRepository,
): UseQueryResult<readonly SubtopicOption[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    queryFn: () => resolved.listSubtopics(),
    queryKey: teacherContentKeys.subtopics,
    retry: retryRead,
  });
}

export function useTeacherClassroomSummary(
  classroomId: string,
  filters: AnalyticsFilters,
  repository?: TeacherContentRepository,
): UseQueryResult<ClassroomSummary | null, TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getClassroomSummary(classroomId, filters),
    queryKey: teacherContentKeys.classroomSummary(classroomId, filters),
    retry: retryRead,
  });
}

export function useTeacherClassroomOverview(
  classroomId: string,
  filters: AnalyticsFilters,
  repository?: TeacherContentRepository,
): UseQueryResult<ClassroomOverview | null, TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getClassroomOverview(classroomId, filters),
    queryKey: teacherContentKeys.classroomOverview(classroomId, filters),
    retry: retryRead,
  });
}

export function useTeacherAssessmentQuestions(
  classroomId: string,
  filters: AnalyticsFilters,
  source: AssessmentSource,
  repository?: TeacherContentRepository,
): UseQueryResult<readonly AssessmentQuestionRow[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () =>
      resolved.getAssessmentQuestions(classroomId, filters, source),
    queryKey: teacherContentKeys.assessmentQuestions(
      classroomId,
      filters,
      source,
    ),
    retry: retryRead,
  });
}

export function useTeacherChapterCompletion(
  classroomId: string,
  chapterId: string | null,
  repository?: TeacherContentRepository,
): UseQueryResult<readonly ChapterCompletionRow[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getChapterCompletion(classroomId, chapterId),
    queryKey: teacherContentKeys.chapterCompletion(classroomId, chapterId),
    retry: retryRead,
  });
}

export function useTeacherQuestionAnalysis(
  classroomId: string,
  filters: AnalyticsFilters,
  repository?: TeacherContentRepository,
): UseQueryResult<readonly QuestionAnalysisRow[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getQuestionAnalysis(classroomId, filters),
    queryKey: teacherContentKeys.questionAnalysis(classroomId, filters),
    retry: retryRead,
  });
}

export function useTeacherQuestionDetail(
  classroomId: string,
  stableCode: string,
  repository?: TeacherContentRepository,
): UseQueryResult<QuestionDetail | null, TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0 && stableCode.length > 0,
    queryFn: () => resolved.getQuestionDetail(classroomId, stableCode),
    queryKey: teacherContentKeys.questionDetail(classroomId, stableCode),
    retry: retryRead,
  });
}

export function useTeacherQuestionAnswer(
  classroomId: string,
  stableCode: string,
  repository?: TeacherContentRepository,
): UseQueryResult<TeacherQuestionAnswer | null, TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0 && stableCode.length > 0,
    queryFn: () => resolved.getQuestionAnswer(classroomId, stableCode),
    queryKey: teacherContentKeys.questionAnswer(classroomId, stableCode),
    retry: retryRead,
  });
}

export function useTeacherSubtopicMastery(
  classroomId: string,
  filters: AnalyticsFilters,
  repository?: TeacherContentRepository,
): UseQueryResult<readonly SubtopicMasteryRow[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getSubtopicMastery(classroomId, filters),
    queryKey: teacherContentKeys.subtopicMastery(classroomId, filters),
    retry: retryRead,
  });
}

export function useTeacherAssignmentSummary(
  classroomId: string,
  filters: DateRangeFilters,
  repository?: TeacherContentRepository,
): UseQueryResult<readonly AssignmentSummaryRow[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getAssignmentSummary(classroomId, filters),
    queryKey: teacherContentKeys.assignmentSummary(classroomId, filters),
    retry: retryRead,
  });
}

export function useTeacherLiveReport(
  classroomId: string,
  filters: DateRangeFilters,
  repository?: TeacherContentRepository,
): UseQueryResult<readonly LiveReportRow[], TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getLiveReport(classroomId, filters),
    queryKey: teacherContentKeys.liveReport(classroomId, filters),
    retry: retryRead,
  });
}

export function useTeacherLiveHistory(
  classroomId: string,
  filters: DateRangeFilters,
  page: number,
  repository?: TeacherContentRepository,
): UseQueryResult<LiveHistoryPage, TeacherContentError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getLiveHistory(classroomId, filters, page, 5),
    queryKey: teacherContentKeys.liveHistory(classroomId, filters, page),
    retry: retryRead,
  });
}

const invalidateContentLists = async (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: teacherContentKeys.questions }),
    queryClient.invalidateQueries({ queryKey: teacherContentKeys.cards }),
  ]);
};

export function useUpsertQuestionDraft(
  repository?: TeacherContentRepository,
): UseMutationResult<
  void,
  TeacherContentError,
  Readonly<{ payload: QuestionDraftPayload; requestId: string }>
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.upsertQuestionDraft(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teacherContentKeys.questions,
      });
    },
    retry: false,
  });
}

export function usePublishQuestion(
  repository?: TeacherContentRepository,
): UseMutationResult<
  PublishReceipt,
  TeacherContentError,
  Readonly<{
    payload: QuestionDraftPayload | null;
    questionId: string;
    requestId: string;
  }>
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.publishQuestion(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teacherContentKeys.questions,
      });
    },
    retry: false,
  });
}

export function useUpsertReviewCardDraft(
  repository?: TeacherContentRepository,
): UseMutationResult<
  void,
  TeacherContentError,
  Readonly<{ payload: ReviewCardDraftPayload; requestId: string }>
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.upsertReviewCardDraft(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teacherContentKeys.cards,
      });
    },
    retry: false,
  });
}

export function usePublishReviewCard(
  repository?: TeacherContentRepository,
): UseMutationResult<
  PublishReceipt,
  TeacherContentError,
  Readonly<{
    cardId: string;
    payload: ReviewCardDraftPayload | null;
    requestId: string;
  }>
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.publishReviewCard(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teacherContentKeys.cards,
      });
    },
    retry: false,
  });
}

export function useArchiveReviewCard(
  repository?: TeacherContentRepository,
): UseMutationResult<
  void,
  TeacherContentError,
  Readonly<{ cardId: string; requestId: string }>
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      resolved.archiveReviewCard(input.cardId, input.requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teacherContentKeys.cards,
      });
    },
    retry: false,
  });
}

export function useArchiveQuestion(
  repository?: TeacherContentRepository,
): UseMutationResult<
  void,
  TeacherContentError,
  Readonly<{ questionId: string; requestId: string }>
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      resolved.archiveQuestion(input.questionId, input.requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teacherContentKeys.questions,
      });
    },
    retry: false,
  });
}

export function useCommitImport(
  repository?: TeacherContentRepository,
): UseMutationResult<
  ImportCommitReport,
  TeacherContentError,
  Readonly<{
    dryRun: boolean;
    filename: string;
    questions: readonly ImportQuestionRow[];
    requestId: string;
    reviewCards: readonly ImportReviewCardRow[];
  }>
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.commitImport(input),
    onSuccess: async () => {
      await invalidateContentLists(queryClient);
    },
    retry: false,
  });
}
