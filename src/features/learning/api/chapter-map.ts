import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import { LearningError } from './learning-repository';

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);

export type CourseProgressionMode = 'open' | 'sequential';
export type ChapterAccessState =
  'content_unavailable' | 'locked' | 'available' | 'completed';
export type ChapterProgressStatus =
  'not_started' | 'learning' | 'developing' | 'mastered';

export type ChapterAccessBlocker = Readonly<{
  chapterId: string;
  chapterTitle: string;
  code: 'CONTENT_UNAVAILABLE' | 'PREREQUISITE_REVIEW' | 'PREREQUISITE_MASTERY';
  current: number | null;
  required: number | null;
}>;

export type StudentChapterMapEntry = Readonly<{
  accessState: ChapterAccessState;
  blockers: readonly ChapterAccessBlocker[];
  chapterId: string;
  description: string;
  mastery: number | null;
  progressStatus: ChapterProgressStatus;
  reviewCompleted: number;
  reviewTotal: number | null;
  sortOrder: number;
  stableCode: string;
  templateId: string | null;
  templateQuestionCount: number | null;
  title: string;
}>;

export type StudentChapterMap = Readonly<{
  chapters: readonly StudentChapterMapEntry[];
  mode: CourseProgressionMode;
  rulesVersion: string;
}>;

const blockerSchema = z.strictObject({
  chapter_id: uuidSchema,
  chapter_title: z.string(),
  code: z.enum([
    'CONTENT_UNAVAILABLE',
    'PREREQUISITE_REVIEW',
    'PREREQUISITE_MASTERY',
  ]),
  current: z.number().nullable(),
  required: z.number().nullable(),
});

const chapterSchema = z.strictObject({
  access_state: z.enum([
    'content_unavailable',
    'locked',
    'available',
    'completed',
  ]),
  blockers: z.array(blockerSchema),
  chapter_id: uuidSchema,
  description: z.string(),
  mastery: z.number().min(0).max(100).nullable(),
  progress_status: z.enum([
    'not_started',
    'learning',
    'developing',
    'mastered',
  ]),
  review_completed: z.number().int().nonnegative(),
  review_total: z.number().int().nonnegative().nullable(),
  sort_order: z.number().int().positive(),
  stable_code: z.string().min(1),
  template_id: uuidSchema.nullable(),
  template_question_count: z.number().int().positive().nullable(),
  title: z.string().min(1),
});

const studentChapterMapSchema = z.strictObject({
  chapters: z.array(chapterSchema).length(6),
  mode: z.enum(['open', 'sequential']),
  rules_version: z.literal('2026-08-sequence-1'),
});

export async function fetchStudentChapterMap(
  client: SupabaseClient<Database>,
): Promise<StudentChapterMap> {
  const { data, error } = await client.rpc('get_student_chapter_map');
  if (error) throw new LearningError('UNAVAILABLE');

  const parsed = studentChapterMapSchema.safeParse(data);
  if (!parsed.success) throw new LearningError('INVALID_RESPONSE');

  return {
    chapters: parsed.data.chapters
      .map((chapter) => ({
        accessState: chapter.access_state,
        blockers: chapter.blockers.map((blocker) => ({
          chapterId: blocker.chapter_id,
          chapterTitle: blocker.chapter_title,
          code: blocker.code,
          current: blocker.current,
          required: blocker.required,
        })),
        chapterId: chapter.chapter_id,
        description: chapter.description,
        mastery: chapter.mastery,
        progressStatus: chapter.progress_status,
        reviewCompleted: chapter.review_completed,
        reviewTotal: chapter.review_total,
        sortOrder: chapter.sort_order,
        stableCode: chapter.stable_code,
        templateId: chapter.template_id,
        templateQuestionCount: chapter.template_question_count,
        title: chapter.title,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder),
    mode: parsed.data.mode,
    rulesVersion: parsed.data.rules_version,
  };
}
