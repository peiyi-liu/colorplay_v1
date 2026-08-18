import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useStudentBackOverride } from '../../../app/shell/student-back-navigation';
import {
  isDirectReviewMediaAssetPath,
  type LearningRepository,
} from '../api/learning-repository';
import { useReviewMedia } from '../hooks/use-learning';
import type { ChapterDetailCardView } from './chapter-detail-view-model';
import {
  paginateBookBlocks,
  type BookPageItem,
  type BookPaginationBlock,
} from './book-paginator';
import {
  ReaderBookBlockContent,
  type ReaderBookBlock,
} from './review-book-block';

function useMobileBookLayout() {
  const query =
    '(max-width: 47.99rem), (orientation: landscape) and (max-width: 56rem) and (max-height: 30rem)';
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => {
      setMobile(mediaQuery.matches);
    };
    update();
    mediaQuery.addEventListener('change', update);
    return () => {
      mediaQuery.removeEventListener('change', update);
    };
  }, []);

  return mobile;
}

export function ChapterReviewReader({
  card,
  cardPosition,
  cardTotal,
  chapterLabel,
  completeError,
  completed,
  onBack,
  onComplete,
  pending,
  repository,
  subtopicTitle,
}: Readonly<{
  card: ChapterDetailCardView;
  cardPosition: number;
  cardTotal: number;
  chapterLabel: string;
  completeError: string | undefined;
  completed: boolean;
  onBack: () => void;
  onComplete: () => void;
  pending: boolean;
  repository?: LearningRepository;
  subtopicTitle: string;
}>) {
  useStudentBackOverride({
    ariaLabel: '返回複習卡選擇',
    onBack,
  });
  const displayTitle = card.groupLabel || card.title;
  const mobileBookLayout = useMobileBookLayout();
  const pagesPerView = mobileBookLayout ? 1 : 2;
  const paginationSourceRef = useRef<HTMLDivElement>(null);
  const paginationMeasureRef = useRef<HTMLDivElement>(null);
  const paginationIdentityRef = useRef('');
  const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [pages, setPages] = useState<readonly (readonly BookPageItem[])[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [mediaWaitCycle, setMediaWaitCycle] = useState(0);
  const [showLongMediaWait, setShowLongMediaWait] = useState(false);
  const [skipPrivateMedia, setSkipPrivateMedia] = useState(false);
  const [turnDirection, setTurnDirection] = useState<
    'next' | 'previous' | null
  >(null);
  const privateMediaAssetPaths = useMemo(
    () =>
      card.media
        .map((item) => item.assetPath)
        .filter((assetPath) => !isDirectReviewMediaAssetPath(assetPath)),
    [card.media],
  );
  const mediaQuery = useReviewMedia(privateMediaAssetPaths, repository);
  const mediaLoading =
    privateMediaAssetPaths.length > 0 &&
    mediaQuery.data === undefined &&
    !mediaQuery.isError &&
    !skipPrivateMedia;

  useEffect(() => {
    if (!mediaLoading) return undefined;
    const timer = window.setTimeout(() => {
      setShowLongMediaWait(true);
    }, 10_000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [mediaLoading, mediaWaitCycle]);

  const resolvedMediaByAssetPath = useMemo(() => {
    const resolved = new Map(
      (mediaQuery.data ?? []).map((item) => [item.assetPath, item.resolvedUrl]),
    );
    for (const item of card.media) {
      if (isDirectReviewMediaAssetPath(item.assetPath)) {
        resolved.set(item.assetPath, item.assetPath);
      }
    }
    return resolved;
  }, [card.media, mediaQuery.data]);
  const blocks = useMemo<readonly ReaderBookBlock[]>(() => {
    const contentParagraphs = card.content
      .split(/\n{2,}/u)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    return [
      {
        displayTitle,
        key: 'intro',
        kind: 'intro',
        title: card.title,
      },
      ...contentParagraphs.map((text, index) => ({
        key: `paragraph-${String(index)}`,
        kind: 'paragraph' as const,
        text,
      })),
      ...card.media.map((media, index) => ({
        altText: media.altText,
        assetPath: resolvedMediaByAssetPath.get(media.assetPath) ?? null,
        key: `media-${String(index)}`,
        kind: 'media' as const,
        loading:
          privateMediaAssetPaths.includes(media.assetPath) && mediaLoading,
      })),
    ];
  }, [
    card.content,
    card.media,
    card.title,
    displayTitle,
    mediaLoading,
    privateMediaAssetPaths,
    resolvedMediaByAssetPath,
  ]);
  const paginationBlocks = useMemo<readonly BookPaginationBlock[]>(
    () =>
      blocks.map((block) =>
        block.kind === 'paragraph'
          ? { key: block.key, splittable: true, text: block.text }
          : { key: block.key, splittable: false },
      ),
    [blocks],
  );
  const blockByKey = useMemo(
    () => new Map(blocks.map((block) => [block.key, block] as const)),
    [blocks],
  );

  const syncPagination = useCallback(() => {
    const sourceElement = paginationSourceRef.current;
    const measureElement = paginationMeasureRef.current;
    if (!sourceElement || !measureElement) return;
    const nextPages = paginateBookBlocks({
      blocks: paginationBlocks,
      measureElement,
      sourceElement,
    });
    if (nextPages.length === 0) return;
    setPages(nextPages);
    const nextViewCount = Math.max(
      1,
      Math.ceil(nextPages.length / pagesPerView),
    );
    const nextIdentity = `${card.cardId}:${String(pagesPerView)}`;
    const resetToFirstPage = paginationIdentityRef.current !== nextIdentity;
    paginationIdentityRef.current = nextIdentity;
    setPageIndex((current) =>
      resetToFirstPage ? 0 : Math.min(current, nextViewCount - 1),
    );
  }, [card.cardId, pagesPerView, paginationBlocks]);

  useLayoutEffect(() => {
    syncPagination();
    const measureElement = paginationMeasureRef.current;
    if (!measureElement || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const resizeObserver = new ResizeObserver(syncPagination);
    resizeObserver.observe(measureElement);
    void document.fonts.ready.then(syncPagination);
    return () => {
      resizeObserver.disconnect();
    };
  }, [layoutRevision, syncPagination]);

  useEffect(
    () => () => {
      if (turnTimerRef.current !== null) clearTimeout(turnTimerRef.current);
    },
    [],
  );

  const pageCount = Math.max(1, Math.ceil(pages.length / pagesPerView));
  const activePageStart = pageIndex * pagesPerView;
  const activePages: readonly (readonly BookPageItem[])[] = Array.from(
    { length: pagesPerView },
    (_, index) =>
      pages[activePageStart + index] ?? ([] as readonly BookPageItem[]),
  );
  const goToPage = (nextPageIndex: number) => {
    const boundedPageIndex = Math.min(
      pageCount - 1,
      Math.max(0, nextPageIndex),
    );
    if (boundedPageIndex === pageIndex) return;
    setTurnDirection(boundedPageIndex > pageIndex ? 'next' : 'previous');
    setPageIndex(boundedPageIndex);
    if (turnTimerRef.current !== null) clearTimeout(turnTimerRef.current);
    turnTimerRef.current = setTimeout(() => {
      setTurnDirection(null);
    }, 360);
  };
  const handleMediaLoad = useCallback(() => {
    setLayoutRevision((current) => current + 1);
  }, []);
  const readingPercent = Math.round(((pageIndex + 1) / pageCount) * 100);

  return (
    <section
      aria-label={`複習卡閱讀：${displayTitle}`}
      className="chapter-review-reader scene-dungeon"
      role="region"
    >
      <header className="chapter-review-reader__header">
        <div className="chapter-review-reader__heading-group">
          <h1>{chapterLabel}</h1>
          <p>{subtopicTitle}</p>
          <p className="chapter-review-reader__position">
            複習 <strong>{cardPosition}</strong> / {cardTotal}
          </p>
        </div>
      </header>
      <div className="chapter-review-reader__book-stage">
        <article
          aria-label={card.title}
          className="chapter-review-reader__book"
        >
          <div
            aria-hidden="true"
            className="chapter-review-reader__viewport"
            data-turn-direction={turnDirection ?? undefined}
          >
            {activePages.map((pageItems, pageOffset) => (
              <section
                className="chapter-review-reader__book-page"
                data-page-number={activePageStart + pageOffset + 1}
                key={`${String(activePageStart + pageOffset)}-${turnDirection ?? 'still'}`}
              >
                {pageItems.map((item) => {
                  const block = blockByKey.get(item.blockKey);
                  return block ? (
                    <ReaderBookBlockContent
                      block={block}
                      key={item.key}
                      onMediaLoad={handleMediaLoad}
                      {...(item.text === undefined ? {} : { text: item.text })}
                    />
                  ) : null;
                })}
              </section>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="chapter-review-reader__pagination-tools"
          >
            <div
              className="chapter-review-reader__book-page chapter-review-reader__pagination-measure"
              ref={paginationMeasureRef}
            />
          </div>
          <div
            className="chapter-review-reader__pagination-source"
            ref={paginationSourceRef}
          >
            {blocks.map((block) => (
              <ReaderBookBlockContent
                block={block}
                key={block.key}
                onMediaLoad={handleMediaLoad}
              />
            ))}
          </div>
          <span aria-hidden="true" className="chapter-review-reader__gutter" />
          <div
            aria-hidden="true"
            className="chapter-review-reader__book-page-numbers"
          >
            <span className="chapter-review-reader__book-page-number chapter-review-reader__book-page-number--left">
              {activePageStart + 1}
            </span>
            <span className="chapter-review-reader__book-page-number chapter-review-reader__book-page-number--mobile">
              第 {activePageStart + 1} 頁
            </span>
            <span className="chapter-review-reader__book-page-number chapter-review-reader__book-page-number--right">
              {activePageStart + 1 < pages.length ? activePageStart + 2 : ''}
            </span>
          </div>
        </article>
      </div>
      <footer className="chapter-review-reader__footer">
        <div className="chapter-review-reader__reading-progress">
          <span>本頁閱讀進度</span>
          <progress
            aria-label="本頁閱讀進度"
            aria-valuemax={pageCount}
            aria-valuemin={1}
            aria-valuenow={pageIndex + 1}
            max={pageCount}
            value={pageIndex + 1}
          />
          <strong>{readingPercent}%</strong>
        </div>
        {showLongMediaWait && mediaLoading ? (
          <div className="chapter-review-reader__media-wait" role="status">
            <p>圖片連線時間較長；文字與翻頁仍可正常使用。</p>
            <div className="chapter-review-reader__media-wait-actions">
              <button
                className="secondary-action"
                onClick={() => {
                  setShowLongMediaWait(false);
                  setMediaWaitCycle((current) => current + 1);
                  void mediaQuery.refetch();
                }}
                type="button"
              >
                重新載入圖片
              </button>
              <button
                className="secondary-action"
                onClick={() => {
                  setSkipPrivateMedia(true);
                }}
                type="button"
              >
                略過圖片
              </button>
            </div>
          </div>
        ) : null}
        <div className="chapter-review-reader__controls">
          <button
            aria-label="閱讀上一頁"
            className="secondary-action chapter-review-reader__page-action chapter-review-reader__page-action--previous"
            disabled={pageIndex === 0}
            onClick={() => {
              goToPage(pageIndex - 1);
            }}
            type="button"
          >
            <span className="chapter-review-reader__desktop-label">
              <span aria-hidden="true">‹</span> 閱讀上一頁
            </span>
            <span
              aria-hidden="true"
              className="chapter-review-reader__mobile-label"
            >
              ‹ 上一頁
            </span>
          </button>
          <p aria-live="polite" className="chapter-review-reader__page-count">
            第 {pageIndex + 1} / {pageCount} 頁
          </p>
          <button
            aria-label="閱讀下一頁"
            className="secondary-action chapter-review-reader__page-action chapter-review-reader__page-action--next"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => {
              goToPage(pageIndex + 1);
            }}
            type="button"
          >
            <span className="chapter-review-reader__desktop-label">
              閱讀下一頁 <span aria-hidden="true">›</span>
            </span>
            <span
              aria-hidden="true"
              className="chapter-review-reader__mobile-label"
            >
              下一頁 ›
            </span>
          </button>
          {completed ? (
            <p className="review-card__status" role="status">
              已完成複習
            </p>
          ) : (
            <button
              aria-label="完成複習"
              className="primary-action chapter-archive__continue review-card__complete-button"
              data-primary-action="true"
              disabled={pending}
              onClick={onComplete}
              type="button"
            >
              {pending ? (
                '儲存中…'
              ) : (
                <>
                  <span className="chapter-review-reader__desktop-label">
                    完成複習
                  </span>
                  <span className="chapter-review-reader__mobile-label chapter-review-reader__complete-label">
                    完成複習 <strong>{readingPercent}%</strong>
                  </span>
                </>
              )}
            </button>
          )}
        </div>
        {completeError ? <p role="alert">{completeError}</p> : null}
      </footer>
    </section>
  );
}
