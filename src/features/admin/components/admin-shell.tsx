import { useEffect, useRef, useState, type ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const WIDE_QUERY = '(min-width: 1024px)';

// 1024px 分界(spec §3.4 三視口:1280×720 常駐、812×375/375×812 收 drawer)。
// 812 寬雖已達 GameStage 的 768px 橫向分界,admin shell 仍要收 drawer,
// 所以刻意不重用 useStageWide,改用純寬度媒體查詢、不看 orientation。
function useAdminShellWide(): boolean {
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

const NAV_GROUPS: readonly {
  label: string;
  items: readonly { label: string; to: string; end?: boolean }[];
}[] = [
  { items: [{ end: true, label: '安全總覽', to: '/admin' }], label: '總覽' },
  {
    items: [
      { label: '管理員', to: '/admin/access/admins' },
      { label: '邀請', to: '/admin/access/invitations' },
      { label: 'Session', to: '/admin/access/sessions' },
      { label: '教師帳號', to: '/admin/teachers' },
    ],
    label: '身分與存取',
  },
  {
    items: [{ label: '資料瀏覽', to: '/admin/data' }],
    label: '資料瀏覽',
  },
  { items: [{ label: '稽核紀錄', to: '/admin/audit' }], label: '稽核' },
  { items: [{ label: '健康狀態', to: '/admin/health' }], label: '系統健康' },
];

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `admin-shell__link${isActive ? ' admin-shell__link--active' : ''}`;

/**
 * Admin 命令 UI 外殼(spec §3.1、§3.4):側欄五群、≥1024px 常駐、
 * 窄視口收 MENU drawer。純導覽外殼,不做任何授權判斷
 * (RequirePrivilegedSession 已在外層把關)。
 */
export function AdminShell(): ReactElement {
  const wide = useAdminShellWide();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // 換頁後收起 drawer;寬版永遠可見不受影響。渲染期間調整狀態(React 官方
  // pattern),不用 effect——避免 react-hooks/set-state-in-effect,做法比照
  // src/features/quiz/components/loot-reveal.tsx 既有慣例。
  const [previousPathname, setPreviousPathname] = useState(location.pathname);
  if (previousPathname !== location.pathname) {
    setPreviousPathname(location.pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  const navVisible = wide || drawerOpen;

  return (
    <div className={`admin-shell${wide ? ' admin-shell--wide' : ''}`}>
      {!wide ? (
        <button
          aria-controls="admin-shell-nav"
          aria-expanded={drawerOpen}
          className="admin-shell__menu-toggle"
          onClick={() => {
            setDrawerOpen((open) => !open);
          }}
          ref={toggleRef}
          type="button"
        >
          MENU
        </button>
      ) : null}
      <nav
        aria-label="管理主控台導覽"
        className="admin-shell__nav"
        hidden={!navVisible}
        id="admin-shell-nav"
      >
        {NAV_GROUPS.map((group) => (
          <div className="admin-shell__group" key={group.label}>
            <p className="admin-shell__group-label">{group.label}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    className={navLinkClassName}
                    end={item.end ?? false}
                    to={item.to}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {/* div 不用 main:AppShell 的 <main id="main-content"> 已是全站唯一 main
          landmark(review 波標準軸抓到巢狀 main 會讓螢幕閱讀器多出重複
          landmark)。 */}
      <div className="admin-shell__main">
        <Outlet />
      </div>
    </div>
  );
}
