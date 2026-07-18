import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { usePublishedChapters } from '../api/chapters';
import type {
  LearningProgressRow,
  LearningRepository,
  ReviewCardView,
  ReviewCompletionRow,
} from '../api/learning-repository';
import {
  useChapterReview,
  useCompleteReviewCard,
  useLearningProgress,
  useReviewProgressRows,
} from '../hooks/use-learning';

export const statusLabels: Readonly<Record<string, string>> = {
  developing: '進步中',
  learning: '學習中',
  mastered: '已精熟',
  not_started: '尚未開始',
};

export const percentText = (value: number | null): string =>
  value === null ? '—' : `${String(value)}%`;

export const reviewText = (completed: number, total: number | null): string =>
  total === null ? '—' : `${String(completed)} / ${String(total)}`;

export const isCardCompleted = (
  card: Pick<ReviewCardView, 'cardId' | 'requiresRecompletion' | 'version'>,
  completions: readonly ReviewCompletionRow[],
): boolean =>
  completions.some(
    (row) =>
      row.reviewCardId === card.cardId &&
      (row.cardVersion === card.version || !card.requiresRecompletion),
  );

function CardMedia({
  altText,
  assetPath,
}: Readonly<{ altText: string; assetPath: string }>) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p
        className="review-card__media-fallback"
        role="img"
        aria-label={altText}
      >
        圖片載入失敗：{altText}
      </p>
    );
  }
  return (
    <img
      alt={altText}
      className="review-card__media"
      onError={() => {
        setFailed(true);
      }}
      src={assetPath}
    />
  );
}

function ReviewCardItem({
  card,
  completed,
  onComplete,
  pending,
}: Readonly<{
  card: ReviewCardView;
  completed: boolean;
  onComplete: () => void;
  pending: boolean;
}>) {
  return (
    <article aria-label={card.title} className="review-card">
      <header>
        {card.groupLabel ? (
          <p className="route-panel__eyebrow">{card.groupLabel}</p>
        ) : null}
        <h4>{card.title}</h4>
      </header>
      <p style={{ whiteSpace: 'pre-wrap' }}>{card.content}</p>
      {card.media.map((media) => (
        <CardMedia
          altText={media.altText}
          assetPath={media.assetPath}
          key={media.assetPath}
        />
      ))}
      {completed ? (
        <p role="status">已完成複習</p>
      ) : (
        <button disabled={pending} onClick={onComplete} type="button">
          完成複習
        </button>
      )}
    </article>
  );
}

const subtopicRow = (
  rows: readonly LearningProgressRow[] | undefined,
  subtopicId: string,
): LearningProgressRow | undefined =>
  rows?.find(
    (row) => row.scope === 'subtopic' && row.subtopicId === subtopicId,
  );

export function ChapterDetailPage({
  chapterId: suppliedChapterId,
  repository,
}: Readonly<{
  chapterId?: string;
  repository?: LearningRepository;
}>) {
  const params = useParams();
  const chapterId = suppliedChapterId ?? params.chapterId ?? '';
  const chapters = usePublishedChapters();
  const review = useChapterReview(chapterId, repository);
  const progress = useLearningProgress(chapterId, repository);
  const completions = useReviewProgressRows(repository);
  const complete = useCompleteReviewCard(chapterId, repository);
  const [completeError, setCompleteError] = useState<string>();

  if (
    chapters.isPending ||
    review.isPending ||
    progress.isPending ||
    completions.isPending
  ) {
    return <RouteLoading withinMain />;
  }
  if (chapters.isError || review.isError || progress.isError) {
    return (
      <section className="route-panel">
        <h1>章節複習</h1>
        <p role="alert">無法載入章節內容，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => {
            void chapters.refetch();
            void review.refetch();
            void progress.refetch();
          }}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const chapter = chapters.data?.find((entry) => entry.id === chapterId);
  if (!chapter) {
    return (
      <section className="route-panel">
        <h1>章節複習</h1>
        <p role="alert">找不到這個章節，或內容尚未發布。</p>
        <Link className="primary-action" to="/app">
          回章節列表
        </Link>
      </section>
    );
  }

  const chapterRow = progress.data.find((row) => row.scope === 'chapter');
  const completionRows = completions.data ?? [];
  const hasCards = review.data.some((section) =>
    section.subtopics.some((subtopic) => subtopic.cards.length > 0),
  );

  return (
    <section
      aria-labelledby="chapter-detail-title"
      className="w-full max-w-3xl"
    >
      <header>
        <p className="route-panel__eyebrow">章節複習</p>
        <h1 id="chapter-detail-title">{chapter.title}</h1>
        <p aria-label="章節進度">
          複習完成{' '}
          {reviewText(
            chapterRow?.reviewCompleted ?? 0,
            chapterRow?.reviewTotal ?? null,
          )}
          ・精熟 {percentText(chapterRow?.mastery ?? null)}・
          {statusLabels[chapterRow?.status ?? 'not_started']}
        </p>
        <nav aria-label="章節行動">
          {chapter.isPlayable ? (
            <Link
              className="primary-action"
              to={`/app/quiz/new?template=${chapter.template.id}`}
            >
              開始挑戰
            </Link>
          ) : null}
          <Link to="/app/mistakes">我的錯題</Link>
          <Link to="/app/progress">學習進度</Link>
        </nav>
      </header>

      {hasCards ? null : <p>這一章還沒有複習卡，內容準備中。</p>}

      {review.data.map((section) => (
        <section aria-label={section.title} key={section.sectionId}>
          {section.subtopics.map((subtopic) => {
            const row = subtopicRow(progress.data, subtopic.subtopicId);
            return (
              <section aria-label={subtopic.title} key={subtopic.subtopicId}>
                <h2>{subtopic.title}</h2>
                <p>
                  複習完成{' '}
                  {reviewText(
                    row?.reviewCompleted ?? 0,
                    row?.reviewTotal ?? null,
                  )}
                  ・精熟 {percentText(row?.mastery ?? null)}・
                  {statusLabels[row?.status ?? 'not_started']}
                </p>
                {subtopic.cards.map((card) => (
                  <ReviewCardItem
                    card={card}
                    completed={isCardCompleted(card, completionRows)}
                    key={card.cardId}
                    onComplete={() => {
                      setCompleteError(undefined);
                      complete.mutate(
                        {
                          requestId: crypto.randomUUID(),
                          reviewCardId: card.cardId,
                        },
                        {
                          onError: (error) => {
                            setCompleteError(error.message);
                          },
                        },
                      );
                    }}
                    pending={complete.isPending}
                  />
                ))}
              </section>
            );
          })}
        </section>
      ))}
      {completeError ? <p role="alert">{completeError}</p> : null}
    </section>
  );
}
