import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import '../../../styles/chapter-archive.css';
import '../../../styles/chapter-archive-controls.css';
import '../../../styles/chapter-archive-header.css';
import '../../../styles/chapter-archive-responsive.css';
import '../../../styles/chapter-review-reader.css';
import '../../../styles/chapter-review-reader-controls.css';
import '../../../styles/chapter-review-reader-responsive.css';
import { ProgressBar } from '../../../components/ui/progress-bar';
import type { LearningRepository } from '../api/learning-repository';
import { useStudentChapterMap } from '../hooks/use-chapter-map';
import {
  useChapterReview,
  useCompleteReviewCard,
  useLearningProgress,
  useReviewProgressRows,
} from '../hooks/use-learning';
import { statusLabels, type ChapterStatus } from '../lib/progress-status';
import { deriveChapterDetailViewModel } from './chapter-detail-adapter';
import {
  chapterMasteryRingValue,
  ContentPreparingState,
  ContentReadinessErrorState,
  ErrorState,
  LoadingState,
  LockedState,
  MasteryDisplayView,
} from './chapter-detail-states';
import type {
  ChapterDetailRetryTarget,
  ChapterDetailViewModel,
} from './chapter-detail-view-model';
import { ChapterReviewLibrary } from './chapter-review-library';
import { ChapterReviewReader } from './chapter-review-reader';

export { statusLabels };

// 章節狀態 pill／圓點的色調(DC 543 只示範「學習中」＝綠;其餘狀態依既有
// tone 慣例延伸——已精熟同為綠、進步中為黃、尚未開始為灰)。
const statusTone: Readonly<
  Record<ChapterStatus, 'success' | 'primary' | 'neutral'>
> = {
  developing: 'primary',
  learning: 'success',
  mastered: 'success',
  not_started: 'neutral',
};

export const percentText = (value: number | null): string =>
  value === null ? '—' : `${String(value)}%`;

export const reviewText = (completed: number, total: number | null): string =>
  total === null ? '—' : `${String(completed)} / ${String(total)}`;

// 複習完成比例(供進度條使用);total 缺值(尚未開始)時視為 0%。
export const reviewPercent = (
  completed: number,
  total: number | null,
): number => (total ? (completed / total) * 100 : 0);

const chapterNumberText = (sortOrder: number): string =>
  ['一', '二', '三', '四', '五', '六'][sortOrder - 1] ?? String(sortOrder);

// 精熟圓環(DC 556–567:44px SVG,r=17,綠 stroke)。DC 原始標記把圓環整體
// aria-hidden、靠旁邊文字傳達數值;但同一進度列的線性條(552)卻是
// 「可見文字＋role=progressbar」雙重表達，故圓環採同一慣例、給
// role=progressbar 以利測試與可及性，而非照抄 aria-hidden。
function MasteryRing({ value }: Readonly<{ value: number | null }>) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const clamped = value === null ? 0 : Math.min(100, Math.max(0, value));
  const dashoffset = circumference * (1 - clamped / 100);
  return (
    <span
      aria-label="精熟程度"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={clamped}
      className="mastery-ring"
      role="progressbar"
    >
      <svg aria-hidden="true" height="44" viewBox="0 0 44 44" width="44">
        <circle className="mastery-ring__track" cx="22" cy="22" r={radius} />
        <circle
          className="mastery-ring__fill"
          cx="22"
          cy="22"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
        />
      </svg>
    </span>
  );
}

// 火把數顯示進度(spec §5 地城樓層):最多畫 10 支,亮的支數依完成比例四捨五入。
export const torchStates = (
  completed: number,
  total: number | null,
): readonly boolean[] => {
  if (total === null || total <= 0) return [];
  const shown = Math.min(total, 10);
  const lit = Math.min(shown, Math.round((completed / total) * shown));
  return Array.from({ length: shown }, (_, index) => index < lit);
};

