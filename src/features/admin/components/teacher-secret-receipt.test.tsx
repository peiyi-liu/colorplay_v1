import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TeacherSecretReceipt } from './teacher-secret-receipt';

const PASSWORD = 'A1!abc234567';

describe('TeacherSecretReceipt', () => {
  it('copies each value only on an explicit action and clears the password after copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const onClose = vi.fn();
    render(
      <TeacherSecretReceipt
        loginAccount="teacher03"
        onClose={onClose}
        password={PASSWORD}
      />,
    );

    expect(writeText).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '複製登入帳號' }));
    expect(writeText).toHaveBeenCalledWith('teacher03');
    expect(screen.getByRole('status')).toHaveTextContent('登入帳號已複製');

    await user.click(screen.getByRole('button', { name: '複製一次性密碼' }));
    expect(writeText).toHaveBeenLastCalledWith(PASSWORD);
    await waitFor(() => {
      expect(document.body).not.toHaveTextContent(PASSWORD);
    });
    expect(onClose).toHaveBeenCalledWith('password_copied');
  });

  it('does not use a fallback or clear the receipt when clipboard write fails', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const onClose = vi.fn();
    render(
      <TeacherSecretReceipt
        loginAccount="teacher03"
        onClose={onClose}
        password={PASSWORD}
      />,
    );

    await user.click(screen.getByRole('button', { name: '複製一次性密碼' }));
    expect(screen.getByRole('alert')).toHaveTextContent('複製失敗');
    expect(screen.getByText(PASSWORD)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears the password on close and cannot be reopened by the same trigger', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [secret, setSecret] = useState(PASSWORD);
      return secret ? (
        <TeacherSecretReceipt
          loginAccount="teacher03"
          onClose={() => {
            setSecret('');
          }}
          password={secret}
        />
      ) : (
        <p>一次性內容已清除</p>
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '關閉並清除' }));
    expect(screen.getByText('一次性內容已清除')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(PASSWORD);
    expect(screen.queryByRole('button', { name: /重新開啟/u })).toBeNull();
  });

  it('focuses the close action and restores the invoking control after close', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            onClick={() => {
              setOpen(true);
            }}
            type="button"
          >
            顯示一次性資料
          </button>
          {open ? (
            <TeacherSecretReceipt
              loginAccount="teacher03"
              onClose={() => {
                setOpen(false);
              }}
              password={PASSWORD}
            />
          ) : null}
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '顯示一次性資料' });
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByRole('button', { name: '關閉並清除' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
