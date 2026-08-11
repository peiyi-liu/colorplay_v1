import colorNetworkBook from '../../../assets/chapter/review-books/color-network.png';
import colorPyramidBook from '../../../assets/chapter/review-books/color-pyramid.png';
import colorSwatchesBook from '../../../assets/chapter/review-books/color-swatches.png';
import fourColorGridBook from '../../../assets/chapter/review-books/four-color-grid.png';
import primaryColorsBook from '../../../assets/chapter/review-books/primary-colors.png';
import prismSpectrumBook from '../../../assets/chapter/review-books/prism-spectrum.png';
import type { ChapterDetailCardView } from './chapter-detail-view-model';

const REVIEW_BOOKS = [
  primaryColorsBook,
  fourColorGridBook,
  colorNetworkBook,
  prismSpectrumBook,
  colorSwatchesBook,
  colorPyramidBook,
] as const;

const artAt = (assets: readonly string[], index: number): string =>
  assets[index % assets.length] ?? assets[0] ?? '';

export function ChapterReviewNode({
  artIndex,
  card,
  completed,
  current,
  onSelect,
  selected,
}: Readonly<{
  artIndex: number;
  card: ChapterDetailCardView;
  completed: boolean;
  current: boolean;
  onSelect: () => void;
  selected: boolean;
}>) {
  const displayTitle = card.groupLabel || card.title;
  const detailTitle =
    card.groupLabel && card.groupLabel !== card.title ? card.title : null;

  return (
    <div
      className="chapter-review-node"
      data-card-id={card.cardId}
      data-completed={completed ? 'true' : 'false'}
      data-current={current ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
    >
      <button
        aria-label={`選擇複習卡：${displayTitle}`}
        aria-pressed={selected}
        className="chapter-review-node__summary"
        id={`review-card-${card.cardId}`}
        onClick={onSelect}
        type="button"
      >
        <span
          aria-hidden="true"
          className={`chapter-review-node__artifact chapter-review-node__book review-accordion__badge review-accordion__badge--${String(artIndex % 3)}`}
          data-selected={selected ? 'true' : undefined}
        >
          <img
            alt=""
            aria-hidden="true"
            className="chapter-review-node__book-art"
            decoding="async"
            draggable={false}
            src={artAt(REVIEW_BOOKS, artIndex)}
          />
        </span>
        <span className="chapter-review-node__copy">
          <strong className="chapter-review-node__title">{displayTitle}</strong>
          {detailTitle ? (
            <span className="chapter-review-node__detail">{detailTitle}</span>
          ) : null}
          <span className="chapter-review-node__status">
            <span
              aria-hidden="true"
              className="chapter-review-node__state-icon"
            >
              {completed ? '✓' : current ? '▶' : '◇'}
            </span>
            {completed ? '已完成' : current ? '進行中' : '尚未開始'}
          </span>
        </span>
      </button>
    </div>
  );
}
