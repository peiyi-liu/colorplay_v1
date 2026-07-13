import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { AppProviders } from './app-providers';
import { queryClient } from './query-client';

function QueryClientProbe() {
  const providedQueryClient = useQueryClient();
  return (
    <output>
      {providedQueryClient === queryClient ? 'shared' : 'different'}
    </output>
  );
}

describe('AppProviders', () => {
  it('provides the shared application QueryClient', () => {
    render(
      <AppProviders>
        <QueryClientProbe />
      </AppProviders>,
    );
    expect(screen.getByText('shared')).toBeVisible();
  });
});
