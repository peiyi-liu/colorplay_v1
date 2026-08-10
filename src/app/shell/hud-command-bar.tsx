import { useEffect, useRef, useState, type ReactElement } from 'react';
import { NavLink } from 'react-router-dom';

const commandTabClassName = ({ isActive }: { isActive: boolean }) =>
  `hud-command__tab${isActive ? ' hud-command__tab--active' : ''}`;
const menuLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `hud-menu__nav-link${isActive ? ' hud-menu__nav-link--active' : ''}`;

// 頂部 HUD 指令列（HUD 重組批 spec 2026-08-02）：列上僅留主要 2 項 tab；
// 其餘導覽收進 MENU 面板的「更多導覽」區。MENU 仍收使用者資訊＋登出。
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

  const closeMenu = () => {
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        // F6 final-review 修法：Escape 關閉面板後焦點回到 MENU 切換鈕，
        // 避免鍵盤/螢幕閱讀器使用者焦點掉回 body（無法察覺面板已關閉）。
        menuToggleRef.current?.focus();
        return;
      }
      // Phase 5V Task 1：面板開啟時的 focus trap——Tab/Shift+Tab 只在面板
      // 內可聚焦元素之間循環，不跳出面板。面板關閉時這個 effect 整體不掛載
      // （見上方 `if (!menuOpen) return`），所以不需要額外開關判斷。
      if (event.key === 'Tab') {
        const panel = menuPanelRef.current;
        if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
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
    <div className="hud-command" data-variant={variant}>
      {variant === 'student' ? (
        <nav aria-label="主要導覽" className="hud-command__nav">
          <NavLink className={commandTabClassName} end to="/app">
            學習大廳
          </NavLink>
          <NavLink className={commandTabClassName} to="/app/live/join">
            Live 課堂
          </NavLink>
          <span aria-hidden="true" className="hud-command__spacer" />
        </nav>
      ) : (
        <nav aria-label="教師導覽" className="hud-command__nav">
          <NavLink className={commandTabClassName} end to="/teacher">
            教師工作區
          </NavLink>
          <NavLink className={commandTabClassName} to="/teacher/live">
            Live 主持
          </NavLink>
          <span aria-hidden="true" className="hud-command__spacer" />
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
          <nav aria-label="更多導覽" className="hud-menu__nav">
            {variant === 'student' ? (
              <>
                <NavLink
                  className={menuLinkClassName}
                  onClick={closeMenu}
                  to="/app/missions"
                >
                  課後任務實戰
                </NavLink>
                <NavLink
                  className={menuLinkClassName}
                  onClick={closeMenu}
                  to="/app/mistakes"
                >
                  我的錯題
                </NavLink>
                <NavLink
                  className={menuLinkClassName}
                  onClick={closeMenu}
                  to="/app/leaderboard"
                >
                  班級排行榜
                </NavLink>
                <NavLink
                  className={menuLinkClassName}
                  onClick={closeMenu}
                  to="/app/achievements"
                >
                  成就徽章
                </NavLink>
                <NavLink
                  className={menuLinkClassName}
                  onClick={closeMenu}
                  to="/app/shop"
                >
                  裝備商店
                </NavLink>
              </>
            ) : (
              <>
                <NavLink
                  className={menuLinkClassName}
                  onClick={closeMenu}
                  to="/teacher/classes"
                >
                  班級管理
                </NavLink>
                <NavLink
                  className={menuLinkClassName}
                  onClick={closeMenu}
                  to="/teacher/analytics"
                >
                  教學分析
                </NavLink>
              </>
            )}
          </nav>
          <span aria-hidden="true" className="hud-menu__divider" />
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
