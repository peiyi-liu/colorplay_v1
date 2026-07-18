import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Chip } from './chip';

describe('Chip', () => {
  it.each([
    'primary',
    'teacher',
    'success',
    'danger',
    'alert',
    'neutral',
  ] as const)('renders the %s tone class', (tone) => {
    render(<Chip tone={tone}>標籤</Chip>);
    expect(
      screen.getByText('標籤').closest(`.ui-chip--${tone}`),
    ).not.toBeNull();
  });
});
