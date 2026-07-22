import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  type LiveActivity,
  type LiveRepository,
  type LiveRepositoryErrorCode,
  LiveRepositoryError,
  type LiveSessionState,
} from '../types';

export { LiveRepositoryError } from '../types';

const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
const utcTimestamp = z.iso.datetime({ offset: true });
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();

const stateNameSchema = z.enum([
  'draft',
  'lobby',
  'question_open',
  'question_feedback',
  'paused',
  'completed',
  'cancelled',
]);

const activitySchema = z.strictObject({
  activity_id: uuidString,
  title: z.string().min(1),
  quiz_template_id: uuidString,
  question_time_limit_seconds: positiveInteger,
  status: z.enum(['active', 'archived']),
  rules_version: z.string().min(1),
  scheduled_for: utcTimestamp.nullable().optional(),
});

const activityRowSchema = z.strictObject({
  id: uuidString,
  title: z.string().min(1),
  quiz_template_id: uuidString,
  question_time_limit_seconds: positiveInteger,
  status: z.enum(['active', 'archived']),
  rules_version: z.string().min(1),
  scheduled_for: utcTimestamp.nullable(),
});

const answerReceiptSchema = z.strictObject({
  recorded: z.literal(true),
  session_question_id: uuidString,
  streak: z.number().int().nonnegative(),
});

const distributionSchema = z.strictObject({
  answered_count: z.number().int().nonnegative(),
  options: z.array(
    z.strictObject({
      option_id: uuidString.nullable(),
      count: z.number().int().positive(),
    }),
  ),
});

const teamTotalsSchema = z.array(
  z.strictObject({
    team_number: z.number().int().positive(),
    score: z.number().int().nonnegative(),
    member_count: z.number().int().positive(),
  }),
);

const sessionDetailSchema = z.strictObject({
  session_id: uuidString,
  mode: z.enum(['individual', 'team']),
  completed_at: utcTimestamp.nullable(),
  questions: z.array(
    z.strictObject({
      position: positiveInteger,
      prompt: z.string().min(1),
      answered: z.number().int().nonnegative(),
      correct: z.number().int().nonnegative(),
      correct_rate: z.number().nullable(),
      average_response_ms: z.number().int().nullable(),
    }),
  ),
  ranking: z.array(
    z.strictObject({
      rank: positiveInteger,
      display_name: z.string().min(1),
      score: z.number().int().nonnegative(),
      team_number: z.number().int().positive().nullable(),
    }),
  ),
});

const sessionReceiptSchema = z.strictObject({
  session_id: uuidString,
  state: stateNameSchema,
  state_version: positiveInteger,
  join_code: z.string().regex(/^[0-9]{6}$/u),
  join_code_version: positiveInteger,
  mode: z.enum(['individual', 'team']),
  team_count: z.number().int().min(2).max(4).nullable(),
});

const rotateSchema = z.strictObject({
  session_id: uuidString,
  join_code: z.string().regex(/^[0-9]{6}$/u),
  join_code_version: positiveInteger,
});

const joinSchema = z.strictObject({
  session_id: uuidString,
  state: stateNameSchema,
  state_version: positiveInteger,
});

const joinErrorSchema = z.strictObject({
  error: z.string().min(1),
});

const standingsSchema = z.strictObject({
  participant_count: nonNegativeInteger,
  standings: z.array(
    z.strictObject({
      rank: positiveInteger,
      display_name: z.string().min(1),
      score: nonNegativeInteger,
    }),
  ),
});

const questionSchema = z.strictObject({
  question_id: uuidString,
  position: positiveInteger,
  prompt: z.string().min(1),
  public_options: z
    .array(
      z.strictObject({
        id: uuidString,
        key: z.string().min(1),
        text: z.string().min(1),
        sort_order: positiveInteger,
      }),
    )
    .min(2),
  opened_at: utcTimestamp.nullable(),
  deadline_at: utcTimestamp.nullable(),
});

