import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  type ClassroomCodeReceipt,
  type ClassroomMember,
  type ClassroomRepository,
  ClassroomRepositoryError,
  type JoinedClassroom,
  type OwnedClassroom,
  type StudentClassroom,
  type StudentProgressSnapshot,
} from '../types';

export { ClassroomRepositoryError } from '../types';

const utcTimestamp = z.iso
  .datetime({ offset: true })
  .refine((value) => value.endsWith('Z') || value.endsWith('+00:00'));
const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();
const classroomName = z.string().min(1).max(80);
const databaseUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const classroomId = databaseUuid;

const studentClassroomSchema = z.strictObject({
  classroom_id: classroomId,
  classroom_name: classroomName,
  joined_at: utcTimestamp,
  membership_status: z.literal('active'),
});
const ownedClassroomSchema = z.strictObject({
  classroom_id: classroomId,
  classroom_name: classroomName,
  classroom_status: z.enum(['active', 'archived']),
  created_at: utcTimestamp,
  join_code: z
    .string()
    .regex(/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/u)
    .nullable(),
  join_code_version: positiveInteger,
  member_count: nonNegativeInteger,
});
const classroomMemberSchema = z.strictObject({
  active_blook_id: databaseUuid.nullable(),
  display_name: z.string().min(1),
  full_name: z.string().min(1).nullable(),
  joined_at: utcTimestamp,
  login_account: z.string().min(1).nullable(),
  member_ref: databaseUuid,
  membership_status: z.enum(['active', 'inactive']),
});
const studentProgressSchema = z.strictObject({
  chapters: z.array(
    z.strictObject({
      accuracy: z.number().nullable(),
      assessment_accuracy: z.number().nullable(),
      chapter_quiz_accuracy: z.number().nullable(),
      chapter_id: databaseUuid,
      chapter_title: z.string().min(1),
      coverage: z.number().nullable(),
      mastery: z.number().nullable(),
      live_accuracy: z.number().nullable(),
      review_completed: z.number().int().nonnegative(),
      review_total: z.number().int().positive().nullable(),
      section_quiz_accuracy: z.number().nullable(),
      status: z.enum(['developing', 'learning', 'mastered', 'not_started']),
    }),
  ),
  identity: z.strictObject({
    display_name: z.string().min(1),
    full_name: z.string().min(1).nullable(),
    joined_at: utcTimestamp,
    login_account: z.string().min(1).nullable(),
    membership_status: z.enum(['active', 'inactive']),
  }),
  stats: z.strictObject({
    avg_accuracy: z.number().nullable(),
    class_rank: z.number().int().positive().nullable(),
    class_xp: z.number().int().nonnegative(),
    open_mistake_count: z.number().int().nonnegative(),
    total_mistake_count: z.number().int().nonnegative(),
    unfinished_mistake_count: z.number().int().nonnegative(),
  }),
});
const createdClassroomSchema = z.strictObject({
  classroom_id: classroomId,
  classroom_name: classroomName,
  join_code: z.string().regex(/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/u),
  join_code_version: positiveInteger,
});
const rotatedCodeSchema = z.strictObject({
  classroom_id: classroomId,
  join_code: z.string().regex(/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/u),
  join_code_version: positiveInteger,
});
const joinedClassroomSchema = z.strictObject({
  classroom_id: classroomId,
  classroom_name: classroomName,
  joined_at: utcTimestamp,
  membership_status: z.literal('active'),
});
const createInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
});

const invalidResponse = () => new ClassroomRepositoryError('INVALID_RESPONSE');
const parseArray = <T>(
  schema: z.ZodType<T>,
  payload: unknown,
): readonly T[] => {
  const parsed = z.array(schema).safeParse(payload);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
};
const parseReceipt = <T>(schema: z.ZodType<T>, payload: unknown): T => {
  const parsed = z.array(schema).length(1).safeParse(payload);
  if (!parsed.success) throw invalidResponse();
  const [receipt] = parsed.data;
  if (receipt === undefined) throw invalidResponse();
  return receipt;
};

const mapRpcError = (
  error: Readonly<{ message: string }>,
  operation: 'idempotent' | 'one-time' | 'read',
) => {
  if (error.message.includes('AUTH_REQUIRED')) {
    return new ClassroomRepositoryError('AUTH_REQUIRED');
  }
  if (error.message.includes('INVALID_CLASSROOM_CODE')) {
    return new ClassroomRepositoryError('INVALID_CODE');
  }
  if (
    error.message.includes('CLASSROOM_NOT_AVAILABLE') ||
    error.message.includes('CLASSROOM_MEMBERSHIP_CONFLICT') ||
    error.message.includes('MEMBER_NOT_AVAILABLE') ||
    error.message.includes('TEACHER_REQUIRED') ||
    error.message.includes('STUDENT_REQUIRED')
  ) {
    return new ClassroomRepositoryError('NOT_AVAILABLE');
  }
  return new ClassroomRepositoryError(
    operation === 'one-time' ? 'AMBIGUOUS_WRITE' : 'UNAVAILABLE',
  );
};

