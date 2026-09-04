import { z } from 'zod';

const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);

export const summarySchema = z.array(
  z
    .object({
      attempts: z.number().int().nonnegative(),
      average_accuracy: z.number().nullable(),
      unique_students: z.number().int().nonnegative(),
      worst_subtopic_title: z.string().nullable(),
    })
    .loose(),
);

export const questionAnalysisSchema = z.array(
  z.object({
    attempts: z.number().int().nonnegative(),
    correct_rate: z.number().nullable(),
    prompt: z.string(),
    stable_code: z.string(),
  }),
);

export const assessmentQuestionSchema = z.array(
  z.object({
    attempts: z.number().int().nonnegative(),
    chapter_id: uuidString,
    chapter_sort_order: z.number().int().nonnegative(),
    chapter_title: z.string(),
    correct_rate: z.number().nullable(),
    prompt: z.string(),
    section_id: uuidString,
    section_sort_order: z.number().int().nonnegative(),
    section_title: z.string(),
    stable_code: z.string(),
  }),
);

export const classroomOverviewSchema = z.array(
  z.object({
    average_accuracy: z.number().nullable(),
    completed_students: z.number().int().nonnegative(),
    total_students: z.number().int().nonnegative(),
    worst_subtopic_code: z.string().nullable(),
    worst_subtopic_title: z.string().nullable(),
  }),
);

export const chapterCompletionSchema = z.array(
  z.object({
    chapter_id: uuidString,
    chapter_sort_order: z.number().int().nonnegative(),
    chapter_title: z.string(),
    completed_students: z.number().int().nonnegative(),
    completion_rate: z.number().nullable(),
    student_statuses: z.array(
      z.object({
        display_name: z.string(),
        is_complete: z.boolean(),
        member_ref: uuidString,
      }),
    ),
    total_students: z.number().int().nonnegative(),
  }),
);

// Intentionally answer-free. ADR 0007 requires a separate owner-only seam.
export const questionDetailSchema = z.array(
  z.object({
    options: z.array(
      z.object({ option_key: z.string(), option_text: z.string() }),
    ),
    prompt: z.string(),
    stable_code: z.string(),
  }),
);

export const subtopicMasterySchema = z.array(
  z.object({
    accuracy: z.number().nullable(),
    answers: z.number().int().nonnegative(),
    students: z.number().int().nonnegative(),
    subtopic_code: z.string(),
    subtopic_title: z.string(),
  }),
);

export const assignmentSummarySchema = z.array(
  z.object({
    assignment_id: uuidString,
    attempts: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    status: z.string(),
    targets: z.number().int().nonnegative(),
    title: z.string(),
  }),
);

export const liveReportSchema = z.array(
  z.object({
    activity_title: z.string(),
    answers: z.number().int().nonnegative(),
    completed_at: z.string().nullable(),
    correct_rate: z.number().nullable(),
    participants: z.number().int().nonnegative(),
    session_id: uuidString,
    state: z.string(),
  }),
);

export const liveHistorySchema = z.array(
  z.object({
    activity_title: z.string(),
    answers: z.number().int().nonnegative(),
    classroom_name: z.string(),
    completed_at: z.string().nullable(),
    correct_rate: z.number().nullable(),
    participants: z.number().int().nonnegative(),
    session_id: uuidString,
    total_count: z.number().int().nonnegative(),
  }),
);

export type AnalyticsFilters = Readonly<{
  chapterId?: string | null;
  from?: string | null;
  subtopicId?: string | null;
  to?: string | null;
}>;

export type AssessmentSource = 'all' | 'chapter_quiz' | 'live' | 'section_quiz';

export type DateRangeFilters = Readonly<{
  from?: string | null;
  to?: string | null;
}>;

export type QuestionAnalysisRow = z.infer<
  typeof questionAnalysisSchema
>[number];
export type AssessmentQuestionRow = z.infer<
  typeof assessmentQuestionSchema
>[number];
export type ChapterCompletionRow = z.infer<
  typeof chapterCompletionSchema
>[number];
export type QuestionDetail = z.infer<typeof questionDetailSchema>[number];

export const teacherQuestionAnswerSchema = z.array(
  z.object({
    is_correct: z.boolean(),
    option_key: z.string(),
    option_text: z.string(),
  }),
);

export type TeacherQuestionAnswer = Readonly<{
  options: readonly Readonly<{
    isCorrect: boolean;
    key: string;
    text: string;
  }>[];
}>;
export type SubtopicMasteryRow = z.infer<typeof subtopicMasterySchema>[number];
export type AssignmentSummaryRow = z.infer<
  typeof assignmentSummarySchema
>[number];
export type LiveReportRow = z.infer<typeof liveReportSchema>[number];
export type LiveHistoryRow = z.infer<typeof liveHistorySchema>[number];

export type ClassroomOverview = Readonly<{
  averageAccuracy: number | null;
  completedStudents: number;
  totalStudents: number;
  worstSubtopicCode: string | null;
  worstSubtopicTitle: string | null;
}>;

export type LiveHistoryPage = Readonly<{
  rows: readonly LiveHistoryRow[];
  total: number;
}>;

export type ClassroomSummary = Readonly<{
  attempts: number;
  averageAccuracy: number | null;
  uniqueStudents: number;
  worstSubtopicTitle: string | null;
}>;

export const dateArgs = (filters: DateRangeFilters) => ({
  ...(filters.from ? { p_from: filters.from } : {}),
  ...(filters.to ? { p_to: filters.to } : {}),
});

export const analyticsArgs = (
  classroomId: string,
  filters: AnalyticsFilters,
) => ({
  p_classroom_id: classroomId,
  ...(filters.chapterId ? { p_chapter_id: filters.chapterId } : {}),
  ...(filters.subtopicId ? { p_subtopic_id: filters.subtopicId } : {}),
  ...dateArgs(filters),
});
