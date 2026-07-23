import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        icon={<span>📭</span>}
        title="尚無資料"
        description="目前沒有可顯示的內容。"
        action={<a href="/app">回大廳</a>}
      />,
    );
    expect(
      screen.getByRole('heading', { name: '尚無資料' }),
    ).toBeInTheDocument();
    expect(screen.getByText('目前沒有可顯示的內容。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '回大廳' })).toBeInTheDocument();
  });
});
