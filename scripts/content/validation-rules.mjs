/**
 * 內容驗證規則（單一事實來源）：
 * 試算表匯入器、XLSX 匯入精靈與伺服器端信任指令共用同一套規則語意。
 * 規則依 spec/06 §5（發布驗證）、§8（正解解析）。
 */

export const QUESTION_CODE_PATTERN = /^[0-9]+-[0-9]+-[0-9]{2}$/u;

export const TEXT_LIMITS = Object.freeze({
  explanation: 2000,
  optionText: 500,
  prompt: 1000,
  reviewCardContent: 8000,
  reviewCardTitle: 200,
});

// 與伺服器 assert_safe_content_text 相同語意：<script 或行內事件屬性。
const unsafePattern = /<script|\bon[a-z]+\s*=/iu;

export const hasUnsafeText = (value) =>
  typeof value === 'string' && unsafePattern.test(value);

export const isValidQuestionCode = (code) =>
  typeof code === 'string' && QUESTION_CODE_PATTERN.test(code);

const answerAliases = Object.freeze({
  1: 'A',
  2: 'B',
  3: 'C',
  4: 'D',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
});

/**
 * 依 spec/06 §8 解析正解欄位。
 * options: [{ key, text }]（text 已 trim）。
 * 回傳 { key } 或 { error: 'ANSWER_INVALID' | 'ANSWER_OPTION_MISSING' }。
 */
export function resolveCorrectAnswer(rawValue, options) {
  const normalized = String(rawValue ?? '')
    .trim()
    .toUpperCase();
  const key = answerAliases[normalized];
  if (!key) return { error: 'ANSWER_INVALID' };
  const option = options.find((entry) => entry.key === key);
  if (!option || option.text === '') return { error: 'ANSWER_OPTION_MISSING' };
  return { key };
}

/**
 * 驗證一列題目。row: { code, prompt, explanation, answer, options: [{key,text}] }
 * 回傳 [{ field, code }]（空陣列 = 通過）。explanation 可為空（匯入端可補草稿）。
 */
export function validateQuestionRow(row) {
  const errors = [];
  if (!isValidQuestionCode(row.code)) {
    errors.push({ code: 'CODE_FORMAT', field: '題號' });
  }
  const prompt = (row.prompt ?? '').trim();
  if (prompt === '' || prompt.length > TEXT_LIMITS.prompt) {
    errors.push({ code: 'PROMPT_INVALID', field: '題目' });
  }
  if (hasUnsafeText(prompt)) {
    errors.push({ code: 'UNSAFE_TEXT', field: '題目' });
  }
  const options = (row.options ?? []).filter((entry) => entry.text !== '');
  if (
    options.length < 2 ||
    options.some((entry) => entry.text.length > TEXT_LIMITS.optionText)
  ) {
    errors.push({ code: 'OPTIONS_INVALID', field: '選項' });
  }
  if (options.some((entry) => hasUnsafeText(entry.text))) {
    errors.push({ code: 'UNSAFE_TEXT', field: '選項' });
  }
  const answer = resolveCorrectAnswer(row.answer, options);
  if (answer.error) {
    errors.push({ code: answer.error, field: '正解' });
  }
  const explanation = (row.explanation ?? '').trim();
  if (explanation.length > TEXT_LIMITS.explanation) {
    errors.push({ code: 'EXPLANATION_INVALID', field: '解析' });
  }
  if (hasUnsafeText(explanation)) {
    errors.push({ code: 'UNSAFE_TEXT', field: '解析' });
  }
  return errors;
}

/**
 * 驗證一列複習卡。row: { chapter, sectionLabel, title, content }
 */
export function validateReviewCardRow(row) {
  const errors = [];
  const title = (row.title ?? '').trim();
  const content = (row.content ?? '').trim();
  if (title === '' || title.length > TEXT_LIMITS.reviewCardTitle) {
    errors.push({ code: 'TITLE_INVALID', field: '卡片標題' });
  }
  if (content === '' || content.length > TEXT_LIMITS.reviewCardContent) {
    errors.push({ code: 'CONTENT_INVALID', field: '卡片內容' });
  }
  if (hasUnsafeText(title) || hasUnsafeText(content)) {
    errors.push({ code: 'UNSAFE_TEXT', field: '卡片內容' });
  }
  return errors;
}
