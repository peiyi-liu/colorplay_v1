import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  analyticsArgs,
  assessmentQuestionSchema,
  assignmentSummarySchema,
  chapterCompletionSchema,
  classroomOverviewSchema,
  dateArgs,
  liveHistorySchema,
  liveReportSchema,
  questionAnalysisSchema,
  questionDetailSchema,
  subtopicMasterySchema,
  summarySchema,
  type AnalyticsFilters,
  type AssessmentQuestionRow,
  type AssessmentSource,
  type AssignmentSummaryRow,
  type ChapterCompletionRow,
  type ClassroomOverview,
  type ClassroomSummary,
  type DateRangeFilters,
  type LiveHistoryPage,
  type LiveReportRow,
  type QuestionAnalysisRow,
  type QuestionDetail,
  type SubtopicMasteryRow,
} from './teacher-content-analytics-contracts';
import {
  cardRowSchema,
  importReportSchema,
  publishReceiptSchema,
  questionRowSchema,
  subtopicOptionSchema,
  toCardPayload,
  toQuestionPayload,
  type ImportCommitReport,
  type PublishReceipt,
  type QuestionDraftPayload,
  type ReviewCardDraftPayload,
  type SubtopicOption,
  type TeacherCardRow,
  type TeacherQuestionRow,
} from './teacher-content-core-contracts';
import {
  TeacherContentError,
  toTeacherContentError as toError,
} from './teacher-content-errors';
import type { ImportQuestionRow, ImportReviewCardRow } from './xlsx-codec';

export type {
  AnalyticsFilters,
  AssessmentQuestionRow,
  AssessmentSource,
  AssignmentSummaryRow,
  ChapterCompletionRow,
  ClassroomOverview,
  ClassroomSummary,
  DateRangeFilters,
  LiveHistoryPage,
  LiveHistoryRow,
  LiveReportRow,
  QuestionAnalysisRow,
  QuestionDetail,
  SubtopicMasteryRow,
} from './teacher-content-analytics-contracts';
export type {
  CardMediaEntry,
  ImportCommitReport,
  PublishReceipt,
  QuestionDraftPayload,
  ReviewCardDraftPayload,
  SubtopicOption,
  TeacherCardRow,
  TeacherQuestionOption,
  TeacherQuestionRow,
} from './teacher-content-core-contracts';
export {
  TeacherContentError,
  type TeacherContentErrorCode,
} from './teacher-content-errors';

const parseWith = <Output>(
  schema: z.ZodType<Output>,
  value: unknown,
): Output => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new TeacherContentError('INVALID_RESPONSE');
  return parsed.data;
};

export type TeacherContentRepository = Readonly<{
  archiveQuestion(questionId: string, requestId: string): Promise<void>;
  archiveReviewCard(cardId: string, requestId: string): Promise<void>;
  commitImport(
    input: Readonly<{
      dryRun: boolean;
      filename: string;
      questions: readonly ImportQuestionRow[];
      requestId: string;
      reviewCards: readonly ImportReviewCardRow[];
    }>,
  ): Promise<ImportCommitReport>;
  getAssignmentSummary(
    classroomId: string,
    filters: DateRangeFilters,
  ): Promise<readonly AssignmentSummaryRow[]>;
  getChapterCompletion(
    classroomId: string,
    chapterId?: string | null,
  ): Promise<readonly ChapterCompletionRow[]>;
  getClassroomSummary(
    classroomId: string,
    filters: AnalyticsFilters,
  ): Promise<ClassroomSummary | null>;
  getClassroomOverview(
    classroomId: string,
    filters: AnalyticsFilters,
  ): Promise<ClassroomOverview | null>;
  getAssessmentQuestions(
    classroomId: string,
    filters: AnalyticsFilters,
    source: AssessmentSource,
  ): Promise<readonly AssessmentQuestionRow[]>;
  getLiveHistory(
    classroomId: string,
    filters: DateRangeFilters,
    page: number,
    pageSize: number,
  ): Promise<LiveHistoryPage>;
  getLiveReport(
    classroomId: string,
    filters: DateRangeFilters,
  ): Promise<readonly LiveReportRow[]>;
  getQuestionAnalysis(
    classroomId: string,
    filters: AnalyticsFilters,
  ): Promise<readonly QuestionAnalysisRow[]>;
  getQuestionDetail(
    classroomId: string,
    stableCode: string,
  ): Promise<QuestionDetail | null>;
  getSubtopicMastery(
    classroomId: string,
    filters: AnalyticsFilters,
  ): Promise<readonly SubtopicMasteryRow[]>;
  listCards(): Promise<readonly TeacherCardRow[]>;
  listQuestions(): Promise<readonly TeacherQuestionRow[]>;
  listSubtopics(): Promise<readonly SubtopicOption[]>;
  publishQuestion(
    input: Readonly<{
      payload: QuestionDraftPayload | null;
      questionId: string;
      requestId: string;
    }>,
  ): Promise<PublishReceipt>;
  publishReviewCard(
    input: Readonly<{
      cardId: string;
      payload: ReviewCardDraftPayload | null;
      requestId: string;
    }>,
  ): Promise<PublishReceipt>;
  upsertQuestionDraft(
    input: Readonly<{
      payload: QuestionDraftPayload;
      requestId: string;
    }>,
  ): Promise<void>;
  upsertReviewCardDraft(
    input: Readonly<{
      payload: ReviewCardDraftPayload;
      requestId: string;
    }>,
  ): Promise<void>;
}>;

