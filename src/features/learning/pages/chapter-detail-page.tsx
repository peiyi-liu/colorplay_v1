import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { GamePager, useStageWide } from '../../../components/ui/game-pager';
import { ProgressBar } from '../../../components/ui/progress-bar';
import type {
  LearningProgressRow,
  LearningRepository,
  ReviewCardView,
  ReviewCompletionRow,
} from '../api/learning-repository';
import { useStudentChapterMap } from '../hooks/use-chapter-map';
import {
  useChapterReview,
  useCompleteReviewCard,
  useLearningProgress,
  useReviewProgressRows,
} from '../hooks/use-learning';
import { statusLabels, type ChapterStatus } from '../lib/progress-status';

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

// 複習卡改為 GAME(1) 的圖卡摺疊式（accordion）；預設收合（owner 0728：
// 進頁先看得到整體有哪些卡），點標題展開。
function ReviewCardItem({
  card,
  completed,
  index,
  onComplete,
  pending,
}: Readonly<{
  card: ReviewCardView;
  completed: boolean;
  index: number;
  onComplete: () => void;
  pending: boolean;
}>) {
  return (
    <details className="review-accordion">
      <summary className="review-accordion__summary">
        <span
          aria-hidden="true"
          className={`review-accordion__badge review-accordion__badge--${String(index % 3)}`}
        >
          {index + 1}
        </span>
        <span className="review-accordion__title">
          {card.groupLabel ? `${card.groupLabel}・` : ''}
          {card.title}
        </span>
        {completed ? (
          <span aria-hidden="true" className="review-accordion__done">
            ✓
          </span>
        ) : null}
      </summary>
      <article aria-label={card.title} className="review-card">
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{card.content}</p>
        {card.media.map((media) => (
          <CardMedia
            altText={media.altText}
            assetPath={media.assetPath}
            key={media.assetPath}
          />
        ))}
        {completed ? (
          <p className="review-card__status" role="status">
            已完成複習
          </p>
        ) : (
          <div className="review-card__actions">
            <button
              className="review-card__complete-button"
              disabled={pending}
              onClick={onComplete}
              type="button"
            >
              完成複習
            </button>
          </div>
        )}
      </article>
    </details>
  );
}

