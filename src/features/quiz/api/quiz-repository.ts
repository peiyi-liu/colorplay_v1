import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);
const timestampSchema = z.iso.datetime({ offset: true });
const answerStatusSchema = z.enum(['correct', 'incorrect', 'timeout']);
const sessionStatusSchema = z.enum(['in_progress', 'completed']);
const optionSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1),
  sort_order: z.number().int().positive(),
  text: z.string().min(1),
});
const questionSchema = z.object({
  answer_status: answerStatusSchema.nullable(),
  correct_option_id: uuidSchema.nullable(),
  deadline_at: timestampSchema.nullable(),
  explanation: z.string().nullable(),
  options: z.array(optionSchema).min(2).max(4),
  position: z.number().int().positive(),
  prompt: z.string().min(1),
  score_delta: z.number().int().nonnegative().nullable(),
  selected_option_id: uuidSchema.nullable(),
  session_question_id: uuidSchema,
  stable_code: z.string().min(1),
  started_at: timestampSchema.nullable(),
  version: z.number().int().positive(),
});
const rewardRateSchema = z.union([z.literal(20), z.literal(100)]);
const gameRulesVersionSchema = z.enum(['2026-07-mvp-1', '2026-07-progress-1']);
const sessionSchema = z.strictObject({
  answered_count: z.number().int().nonnegative(),
  chapter_title: z.string().min(1),
  completed_at: timestampSchema.nullable(),
  correct_count: z.number().int().nonnegative(),
  game_rules_version: gameRulesVersionSchema,
  question_count: z.number().int().positive(),
  questions: z.array(questionSchema).min(1),
  reward_rate_percent: rewardRateSchema,
  session_id: uuidSchema,
  status: sessionStatusSchema,
  template_id: uuidSchema,
  tokens_awarded: z.number().int().nonnegative(),
  total_score: z.number().int().nonnegative(),
  xp_awarded: z.number().int().nonnegative(),
});
const answerResultSchema = z.object({
  answer_status: answerStatusSchema,
  correct_option_id: uuidSchema,
  correct_option_text: z.string().min(1),
  explanation: z.string().min(1),
  response_ms: z.number().int().nonnegative(),
  score_delta: z.number().int().nonnegative(),
  selected_option_id: uuidSchema.nullable(),
  total_score: z.number().int().nonnegative(),
});
const assignmentAttemptSchema = z.strictObject({
  assignment_id: uuidSchema,
  attempt_id: uuidSchema,
  attempt_number: z.number().int().positive(),
  completed_at: timestampSchema.nullable(),
  passed: z.boolean().nullable(),
  status: z.enum(['in_progress', 'completed', 'expired', 'abandoned']),
});
const finalResultSchema = z.strictObject({
  answered_count: z.number().int().nonnegative(),
  assignment_attempt: assignmentAttemptSchema.optional(),
  completed_at: timestampSchema,
  correct_count: z.number().int().nonnegative(),
  game_rules_version: gameRulesVersionSchema,
  question_count: z.number().int().positive(),
  reward_rate_percent: rewardRateSchema,
  session_id: uuidSchema,
  status: z.literal('completed'),
  tokens_awarded: z.number().int().nonnegative(),
  total_score: z.number().int().nonnegative(),
  xp_awarded: z.number().int().nonnegative(),
});
const sessionStateRowSchema = z.strictObject({
  answer_status: answerStatusSchema.nullable(),
  answered_count: z.number().int().nonnegative(),
  chapter_title: z.string().min(1),
  completed_at: timestampSchema.nullable(),
  correct_count: z.number().int().nonnegative(),
  correct_option_id: uuidSchema.nullable(),
  deadline_at: timestampSchema.nullable(),
  explanation: z.string().nullable(),
  game_rules_version: gameRulesVersionSchema,
  options: z.array(optionSchema).min(2).max(4),
  position: z.number().int().positive(),
  prompt: z.string().min(1),
  question_count: z.number().int().positive(),
  question_stable_code: z.string().min(1),
  question_version: z.number().int().positive(),
  response_ms: z.number().int().nonnegative().nullable(),
  reward_rate_percent: rewardRateSchema,
  score_delta: z.number().int().nonnegative().nullable(),
  selected_option_id: uuidSchema.nullable(),
  session_id: uuidSchema,
  session_question_id: uuidSchema,
  session_started_at: timestampSchema,
  session_status: sessionStatusSchema,
  started_at: timestampSchema.nullable(),
  template_id: uuidSchema,
  tokens_awarded: z.number().int().nonnegative(),
  total_score: z.number().int().nonnegative(),
  xp_awarded: z.number().int().nonnegative(),
});

