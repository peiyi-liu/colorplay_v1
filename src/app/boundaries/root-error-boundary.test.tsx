import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RootErrorBoundary, RouteErrorBoundary } from './root-error-boundary';

describe('RootErrorBoundary', () => {
  it('shows a safe recovery message and tracking code', () => {
    render(
      <RootErrorBoundary
        error={new Error('sensitive stack')}
        reset={() => undefined}
      />,
    );
    expect(
      screen.getByRole('heading', { name: '頁面暫時無法顯示' }),
    ).toBeVisible();
    expect(screen.queryByText(/sensitive stack/i)).not.toBeInTheDocument();
    expect(screen.getByText(/追蹤代碼/)).toBeVisible();
  });

  it('keeps its tracking code stable for the mount and calls reset on retry', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const { rerender } = render(
      <RootErrorBoundary error={new Error('first')} reset={reset} />,
    );
    const initialTrackingCode = screen.getByText(/追蹤代碼/).textContent;

    rerender(<RootErrorBoundary error={new Error('second')} reset={reset} />);

    expect(screen.getByText(/追蹤代碼/)).toHaveTextContent(
      initialTrackingCode ?? '',
    );
    await user.click(screen.getByRole('button', { name: '重試' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('retries router failures through navigation', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <p>路由內容</p>,
          HydrateFallback: () => <p role="status">載入中</p>,
          loader: () => {
            throw new Error('sensitive route failure');
          },
          errorElement: <RouteErrorBoundary />,
        },
      ],
      { initialEntries: ['/'] },
    );
    const navigate = vi.spyOn(router, 'navigate');

    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole('heading', { name: '頁面暫時無法顯示' }),
    ).toBeVisible();
    expect(
      screen.queryByText(/sensitive route failure/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重試' }));
    expect(navigate).toHaveBeenCalledWith(0);
  });
});
