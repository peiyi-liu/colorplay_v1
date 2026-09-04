import { z } from 'zod';

const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
const utcTimestamp = z.iso.datetime({ offset: true });
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();

const questionDisplaySchema = z.enum(['screen_only', 'device']);

const stateNameSchema = z.enum([
  'draft',
  'lobby',
  'question_open',
  'question_feedback',
  'paused',
  'completed',
  'cancelled',
]);

export const activitySchema = z.strictObject({
  activity_id: uuidString,
  title: z.string().min(1),
  quiz_template_id: uuidString,
  question_time_limit_seconds: positiveInteger,
  status: z.enum(['active', 'archived']),
  rules_version: z.string().min(1),
  // 伺服器仍回傳，前端已不消費（team 移除批）；strict 契約保留鍵
  scheduled_for: utcTimestamp.nullable().optional(),
  question_display: questionDisplaySchema,
  section_id: uuidString.nullable().optional(),
});

export const sectionOptionsSchema = z.array(
  z.strictObject({
    section_id: uuidString,
    title: z.string().min(1),
    quiz_template_id: uuidString,
  }),
);

export const activityRowSchema = z.strictObject({
  id: uuidString,
  title: z.string().min(1),
  quiz_template_id: uuidString,
  question_time_limit_seconds: positiveInteger,
  status: z.enum(['active', 'archived']),
  rules_version: z.string().min(1),
  question_display: questionDisplaySchema,
  section_id: uuidString.nullable(),
});

export const answerReceiptSchema = z.strictObject({
  recorded: z.literal(true),
  session_question_id: uuidString,
  streak: z.number().int().nonnegative(),
});

export const distributionSchema = z.strictObject({
  answered_count: z.number().int().nonnegative(),
  options: z.array(
    z.strictObject({
      option_id: uuidString.nullable(),
      count: z.number().int().positive(),
    }),
  ),
});

export const sessionDetailSchema = z.strictObject({
  session_id: uuidString,
  // 伺服器仍回傳，前端已不消費（team 移除批）；strict 契約保留鍵
  mode: z.enum(['individual', 'team']),
  completed_at: utcTimestamp.nullable(),
  classroom_id: uuidString,
  activity: z.strictObject({
    title: z.string().min(1),
    quiz_template_id: uuidString,
  }),
  participants: z.array(
    z.strictObject({
      display_name: z.string().min(1),
      rank: positiveInteger.nullable(),
      score: nonNegativeInteger,
      team_number: z.number().int().positive().nullable(),
      answers: z.array(
        z.strictObject({
          position: positiveInteger,
          status: z.enum(['correct', 'incorrect', 'timeout']),
          response_ms: z.number().int().nullable(),
        }),
      ),
    }),
  ),
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

export const sessionReceiptSchema = z.strictObject({
  session_id: uuidString,
  state: stateNameSchema,
  state_version: positiveInteger,
  join_code: z.string().regex(/^[0-9]{6}$/u),
  join_code_version: positiveInteger,
  // 伺服器仍回傳，前端已不消費（team 移除批）；strict 契約保留鍵
  mode: z.enum(['individual', 'team']),
  team_count: z.number().int().min(2).max(4).nullable(),
});

export const rotateSchema = z.strictObject({
  session_id: uuidString,
  join_code: z.string().regex(/^[0-9]{6}$/u),
  join_code_version: positiveInteger,
});

export const joinSchema = z.strictObject({
  session_id: uuidString,
  state: stateNameSchema,
  state_version: positiveInteger,
});

export const joinErrorSchema = z.strictObject({
  error: z.string().min(1),
});

export const standingsSchema = z.strictObject({
  participant_count: nonNegativeInteger,
  standings: z.array(
    z.strictObject({
      rank: positiveInteger,
      display_name: z.string().min(1),
      score: nonNegativeInteger,
    }),
  ),
});

// prompt and option text are absent for students in screen_only sessions;
// the server strips them before the payload leaves the database.
const questionSchema = z.strictObject({
  question_id: uuidString,
  position: positiveInteger,
  prompt: z.string().min(1).optional(),
  public_options: z
    .array(
      z.strictObject({
        id: uuidString,
        key: z.string().min(1),
        text: z.string().min(1).optional(),
        sort_order: positiveInteger,
      }),
    )
    .min(2),
  opened_at: utcTimestamp.nullable(),
  deadline_at: utcTimestamp.nullable(),
});

export const myStandingSchema = z.strictObject({
  rank: positiveInteger,
  score: nonNegativeInteger,
  participant_count: positiveInteger,
  ahead_rank: positiveInteger.nullable(),
  points_behind: nonNegativeInteger.nullable(),
});

export const stateSchema = z
  .strictObject({
    session_id: uuidString,
    state: stateNameSchema,
    state_version: positiveInteger,
    current_position: nonNegativeInteger,
    question_count: nonNegativeInteger,
    participant_count: nonNegativeInteger,
    rules_version: z.string().min(1),
    question_display: questionDisplaySchema,
    server_time: utcTimestamp,
    is_host: z.boolean(),
    // 伺服器仍回傳，前端已不消費（team 移除批）；strict 契約保留鍵
    mode: z.enum(['individual', 'team']),
    team_count: z.number().int().min(2).max(4).nullable(),
    waiting_for_next: z.literal(true).optional(),
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
  )
  .refine(
    (state) =>
      state.question_display === 'device' ||
      state.is_host ||
      state.question === undefined ||
      (state.question.prompt === undefined &&
        state.question.public_options.every(
          (option) => option.text === undefined,
        )),
    { message: 'SCREEN_ONLY_TEXT_LEAK' },
  );
