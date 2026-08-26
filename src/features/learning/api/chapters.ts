import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import type { Database } from '../../../types/database';

const databaseUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);
const catalogSchema = z.array(
  z.object({
    chapters: z.object({
      description: z.string(),
      id: databaseUuidSchema,
      sections: z.array(
        z.object({
          subtopics: z.array(
            z.object({
              questions: z.array(z.object({ id: databaseUuidSchema })),
              title: z.string().min(1),
            }),
          ),
        }),
      ),
      sort_order: z.number().int().nonnegative(),
      stable_code: z.string().min(1),
      title: z.string().min(1),
    }),
    id: databaseUuidSchema,
    question_count: z.number().int().positive(),
    title: z.string().min(1),
  }),
);

export type PublishedChapter = Readonly<{
  description: string;
  id: string;
  isPlayable: boolean;
  sortOrder: number;
  stableCode: string;
  /** 有題目的小節代碼（如 3-1；owner 0728：課後實戰列表要顯示小節）。 */
  subtopicCodes: readonly string[];
  /** 有題目的完整小節標題（owner 0730 #5：任務實戰逐小節完整列出）。 */
  subtopicTitles: readonly string[];
  template: Readonly<{
    id: string;
    questionCount: number;
    title: string;
  }>;
  title: string;
}>;

export type LearningRepositoryErrorCode =
  'CHAPTERS_INVALID_RESPONSE' | 'CHAPTERS_UNAVAILABLE';

const learningMessages: Record<LearningRepositoryErrorCode, string> = {
  CHAPTERS_INVALID_RESPONSE: '章節資料格式不正確，請稍後重試。',
  CHAPTERS_UNAVAILABLE: '目前無法載入章節，請稍後重試。',
};

export class LearningRepositoryError extends Error {
  readonly code: LearningRepositoryErrorCode;

  constructor(code: LearningRepositoryErrorCode) {
    super(learningMessages[code]);
    this.name = 'LearningRepositoryError';
    this.code = code;
  }
}

const countQuestions = (
  sections: z.infer<typeof catalogSchema>[number]['chapters']['sections'],
) =>
  sections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.subtopics.reduce(
        (subtopicTotal, subtopic) => subtopicTotal + subtopic.questions.length,
        0,
      ),
    0,
  );

// 小節標題以「3-1 」代碼開頭（題庫匯入慣例）；取有題目的小節代碼供列表顯示。
const subtopicCodePattern = /^\d+-\d+/u;

const collectSubtopicCodes = (
  sections: z.infer<typeof catalogSchema>[number]['chapters']['sections'],
): readonly string[] =>
  [
    ...new Set(
      sections.flatMap((section) =>
        section.subtopics
          .filter((subtopic) => subtopic.questions.length > 0)
          .map((subtopic) => subtopicCodePattern.exec(subtopic.title)?.[0])
          .filter((code): code is string => code !== undefined),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));

/** owner 0730 #5：課後實戰逐小節完整列出（含「3-1 」代碼前綴的完整標題）。 */
const collectSubtopicTitles = (
  sections: z.infer<typeof catalogSchema>[number]['chapters']['sections'],
): readonly string[] =>
  [
    ...new Set(
      sections.flatMap((section) =>
        section.subtopics
          .filter((subtopic) => subtopic.questions.length > 0)
          .map((subtopic) => subtopic.title),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));

export async function fetchPublishedChapters(
  client: SupabaseClient<Database>,
): Promise<PublishedChapter[]> {
  const { data, error } = await client
    .from('quiz_templates')
    .select(
      `
        id,
        title,
        question_count,
        chapters!inner(
          id,
          stable_code,
          title,
          description,
          sort_order,
          sections(
            subtopics(
              title,
              questions(id)
            )
          )
        )
      `,
    )
    .eq('status', 'published')
    .is('section_id', null)
    .order('sort_order', { referencedTable: 'chapters' });

  if (error) throw new LearningRepositoryError('CHAPTERS_UNAVAILABLE');

  const parsed = catalogSchema.safeParse(data);
  if (!parsed.success) {
    throw new LearningRepositoryError('CHAPTERS_INVALID_RESPONSE');
  }

  return parsed.data
    .map(({ chapters, id, question_count: questionCount, title }) => ({
      description: chapters.description,
      id: chapters.id,
      isPlayable: countQuestions(chapters.sections) > 0,
      sortOrder: chapters.sort_order,
      stableCode: chapters.stable_code,
      subtopicCodes: collectSubtopicCodes(chapters.sections),
      subtopicTitles: collectSubtopicTitles(chapters.sections),
      template: { id, questionCount, title },
      title: chapters.title,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export const publishedChaptersQueryKey = [
  'learning',
  'published-chapters',
] as const;

export type PublishedChaptersQuery = Pick<
  UseQueryResult<PublishedChapter[], LearningRepositoryError>,
  'data' | 'error' | 'isError' | 'isPending' | 'refetch'
>;

export function usePublishedChapters(): PublishedChaptersQuery {
  const query = useQuery<PublishedChapter[], LearningRepositoryError>({
    queryFn: () =>
      fetchPublishedChapters(
        getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
      ),
    queryKey: publishedChaptersQueryKey,
    retry: (failureCount, error) =>
      error.code !== 'CHAPTERS_INVALID_RESPONSE' && failureCount < 2,
  });

  return {
    data: query.data,
    error: query.error,
    isError: query.isError,
    isPending: query.isPending,
    refetch: query.refetch,
  };
}
