import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('exposes progressbar semantics with a clamped value', () => {
    render(<ProgressBar value={62} tone="warning" label="首次正確率" />);
    const bar = screen.getByRole('progressbar', { name: '首次正確率' });
    expect(bar).toHaveAttribute('aria-valuenow', '62');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps out-of-range values', () => {
    render(<ProgressBar value={140} tone="success" label="完成率" />);
    expect(screen.getByRole('progressbar', { name: '完成率' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });
});
