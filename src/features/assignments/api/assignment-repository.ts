import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  type AssignmentRepository,
  type AssignmentRepositoryErrorCode,
  AssignmentRepositoryError,
  type ClassroomAssignment,
  type CreatedAssignment,
  type StudentAssignment,
} from '../types';

export { AssignmentRepositoryError } from '../types';

const utcTimestamp = z.iso
  .datetime({ offset: true })
  .refine((value) => value.endsWith('Z') || value.endsWith('+00:00'));
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
// Deterministic fixture and seed identifiers do not carry RFC 4122 version
// bits, so the strict uuidString validator would reject real server payloads.
const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);

const studentAssignmentSchema = z.strictObject({
  assignment_id: uuidString,
  classroom_id: uuidString,
  classroom_name: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['published', 'paused']),
  available_from: utcTimestamp.nullable(),
  deadline_at: utcTimestamp.nullable(),
  attempt_limit: positiveInteger.nullable(),
  passing_threshold: nonNegativeInteger,
  attempts_used: nonNegativeInteger,
  latest_attempt_status: z
    .enum(['in_progress', 'completed', 'expired', 'abandoned'])
    .nullable(),
  latest_passed: z.boolean().nullable(),
});

const classroomAssignmentSchema = z.strictObject({
  assignment_id: uuidString,
  title: z.string().min(1),
  activity_type: z.enum(['quiz_template', 'live_activity']),
  status: z.enum(['draft', 'published', 'paused', 'archived']),
  available_from: utcTimestamp.nullable(),
  deadline_at: utcTimestamp.nullable(),
  attempt_limit: positiveInteger.nullable(),
  passing_threshold: nonNegativeInteger,
  target_count: nonNegativeInteger,
  completed_count: nonNegativeInteger,
  created_at: utcTimestamp,
  updated_at: utcTimestamp,
});

const createdAssignmentSchema = z.strictObject({
  assignment_id: uuidString,
  classroom_id: uuidString,
  title: z.string().min(1),
  activity_type: z.enum(['quiz_template', 'live_activity']),
  status: z.literal('draft'),
  available_from: utcTimestamp.nullable(),
  deadline_at: utcTimestamp.nullable(),
  attempt_limit: positiveInteger.nullable(),
  passing_threshold: nonNegativeInteger,
  created_at: utcTimestamp,
  updated_at: utcTimestamp,
});

const statusUpdateSchema = z.strictObject({
  assignment_id: uuidString,
  status: z.enum(['draft', 'published', 'paused', 'archived']),
  updated_at: utcTimestamp,
});

// The nested session payload is fully re-validated by the quiz repository when
// the runner loads it; here only the routing identifier is consumed.
const startedAttemptSchema = z.strictObject({
  attempt_id: uuidString,
  assignment_id: uuidString,
  attempt_number: positiveInteger,
  session: z
    .looseObject({
      session_id: uuidString,
    })
    .refine((session) => !('correct_option_id' in session)),
});

const errorCodeByMessage: readonly (readonly [
  string,
  AssignmentRepositoryErrorCode,
])[] = [
  ['AUTH_REQUIRED', 'AUTH_REQUIRED'],
  ['ASSIGNMENT_NOT_FOUND', 'NOT_FOUND'],
  ['CLASSROOM_NOT_FOUND', 'NOT_FOUND'],
  ['ASSIGNMENT_NOT_PUBLISHED', 'NOT_PUBLISHED'],
  ['ASSIGNMENT_NOT_AVAILABLE_YET', 'NOT_AVAILABLE_YET'],
  ['ASSIGNMENT_DEADLINE_PASSED', 'DEADLINE_PASSED'],
  ['ASSIGNMENT_ATTEMPT_LIMIT_REACHED', 'ATTEMPT_LIMIT_REACHED'],
  ['ASSIGNMENT_STATUS_CONFLICT', 'STATUS_CONFLICT'],
  ['ASSIGNMENT_STATUS_INVALID_TRANSITION', 'INVALID_TRANSITION'],
  ['ASSIGNMENT_INVALID_PASSING_RULE', 'VALIDATION'],
  ['ASSIGNMENT_TEMPLATE_NOT_FOUND', 'VALIDATION'],
  ['ASSIGNMENT_LIVE_ACTIVITY_UNAVAILABLE', 'VALIDATION'],
  ['ASSIGNMENT_ACTIVITY_UNAVAILABLE', 'VALIDATION'],
  ['ASSIGNMENT_INVALID_REQUEST', 'VALIDATION'],
];

