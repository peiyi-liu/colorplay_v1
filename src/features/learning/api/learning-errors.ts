import { z } from 'zod';
import { classifyReadFailure } from '../../../lib/query/read-failure';

export const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);

export const parsePrivateReviewMediaAssetPath = (
  assetPath: string,
): Readonly<{ bucket: string; objectPath: string }> => {
  const separator = assetPath.indexOf('/');
  if (separator <= 0 || separator === assetPath.length - 1) {
    throw new LearningError('INVALID_RESPONSE');
  }
  return {
    bucket: assetPath.slice(0, separator),
    objectPath: assetPath.slice(separator + 1),
  };
};

export type LearningErrorCode =
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CHAPTER_LOCKED'
  | 'HINT_CLOSED'
  | 'HINT_SEQUENCE'
  | 'HINT_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'REMEDIATION_NOTHING_OPEN'
  | 'REVIEW_CARD_NOT_FOUND'
  | 'UNAVAILABLE';

const learningMessages: Record<LearningErrorCode, string> = {
  AUTH_REQUIRED: '登入狀態已失效，請重新登入。',
  PERMISSION_DENIED: '目前無法存取這項學習資料。',
  RATE_LIMITED: '請求過於頻繁，請稍後再試。',
  INVALID_INPUT: '學習資料請求無效，請重新操作。',
  NOT_FOUND: '找不到這項學習資料。',
  CHAPTER_LOCKED: '請先完成上一章的複習與挑戰。',
  HINT_CLOSED: '這一題已經作答，提示已關閉。',
  HINT_SEQUENCE: '請依序索取提示。',
  HINT_UNAVAILABLE: '這一題沒有更多提示了。',
  INVALID_RESPONSE: '學習資料格式不正確，請稍後重試。',
  REMEDIATION_NOTHING_OPEN: '這個小節目前沒有待補救的錯題。',
  REVIEW_CARD_NOT_FOUND: '找不到這張複習卡，或內容尚未發布。',
  UNAVAILABLE: '目前無法完成操作，請稍後重試。',
};

export class LearningError extends Error {
  readonly code: LearningErrorCode;

  constructor(code: LearningErrorCode) {
    super(learningMessages[code]);
    this.name = 'LearningError';
    this.code = code;
  }
}

export const toLearningError = (message: string): LearningError => {
  const known: readonly LearningErrorCode[] = [
    'CHAPTER_LOCKED',
    'HINT_CLOSED',
    'HINT_SEQUENCE',
    'HINT_UNAVAILABLE',
    'REMEDIATION_NOTHING_OPEN',
    'REVIEW_CARD_NOT_FOUND',
  ];
  const match = known.find((code) => message.includes(code));
  return new LearningError(match ?? 'UNAVAILABLE');
};

export const parseLearningResponse = <Output>(
  schema: z.ZodType<Output>,
  value: unknown,
): Output => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new LearningError('INVALID_RESPONSE');
  return parsed.data;
};

export const toLearningReadError = (
  error: unknown,
  status?: number,
): LearningError => {
  const descriptor =
    typeof error === 'object' && error !== null
      ? Object.getOwnPropertyDescriptor(error, 'message')
      : undefined;
  const message: unknown = descriptor?.value;
  const known = toLearningError(typeof message === 'string' ? message : '');
  if (known.code !== 'UNAVAILABLE') return known;
  const codes = {
    AUTH: 'AUTH_REQUIRED',
    PERMISSION: 'PERMISSION_DENIED',
    RATE_LIMIT: 'RATE_LIMITED',
    VALIDATION: 'INVALID_INPUT',
    NOT_FOUND: 'NOT_FOUND',
    UNAVAILABLE: 'UNAVAILABLE',
  } as const;
  return new LearningError(codes[classifyReadFailure({ error, status })]);
};
