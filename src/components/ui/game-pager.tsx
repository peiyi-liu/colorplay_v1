import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

const WIDE_QUERY = '(min-width: 768px) and (orientation: landscape)';

// 舞台寬度檔位（分頁批 spec §1）：與 GameStage 768 橫向分界對齊
// （globals.css .lobby .pastel-grid 三欄規則同一媒體查詢，避免
// 768–1023px 直向〔如 iPad〕JS 判定 wide 但 CSS 仍 2 欄造成換行）。
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
  followTail = false,
  items,
  pageSize,
}: Readonly<{
  ariaLabel: string;
  children: (pageItems: readonly T[]) => ReactNode;
  /** 選填、預設 false：items.length 變多時自動跳到含最後一項的頁
   *（教師批 fix wave：建班成功後讓新卡片可見，owner 裁定僅此擴充）。
   *不傳時行為與現行逐 byte 等價。 */
  followTail?: boolean;
  items: readonly T[];
  pageSize: number;
}>): ReactElement {
  const [rawPage, setRawPage] = useState(0);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // 換頁後若原本聚焦的箭頭將因抵達邊界而停用，改把焦點移到另一顆箭頭，
  // 否則 disabled 會把焦點甩回 body，導致鍵盤 ←/→ 失效（見 F1）。焦點交接
  // 必須等 DOM 真的 commit 完（見下方 useEffect）才能執行——換頁當下另一顆
  // 箭頭很可能仍是舊 render 的 disabled 態（例如僅 2 頁時，移到末頁前
  // 「上一頁」還顯示 disabled），對 disabled 元素呼叫 focus() 會被瀏覽器
  // 忽略，此時同步呼叫必定失敗。
  const pendingFocusRef = useRef<'next' | 'prev' | null>(null);
  const safeSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / safeSize));
  const page = Math.min(rawPage, pageCount - 1);
  const prevLengthRef = useRef(items.length);

  const goToPage = (newPage: number) => {
    if (newPage === 0 && document.activeElement === prevRef.current) {
      pendingFocusRef.current = 'next';
    } else if (
      newPage === pageCount - 1 &&
      document.activeElement === nextRef.current
    ) {
      pendingFocusRef.current = 'prev';
    }
    setRawPage(newPage);
  };

  useEffect(() => {
    if (pendingFocusRef.current === 'next') {
      nextRef.current?.focus();
    } else if (pendingFocusRef.current === 'prev') {
      prevRef.current?.focus();
    }
    pendingFocusRef.current = null;
  }, [page]);

  // followTail：items 變多才跳末頁；初掛 prevLengthRef 已等於當前長度不會
  // 觸發，變少（刪除）也不跳，只有「新增」才跳（fix wave spec §1）。
  useEffect(() => {
    if (followTail && items.length > prevLengthRef.current) {
      setRawPage(pageCount - 1);
    }
    prevLengthRef.current = items.length;
  }, [followTail, items.length, pageCount]);

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
          goToPage(page - 1);
        }
        if (event.key === 'ArrowRight' && page < pageCount - 1) {
          goToPage(page + 1);
        }
      }}
      role="group"
    >
      {/* 換頁=整頁子樹重掛（非 reconcile）——分頁內容必須無本地 state，
          否則翻頁即重置；首掛也會播入場動畫。 */}
      <div className="game-pager__page" key={page}>
        {children(pageItems)}
      </div>
      <div className="game-pager__nav">
        <button
          aria-label="上一頁"
          className="game-pager__arrow"
          disabled={page === 0}
          onClick={() => {
            goToPage(page - 1);
          }}
          ref={prevRef}
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
            goToPage(page + 1);
          }}
          ref={nextRef}
          type="button"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
