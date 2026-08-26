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
  type ReviewMediaResolution,
} from '../api/learning-repository';
import { studentChapterMapKey } from './use-chapter-map';

export const learningKeys = {
  chapterReview: (chapterId: string) =>
    ['learning', 'chapter-review', chapterId] as const,
  classroomProgress: (classroomId: string) =>
    ['learning', 'classroom-progress', classroomId] as const,
  mistakes: ['learning', 'mistakes'] as const,
  progress: (chapterId: string | null) =>
    ['learning', 'progress', chapterId ?? 'all'] as const,
  reviewProgress: ['learning', 'review-progress'] as const,
  reviewMedia: (assetPaths: readonly string[]) =>
    ['learning', 'review-media', ...assetPaths] as const,
};

export const REVIEW_MEDIA_STALE_TIME_MS = 50 * 60 * 1000;
export const REVIEW_MEDIA_GC_TIME_MS = 60 * 60 * 1000;
export const REVIEW_MEDIA_MAX_RETRIES = 3;
const REVIEW_MEDIA_INITIAL_RETRY_DELAY_MS = 500;
const REVIEW_MEDIA_MAX_RETRY_DELAY_MS = 4_000;

export const calculateReadQueryRetryDelay = (
  attemptIndex: number,
  random: () => number = Math.random,
): number => {
  const exponentialDelay = Math.min(
    REVIEW_MEDIA_INITIAL_RETRY_DELAY_MS * 2 ** attemptIndex,
    REVIEW_MEDIA_MAX_RETRY_DELAY_MS,
  );
  return Math.round(exponentialDelay * (0.5 + random() * 0.5));
};

export const readQueryRetryDelay = (attemptIndex: number): number =>
  calculateReadQueryRetryDelay(attemptIndex);

export const shouldRetryReviewMedia = (
  failureCount: number,
  error: LearningError,
): boolean =>
  error.code === 'UNAVAILABLE' && failureCount < REVIEW_MEDIA_MAX_RETRIES;

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
  accessConfirmed = true,
): UseQueryResult<readonly ChapterReviewSection[], LearningError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly ChapterReviewSection[], LearningError>({
    enabled: chapterId.length > 0 && accessConfirmed,
    queryFn: () => resolved.listChapterReview(chapterId),
    queryKey: learningKeys.chapterReview(chapterId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
    retryDelay: readQueryRetryDelay,
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
    retryDelay: readQueryRetryDelay,
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
    retryDelay: readQueryRetryDelay,
  });
}

export function useReviewMedia(
  assetPaths: readonly string[],
  repository?: LearningRepository,
): UseQueryResult<readonly ReviewMediaResolution[], LearningError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly ReviewMediaResolution[], LearningError>({
    enabled: assetPaths.length > 0,
    gcTime: REVIEW_MEDIA_GC_TIME_MS,
    queryFn: () => resolved.resolveReviewMedia(assetPaths),
    queryKey: learningKeys.reviewMedia(assetPaths),
    retry: shouldRetryReviewMedia,
    retryDelay: readQueryRetryDelay,
    staleTime: REVIEW_MEDIA_STALE_TIME_MS,
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
        queryClient.invalidateQueries({ queryKey: studentChapterMapKey }),
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
