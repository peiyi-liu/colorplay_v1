import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      // Mutations may have committed even when the response was lost. Each
      // feature must opt in only when its command has an idempotency contract.
      retry: false,
    },
    queries: {
      // Read hooks that know their repository error contract can override this.
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30_000,
    },
  },
});