const mapStudentClassroom = (
  row: z.infer<typeof studentClassroomSchema>,
): StudentClassroom => ({
  classroomId: row.classroom_id,
  classroomName: row.classroom_name,
  joinedAt: row.joined_at,
  membershipStatus: row.membership_status,
});
const mapOwnedClassroom = (
  row: z.infer<typeof ownedClassroomSchema>,
): OwnedClassroom => ({
  classroomId: row.classroom_id,
  classroomName: row.classroom_name,
  classroomStatus: row.classroom_status,
  createdAt: row.created_at,
  joinCode: row.join_code,
  joinCodeVersion: row.join_code_version,
  memberCount: row.member_count,
});
const mapMember = (
  row: z.infer<typeof classroomMemberSchema>,
): ClassroomMember => ({
  activeBlookId: row.active_blook_id,
  displayName: row.display_name,
  fullName: row.full_name,
  joinedAt: row.joined_at,
  loginAccount: row.login_account,
  memberRef: row.member_ref,
  membershipStatus: row.membership_status,
});
const mapStudentProgress = (
  payload: z.infer<typeof studentProgressSchema>,
): StudentProgressSnapshot => ({
  chapters: payload.chapters.map((chapter) => ({
    accuracy: chapter.accuracy,
    assessmentAccuracy: chapter.assessment_accuracy,
    chapterQuizAccuracy: chapter.chapter_quiz_accuracy,
    chapterId: chapter.chapter_id,
    chapterTitle: chapter.chapter_title,
    coverage: chapter.coverage,
    mastery: chapter.mastery,
    liveAccuracy: chapter.live_accuracy,
    reviewCompleted: chapter.review_completed,
    reviewTotal: chapter.review_total,
    sectionQuizAccuracy: chapter.section_quiz_accuracy,
    status: chapter.status,
  })),
  identity: {
    displayName: payload.identity.display_name,
    fullName: payload.identity.full_name,
    joinedAt: payload.identity.joined_at,
    loginAccount: payload.identity.login_account,
    membershipStatus: payload.identity.membership_status,
  },
  stats: {
    avgAccuracy: payload.stats.avg_accuracy,
    classRank: payload.stats.class_rank,
    classXp: payload.stats.class_xp,
    openMistakeCount: payload.stats.open_mistake_count,
    totalMistakeCount: payload.stats.total_mistake_count,
    unfinishedMistakeCount: payload.stats.unfinished_mistake_count,
  },
});
const mapJoined = (
  row: z.infer<typeof joinedClassroomSchema>,
): JoinedClassroom => ({
  classroomId: row.classroom_id,
  classroomName: row.classroom_name,
  joinedAt: row.joined_at,
  membershipStatus: row.membership_status,
});

export function createClassroomRepository(
  client: SupabaseClient<Database>,
): ClassroomRepository {
  return {
    async createClassroom(input) {
      const parsedInput = createInputSchema.safeParse(input);
      if (!parsedInput.success)
        throw new ClassroomRepositoryError('INVALID_INPUT');
      const { data, error } = await client.rpc('create_classroom', {
        p_name: parsedInput.data.name,
      });
      if (error) throw mapRpcError(error, 'one-time');
      const row = parseReceipt(createdClassroomSchema, data);
      return {
        classroomId: row.classroom_id,
        classroomName: row.classroom_name,
        joinCode: row.join_code,
        joinCodeVersion: row.join_code_version,
      } satisfies ClassroomCodeReceipt;
    },
    async getOwnedMembers(requestedClassroomId) {
      const parsedId = classroomId.safeParse(requestedClassroomId);
      if (!parsedId.success)
        throw new ClassroomRepositoryError('INVALID_INPUT');
      const { data, error } = await client.rpc('list_owned_classroom_members', {
        p_classroom_id: parsedId.data,
      });
      if (error) throw mapRpcError(error, 'read');
      return parseArray(classroomMemberSchema, data).map(mapMember);
    },
    async getStudentProgress(requestedClassroomId, requestedMemberRef) {
      const parsedId = classroomId.safeParse(requestedClassroomId);
      const parsedRef = databaseUuid.safeParse(requestedMemberRef);
      if (!parsedId.success || !parsedRef.success)
        throw new ClassroomRepositoryError('INVALID_INPUT');
      const { data, error } = await client.rpc('teacher_student_progress_v2', {
        p_classroom_id: parsedId.data,
        p_member_ref: parsedRef.data,
      });
      if (error) throw mapRpcError(error, 'read');
      const parsed = studentProgressSchema.safeParse(data);
      if (!parsed.success) throw invalidResponse();
      return mapStudentProgress(parsed.data);
    },
    async joinClassroom(input) {
      const { data, error } = await client.rpc('join_classroom', {
        p_join_code: input.joinCode.trim(),
        p_request_id: input.requestId,
      });
      if (error) throw mapRpcError(error, 'idempotent');
      return mapJoined(parseReceipt(joinedClassroomSchema, data));
    },
    async listMine() {
      const { data, error } = await client.rpc('list_my_classrooms');
      if (error) throw mapRpcError(error, 'read');
      return parseArray(studentClassroomSchema, data).map(mapStudentClassroom);
    },
    async listOwned() {
      const { data, error } = await client.rpc('list_owned_classrooms');
      if (error) throw mapRpcError(error, 'read');
      return parseArray(ownedClassroomSchema, data).map(mapOwnedClassroom);
    },
    async rotateJoinCode(requestedClassroomId) {
      const parsedId = classroomId.safeParse(requestedClassroomId);
      if (!parsedId.success)
        throw new ClassroomRepositoryError('INVALID_INPUT');
      const { data, error } = await client.rpc('rotate_classroom_join_code', {
        p_classroom_id: parsedId.data,
      });
      if (error) throw mapRpcError(error, 'one-time');
      const row = parseReceipt(rotatedCodeSchema, data);
      return {
        classroomId: row.classroom_id,
        classroomName: null,
        joinCode: row.join_code,
        joinCodeVersion: row.join_code_version,
      };
    },
  };
}