export function ChapterDetailPageView({
  completeError,
  completePending,
  onCompleteCard,
  onRetry,
  repository,
  viewModel,
}: Readonly<{
  completeError: string | undefined;
  completePending: boolean;
  onCompleteCard: (
    input: Readonly<{ requestId: string; reviewCardId: string }>,
  ) => void;
  onRetry: (target: ChapterDetailRetryTarget) => void;
  repository?: LearningRepository;
  viewModel: ChapterDetailViewModel;
}>) {
  const [readingCardId, setReadingCardId] = useState<string | null>(null);

  if (viewModel.state === 'loading') return <LoadingState />;
  if (viewModel.state === 'locked') {
    return (
      <LockedState
        chapterTitle={viewModel.chapterTitle}
        unmetConditions={viewModel.unmetConditions}
      />
    );
  }
  if (viewModel.state === 'content-preparing') {
    return <ContentPreparingState chapterTitle={viewModel.chapterTitle} />;
  }
  if (viewModel.state === 'content-readiness-error') {
    return (
      <ContentReadinessErrorState
        chapterTitle={viewModel.chapterTitle}
        reason={viewModel.reason}
      />
    );
  }
  if (viewModel.state === 'error') {
    const target = viewModel.retryTarget;
    return (
      <ErrorState
        errorCode={viewModel.errorCode}
        onRetry={
          target
            ? () => {
                onRetry(target);
              }
            : undefined
        }
        retryable={viewModel.retryable}
      />
    );
  }

  const { chapter } = viewModel;
  const chapterTone = statusTone[chapter.status];
  const allCards = chapter.sections.flatMap((section) =>
    section.subtopics.flatMap((subtopic) => subtopic.cards),
  );
  const artIndexByCardId = new Map(
    allCards.map((card, index) => [card.cardId, index]),
  );
  const currentCard =
    allCards.find((card) => !card.completed) ?? allCards[0] ?? null;
  const readingCard = allCards.find((card) => card.cardId === readingCardId);
  const subtopics = chapter.sections.flatMap((section) => section.subtopics);
  const readingSubtopic = readingCard
    ? subtopics.find((subtopic) =>
        subtopic.cards.some((card) => card.cardId === readingCard.cardId),
      )
    : undefined;
  const readingCardIndex =
    readingCard && readingSubtopic
      ? readingSubtopic.cards.findIndex(
          (card) => card.cardId === readingCard.cardId,
        )
      : -1;
  const progressSummary = (
    <div aria-label="章節進度" className="chapter-detail__progress">
      <div className="chapter-detail__learning-status">
        <span className="chapter-detail__progress-label">學習狀態</span>
        <span
          className={`chapter-status-pill chapter-status-pill--${chapterTone}`}
        >
          <span
            aria-hidden="true"
            className={`chapter-status-dot chapter-status-dot--${chapterTone}`}
          />
          {statusLabels[chapter.status]}
        </span>
      </div>
      <div className="chapter-detail__review-progress">
        <div className="chapter-detail__review-progress-row">
          <span className="chapter-detail__review-progress-label">
            複習完成
          </span>{' '}
          <span className="chapter-detail__review-progress-value">
            {reviewText(chapter.reviewCompleted, chapter.reviewTotal)}
          </span>
        </div>
        <ProgressBar
          label="複習完成"
          tone="primary"
          value={reviewPercent(chapter.reviewCompleted, chapter.reviewTotal)}
        />
      </div>
      <div className="chapter-detail__mastery">
        <MasteryRing value={chapterMasteryRingValue(chapter.masteryDisplay)} />
        <span className="chapter-detail__mastery-text">
          <span className="chapter-detail__mastery-label">精熟程度</span>
          <MasteryDisplayView display={chapter.masteryDisplay} />
        </span>
      </div>
    </div>
  );

  if (readingCard) {
    return (
      <ChapterReviewReader
        card={readingCard}
        cardPosition={readingCardIndex + 1}
        cardTotal={readingSubtopic?.cards.length ?? 1}
        chapterLabel={`第${chapterNumberText(chapter.sortOrder)}章 · ${chapter.title}`}
        completeError={completeError}
        completed={readingCard.completed}
        onBack={() => {
          setReadingCardId(null);
        }}
        onComplete={() => {
          onCompleteCard({
            requestId: crypto.randomUUID(),
            reviewCardId: readingCard.cardId,
          });
        }}
        pending={completePending}
        {...(repository ? { repository } : {})}
        subtopicTitle={readingSubtopic?.title ?? ''}
      />
    );
  }

  return (
    <section
      aria-label={`第${chapterNumberText(chapter.sortOrder)}章複習旅程`}
      className="chapter-dungeon chapter-archive scene-dungeon"
      role="region"
    >
      <header className="chapter-archive__header">
        <div className="chapter-archive__title-group">
          <h1
            aria-label={`Chapter ${String(chapter.sortOrder)}：${chapter.title}`}
            className="chapter-detail__title chapter-archive__title"
            id="chapter-detail-title"
          >
            第{chapterNumberText(chapter.sortOrder)}章 · {chapter.title}
          </h1>
          <p className="chapter-archive__subtitle">選擇複習卡，再進入複習</p>
        </div>
        {progressSummary}
      </header>

      <ChapterReviewLibrary
        artIndexByCardId={artIndexByCardId}
        challengeHref={
          chapter.templateId
            ? `/app/quiz/new?template=${chapter.templateId}`
            : null
        }
        currentCardId={currentCard?.cardId ?? null}
        onEnter={(card) => {
          setReadingCardId(card.cardId);
        }}
        subtopics={subtopics}
      />
      {completeError ? <p role="alert">{completeError}</p> : null}
    </section>
  );
}

