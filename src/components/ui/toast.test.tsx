import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './toast';

function Trigger({ tone }: Readonly<{ tone: 'success' | 'error' | 'info' }>) {
  const toast = useToast();
  return (
    <button
      onClick={() => {
        toast({ message: '已裝備熔岩流金。', tone });
      }}
      type="button"
    >
      發送
    </button>
  );
}

describe('Toast', () => {
  it('shows a toast in the top-right region and auto-dismisses', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger tone="success" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: '發送' }).click();
    });
    const region = screen.getByRole('region', { name: '系統通知' });
    expect(region.textContent).toContain('已裝備熔岩流金。');
    expect(
      screen.getByText('已裝備熔岩流金。').closest('.ui-toast--success'),
    ).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('已裝備熔岩流金。')).toBeNull();
    vi.useRealTimers();
  });

  it('announces error toasts assertively', () => {
    render(
      <ToastProvider>
        <Trigger tone="error" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: '發送' }).click();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('已裝備熔岩流金。');
  });
});
