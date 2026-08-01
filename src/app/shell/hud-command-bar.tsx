import { useEffect, useState, type ReactElement } from 'react';
import { Link, NavLink } from 'react-router-dom';

const commandTabClassName = ({ isActive }: { isActive: boolean }) =>
  `hud-command__tab${isActive ? ' hud-command__tab--active' : ''}`;
const commandLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `hud-command__link${isActive ? ' hud-command__link--active' : ''}`;

// 底部 HUD 指令列（spec §4）：7 項導覽全可見；MENU 收使用者資訊＋登出。
export function HudCommandBar({
  displayName,
  isSigningOut,
  onSignOut,
  variant,
}: Readonly<{
  displayName: string;
  isSigningOut: boolean;
  onSignOut: () => void;
  variant: 'student' | 'teacher';
}>): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="hud-command">
      {variant === 'student' ? (
        <nav aria-label="主要導覽" className="hud-command__nav">
          <NavLink className={commandTabClassName} end to="/app">
            學習大廳
          </NavLink>
          <NavLink className={commandTabClassName} to="/app/missions">
            課後任務實戰
          </NavLink>
          <NavLink className={commandTabClassName} to="/app/shop">
            裝備商店
          </NavLink>
          <span aria-hidden="true" className="hud-command__spacer" />
          <NavLink className={commandLinkClassName} to="/app/mistakes">
            我的錯題
          </NavLink>
          <NavLink className={commandLinkClassName} to="/app/live/join">
            Live 課堂
          </NavLink>
          <NavLink className={commandLinkClassName} to="/app/leaderboard">
            班級排行榜
          </NavLink>
          <NavLink className={commandLinkClassName} to="/app/achievements">
            成就徽章
          </NavLink>
        </nav>
      ) : (
        <nav aria-label="教師導覽" className="hud-command__nav">
          <Link className="hud-command__tab" to="/teacher">
            教師工作區
          </Link>
          <Link className="hud-command__tab" to="/teacher/live">
            Live 主持
          </Link>
          <Link className="hud-command__link" to="/teacher/classes">
            班級管理
          </Link>
          <Link className="hud-command__link" to="/teacher/analytics">
            教學分析
          </Link>
        </nav>
      )}
      <div className="hud-menu">
        <button
          aria-controls="hud-menu-panel"
          aria-expanded={menuOpen}
          className="hud-menu__toggle"
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
          type="button"
        >
          MENU
        </button>
        {menuOpen ? (
          <div className="hud-menu__panel" id="hud-menu-panel">
            <p className="hud-menu__user">{displayName}</p>
            <button
              className="hud-menu__logout"
              disabled={isSigningOut}
              onClick={onSignOut}
              type="button"
            >
              {isSigningOut ? '登出中…' : '登出'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
