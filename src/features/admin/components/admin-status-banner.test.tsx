import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ADMIN_ERROR_MESSAGES } from '../api/admin-client';
import { AdminStatusBanner } from './admin-status-banner';

describe('AdminStatusBanner', () => {
  it('renders as an always-present polite status live region', () => {
    render(<AdminStatusBanner code={null} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');
  });

  it('renders the §11 stable-code message for a denial', () => {
    render(<AdminStatusBanner code="MFA_LOCKED" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      ADMIN_ERROR_MESSAGES.MFA_LOCKED,
    );
  });

  it('renders the incident message without any bypass affordance', () => {
    render(<AdminStatusBanner code="FACTOR_BINDING_MISMATCH" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      ADMIN_ERROR_MESSAGES.FACTOR_BINDING_MISMATCH,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
