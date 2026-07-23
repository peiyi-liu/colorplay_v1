import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatTile } from './stat-tile';

describe('StatTile', () => {
  it('renders label and value', () => {
    render(<StatTile label="累計積分 (XP)" value={128} />);
    expect(screen.getByText('累計積分 (XP)')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
  });

  it('applies the xp tone', () => {
    render(<StatTile label="XP" value={1} tone="xp" />);
    expect(screen.getByText('XP').closest('.ui-stat-tile--xp')).not.toBeNull();
  });
});