export type QuizOption = Readonly<{
  id: string;
  key: string;
  sortOrder: number;
  text: string;
}>;
export type QuizQuestion = Readonly<{
  answerStatus: z.infer<typeof answerStatusSchema> | null;
  correctOptionId: string | null;
  deadlineAt: string | null;
  explanation: string | null;
  options: QuizOption[];
  position: number;
  prompt: string;
  scoreDelta: number | null;
  selectedOptionId: string | null;
  sessionQuestionId: string;
  stableCode: string;
  startedAt: string | null;
  version: number;
}>;
export type QuizSession = Readonly<{
  answeredCount: number;
  chapterTitle: string;
  completedAt: string | null;
  correctCount: number;
  gameRulesVersion: z.infer<typeof gameRulesVersionSchema>;
  questionCount: number;
  questions: QuizQuestion[];
  sessionId: string;
  status: z.infer<typeof sessionStatusSchema>;
  templateId: string;
  tokensAwarded: number;
  totalScore: number;
  rewardRatePercent: z.infer<typeof rewardRateSchema>;
  xpAwarded: number;
}>;
export type QuizAnswerResult = Readonly<{
  answerStatus: z.infer<typeof answerStatusSchema>;
  correctOptionId: string;
  correctOptionText: string;
  explanation: string;
  responseMs: number;
  scoreDelta: number;
  selectedOptionId: string | null;
  totalScore: number;
}>;
export type QuizAssignmentAttempt = Readonly<{
  assignmentId: string;
  attemptId: string;
  attemptNumber: number;
  completedAt: string | null;
  passed: boolean | null;
  status: 'in_progress' | 'completed' | 'expired' | 'abandoned';
}>;

export type QuizFinalResult = Readonly<{
  answeredCount: number;
  assignmentAttempt?: QuizAssignmentAttempt;
  completedAt: string;
  correctCount: number;
  gameRulesVersion: z.infer<typeof gameRulesVersionSchema>;
  questionCount: number;
  rewardRatePercent: z.infer<typeof rewardRateSchema>;
  sessionId: string;
  status: 'completed';
  tokensAwarded: number;
  totalScore: number;
  xpAwarded: number;
}>;

export type QuizRepositoryErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_RESPONSE'
  | 'QUESTION_ALREADY_ANSWERED'
  | 'SESSION_INCOMPLETE'
  | 'SESSION_NOT_FOUND'
  | 'UNAVAILABLE';

const errorMessages: Record<QuizRepositoryErrorCode, string> = {
  AUTH_REQUIRED: '請先登入再開始挑戰。',
  INVALID_RESPONSE: '答題資料格式不正確，請重新載入。',
  QUESTION_ALREADY_ANSWERED: '這一題已經作答，正在載入最新結果。',
  SESSION_INCOMPLETE: '還有題目尚未完成，暫時不能結算。',
  SESSION_NOT_FOUND: '找不到這次挑戰，或你沒有檢視權限。',
  UNAVAILABLE: '答題服務暫時無法使用，請稍後重試。',
};

export class QuizRepositoryError extends Error {
  readonly code: QuizRepositoryErrorCode;

