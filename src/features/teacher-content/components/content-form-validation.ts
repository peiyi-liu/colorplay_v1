import {
  hasUnsafeText,
  QUESTION_CODE_PATTERN,
  TEXT_LIMITS,
} from '../../../../scripts/content/validation-rules.mjs';
import type {
  QuestionDraftPayload,
  ReviewCardDraftPayload,
} from '../api/teacher-content-repository';

export const UNSAFE_TEXT_MESSAGE = '內容含不允許的 script 或事件屬性。';

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export type QuestionFormValues = Readonly<{
  explanation: string;
  options: readonly Readonly<{
    isCorrect: boolean;
    key: string;
    text: string;
  }>[];
  prompt: string;
  stableCode: string;
  subtopicId: string;
}>;

export type ReviewCardFormValues = Readonly<{
  content: string;
  groupLabel: string;
  mediaAlt: string;
  mediaUrl: string;
  requiresRecompletion: boolean;
  stableCode: string;
  subtopicId: string;
  title: string;
}>;

const filledOptions = (values: QuestionFormValues) =>
  values.options.filter((option) => option.text.trim().length > 0);

export function validateQuestionForm(
  values: QuestionFormValues,
): readonly string[] {
  const errors: string[] = [];
  if (values.subtopicId.length === 0) errors.push('請選擇子題。');
  if (!QUESTION_CODE_PATTERN.test(values.stableCode.trim())) {
    errors.push('題號格式須為 章-節-兩位數（例：3-1-01）。');
  }
  const prompt = values.prompt.trim();
  if (prompt.length < 1 || prompt.length > TEXT_LIMITS.prompt) {
    errors.push('題目需為 1–1000 字。');
  }
  const filled = filledOptions(values);
  if (filled.length < 2) errors.push('至少需要兩個選項。');
  if (
    filled.some((option) => option.text.trim().length > TEXT_LIMITS.optionText)
  ) {
    errors.push('選項需在 500 字內。');
  }
  if (filled.filter((option) => option.isCorrect).length !== 1) {
    errors.push('請標記剛好一個正確選項。');
  }
  const explanation = values.explanation.trim();
  if (explanation.length < 1 || explanation.length > TEXT_LIMITS.explanation) {
    errors.push('解析需為 1–2000 字。');
  }
  const texts = [
    values.prompt,
    values.explanation,
    ...values.options.map((option) => option.text),
  ];
  if (texts.some((text) => hasUnsafeText(text))) {
    errors.push(UNSAFE_TEXT_MESSAGE);
  }
  return errors;
}

export function toQuestionDraftPayload(
  values: QuestionFormValues,
): QuestionDraftPayload {
  return {
    explanation: values.explanation.trim(),
    options: filledOptions(values).map((option) => ({
      isCorrect: option.isCorrect,
      key: option.key,
      text: option.text.trim(),
    })),
    prompt: values.prompt.trim(),
    stableCode: values.stableCode.trim(),
    subtopicId: values.subtopicId,
  };
}

export function validateReviewCardForm(
  values: ReviewCardFormValues,
): readonly string[] {
  const errors: string[] = [];
  if (values.subtopicId.length === 0) errors.push('請選擇子題。');
  const code = values.stableCode.trim();
  if (code.length < 1 || code.length > 200) {
    errors.push('卡片代碼需為 1–200 字。');
  }
  const title = values.title.trim();
  if (title.length < 1 || title.length > TEXT_LIMITS.reviewCardTitle) {
    errors.push('標題需為 1–200 字。');
  }
  const content = values.content.trim();
  if (content.length < 1 || content.length > TEXT_LIMITS.reviewCardContent) {
    errors.push('內容需為 1–8000 字。');
  }
  if (values.groupLabel.trim().length > 120) {
    errors.push('分組需在 120 字內。');
  }
  const url = values.mediaUrl.trim();
  const alt = values.mediaAlt.trim();
  if (url.length > 0 && alt.length === 0) {
    errors.push('有圖片時必須填寫替代文字。');
  }
  if (url.length > 500) errors.push('圖片網址需在 500 字內。');
  if (alt.length > 300) errors.push('替代文字需在 300 字內。');
  const texts = [
    values.title,
    values.content,
    values.groupLabel,
    values.mediaAlt,
    values.mediaUrl,
  ];
  if (texts.some((text) => hasUnsafeText(text))) {
    errors.push(UNSAFE_TEXT_MESSAGE);
  }
  return errors;
}

export function toReviewCardDraftPayload(
  values: ReviewCardFormValues,
): ReviewCardDraftPayload {
  const url = values.mediaUrl.trim();
  return {
    content: values.content.trim(),
    groupLabel: values.groupLabel.trim(),
    media:
      url.length > 0
        ? [{ altText: values.mediaAlt.trim(), assetPath: url }]
        : null,
    requiresRecompletion: values.requiresRecompletion,
    stableCode: values.stableCode.trim(),
    subtopicId: values.subtopicId,
    title: values.title.trim(),
  };
}
