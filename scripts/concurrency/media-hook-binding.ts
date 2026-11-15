import { fail } from './config';
import type { FunctionalHttpHooks } from './media-http-contract';
export const createMediaHookBinding = (signal: AbortSignal) => {
  let current: FunctionalHttpHooks | null = null;
  return {
    hooks: {
      signal,
      beforeSend: (request) =>
        current?.beforeSend?.(request) ?? Promise.resolve('send'),
      afterResponse: (request, response) =>
        current?.afterResponse?.(request, response) ??
        Promise.resolve('deliver'),
    } satisfies FunctionalHttpHooks,
    bind: (hooks: FunctionalHttpHooks) => {
      if (current || hooks.signal !== signal)
        return fail('FUNCTIONAL_OWNERSHIP_INVALID');
      current = hooks;
    },
  };
};
