import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unit tests must be stack-independent: pages that parse the public env
// (APP_CONFIG_INVALID otherwise) get the same synthetic values CI injects,
// so the suite is green with or without a local .env.
vi.stubEnv('VITE_SUPABASE_URL', 'https://synthetic-colorplay-unit.invalid');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'synthetic-browser-public-anon-key');

afterEach(cleanup);
