import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);

const stageSchema = z.strictObject({
  attempts: z.number().int().nonnegative(),
  completed: z.boolean(),
  position: z.number().int().positive(),
});

const optionSchema = z.strictObject({
  id: uuidSchema,
  key: z.string().min(1),
  locked: z.boolean(),
  text: z.string().min(1),
});

const questionSchema = z.strictObject({
  options: z.array(optionSchema).min(2),
  prompt: z.string().min(1),
  question_id: uuidSchema,
  subtopic_title: z.string().min(1),
  wrong_attempts: z.number().int().nonnegative(),
});

const stateSchema = z.strictObject({
  chapter_id: uuidSchema,
  chapter_title: z.string().min(1),
  position: z.number().int().positive(),
  question: questionSchema.nullable(),
  question_count: z.number().int().positive(),
  rules_version: z.string().min(1),
  session_id: uuidSchema,
  stages: z.array(stageSchema).min(1),
  status: z.enum(['in_progress', 'completed']),
});

const attemptSchema = z.union([
  z.strictObject({
    is_correct: z.literal(false),
    locked_option_ids: z.array(uuidSchema),
  }),
  z.strictObject({
    correct_option_id: uuidSchema,
    explanation: z.string().min(1),
    is_correct: z.literal(true),
    position: z.number().int().positive(),
    status: z.enum(['in_progress', 'completed']),
  }),
]);

const hintSchema = z.strictObject({
  content: z.string().min(1),
  hint_level: z.number().int().min(1).max(3),
});

export type MasteryStage = Readonly<{
  attempts: number;
  completed: boolean;
  position: number;
}>;

export type MasteryOption = Readonly<{
  id: string;
  key: string;
  locked: boolean;
  text: string;
}>;

export type MasteryState = Readonly<{
  chapterId: string;
  chapterTitle: string;
  position: number;
  question: Readonly<{
    options: readonly MasteryOption[];
    prompt: string;
    questionId: string;
    subtopicTitle: string;
    wrongAttempts: number;
  }> | null;
  questionCount: number;
  sessionId: string;
  stages: readonly MasteryStage[];
  status: 'in_progress' | 'completed';
}>;

export type MasteryAttemptResult =
  | Readonly<{ isCorrect: false; lockedOptionIds: readonly string[] }>
  | Readonly<{
      correctOptionId: string;
      explanation: string;
      isCorrect: true;
      position: number;
      status: 'in_progress' | 'completed';
    }>;

export type MasteryErrorCode =
  | 'AUTH_REQUIRED'
  | 'NOT_FOUND'
  | 'NO_QUESTIONS'
  | 'OPTION_LOCKED'
  | 'OPTION_INVALID'
  | 'HINT_LOCKED'
  | 'HINT_UNAVAILABLE'
  | 'COMPLETED'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

export class MasteryError extends Error {
  readonly code: MasteryErrorCode;

  constructor(code: MasteryErrorCode) {
    super(code);
    this.code = code;
    this.name = 'MasteryError';
  }
}

const mapServerError = (message: string): MasteryError => {
  if (message.includes('AUTH_REQUIRED'))
    return new MasteryError('AUTH_REQUIRED');
  if (message.includes('MASTERY_NOT_FOUND'))
    return new MasteryError('NOT_FOUND');
  if (message.includes('MASTERY_CHAPTER_NOT_FOUND'))
    return new MasteryError('NOT_FOUND');
  if (message.includes('MASTERY_NO_QUESTIONS'))
    return new MasteryError('NO_QUESTIONS');
  if (message.includes('MASTERY_OPTION_LOCKED'))
    return new MasteryError('OPTION_LOCKED');
  if (message.includes('MASTERY_OPTION_INVALID'))
    return new MasteryError('OPTION_INVALID');
  if (message.includes('MASTERY_HINT_LOCKED'))
    return new MasteryError('HINT_LOCKED');
  if (message.includes('MASTERY_HINT_UNAVAILABLE'))
    return new MasteryError('HINT_UNAVAILABLE');
  if (message.includes('MASTERY_COMPLETED'))
    return new MasteryError('COMPLETED');
  return new MasteryError('UNAVAILABLE');
};

const parseWith = <Output>(
  schema: z.ZodType<Output>,
  payload: unknown,
): Output => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new MasteryError('INVALID_RESPONSE');
  return parsed.data;
};

export type MasteryRepository = Readonly<{
  startSession(chapterId: string): Promise<string>;
  getState(sessionId: string): Promise<MasteryState>;
  submitAttempt(
    sessionId: string,
    optionId: string,
  ): Promise<MasteryAttemptResult>;
  getHint(
    sessionId: string,
    hintLevel: number,
  ): Promise<Readonly<{ content: string; hintLevel: number }>>;
}>;

export function createMasteryRepository(
  client: SupabaseClient<Database>,
): MasteryRepository {
  return {
    async getHint(sessionId, hintLevel) {
      const { data, error } = await client.rpc('get_mastery_hint', {
        p_hint_level: hintLevel,
        p_session_id: sessionId,
      });
      if (error) throw mapServerError(error.message);
      const parsed = parseWith(hintSchema, data);
      return { content: parsed.content, hintLevel: parsed.hint_level };
    },
    async getState(sessionId) {
      const { data, error } = await client.rpc('get_mastery_state', {
        p_session_id: sessionId,
      });
      if (error) throw mapServerError(error.message);
      const parsed = parseWith(stateSchema, data);
      return {
        chapterId: parsed.chapter_id,
        chapterTitle: parsed.chapter_title,
        position: parsed.position,
        question: parsed.question
          ? {
              options: parsed.question.options.map((option) => ({
                id: option.id,
                key: option.key,
                locked: option.locked,
                text: option.text,
              })),
              prompt: parsed.question.prompt,
              questionId: parsed.question.question_id,
              subtopicTitle: parsed.question.subtopic_title,
              wrongAttempts: parsed.question.wrong_attempts,
            }
          : null,
        questionCount: parsed.question_count,
        sessionId: parsed.session_id,
        stages: parsed.stages.map((stage) => ({
          attempts: stage.attempts,
          completed: stage.completed,
          position: stage.position,
        })),
        status: parsed.status,
      };
    },
    async startSession(chapterId) {
      const { data, error } = await client.rpc('start_mastery_session', {
        p_chapter_id: chapterId,
      });
      if (error) throw mapServerError(error.message);
      return parseWith(uuidSchema, data);
    },
    async submitAttempt(sessionId, optionId) {
      const { data, error } = await client.rpc('submit_mastery_attempt', {
        p_option_id: optionId,
        p_session_id: sessionId,
      });
      if (error) throw mapServerError(error.message);
      const parsed = parseWith(attemptSchema, data);
      if (parsed.is_correct) {
        return {
          correctOptionId: parsed.correct_option_id,
          explanation: parsed.explanation,
          isCorrect: true,
          position: parsed.position,
          status: parsed.status,
        };
      }
      return {
        isCorrect: false,
        lockedOptionIds: parsed.locked_option_ids,
      };
    },
  };
}
