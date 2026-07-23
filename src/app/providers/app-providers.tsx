import { ToastProvider } from '../../components/ui/toast';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useMemo } from 'react';
import { createAuthRepository } from '../../features/auth/api/auth-repository';
import { AuthBootstrap } from '../../features/auth/components/auth-bootstrap';
import type { AuthRepository } from '../../features/auth/types';
import { parsePublicEnv } from '../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../lib/supabase/browser-client';
import { queryClient } from './query-client';

type AppProvidersProps = Readonly<{
  authRepository?: AuthRepository;
  children: ReactNode;
}>;

export function AppProviders({ authRepository, children }: AppProvidersProps) {
  const repository = useMemo(
    () =>
      authRepository ??
      createAuthRepository(
        getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
      ),
    [authRepository],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthBootstrap repository={repository}>{children}</AuthBootstrap>
      </ToastProvider>
    </QueryClientProvider>
  );
}
