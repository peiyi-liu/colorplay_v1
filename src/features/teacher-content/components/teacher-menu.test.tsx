import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TeacherMenu } from './teacher-menu';

const renderMenu = (
  overrides: Partial<React.ComponentProps<typeof TeacherMenu>> = {},
) =>
  render(
    <MemoryRouter initialEntries={['/teacher']}>
      <TeacherMenu
        avatarError={null}
        avatarPending={false}
        avatarUrl={null}
        displayName="林老師"
        isSigningOut={false}
        onAvatarUpload={vi.fn().mockResolvedValue(undefined)}
        onSignOut={vi.fn()}
        signOutError={false}
        {...overrides}
      />
    </MemoryRouter>,
  );

describe('TeacherMenu', () => {
  it('shows the upload invitation inside an empty avatar frame', () => {
    renderMenu();

    const upload = screen.getByLabelText('上傳教師頭像');
    expect(upload).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
    expect(screen.getByText('點此上傳')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders exactly the three approved teacher destinations', () => {
    renderMenu();

    const navigation = screen.getByRole('navigation', { name: '教師導覽' });
    const links = Array.from(navigation.querySelectorAll('a'));
    expect(links).toHaveLength(3);
    expect(
      links.map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['教學分析', '/teacher'],
      ['班級管理', '/teacher/classes'],
      ['Live 課堂', '/teacher/live'],
    ]);
  });

  it('uploads the selected file and confirms before signing out', async () => {
    const onAvatarUpload = vi.fn().mockResolvedValue(undefined);
    const onSignOut = vi.fn();
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderMenu({ onAvatarUpload, onSignOut });
    const file = new File(['avatar'], 'teacher.webp', { type: 'image/webp' });

    await userEvent.upload(screen.getByLabelText('上傳教師頭像'), file);
    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    expect(confirm).toHaveBeenLastCalledWith('確定要登出嗎？');
    expect(onSignOut).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    expect(onAvatarUpload).toHaveBeenCalledWith(file);
    expect(onSignOut).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('keeps only the teacher name and role in the identity block', () => {
    renderMenu();

    const identity = screen.getByText('林老師・教師端').parentElement;
    expect(identity).not.toHaveTextContent('教師工作區');
  });

  it('shows the uploaded avatar and does not expose student economy values', () => {
    renderMenu({ avatarUrl: 'https://example.test/teacher-avatar' });

    expect(
      screen.getByRole('img', { name: '林老師的教師頭像' }),
    ).toHaveAttribute('src', 'https://example.test/teacher-avatar');
    expect(screen.queryByText(/XP|Token|金幣/u)).not.toBeInTheDocument();
  });

  it('surfaces a failed sign-out without replacing the navigation', () => {
    renderMenu({ signOutError: true });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '登出失敗，請稍後重試。',
    );
    expect(screen.getByRole('navigation', { name: '教師導覽' })).toBeVisible();
  });

  it('renders avatar and sign-out failures as two independent alerts', () => {
    renderMenu({ avatarError: '頭像上傳失敗。', signOutError: true });

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('頭像上傳失敗。');
    expect(alerts[1]).toHaveTextContent('登出失敗，請稍後重試。');
  });

  it('keeps avatar pending and error states explicit', () => {
    const { rerender } = renderMenu({ avatarPending: true });

    expect(screen.getByText('上傳中…')).toBeVisible();
    expect(screen.getByLabelText('上傳教師頭像')).toBeDisabled();

    rerender(
      <MemoryRouter initialEntries={['/teacher']}>
        <TeacherMenu
          avatarError="頭像上傳失敗。"
          avatarPending={false}
          avatarUrl={null}
          displayName="林老師"
          isSigningOut={false}
          onAvatarUpload={vi.fn()}
          onSignOut={vi.fn()}
          signOutError={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('頭像上傳失敗。');
  });
});
