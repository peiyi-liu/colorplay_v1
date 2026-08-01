import { useEffect, useRef, useState, type ReactElement } from 'react';
import { NavLink } from 'react-router-dom';

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
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        // F6 final-review 修法：Escape 關閉面板後焦點回到 MENU 切換鈕，
        // 避免鍵盤/螢幕閱讀器使用者焦點掉回 body（無法察覺面板已關閉）。
        menuToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    menuPanelRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
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
          <NavLink className={commandTabClassName} end to="/teacher">
            教師工作區
          </NavLink>
          <NavLink className={commandTabClassName} to="/teacher/live">
            Live 主持
          </NavLink>
          <NavLink className={commandLinkClassName} to="/teacher/classes">
            班級管理
          </NavLink>
          <NavLink className={commandLinkClassName} to="/teacher/analytics">
            教學分析
          </NavLink>
        </nav>
      )}
      <div className="hud-menu" ref={menuRef}>
        <button
          aria-controls="hud-menu-panel"
          aria-expanded={menuOpen}
          className="hud-menu__toggle"
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
          ref={menuToggleRef}
          type="button"
        >
          MENU
        </button>
        <div
          className="hud-menu__panel"
          hidden={!menuOpen}
          id="hud-menu-panel"
          ref={menuPanelRef}
          tabIndex={-1}
        >
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
      </div>
    </div>
  );
}
