import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminTrace } from './admin-trace';

describe('AdminTrace', () => {
  it('does not render arbitrary response text as a trace', () => {
    render(<AdminTrace value="Bearer SECRET" />);
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('shows failure when clipboard is unavailable and does not retain success for a new ID', async () => {
    const user = userEvent.setup();
    const first = '019fe0fe-a795-7c83-9412-27e368974a7c';
    const { rerender } = render(<AdminTrace value={first} />);
    const write = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue();
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('已複製');
    rerender(<AdminTrace value="019fe0fe-a795-7c83-9412-27e368974a7d" />);
    expect(screen.getByRole('button')).toHaveTextContent('複製');
    write.mockRejectedValue(new Error('private diagnostic'));
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('status')).toHaveTextContent('複製失敗');
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
    write.mockRestore();
  });
  it('offers copy only for a safe trace identifier', () => {
    render(<AdminTrace value="019fe0fe-a795-7c83-9412-27e368974a7c" />);
    expect(screen.getByRole('button', { name: '複製追蹤代碼' })).toBeVisible();
  });
});
