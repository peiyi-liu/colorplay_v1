import { useEffect, useState, type ReactElement } from 'react';

const STORAGE_KEY = 'colorplay.rotate-banner-dismissed';
const PORTRAIT_QUERY = '(orientation: portrait)';

// 直向軟提示（spec §3）：佔位式、可關、sessionStorage 記住；不硬擋直式操作。
export function RotateBanner(): ReactElement | null {
  const [isPortrait, setIsPortrait] = useState(
    () => window.matchMedia(PORTRAIT_QUERY).matches,
  );
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === '1',
  );

  useEffect(() => {
    const media = window.matchMedia(PORTRAIT_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsPortrait(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  if (!isPortrait || dismissed) return null;

  return (
    <div className="rotate-banner" role="status">
      <span className="rotate-banner__text">轉橫體驗更佳</span>
      <button
        aria-label="關閉轉向提示"
        className="rotate-banner__close"
        onClick={() => {
          sessionStorage.setItem(STORAGE_KEY, '1');
          setDismissed(true);
        }}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