export function ChapterDetailPage({
  chapterId: suppliedChapterId,
  repository,
}: Readonly<{
  chapterId?: string;
  repository?: LearningRepository;
}>) {
  const params = useParams();
  const chapterId = suppliedChapterId ?? params.chapterId ?? '';
  const chapterMap = useStudentChapterMap();
  const entry = chapterMap.data?.chapters.find(
    (row) => row.chapterId === chapterId,
  );
  const accessGranted =
    entry?.accessState === 'available' || entry?.accessState === 'completed';
  const review = useChapterReview(chapterId, repository, accessGranted);
  const progress = useLearningProgress(chapterId, repository);
  const completions = useReviewProgressRows(repository);
  const complete = useCompleteReviewCard(chapterId, repository);
  const [completeError, setCompleteError] = useState<string>();

  useEffect(() => {
    if (review.error?.code === 'CHAPTER_LOCKED') {
      void chapterMap.refetch();
    }
  }, [review.error, chapterMap]);

  const viewModel = deriveChapterDetailViewModel({
    chapterMapEntry: entry,
    chapterMapIsError: chapterMap.isError,
    chapterMapIsPending: chapterMap.isPending,
    completions: completions.data,
    completionsIsError: completions.isError,
    completionsIsPending: completions.isPending,
    progressIsError: progress.isError,
    progressIsPending: progress.isPending,
    progressRows: progress.data,
    reviewError: review.error ?? null,
    reviewIsPending: review.isPending,
    reviewSections: review.data,
  });

  const retryActions: Record<ChapterDetailRetryTarget, () => void> = {
    'chapter-content': () => {
      void review.refetch();
      void progress.refetch();
    },
    'chapter-map': () => {
      void chapterMap.refetch();
    },
  };

  return (
    <ChapterDetailPageView
      completeError={completeError}
      completePending={complete.isPending}
      onCompleteCard={(input) => {
        setCompleteError(undefined);
        complete.mutate(input, {
          onError: (error) => {
            if (error.code === 'CHAPTER_LOCKED') {
              void chapterMap.refetch();
              return;
            }
            setCompleteError(error.message);
          },
        });
      }}
      onRetry={(target) => {
        retryActions[target]();
      }}
      {...(repository ? { repository } : {})}
      viewModel={viewModel}
    />
  );
}