const stateSchema = z
  .strictObject({
    session_id: uuidString,
    state: stateNameSchema,
    state_version: positiveInteger,
    current_position: nonNegativeInteger,
    question_count: nonNegativeInteger,
    participant_count: nonNegativeInteger,
    rules_version: z.string().min(1),
    server_time: utcTimestamp,
    is_host: z.boolean(),
    mode: z.enum(['individual', 'team']),
    team_count: z.number().int().min(2).max(4).nullable(),
    participants: z
      .array(z.strictObject({ display_name: z.string().min(1) }))
      .optional(),
    paused_remaining_ms: nonNegativeInteger.optional(),
    question: questionSchema.optional(),
    answered_count: nonNegativeInteger.optional(),
    my_answer: z
      .union([
        z.strictObject({ answered: z.boolean() }),
        z.strictObject({
          answer_status: z.enum(['correct', 'incorrect', 'timeout']),
          selected_option_id: uuidString.nullable(),
          score_delta: nonNegativeInteger,
        }),
      ])
      .optional(),
    correct_option_id: uuidString.optional(),
    explanation: z.string().nullable().optional(),
    option_counts: z
      .array(
        z.strictObject({
          option_id: uuidString.nullable(),
          count: nonNegativeInteger,
        }),
      )
      .optional(),
    podium: z
      .array(
        z.strictObject({
          rank: positiveInteger,
          display_name: z.string().min(1),
          score: nonNegativeInteger,
        }),
      )
      .optional(),
    my_result: z
      .strictObject({
        score: nonNegativeInteger,
        rank: positiveInteger.nullable(),
      })
      .optional(),
  })
  .refine(
    (state) =>
      state.state === 'question_feedback' || state.state === 'completed'
        ? true
        : state.correct_option_id === undefined &&
          state.explanation === undefined &&
          state.option_counts === undefined &&
          !(state.my_answer && 'answer_status' in state.my_answer),
    { message: 'PRE_FEEDBACK_REVEAL_LEAK' },
  );

const errorCodeByMessage: readonly (readonly [
  string,
  LiveRepositoryErrorCode,
])[] = [
  ['AUTH_REQUIRED', 'AUTH_REQUIRED'],
  ['LIVE_SESSION_NOT_FOUND', 'NOT_FOUND'],
  ['LIVE_ACTIVITY_NOT_FOUND', 'NOT_FOUND'],
  ['LIVE_CLASSROOM_NOT_FOUND', 'NOT_FOUND'],
  ['LIVE_QUESTION_NOT_FOUND', 'NOT_FOUND'],
  ['LIVE_STATE_CONFLICT', 'STATE_CONFLICT'],
  ['LIVE_STATE_INVALID_TRANSITION', 'INVALID_TRANSITION'],
  ['LIVE_JOIN_INVALID_CODE', 'JOIN_INVALID_CODE'],
  ['LIVE_JOIN_RATE_LIMITED', 'JOIN_RATE_LIMITED'],
  ['LIVE_ANSWER_CLOSED', 'ANSWER_CLOSED'],
  ['LIVE_ANSWER_ALREADY_SUBMITTED', 'ANSWER_ALREADY_SUBMITTED'],
  ['LIVE_INVALID_OPTION', 'VALIDATION'],
  ['LIVE_INVALID_REQUEST', 'VALIDATION'],
  ['LIVE_ASSIGNMENT_MISMATCH', 'VALIDATION'],
  ['LIVE_TEACHER_ROLE_REQUIRED', 'VALIDATION'],
  ['LIVE_TEMPLATE_NOT_FOUND', 'VALIDATION'],
  ['LIVE_TEMPLATE_HAS_NO_QUESTIONS', 'VALIDATION'],
  ['LIVE_CODE_GENERATION_FAILED', 'UNAVAILABLE'],
];

const toRepositoryError = (message: string): LiveRepositoryError => {
  const match = errorCodeByMessage.find(([marker]) => message.includes(marker));
  return new LiveRepositoryError(match ? match[1] : 'UNAVAILABLE');
};

const parseWith = <Schema extends z.ZodType>(
  schema: Schema,
  payload: unknown,
): z.infer<Schema> => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new LiveRepositoryError('INVALID_RESPONSE');
  }
  return parsed.data;
};

const mapActivity = (row: z.infer<typeof activitySchema>): LiveActivity => ({
  activityId: row.activity_id,
  title: row.title,
  quizTemplateId: row.quiz_template_id,
  questionTimeLimitSeconds: row.question_time_limit_seconds,
  status: row.status,
  rulesVersion: row.rules_version,
  scheduledFor: row.scheduled_for ?? null,
});