const toRepositoryError = (message: string): AssignmentRepositoryError => {
  const match = errorCodeByMessage.find(([marker]) => message.includes(marker));
  return new AssignmentRepositoryError(match ? match[1] : 'UNAVAILABLE');
};

const mapStudentAssignment = (
  row: z.infer<typeof studentAssignmentSchema>,
): StudentAssignment => ({
  assignmentId: row.assignment_id,
  classroomId: row.classroom_id,
  classroomName: row.classroom_name,
  title: row.title,
  status: row.status,
  availableFrom: row.available_from,
  deadlineAt: row.deadline_at,
  attemptLimit: row.attempt_limit,
  passingThreshold: row.passing_threshold,
  attemptsUsed: row.attempts_used,
  latestAttemptStatus: row.latest_attempt_status,
  latestPassed: row.latest_passed,
});

const mapClassroomAssignment = (
  row: z.infer<typeof classroomAssignmentSchema>,
): ClassroomAssignment => ({
  assignmentId: row.assignment_id,
  title: row.title,
  activityType: row.activity_type,
  status: row.status,
  availableFrom: row.available_from,
  deadlineAt: row.deadline_at,
  attemptLimit: row.attempt_limit,
  passingThreshold: row.passing_threshold,
  targetCount: row.target_count,
  completedCount: row.completed_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCreatedAssignment = (
  row: z.infer<typeof createdAssignmentSchema>,
): CreatedAssignment => ({
  assignmentId: row.assignment_id,
  classroomId: row.classroom_id,
  title: row.title,
  activityType: row.activity_type,
  status: row.status,
  availableFrom: row.available_from,
  deadlineAt: row.deadline_at,
  attemptLimit: row.attempt_limit,
  passingThreshold: row.passing_threshold,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const parseWith = <Schema extends z.ZodType>(
  schema: Schema,
  payload: unknown,
): z.infer<Schema> => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AssignmentRepositoryError('INVALID_RESPONSE');
  }
  return parsed.data;
};

export function createAssignmentRepository(
  client: SupabaseClient<Database>,
): AssignmentRepository {
  return {
    async listMine() {
      const { data, error } = await client.rpc('list_my_assignments');
      if (error) throw toRepositoryError(error.message);
      return parseWith(z.array(studentAssignmentSchema), data).map(
        mapStudentAssignment,
      );
    },

    async listClassroom(classroomId) {
      const { data, error } = await client.rpc('list_classroom_assignments', {
        p_classroom_id: classroomId,
      });
      if (error) throw toRepositoryError(error.message);
      return parseWith(z.array(classroomAssignmentSchema), data).map(
        mapClassroomAssignment,
      );
    },

    async createAssignment(input) {
      // PostgREST accepts explicit SQL nulls for these optional arguments;
      // the generated Args type drops that nullability, hence the cast.
      const createArgs = {
        p_activity_reference: input.quizTemplateId,
        p_activity_type: 'quiz_template',
        p_attempt_limit: input.attemptLimit,
        p_available_from: input.availableFrom,
        p_classroom_id: input.classroomId,
        p_deadline_at: input.deadlineAt,
        p_passing_threshold: input.passingThreshold,
        p_title: input.title,
      };
      const { data, error } = await client.rpc(
        'create_assignment',
        createArgs as Database['public']['Functions']['create_assignment']['Args'],
      );
      if (error) throw toRepositoryError(error.message);
      return mapCreatedAssignment(parseWith(createdAssignmentSchema, data));
    },

    async updateStatus(input) {
      const updateArgs = {
        p_assignment_id: input.assignmentId,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_status: input.status,
      };
      const { data, error } = await client.rpc(
        'update_assignment_status',
        updateArgs as Database['public']['Functions']['update_assignment_status']['Args'],
      );
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(statusUpdateSchema, data);
      return {
        assignmentId: parsed.assignment_id,
        status: parsed.status,
        updatedAt: parsed.updated_at,
      };
    },

    async startAttempt(input) {
      const { data, error } = await client.rpc('start_assignment_attempt', {
        p_assignment_id: input.assignmentId,
        p_request_id: input.requestId,
      });
      if (error) throw toRepositoryError(error.message);
      const parsed = parseWith(startedAttemptSchema, data);
      return {
        attemptId: parsed.attempt_id,
        assignmentId: parsed.assignment_id,
        attemptNumber: parsed.attempt_number,
        sessionId: parsed.session.session_id,
      };
    },
  };
}
