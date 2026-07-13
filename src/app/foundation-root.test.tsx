import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FoundationRoot } from './foundation-root';

describe('FoundationRoot', () => {
  it('renders the ColorPlay application name', () => {
    render(<FoundationRoot />);
    expect(screen.getByRole('heading', { name: 'ColorPlay' })).toBeVisible();
  });
});
