import { describe, expect, it } from 'vitest';

import { verifySequentialManifests } from './verify-sequential-readiness';

const completeChapters = Array.from({ length: 6 }, (_, index) => ({
  chapterCode: `chapter-${String(index + 1)}`,
  chapterNumber: index + 1,
  questionCount: 10,
}));

const completeReviews = completeChapters.map(({ chapterCode }) => ({
  cardCount: 1,
  chapterCode,
}));

const verify = (
  overrides: Partial<Parameters<typeof verifySequentialManifests>[0]> = {},
) =>
  verifySequentialManifests({
    chapters: completeChapters,
    requiredQuestionCount: 10,
    reviewSubtopics: completeReviews,
    ...overrides,
  });

describe('verifySequentialManifests', () => {
  it('accepts six ordered chapters with sufficient questions and review cards', () => {
    expect(verify()).toEqual([]);
  });

  it.each([
    {
      chapters: completeChapters.filter(
        ({ chapterNumber }) => chapterNumber !== 2,
      ),
      expectedChapterCodes: [
        'chapter-2',
        'chapter-3',
        'chapter-4',
        'chapter-5',
        'chapter-6',
      ],
      name: 'missing',
    },
    {
      chapters: completeChapters.map((chapter, index) =>
        index === 1 ? (completeChapters[0] ?? chapter) : chapter,
      ),
      expectedChapterCodes: ['chapter-2'],
      name: 'duplicate',
    },
    {
      chapters: completeChapters.map((chapter, index) => {
        if (index === 0) return completeChapters[1] ?? chapter;
        if (index === 1) return completeChapters[0] ?? chapter;
        return chapter;
      }),
      expectedChapterCodes: ['chapter-1', 'chapter-2'],
      name: 'out-of-order',
    },
  ])(
    'rejects a $name chapter set deterministically',
    ({ chapters, expectedChapterCodes }) => {
      expect(
        verify({ chapters })
          .filter(({ code }) => code === 'CHAPTER_SET_INVALID')
          .map(({ chapterCode }) => chapterCode),
      ).toEqual(expectedChapterCodes);
    },
  );

  it('reports insufficient questions and missing review cards in stable order', () => {
    const chapters = completeChapters.map((chapter) =>
      chapter.chapterNumber === 2 ? { ...chapter, questionCount: 9 } : chapter,
    );
    const reviewSubtopics = completeReviews.map((review) =>
      review.chapterCode === 'chapter-2' ? { ...review, cardCount: 0 } : review,
    );

    expect(verify({ chapters, reviewSubtopics })).toEqual([
      {
        chapterCode: 'chapter-2',
        code: 'QUESTION_COUNT_INSUFFICIENT',
        message: '9 published questions; requires at least 10',
      },
      {
        chapterCode: 'chapter-2',
        code: 'REVIEW_CARDS_MISSING',
        message: '0 published review cards; requires at least 1',
      },
    ]);
  });

  it('aggregates review cards across subtopics before deciding readiness', () => {
    const reviewSubtopics = [
      ...completeReviews.filter(
        ({ chapterCode }) => chapterCode !== 'chapter-3',
      ),
      { cardCount: 0, chapterCode: 'chapter-3' },
      { cardCount: 2, chapterCode: 'chapter-3' },
    ];

    expect(verify({ reviewSubtopics })).toEqual([]);
    expect(
      verify({
        reviewSubtopics: reviewSubtopics.map((review) =>
          review.chapterCode === 'chapter-3'
            ? { ...review, cardCount: 0 }
            : review,
        ),
      }),
    ).toEqual([
      {
        chapterCode: 'chapter-3',
        code: 'REVIEW_CARDS_MISSING',
        message: '0 published review cards; requires at least 1',
      },
    ]);
  });
});
