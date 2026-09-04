import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import { type LiveRepository } from '../types';
import { parseWith, toRepositoryError } from './live-repository-errors';
import { mapActivity, mapState } from './live-repository-mappers';
import {
  activityRowSchema,
  activitySchema,
  answerReceiptSchema,
  distributionSchema,
  joinErrorSchema,
  joinSchema,
  myStandingSchema,
  rotateSchema,
  sectionOptionsSchema,
  sessionDetailSchema,
  sessionReceiptSchema,
  standingsSchema,
  stateSchema,
} from './live-repository-schemas';

export { LiveRepositoryError } from '../types';

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
        ...(input.questionDisplay
          ? { p_question_display: input.questionDisplay }
          : {}),
        ...(input.sectionId ? { p_section_id: input.sectionId } : {}),
      });
      if (error) throw toRepositoryError(error.message);
      return mapActivity(parseWith(activitySchema, data));
    },

    async listMyActivities() {
      const { data, error } = await client
        .from('live_activities')
        .select(
          'id, title, quiz_template_id, question_time_limit_seconds, status, rules_version, question_display, section_id',
        )
        .order('created_at', { ascending: false });
      if (error) throw toRepositoryError(error.message);
      return parseWith(z.array(activityRowSchema), data).map((row) =>
        mapActivity({
          activity_id: row.id,
          question_display: row.question_display,
          section_id: row.section_id,
          question_time_limit_seconds: row.question_time_limit_seconds,
          quiz_template_id: row.quiz_template_id,
          rules_version: row.rules_version,
          status: row.status,
          title: row.title,
        }),
      );
    },

    async listSectionOptions() {
      const { data, error } = await client.rpc('list_live_section_options');
      if (error) throw toRepositoryError(error.message);
      return parseWith(sectionOptionsSchema, data).map((row) => ({
        sectionId: row.section_id,
        title: row.title,
        quizTemplateId: row.quiz_template_id,
      }));
    },

    async createSession(input) {
      const sessionArgs = {
        p_assignment_id: input.assignmentId,
        p_classroom_id: input.classroomId,
        p_live_activity_id: input.activityId,
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

    async getMyStanding(sessionId) {
      const { data, error } = await client.rpc('live_my_standing', {
        p_session_id: sessionId,
      });
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(myStandingSchema, data);
      return {
        rank: parsed.rank,
        score: parsed.score,
        participantCount: parsed.participant_count,
        aheadRank: parsed.ahead_rank,
        pointsBehind: parsed.points_behind,
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
        completedAt: parsed.completed_at,
        classroomId: parsed.classroom_id,
        activity: {
          title: parsed.activity.title,
          quizTemplateId: parsed.activity.quiz_template_id,
        },
        participants: parsed.participants.map((participant) => ({
          displayName: participant.display_name,
          rank: participant.rank,
          score: participant.score,
          answers: participant.answers.map((entry) => ({
            position: entry.position,
            status: entry.status,
            responseMs: entry.response_ms,
          })),
        })),
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
        })),
      };
    },
  };
}
