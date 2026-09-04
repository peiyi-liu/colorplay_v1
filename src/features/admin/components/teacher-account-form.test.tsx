import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TeacherAccountForm } from './teacher-account-form';

describe('TeacherAccountForm', () => {
  it('validates create fields and submits only the editable values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TeacherAccountForm
        isSubmitting={false}
        mode="create"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: '確認新增' })).toHaveClass(
      'primary-action',
    );
    expect(screen.getByRole('button', { name: '取消' })).toHaveClass(
      'secondary-action',
    );

    await user.click(screen.getByRole('button', { name: '確認新增' }));
    expect(screen.getByText('請輸入教師姓名')).toBeInTheDocument();
    expect(screen.getByText('請輸入至少 10 字的原因')).toBeInTheDocument();

    await user.type(screen.getByLabelText('教師姓名'), '王老師');
    await user.type(screen.getByLabelText('聯絡 Email（選填）'), 'bad-email');
    await user.type(
      screen.getByLabelText('操作原因'),
      '建立教師帳號供新學期課程使用',
    );
    await user.click(screen.getByRole('button', { name: '確認新增' }));
    expect(screen.getByText('請輸入有效的 Email')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('聯絡 Email（選填）'));
    await user.type(
      screen.getByLabelText('聯絡 Email（選填）'),
      'teacher@example.test',
    );
    await user.click(screen.getByRole('button', { name: '確認新增' }));

    expect(onSubmit).toHaveBeenCalledWith({
      contactEmail: 'teacher@example.test',
      fullName: '王老師',
      reason: '建立教師帳號供新學期課程使用',
    });
  });

  it('renders reset confirmation with only a reason field', () => {
    render(
      <TeacherAccountForm
        isSubmitting={false}
        mode="reset"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        targetLabel="王老師（teacher01）"
      />,
    );

    expect(screen.getByText(/舊密碼會立即失效/u)).toBeInTheDocument();
    expect(screen.getByText(/王老師（teacher01）/u)).toBeInTheDocument();
    expect(screen.queryByLabelText('教師姓名')).toBeNull();
    expect(screen.getByLabelText('操作原因')).toBeInTheDocument();
  });

  it('restores trigger focus on Escape and locks controls while submitting', async () => {
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
            開啟表單
          </button>
          {open ? (
            <TeacherAccountForm
              isSubmitting={false}
              mode="create"
              onCancel={() => {
                setOpen(false);
              }}
              onSubmit={vi.fn()}
            />
          ) : null}
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '開啟表單' });
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByLabelText('教師姓名')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    render(
      <TeacherAccountForm
        isSubmitting
        mode="reset"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '處理中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
  });
});
