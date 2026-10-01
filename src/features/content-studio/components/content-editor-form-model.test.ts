import { describe, expect, it } from 'vitest';

import type { ContentEntityType, ContentScope } from '../api/contracts';
import type { ContentStudioItem } from '../lib/content-studio-model';
import {
  payloadFromValues,
  nextStableCode,
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
  it('avoids code collisions across subtopics and archived cards instead of counting rows', () => {
    const scope: ContentScope = {
      course: {
        courseId: 'course-id',
        stableCode: 'course',
        title: '課程',
        sortOrder: 1,
        status: 'published',
      },
      chapter: {
        chapterId: 'chapter-id',
        stableCode: 'chapter-3',
        title: '第三章',
        sortOrder: 3,
        status: 'published',
      },
      chapterBanks: [],
      drafts: [],
      outcome: 'ok',
      requestId: 'request-id',
      sections: [
        {
          sectionId: 'section-id',
          stableCode: 'section',
          title: '小節',
          sortOrder: 1,
          status: 'published',
          banks: [],
          subtopics: [],
        },
      ],
    };
    const items: ContentStudioItem[] = ['RC3101', 'RC3103'].map(
      (stableCode) => ({
        stableCode,
        bankKind: null,
        chapterId: 'chapter-id',
        draftId: null,
        entityId: stableCode,
        entityType: 'review_card',
        parentId: 'other-subtopic',
        parentType: 'subtopic',
        sectionId: 'section-id',
        subtopicId: 'other-subtopic',
        title: '其他子主題卡片',
        status: 'archived',
        version: 1,
      }),
    );
    expect(nextStableCode('review_card', values, scope, items)).toBe('RC3102');
    expect(
      nextStableCode('question', { ...values, kind: 'CR' }, scope, []),
    ).toBe('CR3001');
  });
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