const mapState = (raw: z.infer<typeof stateSchema>): LiveSessionState => ({
  sessionId: raw.session_id,
  state: raw.state,
  stateVersion: raw.state_version,
  currentPosition: raw.current_position,
  questionCount: raw.question_count,
  participantCount: raw.participant_count,
  rulesVersion: raw.rules_version,
  serverTime: raw.server_time,
  isHost: raw.is_host,
  mode: raw.mode,
  teamCount: raw.team_count,
  ...(raw.participants
    ? {
        participants: raw.participants.map((entry) => ({
          displayName: entry.display_name,
        })),
      }
    : {}),
  ...(raw.question
    ? {
        question: {
          questionId: raw.question.question_id,
          position: raw.question.position,
          prompt: raw.question.prompt,
          publicOptions: raw.question.public_options.map((option) => ({
            id: option.id,
            key: option.key,
            text: option.text,
            sortOrder: option.sort_order,
          })),
          openedAt: raw.question.opened_at,
          deadlineAt: raw.question.deadline_at,
        },
      }
    : {}),
  ...(raw.answered_count === undefined
    ? {}
    : { answeredCount: raw.answered_count }),
  ...(raw.my_answer && 'answered' in raw.my_answer
    ? { myAnswer: { answered: raw.my_answer.answered } }
    : {}),
  ...(raw.my_answer && 'answer_status' in raw.my_answer
    ? {
        myFeedback: {
          answerStatus: raw.my_answer.answer_status,
          selectedOptionId: raw.my_answer.selected_option_id,
          scoreDelta: raw.my_answer.score_delta,
        },
      }
    : {}),
  ...(raw.correct_option_id === undefined
    ? {}
    : { correctOptionId: raw.correct_option_id }),
  ...(raw.explanation === undefined ? {} : { explanation: raw.explanation }),
  ...(raw.option_counts
    ? {
        optionCounts: raw.option_counts.map((entry) => ({
          optionId: entry.option_id,
          count: entry.count,
        })),
      }
    : {}),
  ...(raw.podium
    ? {
        podium: raw.podium.map((entry) => ({
          rank: entry.rank,
          displayName: entry.display_name,
          score: entry.score,
        })),
      }
    : {}),
  ...(raw.my_result
    ? { myResult: { score: raw.my_result.score, rank: raw.my_result.rank } }
    : {}),
  ...(raw.paused_remaining_ms === undefined
    ? {}
    : { pausedRemainingMs: raw.paused_remaining_ms }),
});

