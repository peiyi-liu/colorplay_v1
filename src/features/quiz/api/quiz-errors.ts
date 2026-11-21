import { classifyReadFailure } from '../../../lib/query/read-failure';
export type QuizRepositoryErrorCode =
  | 'AUTH_REQUIRED'
  | 'CHAPTER_LOCKED'
  | 'INVALID_RESPONSE'
  | 'QUESTION_ALREADY_ANSWERED'
  | 'SESSION_INCOMPLETE'
  | 'SESSION_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE';

const errorMessages: Record<QuizRepositoryErrorCode, string> = {
  AUTH_REQUIRED: '請先登入再開始挑戰。',
  CHAPTER_LOCKED: '請先完成上一章的複習與挑戰。',
  INVALID_RESPONSE: '答題資料格式不正確，請重新載入。',
  QUESTION_ALREADY_ANSWERED: '這一題已經作答，正在載入最新結果。',
  SESSION_INCOMPLETE: '還有題目尚未完成，暫時不能結算。',
  SESSION_NOT_FOUND: '找不到這次挑戰，或你沒有檢視權限。',
  RATE_LIMITED: '挑戰資料讀取過於頻繁，請稍後再試。',
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

export const mapServerError = (message: string): QuizRepositoryError => {
  if (message.includes('CHAPTER_LOCKED')) {
    return new QuizRepositoryError('CHAPTER_LOCKED');
  }
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

export const mapQuizReadError = (
  error: unknown,
  status?: number,
): QuizRepositoryError => {
  const message: unknown =
    typeof error === 'object' && error !== null
      ? Object.getOwnPropertyDescriptor(error, 'message')?.value
      : undefined;
  const legacy = mapServerError(
    typeof message === 'string' && message.length <= 256 ? message : '',
  );
  if (legacy.code !== 'UNAVAILABLE' && ![401, 403, 429].includes(status ?? 0))
    return legacy;
  const codes = {
    AUTH: 'AUTH_REQUIRED',
    PERMISSION: 'SESSION_NOT_FOUND',
    RATE_LIMIT: 'RATE_LIMITED',
    VALIDATION: 'INVALID_RESPONSE',
    NOT_FOUND: 'SESSION_NOT_FOUND',
    UNAVAILABLE: 'UNAVAILABLE',
  } as const;
  return new QuizRepositoryError(codes[classifyReadFailure({ error, status })]);
};
