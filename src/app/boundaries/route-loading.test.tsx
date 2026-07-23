import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteLoading } from './route-loading';

describe('RouteLoading', () => {
  it('shows a visible loading status', () => {
    render(<RouteLoading />);
    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });
});
