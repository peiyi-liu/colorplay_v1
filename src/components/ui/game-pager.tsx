import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

const WIDE_QUERY = '(min-width: 768px)';

// 舞台寬度檔位（分頁批 spec §1）：與 GameStage 768 分界對齊。
export function useStageWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setWide(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  return wide;
}

// 像素風水平分頁器（spec §1）：溢出才分頁；未溢出時 DOM 與現行等價。
export function GamePager<T>({
  ariaLabel,
  children,
  items,
  pageSize,
}: Readonly<{
  ariaLabel: string;
  children: (pageItems: readonly T[]) => ReactNode;
  items: readonly T[];
  pageSize: number;
}>): ReactElement {
  const [rawPage, setRawPage] = useState(0);
  const safeSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / safeSize));
  const page = Math.min(rawPage, pageCount - 1);

  if (items.length <= safeSize) {
    return <>{children(items)}</>;
  }

  const pageItems = items.slice(page * safeSize, (page + 1) * safeSize);

  return (
    <div
      aria-label={ariaLabel}
      className="game-pager"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' && page > 0) {
          setRawPage(page - 1);
        }
        if (event.key === 'ArrowRight' && page < pageCount - 1) {
          setRawPage(page + 1);
        }
      }}
      role="group"
    >
      <div className="game-pager__page" key={page}>
        {children(pageItems)}
      </div>
      <div className="game-pager__nav">
        <button
          aria-label="上一頁"
          className="game-pager__arrow"
          disabled={page === 0}
          onClick={() => {
            setRawPage(page - 1);
          }}
          type="button"
        >
          ◀
        </button>
        <span aria-live="polite" className="game-pager__status">
          第 {page + 1} / {pageCount} 頁
        </span>
        <span aria-hidden="true" className="game-pager__dots">
          {Array.from({ length: pageCount }, (_, index) => (
            <span
              className={`game-pager__dot${index === page ? ' game-pager__dot--on' : ''}`}
              key={index}
            />
          ))}
        </span>
        <button
          aria-label="下一頁"
          className="game-pager__arrow"
          disabled={page === pageCount - 1}
          onClick={() => {
            setRawPage(page + 1);
          }}
          type="button"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
