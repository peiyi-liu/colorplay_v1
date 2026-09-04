export type TeacherContentErrorCode =
  | 'CONTENT_ALREADY_PUBLISHED'
  | 'CONTENT_INVALID'
  | 'CONTENT_NOT_FOUND'
  | 'CONTENT_TEACHER_ONLY'
  | 'CONTENT_UNSAFE_TEXT'
  | 'EXTERNAL_URL_INVALID'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

const messages: Record<TeacherContentErrorCode, string> = {
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
