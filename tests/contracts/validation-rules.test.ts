import { describe, expect, it } from 'vitest';

import {
  hasUnsafeText,
  isValidQuestionCode,
  resolveCorrectAnswer,
  validateQuestionRow,
} from '../../scripts/content/validation-rules.mjs';

const options = [
  { key: 'A', text: '甲' },
  { key: 'B', text: '乙' },
] as const;

describe('shared content validation rules', () => {
  it('accepts letters and digits as correct answers, nothing else', () => {
    expect(resolveCorrectAnswer('A', options)).toEqual({ key: 'A' });
    expect(resolveCorrectAnswer('2', options)).toEqual({ key: 'B' });
    expect(resolveCorrectAnswer('b', options)).toEqual({ key: 'B' });
    expect(resolveCorrectAnswer('X', options)).toEqual({
      error: 'ANSWER_INVALID',
    });
    expect(resolveCorrectAnswer('', options)).toEqual({
      error: 'ANSWER_INVALID',
    });
    expect(resolveCorrectAnswer('C', options)).toEqual({
      error: 'ANSWER_OPTION_MISSING',
    });
  });

  it('flags script payloads and inline handlers as unsafe', () => {
    expect(hasUnsafeText('<script>window.__xss=1</script>')).toBe(true);
    expect(hasUnsafeText('<img onerror=alert(1)>')).toBe(true);
    expect(hasUnsafeText('正常的教學內容 on the topic')).toBe(false);
  });

  it('validates question rows field by field', () => {
    expect(
      validateQuestionRow({
        answer: 'A',
        code: '3-1-01',
        explanation: '解析',
        options: [...options],
        prompt: '題目',
      }),
    ).toEqual([]);
    const failing = validateQuestionRow({
      answer: 'X',
      code: 'abc',
      explanation: '',
      options: [{ key: 'A', text: '甲' }],
      prompt: '',
    });
    expect(failing.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'CODE_FORMAT',
        'PROMPT_INVALID',
        'OPTIONS_INVALID',
        'ANSWER_INVALID',
      ]),
    );
    expect(isValidQuestionCode('7-1-01')).toBe(true);
    expect(isValidQuestionCode('7-1-1')).toBe(false);
  });
});
