import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EnvironmentMarker } from './environment-marker';

describe('EnvironmentMarker', () => {
  it('shows an explicit status only in Staging', () => {
    const { rerender } = render(<EnvironmentMarker environment="staging" />);

    expect(screen.getByRole('status')).toHaveTextContent('STAGING 測試環境');

    rerender(<EnvironmentMarker environment="production" />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<EnvironmentMarker environment="local" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
