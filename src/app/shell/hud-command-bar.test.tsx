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

  it('Escape 關閉 MENU 面板', async () => {
    renderBar('student');
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: '登出' })).toBeNull();
  });
});
