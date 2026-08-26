import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudCommandBar } from './hud-command-bar';

function renderBar(variant: 'student' | 'teacher', onSignOut = vi.fn()) {
  render(
    <MemoryRouter>
      <HudCommandBar
        displayName="student.one"
        isSigningOut={false}
        onSignOut={onSignOut}
        variant={variant}
      />
    </MemoryRouter>,
  );
  return onSignOut;
}

function renderStudentAt(initialPath: string, onSignOut = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HudCommandBar
        displayName="student.one"
        isSigningOut={false}
        onSignOut={onSignOut}
        variant="student"
      />
    </MemoryRouter>,
  );
  return onSignOut;
}

function renderTeacherAt(initialPath: string, onSignOut = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HudCommandBar
        displayName="teacher.one"
        isSigningOut={false}
        onSignOut={onSignOut}
        variant="teacher"
      />
    </MemoryRouter>,
  );
  return onSignOut;
}

describe('HudCommandBar', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: false,
        media: '(max-width: 47.99rem)',
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('手機收合主列但在 MENU 內保留三個正式 route', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        media: '(max-width: 47.99rem)',
        removeEventListener: vi.fn(),
      }),
    );

    renderStudentAt('/app');
    expect(screen.queryByRole('navigation', { name: '主要導覽' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    const primary = screen.getByRole('navigation', { name: '主要導覽' });
    expect(
      within(primary)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['學習大廳', 'Live 課堂', '商店']);
  });

  it('學生列固定顯示學習大廳、Live 課堂與商店，其餘導覽收進 MENU 面板', async () => {
    renderStudentAt('/app');
    const bar = screen.getByRole('navigation', { name: '主要導覽' });
    expect(
      within(bar)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['學習大廳', 'Live 課堂', '商店']);
    expect(within(bar).getByRole('link', { name: '商店' })).toHaveAttribute(
      'href',
      '/app/shop',
    );
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    const panelNav = screen.getByRole('navigation', { name: '更多導覽' });
    expect(
      within(panelNav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['我的錯題', '班級排行榜', '成就徽章']);
    expect(
      within(panelNav).queryByRole('link', { name: '裝備商店' }),
    ).toBeNull();
  });

  it('點擊面板導覽項後 MENU 自動關閉', async () => {
    renderStudentAt('/app');
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    const panelNav = screen.getByRole('navigation', { name: '更多導覽' });
    await userEvent.click(
      within(panelNav).getByRole('link', { name: '我的錯題' }),
    );
    expect(document.getElementById('hud-menu-panel')).toHaveAttribute('hidden');
  });

  it('教師列上剩工作區與 Live 主持，班級管理/教學分析收進 MENU', async () => {
    renderTeacherAt('/teacher');
    const bar = screen.getByRole('navigation', { name: '教師導覽' });
    expect(within(bar).getAllByRole('link')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    const panelNav = screen.getByRole('navigation', { name: '更多導覽' });
    expect(
      within(panelNav).getByRole('link', { name: '班級管理' }),
    ).toBeVisible();
    expect(
      within(panelNav).getByRole('link', { name: '教學分析' }),
    ).toBeVisible();
  });

  it('MENU 收使用者名與登出，點登出委派 onSignOut', async () => {
    const onSignOut = renderBar('student');
    expect(screen.queryByRole('button', { name: '登出' })).toBeNull();
    const menu = screen.getByRole('button', { name: 'MENU' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('student.one')).toBeVisible();
    const logout = screen.getByRole('button', { name: '登出' });
    expect(logout).toHaveClass('hud-menu__logout--pixel');
    await userEvent.click(logout);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('Escape 關閉 MENU 面板並將焦點送回 MENU 切換鈕', async () => {
    renderBar('student');
    const toggle = screen.getByRole('button', { name: 'MENU' });
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: '登出' })).toBeNull();
    expect(toggle).toHaveFocus();
  });

  it('教師導覽於目前路徑顯示 active 態', async () => {
    renderTeacherAt('/teacher/classes');
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    const panelNav = screen.getByRole('navigation', { name: '更多導覽' });
    expect(
      within(panelNav).getByRole('link', { name: '班級管理' }),
    ).toHaveClass('hud-menu__nav-link--active');
    expect(
      within(panelNav).getByRole('link', { name: '教學分析' }),
    ).not.toHaveClass('hud-menu__nav-link--active');
  });

  it('MENU 面板收合時仍掛在 DOM 且 hidden，aria-controls 不懸空', () => {
    renderTeacherAt('/teacher');
    const panel = document.getElementById('hud-menu-panel');
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('hidden');
  });

  it('點擊面板外會關閉 MENU；開啟時焦點移入面板', async () => {
    renderTeacherAt('/teacher');
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    const panel = document.getElementById('hud-menu-panel');
    expect(panel).not.toHaveAttribute('hidden');
    expect(panel?.contains(document.activeElement)).toBe(true);
    await userEvent.click(document.body);
    expect(panel).toHaveAttribute('hidden');
  });

  it('MENU 開啟時，Tab 從面板內最後一個可聚焦元素回到第一個（focus trap）', async () => {
    renderTeacherAt('/teacher');
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    const panel = document.getElementById('hud-menu-panel');
    if (!panel) throw new Error('panel missing');
    const focusable = within(panel)
      .getAllByRole('link')
      .concat(within(panel).getAllByRole('button'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) throw new Error('panel has no focusable elements');
    last.focus();
    await userEvent.tab();
    expect(first).toHaveFocus();
  });

  it('MENU 開啟時，Shift+Tab 從面板內第一個可聚焦元素回到最後一個（focus trap）', async () => {
    renderTeacherAt('/teacher');
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    const panel = document.getElementById('hud-menu-panel');
    if (!panel) throw new Error('panel missing');
    const focusable = within(panel)
      .getAllByRole('link')
      .concat(within(panel).getAllByRole('button'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) throw new Error('panel has no focusable elements');
    first.focus();
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('MENU 關閉時，Tab 不被攔截（正常瀏覽器 tab order，不強制回到面板內）', async () => {
    renderTeacherAt('/teacher');
    const toggle = screen.getByRole('button', { name: 'MENU' });
    toggle.focus();
    await userEvent.tab();
    expect(toggle).not.toHaveFocus();
  });
});
