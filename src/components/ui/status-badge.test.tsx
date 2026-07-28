import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it.each([
    ['active', '進行中'],
    ['done', '已完成'],
    ['locked', '尚未解鎖'],
    ['open', '已開放'],
    ['review', '建議複習'],
  ] as const)('renders default label for %s', (state, label) => {
    render(<StatusBadge state={state} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass('status-badge', `status-badge--${state}`);
  });

  it('allows overriding the label while keeping the state style', () => {
    render(<StatusBadge state="done">已解鎖</StatusBadge>);
    expect(screen.getByText('已解鎖')).toHaveClass('status-badge--done');
  });
});