const subtopicRow = (
  rows: readonly LearningProgressRow[] | undefined,
  subtopicId: string,
): LearningProgressRow | undefined =>
  rows?.find(
    (row) => row.scope === 'subtopic' && row.subtopicId === subtopicId,
  );

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
  const chapter = chapterMap.data?.chapters.find(
    (entry) => entry.chapterId === chapterId,
  );
  const accessConfirmed =
    chapter?.accessState === 'available' ||
    chapter?.accessState === 'completed';
  const review = useChapterReview(chapterId, repository, accessConfirmed);
  const progress = useLearningProgress(chapterId, repository);
  const completions = useReviewProgressRows(repository);
  const complete = useCompleteReviewCard(chapterId, repository);
  const [completeError, setCompleteError] = useState<string>();
  const [accessRevoked, setAccessRevoked] = useState(false);
  const stageWide = useStageWide();

  const lockedMapHref = `/app?chapter=${encodeURIComponent(chapterId)}&reason=locked`;

  if (chapterMap.isPending) return <RouteLoading withinMain />;
  if (chapterMap.isError) {
    return (
      <section className="route-panel">
        <h1>章節複習</h1>
        <p role="alert">章節狀態暫時無法確認</p>
        <button
          className="primary-action"
          onClick={() => {
            void chapterMap.refetch();
          }}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  if (!chapter) {
    return (
      <section className="route-panel">
        <h1>章節複習</h1>
        <p role="alert">找不到這個章節，或內容尚未發布。</p>
        <Link className="primary-action" to="/app">
          回學習地圖
        </Link>
      </section>
    );
  }

  if (!accessConfirmed || accessRevoked) {
    return <Navigate replace to={lockedMapHref} />;
  }

  if (review.isError && review.error.code === 'CHAPTER_LOCKED') {
    return <Navigate replace to={lockedMapHref} />;
  }

  if (review.isPending || progress.isPending || completions.isPending) {
    return <RouteLoading withinMain />;
  }
  if (review.isError || progress.isError || completions.isError) {
    return (
      <section className="route-panel">
        <h1>章節複習</h1>
        <p role="alert">章節狀態暫時無法確認</p>
        <button
          className="primary-action"
          onClick={() => {
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

  const chapterRow = progress.data.find((row) => row.scope === 'chapter');
  const completionRows = completions.data;
  const hasCards = review.data.some((section) =>
    section.subtopics.some((subtopic) => subtopic.cards.length > 0),
  );

  const chapterStatus = chapterRow?.status ?? 'not_started';
  const chapterTone = statusTone[chapterStatus];

  return (
    <section
      aria-labelledby="chapter-detail-title"
      className="chapter-dungeon scene-dungeon"
    >
      <header>
        <p className="route-panel__eyebrow">章節複習</p>
        <div className="chapter-detail__title-row">
          {/* owner 0730 #4:章節標題表示完整(同大廳卡片格式)。 */}
          <h1 className="chapter-detail__title" id="chapter-detail-title">
            Chapter {chapter.sortOrder}：{chapter.title}
          </h1>
          {chapter.templateId ? (
            <Link
              className="primary-action"
              to={`/app/quiz/new?template=${chapter.templateId}`}
            >
              開始挑戰
            </Link>
          ) : null}
        </div>
        <div aria-label="章節進度" className="chapter-detail__progress">
          <span
            className={`chapter-status-pill chapter-status-pill--${chapterTone}`}
          >
            <span
              aria-hidden="true"
              className={`chapter-status-dot chapter-status-dot--${chapterTone}`}
            />
            {statusLabels[chapterStatus]}
          </span>
          <div className="chapter-detail__review-progress">
            <div className="chapter-detail__review-progress-row">
              <span className="chapter-detail__review-progress-label">
                複習完成
              </span>{' '}
              <span className="chapter-detail__review-progress-value">
                {reviewText(
                  chapterRow?.reviewCompleted ?? 0,
                  chapterRow?.reviewTotal ?? null,
                )}
              </span>
            </div>
            <ProgressBar
              label="複習完成"
              tone="primary"
              value={reviewPercent(
                chapterRow?.reviewCompleted ?? 0,
                chapterRow?.reviewTotal ?? null,
              )}
            />
          </div>
          <div className="chapter-detail__mastery">
            <MasteryRing value={chapterRow?.mastery ?? null} />
            <span className="chapter-detail__mastery-text">
              <span className="chapter-detail__mastery-label">精熟程度</span>
              <span className="chapter-detail__mastery-value">
                {percentText(chapterRow?.mastery ?? null)}
              </span>
            </span>
          </div>
        </div>
      </header>

      {hasCards ? null : <p>這一章還沒有複習卡，內容準備中。</p>}

      {review.data.map((section) => (
        <section aria-label={section.title} key={section.sectionId}>
          <GamePager
            ariaLabel={`${section.title} 樓層分頁`}
            items={section.subtopics}
            pageSize={stageWide ? 4 : 2}
          >
            {(pageSubtopics) => (
              <>
                {pageSubtopics.map((subtopic) => {
                  const row = subtopicRow(progress.data, subtopic.subtopicId);
                  const reviewCompleted = row?.reviewCompleted ?? 0;
                  const reviewTotal = row?.reviewTotal ?? null;
                  return (
                    <section
                      aria-label={subtopic.title}
                      className="chapter-detail__subtopic"
                      key={subtopic.subtopicId}
                    >
                      <h2 className="chapter-detail__subtopic-title">
                        <span className="chapter-detail__subtopic-tag">
                          小節
                        </span>{' '}
                        {subtopic.title}
                      </h2>
                      {torchStates(reviewCompleted, reviewTotal).length > 0 ? (
                        <span aria-hidden="true" className="floor-torches">
                          {torchStates(reviewCompleted, reviewTotal).map(
                            (lit, index) => (
                              <span
                                className={
                                  lit
                                    ? 'floor-torch floor-torch--lit'
                                    : 'floor-torch'
                                }
                                key={index}
                              />
                            ),
                          )}
                        </span>
                      ) : null}
                      <div
                        aria-label="小節進度"
                        className="chapter-detail__subtopic-progress"
                      >
                        <span className="chapter-detail__subtopic-studied">
                          <span
                            aria-hidden="true"
                            className="chapter-detail__subtopic-dot"
                          />
                          已學習
                        </span>
                        <span
                          aria-hidden="true"
                          className="chapter-detail__subtopic-divider"
                        >
                          ・
                        </span>
                        <span className="chapter-detail__subtopic-review">
                          複習 {reviewText(reviewCompleted, reviewTotal)}
                          <ProgressBar
                            label="複習完成"
                            size="sm"
                            tone="primary"
                            value={reviewPercent(reviewCompleted, reviewTotal)}
                          />
                        </span>
                        <span
                          aria-hidden="true"
                          className="chapter-detail__subtopic-divider"
                        >
                          ・
                        </span>
                        <span>精熟 {percentText(row?.mastery ?? null)}</span>
                      </div>
                      {subtopic.cards.map((card, index) => (
                        <ReviewCardItem
                          card={card}
                          completed={isCardCompleted(card, completionRows)}
                          index={index}
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
                                  if (error.code === 'CHAPTER_LOCKED') {
                                    setAccessRevoked(true);
                                    return;
                                  }
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
              </>
            )}
          </GamePager>
        </section>
      ))}
      {completeError ? <p role="alert">{completeError}</p> : null}
    </section>
  );
}
