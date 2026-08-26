import type { z } from 'zod';

import type { LiveActivity, LiveSessionState } from '../types';
import type { activitySchema, stateSchema } from './live-repository-schemas';

export const mapActivity = (
  row: z.infer<typeof activitySchema>,
): LiveActivity => ({
  activityId: row.activity_id,
  title: row.title,
  quizTemplateId: row.quiz_template_id,
  questionTimeLimitSeconds: row.question_time_limit_seconds,
  status: row.status,
  rulesVersion: row.rules_version,
  questionDisplay: row.question_display,
  sectionId: row.section_id ?? null,
});

export const mapState = (
  raw: z.infer<typeof stateSchema>,
): LiveSessionState => ({
  sessionId: raw.session_id,
  state: raw.state,
  stateVersion: raw.state_version,
  currentPosition: raw.current_position,
  questionCount: raw.question_count,
  participantCount: raw.participant_count,
  rulesVersion: raw.rules_version,
  questionDisplay: raw.question_display,
  serverTime: raw.server_time,
  isHost: raw.is_host,
  ...(raw.waiting_for_next === undefined
    ? {}
    : { waitingForNext: raw.waiting_for_next }),
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
          ...(raw.question.prompt === undefined
            ? {}
            : { prompt: raw.question.prompt }),
          publicOptions: raw.question.public_options.map((option) => ({
            id: option.id,
            key: option.key,
            ...(option.text === undefined ? {} : { text: option.text }),
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