export function createTeacherContentRepository(
  client: SupabaseClient<Database>,
): TeacherContentRepository {
  return {
    async archiveQuestion(questionId, requestId) {
      const { error } = await client.rpc('archive_question', {
        p_question_id: questionId,
        p_request_id: requestId,
      });
      if (error) throw toError(error.message);
    },

    async archiveReviewCard(cardId, requestId) {
      const { error } = await client.rpc('archive_review_card', {
        p_card_id: cardId,
        p_request_id: requestId,
      });
      if (error) throw toError(error.message);
    },

    async commitImport(input) {
      const { data, error } = await client.rpc('commit_content_import', {
        p_dry_run: input.dryRun,
        p_filename: input.filename,
        p_request_id: input.requestId,
        p_rows: {
          questions: input.questions.map((row) => ({
            answer: row.answerKey,
            chapter: row.chapter,
            code: row.code,
            explanation: row.explanation,
            options: row.options.map((option) => ({
              key: option.key,
              text: option.text,
            })),
            prompt: row.prompt,
            row: row.row,
            section_label: row.sectionLabel,
            subtopic_label: row.subtopicLabel,
          })),
          review_cards: input.reviewCards.map((row) => ({
            alt_text: row.altText,
            chapter: row.chapter,
            content: row.content,
            media_url: row.mediaUrl,
            row: row.row,
            section_label: row.sectionLabel,
            subtopic_label: row.subtopicLabel,
            title: row.title,
          })),
        },
      });
      if (error) throw toError(error.message);
      return parseWith(importReportSchema, data);
    },

    async getAssignmentSummary(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_assignment_summary', {
        p_classroom_id: classroomId,
        ...dateArgs(filters),
      });
      if (error) throw toError(error.message);
      return parseWith(assignmentSummarySchema, data);
    },

    async getChapterCompletion(classroomId, chapterId) {
      const { data, error } = await client.rpc(
        'teacher_chapter_completion_summary',
        {
          p_classroom_id: classroomId,
          ...(chapterId ? { p_chapter_id: chapterId } : {}),
        },
      );
      if (error) throw toError(error.message);
      return parseWith(chapterCompletionSchema, data);
    },

    async getClassroomSummary(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_classroom_summary', {
        ...analyticsArgs(classroomId, filters),
      });
      if (error) throw toError(error.message);
      const rows = parseWith(summarySchema, data);
      const row = rows[0];
      if (!row) return null;
      return {
        attempts: row.attempts,
        averageAccuracy: row.average_accuracy,
        uniqueStudents: row.unique_students,
        worstSubtopicTitle: row.worst_subtopic_title,
      };
    },

    async getClassroomOverview(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_classroom_overview', {
        p_classroom_id: classroomId,
        ...(filters.chapterId ? { p_chapter_id: filters.chapterId } : {}),
        ...dateArgs(filters),
      });
      if (error) throw toError(error.message);
      const row = parseWith(classroomOverviewSchema, data)[0];
      return row
        ? {
            averageAccuracy: row.average_accuracy,
            completedStudents: row.completed_students,
            totalStudents: row.total_students,
            worstSubtopicCode: row.worst_subtopic_code,
            worstSubtopicTitle: row.worst_subtopic_title,
          }
        : null;
    },

    async getAssessmentQuestions(classroomId, filters, source) {
      const { data, error } = await client.rpc(
        'teacher_assessment_question_analysis',
        {
          p_classroom_id: classroomId,
          p_source: source,
          ...(filters.chapterId ? { p_chapter_id: filters.chapterId } : {}),
          ...dateArgs(filters),
        },
      );
      if (error) throw toError(error.message);
      return parseWith(assessmentQuestionSchema, data);
    },

    async getLiveReport(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_live_session_report', {
        p_classroom_id: classroomId,
        ...dateArgs(filters),
      });
      if (error) throw toError(error.message);
      return parseWith(liveReportSchema, data);
    },

    async getLiveHistory(classroomId, filters, page, pageSize) {
      const { data, error } = await client.rpc(
        'teacher_live_session_report_v2',
        {
          p_classroom_id: classroomId,
          p_limit: pageSize,
          p_offset: Math.max(0, page - 1) * pageSize,
          ...dateArgs(filters),
        },
      );
      if (error) throw toError(error.message);
      const rows = parseWith(liveHistorySchema, data);
      return { rows, total: rows[0]?.total_count ?? 0 };
    },

    async getQuestionAnalysis(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_question_analysis', {
        ...analyticsArgs(classroomId, filters),
      });
      if (error) throw toError(error.message);
      return parseWith(questionAnalysisSchema, data);
    },

    async getQuestionDetail(classroomId, stableCode) {
      const { data, error } = await client.rpc('teacher_question_detail', {
        p_classroom_id: classroomId,
        p_stable_code: stableCode,
      });
      if (error) throw toError(error.message);
      return parseWith(questionDetailSchema, data)[0] ?? null;
    },

    async getSubtopicMastery(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_subtopic_mastery', {
        ...analyticsArgs(classroomId, filters),
      });
      if (error) throw toError(error.message);
      return parseWith(subtopicMasterySchema, data);
    },

    async listCards() {
      const { data, error } = await client
        .from('review_cards')
        .select(
          'id, stable_code, group_label, title, content, status, version, ' +
            'requires_recompletion, subtopic_id, ' +
            'review_card_media (asset_path, alt_text, card_version)',
        )
        .order('title');
      if (error) throw toError(error.message);
      return parseWith(z.array(cardRowSchema), data).map((row) => ({
        cardId: row.id,
        content: row.content,
        groupLabel: row.group_label,
        media: row.review_card_media
          .filter((entry) => entry.card_version === row.version)
          .map((entry) => ({
            altText: entry.alt_text,
            assetPath: entry.asset_path,
          })),
        requiresRecompletion: row.requires_recompletion,
        stableCode: row.stable_code,
        status: row.status,
        subtopicId: row.subtopic_id,
        title: row.title,
        version: row.version,
      }));
    },

    async listQuestions() {
      const { data, error } = await client.rpc('teacher_list_questions');
      if (error) throw toError(error.message);
      return parseWith(z.array(questionRowSchema), data).map((row) => ({
        explanation: row.explanation,
        options: row.options.map((option) => ({
          isCorrect: option.is_correct,
          key: option.key,
          text: option.text,
        })),
        prompt: row.prompt,
        questionId: row.question_id,
        stableCode: row.stable_code,
        status: row.status,
        subtopicId: row.subtopic_id,
        version: row.version,
      }));
    },

    async listSubtopics() {
      const { data, error } = await client
        .from('subtopics')
        .select('id, stable_code, title')
        .order('stable_code');
      if (error) throw toError(error.message);
      return parseWith(z.array(subtopicOptionSchema), data).map((row) => ({
        stableCode: row.stable_code,
        subtopicId: row.id,
        title: row.title,
      }));
    },

    async publishQuestion(input) {
      const { data, error } = await client.rpc('publish_question', {
        p_question_id: input.questionId,
        p_request_id: input.requestId,
        ...(input.payload
          ? { p_payload: toQuestionPayload(input.payload) }
          : {}),
      });
      if (error) throw toError(error.message);
      const receipt = parseWith(publishReceiptSchema, data);
      return { changed: receipt.changed, version: receipt.version };
    },

    async publishReviewCard(input) {
      const { data, error } = await client.rpc('publish_review_card', {
        p_card_id: input.cardId,
        p_request_id: input.requestId,
        ...(input.payload ? { p_payload: toCardPayload(input.payload) } : {}),
      });
      if (error) throw toError(error.message);
      const receipt = parseWith(publishReceiptSchema, data);
      return { changed: receipt.changed, version: receipt.version };
    },

    async upsertQuestionDraft(input) {
      const { error } = await client.rpc('upsert_question_draft', {
        p_payload: toQuestionPayload(input.payload),
        p_request_id: input.requestId,
      });
      if (error) throw toError(error.message);
    },

    async upsertReviewCardDraft(input) {
      const { error } = await client.rpc('upsert_review_card_draft', {
        p_payload: toCardPayload(input.payload),
        p_request_id: input.requestId,
      });
      if (error) throw toError(error.message);
    },
  };
}