  constructor(code: QuizRepositoryErrorCode) {
    super(errorMessages[code]);
    this.name = 'QuizRepositoryError';
    this.code = code;
  }
}

const mapServerError = (message: string): QuizRepositoryError => {
  if (message.includes('AUTH_REQUIRED')) {
    return new QuizRepositoryError('AUTH_REQUIRED');
  }
  if (message.includes('QUIZ_QUESTION_ALREADY_ANSWERED')) {
    return new QuizRepositoryError('QUESTION_ALREADY_ANSWERED');
  }
  if (message.includes('QUIZ_SESSION_INCOMPLETE')) {
    return new QuizRepositoryError('SESSION_INCOMPLETE');
  }
  if (message.includes('NOT_FOUND')) {
    return new QuizRepositoryError('SESSION_NOT_FOUND');
  }
  return new QuizRepositoryError('UNAVAILABLE');
};

const mapQuestion = (
  question: z.infer<typeof questionSchema>,
): QuizQuestion => ({
  answerStatus: question.answer_status,
  correctOptionId: question.correct_option_id,
  deadlineAt: question.deadline_at,
  explanation: question.explanation,
  options: question.options.map((option) => ({
    id: option.id,
    key: option.key,
    sortOrder: option.sort_order,
    text: option.text,
  })),
  position: question.position,
  prompt: question.prompt,
  scoreDelta: question.score_delta,
  selectedOptionId: question.selected_option_id,
  sessionQuestionId: question.session_question_id,
  stableCode: question.stable_code,
  startedAt: question.started_at,
  version: question.version,
});

const mapSession = (session: z.infer<typeof sessionSchema>): QuizSession => ({
  answeredCount: session.answered_count,
  chapterTitle: session.chapter_title,
  completedAt: session.completed_at,
  correctCount: session.correct_count,
  gameRulesVersion: session.game_rules_version,
  questionCount: session.question_count,
  questions: session.questions.map(mapQuestion),
  sessionId: session.session_id,
  status: session.status,
  templateId: session.template_id,
  tokensAwarded: session.tokens_awarded,
  totalScore: session.total_score,
  rewardRatePercent: session.reward_rate_percent,
  xpAwarded: session.xp_awarded,
});

function parseSession(value: unknown): QuizSession {
  const parsed = sessionSchema.safeParse(value);
  if (!parsed.success) throw new QuizRepositoryError('INVALID_RESPONSE');
  return mapSession(parsed.data);
}

function parseAnswer(value: unknown): QuizAnswerResult {
  const parsed = answerResultSchema.safeParse(value);
  if (!parsed.success) throw new QuizRepositoryError('INVALID_RESPONSE');
  return {
    answerStatus: parsed.data.answer_status,
    correctOptionId: parsed.data.correct_option_id,
    correctOptionText: parsed.data.correct_option_text,
    explanation: parsed.data.explanation,
    responseMs: parsed.data.response_ms,
    scoreDelta: parsed.data.score_delta,
    selectedOptionId: parsed.data.selected_option_id,
    totalScore: parsed.data.total_score,
  };
}

function parseFinal(value: unknown): QuizFinalResult {
  const parsed = finalResultSchema.safeParse(value);
  if (!parsed.success) throw new QuizRepositoryError('INVALID_RESPONSE');
  return {
    ...(parsed.data.assignment_attempt
      ? {
          assignmentAttempt: {
            assignmentId: parsed.data.assignment_attempt.assignment_id,
            attemptId: parsed.data.assignment_attempt.attempt_id,
            attemptNumber: parsed.data.assignment_attempt.attempt_number,
            completedAt: parsed.data.assignment_attempt.completed_at,
            passed: parsed.data.assignment_attempt.passed,
            status: parsed.data.assignment_attempt.status,
          },
        }
      : {}),
    answeredCount: parsed.data.answered_count,
    completedAt: parsed.data.completed_at,
    correctCount: parsed.data.correct_count,
    gameRulesVersion: parsed.data.game_rules_version,
    questionCount: parsed.data.question_count,
    rewardRatePercent: parsed.data.reward_rate_percent,
    sessionId: parsed.data.session_id,
    status: parsed.data.status,
    tokensAwarded: parsed.data.tokens_awarded,
    totalScore: parsed.data.total_score,
    xpAwarded: parsed.data.xp_awarded,
  };
}

