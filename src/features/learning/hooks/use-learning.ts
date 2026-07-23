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
  type ChapterReviewSection,
  type ClassroomProgressRow,
  createLearningRepository,
  type LearningError,
  type LearningProgressRow,
  type LearningRepository,
  type MistakeView,
  type QuestionHintView,
  type ReviewCompletionRow,
} from '../api/learning-repository';

export const learningKeys = {
  chapterReview: (chapterId: string) =>
    ['learning', 'chapter-review', chapterId] as const,
  classroomProgress: (classroomId: string) =>
    ['learning', 'classroom-progress', classroomId] as const,
  mistakes: ['learning', 'mistakes'] as const,
  progress: (chapterId: string | null) =>
    ['learning', 'progress', chapterId ?? 'all'] as const,
  reviewProgress: ['learning', 'review-progress'] as const,
};

const resolveRepository = (
  repository?: LearningRepository,
): LearningRepository =>
  repository ??
  createLearningRepository(
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
  );

export function useChapterReview(
  chapterId: string,
  repository?: LearningRepository,
): UseQueryResult<readonly ChapterReviewSection[], LearningError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly ChapterReviewSection[], LearningError>({
    enabled: chapterId.length > 0,
    queryFn: () => resolved.listChapterReview(chapterId),
    queryKey: learningKeys.chapterReview(chapterId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export function useLearningProgress(
  chapterId: string | null,
  repository?: LearningRepository,
): UseQueryResult<readonly LearningProgressRow[], LearningError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly LearningProgressRow[], LearningError>({
    queryFn: () => resolved.getLearningProgress(chapterId),
    queryKey: learningKeys.progress(chapterId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export function useReviewProgressRows(
  repository?: LearningRepository,
): UseQueryResult<readonly ReviewCompletionRow[], LearningError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly ReviewCompletionRow[], LearningError>({
    queryFn: () => resolved.listReviewProgress(),
    queryKey: learningKeys.reviewProgress,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export function useCompleteReviewCard(
  chapterId: string,
  repository?: LearningRepository,
): UseMutationResult<
  void,
  LearningError,
  { requestId: string; reviewCardId: string }
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.completeReviewCard(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: learningKeys.reviewProgress,
        }),
        queryClient.invalidateQueries({
          queryKey: learningKeys.progress(chapterId),
        }),
        queryClient.invalidateQueries({
          queryKey: learningKeys.progress(null),
        }),
      ]);
    },
    retry: false,
  });
}

export function useMistakes(
  repository?: LearningRepository,
): UseQueryResult<readonly MistakeView[], LearningError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly MistakeView[], LearningError>({
    queryFn: () => resolved.listMistakes(),
    queryKey: learningKeys.mistakes,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export function useStartRemediation(
  repository?: LearningRepository,
): UseMutationResult<
  string,
  LearningError,
  { requestId: string; subtopicId: string }
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.startRemediation(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: learningKeys.mistakes });
    },
    retry: false,
  });
}

export function useRequestHint(
  repository?: LearningRepository,
): UseMutationResult<
  QuestionHintView,
  LearningError,
  { hintLevel: number; sessionQuestionId: string }
> {
  const resolved = resolveRepository(repository);
  return useMutation({
    mutationFn: (input) => resolved.requestHint(input),
    retry: false,
  });
}

export function useClassroomProgress(
  classroomId: string,
  repository?: LearningRepository,
): UseQueryResult<readonly ClassroomProgressRow[], LearningError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly ClassroomProgressRow[], LearningError>({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getClassroomProgress(classroomId),
    queryKey: learningKeys.classroomProgress(classroomId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}
