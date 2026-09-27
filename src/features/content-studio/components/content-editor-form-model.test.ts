import { describe, expect, it } from 'vitest';

import type { ContentEntityType } from '../api/contracts';
import {
  payloadFromValues,
  type EditorValues,
} from './content-editor-form-model';

const values: EditorValues = {
  bankId: 'bank-id',
  chapterId: 'chapter-id',
  content: '複習內容',
  correctAnswer: 'B',
  description: '說明',
  durationSeconds: 20,
  explanation: '解說',
  groupLabel: '3-1',
  kind: 'QB',
  media: [],
  optionA: 'A 選項',
  optionB: 'B 選項',
  optionC: 'C 選項',
  optionD: 'D 選項',
  parentId: 'course-id',
  prompt: '題目',
  sectionId: 'section-id',
  sortOrder: 2,
  stableCode: 'stable-code',
  subtopicId: 'subtopic-id',
  title: '標題',
};

describe('Content Editor payload mapping', () => {
  it.each<readonly [ContentEntityType, string, unknown]>([
    ['course', 'description', '說明'],
    ['chapter', 'course_id', 'course-id'],
    ['section', 'chapter_id', 'chapter-id'],
    ['subtopic', 'section_id', 'section-id'],
    ['review_card', 'subtopic_id', 'subtopic-id'],
    ['assessment_bank', 'section_id', 'section-id'],
    ['question', 'bank_id', 'bank-id'],
  ])(
    'builds a valid %s payload with the correct parent',
    (type, key, expected) => {
      expect(payloadFromValues(type, values)).toHaveProperty(key, expected);
    },
  );

  it('keeps one correct answer while creating all four question options', () => {
    const payload = payloadFromValues('question', values);
    const options = payload.options as readonly Readonly<{
      is_correct: boolean;
      key: string;
    }>[];

    expect(options).toHaveLength(4);
    expect(options.filter((option) => option.is_correct)).toEqual([
      expect.objectContaining({ key: 'B' }),
    ]);
  });
});
