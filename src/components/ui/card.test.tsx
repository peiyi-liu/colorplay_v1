import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card } from './card';

describe('Card', () => {
  it('renders children inside a ggame card surface', () => {
    render(<Card>內容</Card>);
    const card = screen.getByText('內容');
    expect(card.closest('.ui-card')).not.toBeNull();
  });

  it('applies the large padding variant', () => {
    render(<Card padding="lg">內容</Card>);
    expect(screen.getByText('內容').closest('.ui-card--lg')).not.toBeNull();
  });
});