export function createLiveRepository(
  client: SupabaseClient<Database>,
): LiveRepository {
  const transition = async (
    name:
      | 'advance_live_session'
      | 'cancel_live_session'
      | 'close_live_question'
      | 'finalize_live_session'
      | 'open_live_question'
      | 'pause_live_session'
      | 'resume_live_session'
      | 'start_live_session',
    sessionId: string,
    expectedVersion: number,
  ) => {
    const { error } = await client.rpc(name, {
      p_expected_version: expectedVersion,
      p_session_id: sessionId,
    });
    if (error) throw toRepositoryError(error.message);
  };

  return {
    async createActivity(input) {
      const { data, error } = await client.rpc('create_live_activity', {
        p_question_time_limit_seconds: input.questionTimeLimitSeconds,
        p_quiz_template_id: input.quizTemplateId,
        p_title: input.title,
      });
      if (error) throw toRepositoryError(error.message);
      return mapActivity(parseWith(activitySchema, data));
    },

    async listMyActivities() {
      const { data, error } = await client
        .from('live_activities')
        .select(
          'id, title, quiz_template_id, question_time_limit_seconds, status, rules_version, scheduled_for',
        )
        .order('created_at', { ascending: false });
      if (error) throw toRepositoryError(error.message);
      return parseWith(z.array(activityRowSchema), data).map((row) =>
        mapActivity({
          activity_id: row.id,
          question_time_limit_seconds: row.question_time_limit_seconds,
          quiz_template_id: row.quiz_template_id,
          rules_version: row.rules_version,
          scheduled_for: row.scheduled_for,
          status: row.status,
          title: row.title,
        }),
      );
    },

    async createSession(input) {
      const sessionArgs = {
        p_assignment_id: input.assignmentId,
        p_classroom_id: input.classroomId,
        p_live_activity_id: input.activityId,
        ...(input.mode ? { p_mode: input.mode } : {}),
        ...(input.teamCount ? { p_team_count: input.teamCount } : {}),
      };
      const { data, error } = await client.rpc(
        'create_live_session',
        sessionArgs as Database['public']['Functions']['create_live_session']['Args'],
      );
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(sessionReceiptSchema, data);
      return {
        sessionId: parsed.session_id,
        state: parsed.state,
        stateVersion: parsed.state_version,
        joinCode: parsed.join_code,
        joinCodeVersion: parsed.join_code_version,
        mode: parsed.mode,
        teamCount: parsed.team_count,
      };
    },

    async rotateJoinCode(sessionId) {
      const { data, error } = await client.rpc('rotate_live_join_code', {
        p_session_id: sessionId,
      });
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(rotateSchema, data);
      return {
        joinCode: parsed.join_code,
        joinCodeVersion: parsed.join_code_version,
      };
    },

    async join(input) {
      const { data, error } = await client.rpc('join_live_session', {
        p_join_code: input.joinCode,
        p_request_id: input.requestId,
      });
      if (error) throw toRepositoryError(error.message);
      // Failed lookups arrive as committed payload errors so the server-side
      // throttle can count them (2026-07-live-3).
      const payloadError = joinErrorSchema.safeParse(data);
      if (payloadError.success) {
        throw toRepositoryError(payloadError.data.error);
      }
      const parsed = parseWith(joinSchema, data);
      return {
        sessionId: parsed.session_id,
        state: parsed.state,
        stateVersion: parsed.state_version,
      };
    },

    async getState(sessionId) {
      const { data, error } = await client.rpc('get_live_session_state', {
        p_session_id: sessionId,
      });
      if (error) throw toRepositoryError(error.message);
      return mapState(parseWith(stateSchema, data));
    },

    startSession: (sessionId, expectedVersion) =>
      transition('start_live_session', sessionId, expectedVersion),
    openQuestion: (sessionId, expectedVersion) =>
      transition('open_live_question', sessionId, expectedVersion),
    advance: (sessionId, expectedVersion) =>
      transition('advance_live_session', sessionId, expectedVersion),
    closeQuestion: (sessionId, expectedVersion) =>
      transition('close_live_question', sessionId, expectedVersion),
    finalize: (sessionId, expectedVersion) =>
      transition('finalize_live_session', sessionId, expectedVersion),
    cancel: (sessionId, expectedVersion) =>
      transition('cancel_live_session', sessionId, expectedVersion),

    async submitAnswer(input) {
      const { data, error } = await client.rpc('submit_live_answer', {
        p_idempotency_key: input.idempotencyKey,
        p_selected_option_id: input.selectedOptionId,
        p_session_question_id: input.sessionQuestionId,
      });
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(answerReceiptSchema, data);
      return { streak: parsed.streak };
    },

    pauseSession: (sessionId, expectedVersion) =>
      transition('pause_live_session', sessionId, expectedVersion),
    resumeSession: (sessionId, expectedVersion) =>
      transition('resume_live_session', sessionId, expectedVersion),

    async getDistribution(sessionId) {
      const { data, error } = await client.rpc('live_question_distribution', {
        p_session_id: sessionId,
      });
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(distributionSchema, data);
      return {
        answeredCount: parsed.answered_count,
        options: parsed.options.map((entry) => ({
          count: entry.count,
          optionId: entry.option_id,
        })),
      };
    },

    async getTeamTotals(sessionId) {
      const { data, error } = await client.rpc('live_team_totals', {
        p_session_id: sessionId,
      });
      if (error) throw toRepositoryError(error.message);
      return parseWith(teamTotalsSchema, data).map((entry) => ({
        memberCount: entry.member_count,
        score: entry.score,
        teamNumber: entry.team_number,
      }));
    },

    async getStandings(sessionId) {
      const { data, error } = await client.rpc('live_session_standings', {
        p_session_id: sessionId,
      });
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(standingsSchema, data);
      return {
        participantCount: parsed.participant_count,
        standings: parsed.standings.map((entry) => ({
          rank: entry.rank,
          displayName: entry.display_name,
          score: entry.score,
        })),
      };
    },

    async getSessionDetail(sessionId) {
      const { data, error } = await client.rpc('teacher_live_session_detail', {
        p_session_id: sessionId,
      });
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(sessionDetailSchema, data);
      return {
        sessionId: parsed.session_id,
        mode: parsed.mode,
        completedAt: parsed.completed_at,
        questions: parsed.questions.map((entry) => ({
          answered: entry.answered,
          averageResponseMs: entry.average_response_ms,
          correct: entry.correct,
          correctRate: entry.correct_rate,
          position: entry.position,
          prompt: entry.prompt,
        })),
        ranking: parsed.ranking.map((entry) => ({
          displayName: entry.display_name,
          rank: entry.rank,
          score: entry.score,
          teamNumber: entry.team_number,
        })),
      };
    },

    async scheduleActivity(activityId, scheduledFor) {
      const scheduleArgs = {
        p_activity_id: activityId,
        p_scheduled_for: scheduledFor,
      };
      const { error } = await client.rpc(
        'schedule_live_activity',
        scheduleArgs as unknown as Database['public']['Functions']['schedule_live_activity']['Args'],
      );
      if (error) throw toRepositoryError(error.message);
    },
  };
}
