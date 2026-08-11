import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ChapterDetailCardView } from './chapter-detail-view-model';
import {
  paginateBookBlocks,
  type BookPageItem,
  type BookPaginationBlock,
} from './book-paginator';

function CardMedia({
  altText,
  assetPath,
  blockKey,
  onLoad,
}: Readonly<{
  altText: string;
  assetPath: string;
  blockKey: string;
  onLoad: () => void;
}>) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p
        aria-label={altText}
        className="review-card__media-fallback"
        data-book-block-key={blockKey}
        role="img"
      >
        圖片載入失敗：{altText}
      </p>
    );
  }
  return (
    <img
      alt={altText}
      className="review-card__media"
      data-book-block-key={blockKey}
      onError={() => {
        setFailed(true);
      }}
      onLoad={onLoad}
      src={assetPath}
    />
  );
}

type ReaderBookBlock =
  | Readonly<{
      displayTitle: string;
      key: string;
      kind: 'intro';
      title: string;
    }>
  | Readonly<{
      key: string;
      kind: 'paragraph';
      text: string;
    }>
  | Readonly<{
      altText: string;
      assetPath: string;
      key: string;
      kind: 'media';
    }>;

function ReaderBookBlockContent({
  block,
  onMediaLoad,
  text,
}: Readonly<{
  block: ReaderBookBlock;
  onMediaLoad: () => void;
  text?: string;
}>) {
  if (block.kind === 'intro') {
    return (
      <div
        className="chapter-review-reader__intro"
        data-book-block-key={block.key}
      >
        <p className="chapter-review-reader__eyebrow">REVIEW ARCHIVE</p>
        <h2 className="chapter-review-reader__book-title">
          {block.displayTitle}
        </h2>
        {block.displayTitle !== block.title ? (
          <p className="chapter-review-reader__subtitle">{block.title}</p>
        ) : null}
      </div>
    );
  }
  if (block.kind === 'paragraph') {
    return (
      <p
        className="chapter-review-reader__content"
        data-book-block-key={block.key}
      >
        {text ?? block.text}
      </p>
    );
  }
  return (
    <CardMedia
      altText={block.altText}
      assetPath={block.assetPath}
      blockKey={block.key}
      onLoad={onMediaLoad}
    />
  );
}

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
  subtopicTitle: string;
}>) {
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
  const [turnDirection, setTurnDirection] = useState<
    'next' | 'previous' | null
  >(null);
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
        assetPath: media.assetPath,
        key: `media-${String(index)}`,
        kind: 'media' as const,
      })),
    ];
  }, [card.content, card.media, card.title, displayTitle]);
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
        <button
          aria-label="返回複習卡選擇"
          className="secondary-action chapter-review-reader__back"
          onClick={onBack}
          type="button"
        >
          <span className="chapter-review-reader__desktop-label">
            返回複習卡選擇
          </span>
          <span
            aria-hidden="true"
            className="chapter-review-reader__mobile-label"
          >
            返回
          </span>
        </button>
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
