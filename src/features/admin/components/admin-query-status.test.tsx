import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminQueryStatus } from './admin-query-status';

describe('Admin query status', () => {
  it('describes failed refresh as old data rather than no data', () => {
    render(
      <AdminQueryStatus
        query={{
          dataUpdatedAt: Date.now() - 60_000,
          isFetching: false,
          isError: true,
          refetch: vi.fn(),
        }}
      />,
    );
    expect(
      screen.getByText(/更新失敗，目前顯示上次取得的資料/),
    ).toHaveTextContent('更新失敗，目前顯示上次取得的資料');
    expect(screen.getByRole('button', { name: '重新整理' })).toBeEnabled();
  });
});
