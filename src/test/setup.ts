import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unit tests must be stack-independent: pages that parse the public env
// (APP_CONFIG_INVALID otherwise) get the same synthetic values CI injects,
// so the suite is green with or without a local .env.
vi.stubEnv('VITE_SUPABASE_URL', 'https://synthetic-colorplay-unit.invalid');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'synthetic-browser-public-anon-key');

// jsdom has no matchMedia implementation; RotateBanner (GameStage shell)
// calls it unconditionally on mount, so any test rendering AppShell needs a
// baseline stub. Individual tests may still vi.stubGlobal('matchMedia', …)
// for their own scenario — that override wins for the test and
// vi.unstubAllGlobals() restores this baseline afterwards.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    }) as unknown as MediaQueryList;
}

afterEach(cleanup);
