import { classifyReadFailure } from '../../../lib/query/read-failure';
export type TeacherContentErrorCode =
  | 'CONTENT_ALREADY_PUBLISHED'
  | 'CONTENT_INVALID'
  | 'CONTENT_NOT_FOUND'
  | 'CONTENT_TEACHER_ONLY'
  | 'CONTENT_UNSAFE_TEXT'
  | 'EXTERNAL_URL_INVALID'
  | 'INVALID_RESPONSE'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE';

const messages: Record<TeacherContentErrorCode, string> = {
  AUTH_REQUIRED: '請先登入教師帳號。',
  RATE_LIMITED: '內容讀取過於頻繁，請稍後再試。',
  CONTENT_ALREADY_PUBLISHED: '已發布的內容請用發布流程更新。',
  CONTENT_INVALID: '內容未通過驗證，請檢查欄位。',
  CONTENT_NOT_FOUND: '找不到這筆內容。',
  CONTENT_TEACHER_ONLY: '只有教師帳號可以管理內容。',
  CONTENT_UNSAFE_TEXT: '內容含不允許的 script 或事件屬性。',
  EXTERNAL_URL_INVALID: '外部連結必須是 https 開頭的網址。',
  INVALID_RESPONSE: '內容資料格式不正確，請稍後重試。',
  UNAVAILABLE: '目前無法完成操作，請稍後重試。',
};

export class TeacherContentError extends Error {
  readonly code: TeacherContentErrorCode;

  constructor(code: TeacherContentErrorCode) {
    super(messages[code]);
    this.name = 'TeacherContentError';
    this.code = code;
  }
}

export const toTeacherContentError = (message: string): TeacherContentError => {
  if (message.includes('CONTENT_ALREADY_PUBLISHED')) {
    return new TeacherContentError('CONTENT_ALREADY_PUBLISHED');
  }
  if (message.includes('CONTENT_TEACHER_ONLY')) {
    return new TeacherContentError('CONTENT_TEACHER_ONLY');
  }
  if (message.includes('CONTENT_UNSAFE_TEXT')) {
    return new TeacherContentError('CONTENT_UNSAFE_TEXT');
  }
  if (message.includes('CONTENT_NOT_FOUND')) {
    return new TeacherContentError('CONTENT_NOT_FOUND');
  }
  if (message.includes('EXTERNAL_URL_INVALID')) {
    return new TeacherContentError('EXTERNAL_URL_INVALID');
  }
  if (message.includes('CONTENT_INVALID') || message.includes('_INVALID')) {
    return new TeacherContentError('CONTENT_INVALID');
  }
  return new TeacherContentError('UNAVAILABLE');
};

export const toTeacherContentReadError = (
  error: unknown,
  status?: number,
): TeacherContentError => {
  const message: unknown =
    typeof error === 'object' && error !== null
      ? Object.getOwnPropertyDescriptor(error, 'message')?.value
      : undefined;
  const legacy = toTeacherContentError(
    typeof message === 'string' && message.length <= 256 ? message : '',
  );
  if (legacy.code !== 'UNAVAILABLE' && ![401, 403, 429].includes(status ?? 0))
    return legacy;
  const codes = {
    AUTH: 'AUTH_REQUIRED',
    PERMISSION: 'CONTENT_TEACHER_ONLY',
    RATE_LIMIT: 'RATE_LIMITED',
    VALIDATION: 'CONTENT_INVALID',
    NOT_FOUND: 'CONTENT_NOT_FOUND',
    UNAVAILABLE: 'UNAVAILABLE',
  } as const;
  return new TeacherContentError(codes[classifyReadFailure({ error, status })]);
};
