import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
  it('學生指令列 7 項導覽全可見且 aria-label 不變', () => {
    renderBar('student');
    expect(screen.getByRole('navigation', { name: '主要導覽' })).toBeVisible();
    for (const label of [
      '學習大廳',
      '課後任務實戰',
      '裝備商店',
      '我的錯題',
      'Live 課堂',
      '班級排行榜',
      '成就徽章',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
  });

  it('教師指令列 4 項導覽全可見且 aria-label 不變', () => {
    renderBar('teacher');
    expect(screen.getByRole('navigation', { name: '教師導覽' })).toBeVisible();
    for (const label of ['教師工作區', 'Live 主持', '班級管理', '教學分析']) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
  });

  it('MENU 收使用者名與登出，點登出委派 onSignOut', async () => {
    const onSignOut = renderBar('student');
    expect(screen.queryByRole('button', { name: '登出' })).toBeNull();
    const menu = screen.getByRole('button', { name: 'MENU' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('student.one')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
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

  it('教師導覽於目前路徑顯示 active 態', () => {
    renderTeacherAt('/teacher/classes');
    expect(screen.getByRole('link', { name: '班級管理' })).toHaveClass(
      'hud-command__link--active',
    );
    expect(screen.getByRole('link', { name: '教學分析' })).not.toHaveClass(
      'hud-command__link--active',
    );
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
});
