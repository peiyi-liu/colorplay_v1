import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the h1 title with the optional description', () => {
    render(
      <PageHeader
        description="選擇下方章節。"
        title="色彩任務選擇大廳"
        titleId="lobby-title"
      />,
    );
    const title = screen.getByRole('heading', {
      level: 1,
      name: '色彩任務選擇大廳',
    });
    expect(title).toHaveAttribute('id', 'lobby-title');
    expect(screen.getByText('選擇下方章節。')).toBeVisible();
  });

  it('renders leading content before the title block', () => {
    render(<PageHeader leading={<a href="/app">回大廳</a>} title="成就" />);
    expect(screen.getByRole('link', { name: '回大廳' })).toBeVisible();
    expect(screen.queryByText('undefined')).toBeNull();
  });
});
