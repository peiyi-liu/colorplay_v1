import { pathToFileURL } from 'node:url';

import { CONTENT_MANIFEST } from '../../tests/fixtures/content-manifest.generated';
import { REVIEW_MANIFEST } from '../../tests/fixtures/review-manifest.generated';

export type ReadinessIssue = Readonly<{
  chapterCode: string;
  code:
    | 'CHAPTER_SET_INVALID'
    | 'QUESTION_COUNT_INSUFFICIENT'
    | 'REVIEW_CARDS_MISSING';
  message: string;
}>;

type SequentialManifestInput = Readonly<{
  chapters: readonly {
    chapterCode: string;
    chapterNumber: number;
    questionCount: number;
  }[];
  reviewSubtopics: readonly {
    chapterCode: string;
    cardCount: number;
  }[];
  requiredQuestionCount: number;
}>;

const EXPECTED_CHAPTERS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => ({
    chapterCode: `chapter-${String(index + 1)}`,
    chapterNumber: index + 1,
  })),
);

const ISSUE_ORDER: Readonly<Record<ReadinessIssue['code'], number>> = {
  CHAPTER_SET_INVALID: 0,
  QUESTION_COUNT_INSUFFICIENT: 1,
  REVIEW_CARDS_MISSING: 2,
};

const chapterSortNumber = (chapterCode: string) => {
  const match = /^chapter-(\d+)$/u.exec(chapterCode);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
};

export function verifySequentialManifests(
  input: SequentialManifestInput,
): readonly ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const chapterSlots = Math.max(
    EXPECTED_CHAPTERS.length,
    input.chapters.length,
  );

  for (let index = 0; index < chapterSlots; index += 1) {
    const expected = EXPECTED_CHAPTERS[index];
    const actual = input.chapters[index];
    if (
      expected?.chapterCode !== actual?.chapterCode ||
      expected?.chapterNumber !== actual?.chapterNumber
    ) {
      const chapterCode =
        expected?.chapterCode ?? actual?.chapterCode ?? 'unknown';
      const expectedLabel = expected
        ? `${expected.chapterCode}#${String(expected.chapterNumber)}`
        : 'no additional chapter';
      const actualLabel = actual
        ? `${actual.chapterCode}#${String(actual.chapterNumber)}`
        : 'missing';
      issues.push({
        chapterCode,
        code: 'CHAPTER_SET_INVALID',
        message: `position ${String(index + 1)} expected ${expectedLabel}; received ${actualLabel}`,
      });
    }
  }

  const reviewCountByChapter = new Map<string, number>();
  for (const review of input.reviewSubtopics) {
    reviewCountByChapter.set(
      review.chapterCode,
      (reviewCountByChapter.get(review.chapterCode) ?? 0) + review.cardCount,
    );
  }

  for (const expected of EXPECTED_CHAPTERS) {
    const chapter = input.chapters.find(
      (candidate) =>
        candidate.chapterCode === expected.chapterCode &&
        candidate.chapterNumber === expected.chapterNumber,
    );
    if (!chapter) continue;

    if (chapter.questionCount < input.requiredQuestionCount) {
      issues.push({
        chapterCode: chapter.chapterCode,
        code: 'QUESTION_COUNT_INSUFFICIENT',
        message: `${String(chapter.questionCount)} published questions; requires at least ${String(input.requiredQuestionCount)}`,
      });
    }

    const reviewCount = reviewCountByChapter.get(chapter.chapterCode) ?? 0;
    if (reviewCount < 1) {
      issues.push({
        chapterCode: chapter.chapterCode,
        code: 'REVIEW_CARDS_MISSING',
        message: `${String(reviewCount)} published review cards; requires at least 1`,
      });
    }
  }

  return issues.sort((left, right) => {
    const chapterDifference =
      chapterSortNumber(left.chapterCode) -
      chapterSortNumber(right.chapterCode);
    if (chapterDifference !== 0) return chapterDifference;
    const codeDifference = ISSUE_ORDER[left.code] - ISSUE_ORDER[right.code];
    if (codeDifference !== 0) return codeDifference;
    return left.message.localeCompare(right.message, 'en');
  });
}

const runCli = () => {
  const issues = verifySequentialManifests({
    chapters: CONTENT_MANIFEST,
    requiredQuestionCount: 10,
    reviewSubtopics: REVIEW_MANIFEST,
  });
  const reviewCountByChapter = new Map<string, number>();
  for (const review of REVIEW_MANIFEST) {
    reviewCountByChapter.set(
      review.chapterCode,
      (reviewCountByChapter.get(review.chapterCode) ?? 0) + review.cardCount,
    );
  }
  for (const chapter of CONTENT_MANIFEST) {
    process.stdout.write(
      `${chapter.chapterCode} questions=${String(chapter.questionCount)} review_cards=${String(reviewCountByChapter.get(chapter.chapterCode) ?? 0)}\n`,
    );
  }
  if (issues.length > 0) {
    for (const issue of issues) {
      process.stdout.write(
        `SEQUENTIAL_NOT_READY ${issue.chapterCode} ${issue.code} ${issue.message}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write('SEQUENTIAL_CONTENT_READY\n');
};

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) runCli();