function sessionFromStateRows(value: unknown): QuizSession {
  const parsed = z.array(sessionStateRowSchema).min(1).safeParse(value);
  if (!parsed.success) throw new QuizRepositoryError('INVALID_RESPONSE');
  const [first] = parsed.data;
  if (!first) throw new QuizRepositoryError('INVALID_RESPONSE');
  const questions = parsed.data.map((row) =>
    mapQuestion({
      answer_status: row.answer_status,
      correct_option_id: row.correct_option_id,
      deadline_at: row.deadline_at,
      explanation: row.explanation,
      options: row.options,
      position: row.position,
      prompt: row.prompt,
      score_delta: row.score_delta,
      selected_option_id: row.selected_option_id,
      session_question_id: row.session_question_id,
      stable_code: row.question_stable_code,
      started_at: row.started_at,
      version: row.question_version,
    }),
  );
  return {
    answeredCount: first.answered_count,
    chapterTitle: first.chapter_title,
    completedAt: first.completed_at,
    correctCount: first.correct_count,
    gameRulesVersion: first.game_rules_version,
    questionCount: first.question_count,
    questions,
    sessionId: first.session_id,
    status: first.session_status,
    templateId: first.template_id,
    tokensAwarded: first.tokens_awarded,
    totalScore: first.total_score,
    rewardRatePercent: first.reward_rate_percent,
    xpAwarded: first.xp_awarded,
  };
}

export type QuizRepository = Readonly<{
  activateNextQuestion(sessionId: string): Promise<QuizSession>;
  createSession(
    templateId: string,
    clientRequestId: string,
  ): Promise<QuizSession>;
  finalizeSession(sessionId: string): Promise<QuizFinalResult>;
  getSession(sessionId: string): Promise<QuizSession>;
  submitAnswer(
    sessionQuestionId: string,
    selectedOptionId: string | null,
    idempotencyKey: string,
  ): Promise<QuizAnswerResult>;
}>;

export function createQuizRepository(
  client: SupabaseClient<Database>,
): QuizRepository {
  return {
    async activateNextQuestion(sessionId) {
      const { data, error } = await client.rpc('activate_next_quiz_question', {
        session_id: sessionId,
      });
      if (error) throw mapServerError(error.message);
      return parseSession(data);
    },

    async createSession(templateId, clientRequestId) {
      const { data, error } = await client.rpc('create_quiz_session', {
        client_request_id: clientRequestId,
        template_id: templateId,
      });
      if (error) throw mapServerError(error.message);
      return parseSession(data);
    },

    async finalizeSession(sessionId) {
      const { data, error } = await client.rpc('finalize_quiz_session', {
        session_id: sessionId,
      });
      if (error) throw mapServerError(error.message);
      return parseFinal(data);
    },

    async getSession(sessionId) {
      const { data, error } = await client
        .from('quiz_session_question_state')
        .select('*')
        .eq('session_id', sessionId)
        .order('position');
      if (error) throw mapServerError(error.message);
      if (data.length === 0) {
        throw new QuizRepositoryError('SESSION_NOT_FOUND');
      }
      return sessionFromStateRows(data);
    },

    async submitAnswer(sessionQuestionId, selectedOptionId, idempotencyKey) {
      const args = {
        idempotency_key: idempotencyKey,
        session_question_id: sessionQuestionId,
        ...(selectedOptionId === null
          ? {}
          : { selected_option_id: selectedOptionId }),
      };
      const { data, error } = await client.rpc('submit_quiz_answer', args);
      if (error) throw mapServerError(error.message);
      return parseAnswer(data);
    },
  };
}
