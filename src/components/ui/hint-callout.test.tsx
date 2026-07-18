import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HintCallout } from './hint-callout';

describe('HintCallout', () => {
  it('renders tier 1 with its heading', () => {
    render(<HintCallout tier={1}>白色是無彩色。</HintCallout>);
    expect(screen.getByText('第一層概念提示：')).toBeInTheDocument();
    expect(
      screen.getByText('白色是無彩色。').closest('.ui-hint--tier1'),
    ).not.toBeNull();
  });

  it('renders tier 2 with its heading', () => {
    render(<HintCallout tier={2}>排除高彩度選項。</HintCallout>);
    expect(screen.getByText('第二層排除提示：')).toBeInTheDocument();
    expect(
      screen.getByText('排除高彩度選項。').closest('.ui-hint--tier2'),
    ).not.toBeNull();
  });
});
