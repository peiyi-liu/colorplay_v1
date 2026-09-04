import { z } from 'zod';

import { LiveRepositoryError, type LiveRepositoryErrorCode } from '../types';

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

export const toRepositoryError = (message: string): LiveRepositoryError => {
  const match = errorCodeByMessage.find(([marker]) => message.includes(marker));
  return new LiveRepositoryError(match ? match[1] : 'UNAVAILABLE');
};

export const parseWith = <Schema extends z.ZodType>(
  schema: Schema,
  payload: unknown,
): z.infer<Schema> => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new LiveRepositoryError('INVALID_RESPONSE');
  }
  return parsed.data;
};
