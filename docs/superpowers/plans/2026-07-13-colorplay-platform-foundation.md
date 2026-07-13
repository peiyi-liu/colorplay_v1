# ColorPlay Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reproducible React/Vite foundation in Phase 1A and a real Supabase local Email/password plus own-profile/RLS vertical slice in Phase 1B, with evidence, CI, GitHub, and Vercel deployment contracts.

**Architecture:** Build a clean feature-oriented SPA without embedding legacy runtime code. The browser remains untrusted; Supabase Auth identifies users and PostgreSQL grants/RLS authorize profile data. Phase 1A contains no product-domain migration, while Phase 1B introduces only the `profiles` slice and proves it against real local Auth/PostgreSQL.

**Tech Stack:** React, TypeScript strict mode, Vite, Tailwind CSS, React Router, TanStack Query, Supabase Auth/PostgreSQL, Zod, Vitest, React Testing Library, Playwright, Supabase CLI, GitHub Actions, Vercel, pnpm.

## Global Constraints

- Normative inputs are `docs/superpowers/specs/2026-07-13-colorplay-platform-foundation-design.md`, `spec/README.md`, every numbered `spec/*.md`, `acceptance/ACCEPTANCE_CRITERIA.md`, and `acceptance/EVIDENCE_TEMPLATE.md`; a task-level mapping narrows these inputs but never overrides them.
- Canonical execution root is `/Users/guanyucheng/Desktop/pei-game/colorplay`; the directory was renamed after design approval, without changing architecture.
- Package management uses pnpm and one committed `pnpm-lock.yaml`; do not create `package-lock.json`.
- Vercel Build Command is exactly `npm run build`; Output Directory is exactly `dist`; Production Branch is `main`.
- Browser configuration keys are exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never commit or bundle Supabase `service_role`, database passwords, JWT secrets, access tokens, real student data, or server credentials.
- TypeScript uses `strict: true`; do not add explicit or inferred escape-hatch `any`, ignored diagnostics, disabled lint rules, skipped tests, or weakened assertions.
- Acceptance and E2E use real Supabase local or staging services; they do not intercept the application API.
- UI tasks produce headed Chromium screenshots and Playwright traces; flows involving state transitions also retain video.
- Every behavior change follows red test -> observed failure -> minimal implementation -> observed pass -> commit.
- Do not delete or rewrite `legacy/colorplay-original.html`; preserve its SHA-256 `733216166f40879647f12fd1db70faecaaa13c1a3178d3a95b24cce4c707f7fc`.
- Do not claim a full acceptance criterion passes when Phase 1 verifies only a subset of its final MVP conditions.

## Execution Preconditions

The current repository already has `main`, `origin=https://github.com/peiyi-liu/colorplay.git`, and remote commits. It also has user-owned dirty changes to `.gitignore`, `.DS_Store`, and `legacy/`. Task 1 is intentionally executed in the current checkout so a reviewer can normalize and commit that baseline. After Task 1 passes, invoke `superpowers:using-git-worktrees` and execute Tasks 2-16 on a feature branch created from the committed baseline.

Task 16 consumes two externally provisioned, empty Supabase projects in `ap-southeast-1`: one staging and one production. The account owner supplies their project refs, public URLs, public anon keys, and database passwords interactively at execution time. Values are never written to this plan, shell history, source files, test artifacts, or GitHub logs. If those real projects are unavailable, Task 16 stops before Vercel linking and records the deployment criterion as not verified; it does not substitute fake endpoints.

## Locked File Map

| Area | Files | Responsibility |
|---|---|---|
| Governance baseline | `.gitignore`, `legacy/*`, `AGENTS.md`, `spec/*`, `acceptance/*`, `docs/*`, `DOCUMENT_MANIFEST.json` | Keep rules, approved designs, plan, acceptance, and immutable prototype in Git |
| Toolchain | `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc.json` | Reproducible strict build and quality commands |
| App composition | `src/main.tsx`, `src/app/providers/*`, `src/app/router/*`, `src/app/boundaries/*`, `src/app/shell/*` | Providers, routes, shell, loading and render recovery |
| Public config | `.env.example`, `src/lib/config/public-env.ts`, `src/lib/supabase/browser-client.ts`, `src/types/database.ts` | Validate browser-safe environment and create one typed Supabase client |
| Styles | `src/styles/tokens.css`, `src/styles/globals.css` | Approved flat-design tokens and responsive baseline |
| Local backend | `supabase/config.toml`, `supabase/migrations/*`, `supabase/seed.sql`, `supabase/tests/*` | Real local services, profile schema, grants, RLS, and SQL assertions |
| Auth/profile features | `src/features/auth/*`, `src/features/profile/*` | Email/password UI, session lifecycle, guards, safe own-profile read |
| Test/evidence | `tests/*`, `playwright.config.ts`, `scripts/acceptance/*`, `artifacts/acceptance/*` | Unit, component, integration, browser, DB, and evidence contracts |
| Delivery | `.github/workflows/ci.yml`, `vercel.json`, `docs/deployment/vercel.md` | CI, SPA fallback, Git-based preview/production deployments |

---

## Phase 1A — Reproducible Engineering Foundation

### Task 1: Track governance files and preserve the legacy baseline

**Reviewer gate:** Accept only if Git tracks the approved rules/spec/design/plan and both legacy files match byte-for-byte, while the original file remains unchanged.

**Files:**
- Modify: `.gitignore`
- Create: `.gitattributes`
- Create: `legacy/colorplay-prototype.html`
- Create: `legacy/README.md`
- Create: `tests/contracts/repository-baseline.test.sh`
- Track unchanged: `AGENTS.md`, `DOCUMENT_MANIFEST.json`, `acceptance/**`, `docs/**`, `spec/**`, `legacy/colorplay-original.html`
- Remove from Git index only: `.DS_Store`

**Interfaces:**
- Consumes: current Git `main`; `legacy/colorplay-original.html` with the approved SHA-256.
- Produces: tracked `GovernanceBaseline`; immutable pair `legacy/colorplay-original.html` and `legacy/colorplay-prototype.html`; clean ignore rules for product work.

**Specs / acceptance:** `AGENTS.md` sections 2, 6, 7, 11; `spec/00-project-charter.md` sections 9-10; `spec/08-testing-and-evidence.md`; `spec/10-migration-roadmap.md` Phase 0; `AC-DOC-001`, `AC-DOC-003` as traceability checkpoints.

**Evidence:** `artifacts/acceptance/phase-1a-task-01/reports/legacy-sha256.txt` and `git ls-files` output with no `.DS_Store`.

- [ ] **Step 1: Write the failing repository contract**

```bash
#!/usr/bin/env bash
set -euo pipefail

expected='733216166f40879647f12fd1db70faecaaa13c1a3178d3a95b24cce4c707f7fc'
test "$(git branch --show-current)" = 'main'
test -f legacy/colorplay-original.html
test -f legacy/colorplay-prototype.html
test "$(shasum -a 256 legacy/colorplay-original.html | awk '{print $1}')" = "$expected"
test "$(shasum -a 256 legacy/colorplay-prototype.html | awk '{print $1}')" = "$expected"
cmp -s legacy/colorplay-original.html legacy/colorplay-prototype.html
git check-ignore -q AGENTS.md && exit 1
git check-ignore -q spec/00-project-charter.md && exit 1
git check-ignore -q docs/superpowers/specs/2026-07-13-colorplay-platform-foundation-design.md && exit 1
git ls-files --error-unmatch AGENTS.md >/dev/null
git ls-files --error-unmatch acceptance/ACCEPTANCE_CRITERIA.md >/dev/null
git ls-files --error-unmatch legacy/colorplay-original.html >/dev/null
! git ls-files --error-unmatch .DS_Store >/dev/null 2>&1
```

- [ ] **Step 2: Run the contract and observe the intended failure**

Run: `bash tests/contracts/repository-baseline.test.sh`

Expected: non-zero; first actionable failure is missing `legacy/colorplay-prototype.html` or governance paths still ignored/untracked.

- [ ] **Step 3: Apply the minimal baseline change**

Replace `.gitignore` with rules that ignore generated/runtime files but do not ignore governance directories:

```gitignore
node_modules/
dist/
coverage/
.env
.env.local
.env.*.local
!.env.example
supabase/.temp/
supabase/.branches/
playwright-report/
test-results/
blob-report/
artifacts/acceptance/*
!artifacts/acceptance/.gitkeep
.vercel/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.DS_Store
Thumbs.db
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
```

Create `.gitattributes` with path-specific whitespace exceptions that preserve the approved bytes while keeping whitespace checks active elsewhere:

```gitattributes
legacy/colorplay-original.html -whitespace
legacy/colorplay-prototype.html -whitespace
acceptance/EVIDENCE_TEMPLATE.md -whitespace
```

Run:

```bash
cp -p legacy/colorplay-original.html legacy/colorplay-prototype.html
git rm --cached .DS_Store
git add .gitattributes .gitignore AGENTS.md DOCUMENT_MANIFEST.json README.md acceptance docs legacy spec tests/contracts/repository-baseline.test.sh
mkdir -p artifacts/acceptance/phase-1a-task-01/reports
shasum -a 256 legacy/colorplay-original.html legacy/colorplay-prototype.html > artifacts/acceptance/phase-1a-task-01/reports/legacy-sha256.txt
```

Write `legacy/README.md` exactly:

```markdown
# Legacy ColorPlay Prototype

`colorplay-original.html` is the preserved source artifact. `colorplay-prototype.html` is its byte-identical comparison copy for migration work. Neither file is imported by, copied into, or served from the production React application.

Approved SHA-256 for both files:

`733216166f40879647f12fd1db70faecaaa13c1a3178d3a95b24cce4c707f7fc`
```

- [ ] **Step 4: Run verification and confirm the pass**

Run: `bash tests/contracts/repository-baseline.test.sh && git diff --cached --check`

Expected: exit 0; both legacy hashes match, governance files are staged, `.DS_Store` is absent from the index, and no whitespace error is reported outside the three byte-preserving exceptions for `legacy/colorplay-original.html`, `legacy/colorplay-prototype.html`, and `acceptance/EVIDENCE_TEMPLATE.md`.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: preserve ColorPlay governance baseline"
```

### Task 2: Establish the strict React/Vite toolchain contract

**Reviewer gate:** Accept only if install, typecheck, unit smoke, and production build are reproducible from `pnpm-lock.yaml`, with every required package script present.

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `index.html`
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Create: `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`
- Create: `src/main.tsx`, `src/app/foundation-root.tsx`, `src/test/setup.ts`
- Create: `tests/contracts/toolchain.test.sh`, `src/app/foundation-root.test.tsx`, `src/main.test.tsx`

**Interfaces:**
- Consumes: `GovernanceBaseline` from Task 1.
- Produces: package scripts `dev`, `build`, `preview`, `lint`, `format:check`, `typecheck`, `test`, `test:coverage`, `test:db`, `test:e2e`, `test:visual`, `acceptance`; React mount point `FoundationRoot(): JSX.Element`.

**Specs / acceptance:** `AGENTS.md` sections 4, 8, 9; `spec/02-system-architecture.md` section 3; `spec/08-testing-and-evidence.md`; `spec/09-nonfunctional-requirements.md`; `spec/11-reference-standards.md` version principles; `AC-ENV-001`, `AC-PERF-001` checkpoint.

**Evidence:** command log at `artifacts/acceptance/phase-1a-task-02/reports/toolchain.txt`; built `dist/index.html`; coverage report.

- [ ] **Step 1: Write failing shell and component tests**

`tests/contracts/toolchain.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
test -f package.json
test -f pnpm-lock.yaml
test ! -f package-lock.json
node -e "const p=require('./package.json'); for (const s of ['dev','build','preview','lint','format:check','typecheck','test','test:coverage','test:db','test:e2e','test:visual','acceptance']) if (!p.scripts[s]) process.exit(1)"
node -e "const c=require('./tsconfig.app.json'); if (c.compilerOptions.strict !== true) process.exit(1)"
```

`src/app/foundation-root.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FoundationRoot } from './foundation-root';

describe('FoundationRoot', () => {
  it('renders the ColorPlay application name', () => {
    render(<FoundationRoot />);
    expect(screen.getByRole('heading', { name: 'ColorPlay' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the contract and observe failure**

Run: `bash tests/contracts/toolchain.test.sh`

Expected: non-zero with `package.json` missing.

- [ ] **Step 3: Install dependencies and write the minimal strict app**

Run:

```bash
pnpm init
pnpm pkg set private=true --json
pnpm pkg set type=module
pnpm pkg set "packageManager=pnpm@$(pnpm --version)"
pnpm add react@latest react-dom@latest react-router-dom@latest @tanstack/react-query@latest @supabase/supabase-js@latest zod@latest
pnpm add -D typescript@latest vite@latest @vitejs/plugin-react@latest @types/react@latest @types/react-dom@latest eslint@latest @eslint/js@latest typescript-eslint@latest prettier@latest vitest@latest @vitest/coverage-v8@latest jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest @playwright/test@latest tailwindcss@latest @tailwindcss/vite@latest
pnpm pkg set scripts.dev="vite" scripts.build="tsc -b && vite build" scripts.preview="vite preview"
pnpm pkg set scripts.lint="eslint . --max-warnings 0" scripts.format:check="prettier --check ." scripts.typecheck="tsc -b --pretty false"
pnpm pkg set scripts.test="vitest run" scripts.test:coverage="vitest run --coverage" scripts.test:db="bash scripts/test-db.sh"
pnpm pkg set scripts.test:e2e="playwright test" scripts.test:visual="playwright test tests/visual" scripts.acceptance="bash scripts/acceptance/run.sh"
```

`src/app/foundation-root.tsx`:

```tsx
export function FoundationRoot() {
  return (
    <main>
      <h1>ColorPlay</h1>
    </main>
  );
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FoundationRoot } from './app/foundation-root';

const root = document.getElementById('root');
if (!root) throw new Error('APP_ROOT_MISSING');
createRoot(root).render(
  <StrictMode>
    <FoundationRoot />
  </StrictMode>,
);
```

Set `tsconfig.app.json` compiler options to `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, and `useUnknownInCatchVariables: true`. Configure Vitest with `jsdom`, `src/test/setup.ts`, and V8 coverage that includes every production `src/**/*.{ts,tsx}` file while excluding only test, test-support, and type-declaration files. Before adding `src/main.test.tsx`, run `pnpm test:coverage` and confirm the thresholds fail because `src/main.tsx` is uncovered; then add the minimal real bootstrap tests for the successful mount and missing-root error. Configure ESLint flat config for TypeScript type-aware rules and React hooks. Configure Vite with React and Tailwind Vite plugins.

Add a narrowly scoped `.prettierignore` that lists only immutable or out-of-scope governance/spec/legacy inputs and generated `pnpm-lock.yaml`. It must not exclude Task 2 application, configuration, or test source.

- [ ] **Step 4: Run all task verification**

Run:

```bash
pnpm format:check
pnpm test:coverage
bash tests/contracts/toolchain.test.sh && pnpm typecheck && pnpm lint && pnpm test -- src/app/foundation-root.test.tsx && npm run build
```

Expected: all exit 0; Prettier checks every in-scope Task 2 file; coverage includes the application bootstrap and meets the configured thresholds; Vitest reports 2 passed files and 3 passed tests; Vite creates `dist/index.html`; no npm lockfile is created.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml index.html tsconfig*.json vite.config.ts vitest.config.ts eslint.config.js .prettierrc.json .prettierignore src src/main.test.tsx tests/contracts/toolchain.test.sh
git commit -m "build: establish strict React Vite toolchain"
```

### Task 3: Validate public environment and layer the Supabase browser client

**Reviewer gate:** Accept only if invalid/missing browser configuration fails safely and one typed client is created without exposing server credentials.

**Files:**

- Create: `.env.example`
- Create: `src/lib/config/public-env.ts`, `src/lib/config/public-env.test.ts`
- Create: `src/lib/supabase/browser-client.ts`, `src/lib/supabase/browser-client.test.ts`
- Create: `src/types/database.ts`
- Modify: `package.json`, `pnpm-lock.yaml`, `tsconfig.app.json` (Supabase declaration compatibility support)

**Interfaces:**
- Consumes: `import.meta.env` fields `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Produces: `PublicEnv = Readonly<{ supabaseUrl: string; supabaseAnonKey: string }>`; `parsePublicEnv(input: Record<string, unknown>): PublicEnv`; `getBrowserSupabaseClient(env: PublicEnv): SupabaseClient<Database>`.

**Specs / acceptance:** `spec/02-system-architecture.md` sections 2, 7; `spec/04-security-and-privacy.md` sections 1-2; `AC-ENV-004`, `AC-SEC-007` checkpoint.

**Evidence:** unit report and `dist/` secret-scan report at `artifacts/acceptance/phase-1a-task-03/reports/client-secret-scan.txt`.

- [ ] **Step 1: Write failing environment and singleton tests**

```ts
import { describe, expect, it } from 'vitest';
import { parsePublicEnv } from './public-env';

describe('parsePublicEnv', () => {
  it('accepts exactly the browser-safe Supabase inputs', () => {
    expect(parsePublicEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'synthetic-anon-test-key-12345' })).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'synthetic-anon-test-key-12345',
    });
  });

  it('rejects a missing URL with a stable configuration code', () => {
    expect(() => parsePublicEnv({ VITE_SUPABASE_ANON_KEY: 'synthetic-anon-test-key-12345' })).toThrow('APP_CONFIG_INVALID');
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { getBrowserSupabaseClient } from './browser-client';

describe('getBrowserSupabaseClient', () => {
  it('returns the same client for repeated calls', () => {
    const env = { supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: 'synthetic-anon-test-key-12345' } as const;
    expect(getBrowserSupabaseClient(env)).toBe(getBrowserSupabaseClient(env));
  });
});
```

- [ ] **Step 2: Verify the red state**

Run: `pnpm test -- src/lib/config/public-env.test.ts src/lib/supabase/browser-client.test.ts`

Expected: FAIL with module resolution errors for `public-env` and `browser-client`.

- [ ] **Step 3: Implement the minimal validated interface**

`src/lib/config/public-env.ts`:

```ts
import { z } from 'zod';

const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});

export type PublicEnv = Readonly<{ supabaseUrl: string; supabaseAnonKey: string }>;

export function parsePublicEnv(input: Record<string, unknown>): PublicEnv {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) throw new Error('APP_CONFIG_INVALID');
  return { supabaseUrl: result.data.VITE_SUPABASE_URL, supabaseAnonKey: result.data.VITE_SUPABASE_ANON_KEY };
}
```

`src/types/database.ts` accurately represents the Phase 1A schema with no application tables:

```ts
export interface Database {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
```

`src/lib/supabase/browser-client.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';
import type { PublicEnv } from '../config/public-env';

let singleton: SupabaseClient<Database> | undefined;

export function getBrowserSupabaseClient(env: PublicEnv): SupabaseClient<Database> {
  singleton ??= createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  return singleton;
}
```

`.env.example`:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=local-public-anon-key-from-supabase-status
```

The first `npm run build` after importing `@supabase/supabase-js@2.110.2` was an additional build RED. TypeScript 6.0.3 traversed Supabase Auth's declarations and rejected `PublicKeyCredentialFuture<T>.toJSON()` against TypeScript 6's newer DOM declaration. Supabase Storage and Phoenix declarations also reference `Buffer` and `NodeJS`, while the application compiler exposed only `vite/client` ambient types. The minimal compatibility fix is to pin TypeScript exactly to 5.8.3, the compiler line used by the installed Supabase package, and expose the already-installed `node` types alongside `vite/client`. Do not enable `skipLibCheck`, disable strict flags, or suppress diagnostics.

- [ ] **Step 4: Verify tests, build, and bundle scan**

Run:

```bash
pnpm test -- src/lib/config/public-env.test.ts src/lib/supabase/browser-client.test.ts
npm run build
! rg -n 'service_role|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|JWT_SECRET|db_password' dist
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm install --frozen-lockfile
pnpm peers check
pnpm audit --audit-level high
bash tests/contracts/toolchain.test.sh && pnpm typecheck && pnpm lint && pnpm test -- src/app/foundation-root.test.tsx && npm run build
```

Expected: the 3 new assertions pass; all discovered tests and quality gates exit 0; coverage remains above the unchanged thresholds; the build exits 0 without ignored diagnostics; the frozen install, peer check, audit, and original Task 2 GREEN gate pass; the forbidden-pattern search returns no matches.

- [ ] **Step 5: Commit**

```bash
git add .env.example package.json pnpm-lock.yaml tsconfig.app.json docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md src/lib src/types
git commit -m "feat: validate public Supabase configuration"
```

### Task 4: Compose providers, routes, and recovery boundaries

**Reviewer gate:** Accept only if route rendering is deterministic, QueryClient is shared, render failures show a safe recovery UI, and no route guard is mistaken for data authorization.

**Files:**
- Create: `src/app/providers/app-providers.tsx`, `src/app/providers/query-client.ts`
- Create: `src/app/router/create-app-router.tsx`, `src/app/router/route-page.tsx`
- Create: `src/app/boundaries/root-error-boundary.tsx`, `src/app/boundaries/route-loading.tsx`
- Create: `src/app/providers/app-providers.test.tsx`
- Create: `src/app/router/create-app-router.test.tsx`, `src/app/router/route-page.test.tsx`
- Create: `src/app/boundaries/root-error-boundary.test.tsx`, `src/app/boundaries/route-loading.test.tsx`
- Create: `tests/e2e/foundation-routes.spec.ts`, `tests/e2e/task-4-evidence-reporter.ts`
- Create: `playwright.config.ts`
- Modify: `index.html`, `src/main.tsx`, `src/main.test.tsx`, `src/test/setup.ts`, `vitest.config.ts`, `tsconfig.node.json`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient(PublicEnv)` from Task 3.
- Produces: `queryClient: QueryClient`; `AppProviders(props: { children: ReactNode }): JSX.Element`; `createAppRouter(): Router`; `RootErrorBoundary`; `RouteLoading`.

**Specs / acceptance:** `spec/01-user-roles-and-flows.md` sections 1, 5-6; `spec/02-system-architecture.md` section 3; `spec/07-ui-visual-system.md` section 6; `AC-UI-006`, `AC-UI-007` route subset; `AC-LEARN-004` intended-route foundation.

**Evidence:** headed screenshots for `/login`, `/app`, `/unauthorized`, and unknown route; trace at `artifacts/acceptance/phase-1a-task-04/traces/app-router.zip`.

- [ ] **Step 1: Write failing route and error tests**

Also write focused component tests for `AppProviders`/the shared QueryClient,
`RoutePage`, `RouteLoading`, stable error correlation IDs, and retry behavior.
Write `tests/e2e/foundation-routes.spec.ts` before the browser harness exists; it
must visit `/login`, `/app`, `/unauthorized`, and a missing route, reject console
errors, unhandled page errors, failed requests, and HTTP 4xx/5xx responses, and request
four screenshots plus the Task 4 trace.

```tsx
import { RouterProvider } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './create-app-router';

describe('createAppRouter', () => {
  it.each([['/login', '登入'], ['/app', '學習大廳'], ['/unauthorized', '沒有權限']])('renders %s', async (path, heading) => {
    window.history.replaceState({}, '', path);
    render(<RouterProvider router={createAppRouter()} />);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  });
});
```

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RootErrorBoundary } from './root-error-boundary';

describe('RootErrorBoundary', () => {
  it('shows a safe recovery message and tracking code', () => {
    render(<RootErrorBoundary error={new Error('sensitive stack')} reset={() => undefined} />);
    expect(screen.getByRole('heading', { name: '頁面暫時無法顯示' })).toBeVisible();
    expect(screen.queryByText(/sensitive stack/i)).not.toBeInTheDocument();
    expect(screen.getByText(/追蹤代碼/)).toBeVisible();
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
pnpm test -- src/app/router/create-app-router.test.tsx src/app/boundaries/root-error-boundary.test.tsx
pnpm playwright test tests/e2e/foundation-routes.spec.ts --headed --trace on
```

Expected: unit FAIL because router and boundary modules do not exist. Before
`playwright.config.ts` and the Chromium runtime exist, the E2E command must also
record an honest harness RED.

- [ ] **Step 3: Implement minimal route composition**

`src/app/router/route-page.tsx`:

```tsx
export function RoutePage({ heading, message }: Readonly<{ heading: string; message: string }>) {
  return (
    <main data-interaction-group="foundation-route">
      <h1>{heading}</h1>
      <p>{message}</p>
    </main>
  );
}
```

`src/app/router/create-app-router.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom';
import { RoutePage } from './route-page';

export function createAppRouter() {
  return createBrowserRouter([
    { path: '/', element: <RoutePage heading="ColorPlay" message="色彩原理遊戲式學習平台" /> },
    { path: '/login', element: <RoutePage heading="登入" message="使用個人 Email 進入 ColorPlay" /> },
    { path: '/app', element: <RoutePage heading="學習大廳" message="登入後顯示個人學習入口" /> },
    { path: '/unauthorized', element: <RoutePage heading="沒有權限" message="目前帳號無法存取此頁面" /> },
    { path: '*', element: <RoutePage heading="找不到頁面" message="請返回 ColorPlay 首頁" /> },
  ]);
}
```

Implement `AppProviders` with one exported QueryClient and `QueryClientProvider`. Implement `RootErrorBoundary` with an internally generated `crypto.randomUUID()` correlation ID and a visible retry button calling `reset`. Update `main.tsx` to render `AppProviders` plus `RouterProvider`.

Create the minimum Task 4 Playwright harness in `playwright.config.ts`: one
Chromium project, `baseURL` `http://127.0.0.1:4173`, a Vite `webServer` launched
through the existing `dev` script on port 4173, and task-scoped output under
`artifacts/acceptance/phase-1a-task-04`. Exclude Playwright specs from Vitest
discovery and install only the Chromium browser runtime through the project CLI.

- [ ] **Step 4: Verify unit and headed browser behavior**

Run:

```bash
pnpm test -- src/app/router/create-app-router.test.tsx src/app/boundaries/root-error-boundary.test.tsx
pnpm exec vitest run src/app/providers/app-providers.test.tsx src/app/router/route-page.test.tsx src/app/boundaries/route-loading.test.tsx
pnpm playwright test tests/e2e/foundation-routes.spec.ts --headed --trace on
```

Expected: component tests pass; Chromium visits all four routes with no console errors and writes four screenshots plus one trace under the task evidence directory.

- [ ] **Step 5: Commit**

```bash
git add index.html playwright.config.ts vitest.config.ts tsconfig.node.json src/main.tsx src/main.test.tsx src/test/setup.ts src/app tests/e2e docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md
git commit -m "feat: add application providers and route boundaries"
```

### Task 5: Apply the flat-design App shell and accessibility baseline

**Reviewer gate:** Accept only if the shell uses approved tokens, has one primary action per foundation route, passes 320px overflow/touch-target/focus checks, and honors reduced motion.

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/globals.css`
- Create: `src/app/shell/app-shell.tsx`, `src/app/shell/app-shell.test.tsx`
- Modify: `src/app/router/create-app-router.tsx`, `src/app/router/create-app-router.test.tsx`, `src/app/router/route-page.tsx`, `src/app/router/route-page.test.tsx`, `src/main.tsx`
- Create: `tests/e2e/app-shell.visual.spec.ts`, `tests/e2e/accessibility.spec.ts`
- Create after reviewer-approved first render: `tests/e2e/app-shell.visual.spec.ts-snapshots/**`
- Modify: `playwright.config.ts` to add the Task 5 `PLAYWRIGHT_VIDEO=on` recording contract; Task 6 preserves and expands this configuration.
- Modify: `docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md` to replace unsupported Playwright video flags plan-wide.
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: route elements and providers from Task 4.
- Produces: `AppShell(): JSX.Element`; CSS variables from `spec/07`; route outlet layout with header, skip link, main region, and visible focus state.

**Specs / acceptance:** `spec/07-ui-visual-system.md` sections 1-6, 12-14; `spec/11-reference-standards.md` `REF-EDU-UI-001`, `REF-EDU-UI-002`, `REF-EDU-UI-004`, `REF-EDU-UI-005`; `AC-UI-003`, `AC-UI-004`, `AC-UI-005`, `AC-UI-008`, `AC-UI-009`, `AC-UI-013`, `AC-UI-014`, `AC-UI-015` limited to foundation states; `AC-A11Y-001`, `AC-A11Y-004`, `AC-A11Y-005` checkpoints.

**Evidence:** headed screenshots at 320x812, 375x812, 768x1024, 1440x900; reduced-motion trace and task video.

- [ ] **Step 1: Write failing shell and visual contract tests**

```tsx
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('provides a skip link, banner, and main region', () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '跳到主要內容' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });
});
```

```ts
import { expect, test } from '@playwright/test';

test('foundation shell has no horizontal overflow and visible focus', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/login');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要內容' })).toBeFocused();
});
```

The same visual spec must assert every visible `[data-acceptance-target]` has width and height at least 44 CSS pixels and call `expect(page).toHaveScreenshot('login-320.png', { maxDiffPixelRatio: 0.01 })`. `tests/e2e/accessibility.spec.ts` visits every Phase 1 route with `@axe-core/playwright` and asserts the `critical` and `serious` violation arrays are empty.

- [ ] **Step 2: Verify the red state**

Run: `pnpm test -- src/app/shell/app-shell.test.tsx`

Expected: FAIL because `app-shell` does not exist.

- [ ] **Step 3: Implement minimal shell and token styles**

Run: `pnpm add -D @axe-core/playwright@latest lighthouse@latest`

`src/styles/tokens.css` defines exactly the approved color, spacing, radius, typography, and focus variables from `spec/07-ui-visual-system.md` section 2. `src/styles/globals.css` applies border-box sizing, 16px mobile body text, WCAG-safe colors, `min-height: 100dvh`, and reduced-motion rules.

Extend `playwright.config.ts` so `PLAYWRIGHT_VIDEO=on` selects Playwright video mode `on`; otherwise retain video on failure. Do not use the unsupported `--video on` CLI flag. Task 6 owns the later cross-browser acceptance-harness expansion and must preserve this Task 5 recording contract.

`src/app/shell/app-shell.tsx`:

```tsx
import { Link, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要內容</a>
      <header className="app-header">
        <Link className="brand" to="/" aria-label="ColorPlay 首頁">ColorPlay</Link>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
```

Nest the foundation routes under `AppShell`, mark every primary route control with `data-acceptance-target`, and import `tokens.css` then `globals.css` once from `main.tsx`. Generate visual baselines only after a reviewer inspects the headed first render and approves it as the Phase 1A reference.

- [ ] **Step 4: Verify unit, responsive, and headed visual behavior**

Run:

```bash
pnpm test -- src/app/shell/app-shell.test.tsx
PLAYWRIGHT_VIDEO=on pnpm playwright test tests/e2e/app-shell.visual.spec.ts tests/e2e/accessibility.spec.ts --headed --trace on
```

Expected: unit test passes; all four viewport checks pass; tagged controls are at least 44x44; visual diff ratio is at most 0.01; axe has zero critical/serious findings; screenshots show no horizontal overflow, one clear route action, visible focus, flat 2D styling, and no continuous decorative animation.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md playwright.config.ts src/styles src/app/shell src/app/router/create-app-router.tsx src/app/router/create-app-router.test.tsx src/app/router/route-page.tsx src/app/router/route-page.test.tsx src/main.tsx tests/e2e/app-shell.visual.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/app-shell.visual.spec.ts-snapshots package.json pnpm-lock.yaml
git commit -m "feat: add accessible flat-design application shell"
```

### Task 6: Create the Playwright and acceptance evidence harness

**Reviewer gate:** Accept only if a run manifest is deterministic, records Git/browser/viewport/commands, counts all 84 normative IDs, and refuses to label absent evidence as passed.

**Files:**
- Modify/expand: `playwright.config.ts`, preserving Task 5's environment-controlled video policy while adding the Task 6 acceptance harness.
- Create: `scripts/acceptance/create-run.mjs`, `scripts/acceptance/run.sh`
- Create: `scripts/verify/count-acceptance.mjs`
- Create/support: `scripts/acceptance/create-run.d.mts`, `scripts/verify/count-acceptance.d.mts`, providing strict types for the JavaScript CLI modules consumed by the TypeScript contract.
- Create: `tests/contracts/evidence-manifest.test.ts`
- Create: `artifacts/acceptance/.gitkeep`
- Modify/support: `tests/e2e/foundation-routes.spec.ts`, migrating Task 4 browser coverage to standard Playwright fixtures, projects, and configured `baseURL`.
- Modify/support: `.prettierignore`, excluding the Git-ignored `.superpowers/` coordination workspace from repository formatting gates.
- Modify/support: `tsconfig.node.json`, bringing the new TypeScript contract test under strict project-service checks.
- Modify: `DOCUMENT_MANIFEST.json`, `package.json`
- Modify/documentation-only: `docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md`, recording the support file above and the canonical testing-spec path.

**Interfaces:**
- Consumes: Git SHA, dirty state, browser metadata, commands, normative acceptance Markdown.
- Produces: `EvidenceManifest` JSON with `run_id`, `git_sha`, `dirty_worktree`, `app_url`, `supabase_environment`, browser/OS, command exit codes, acceptance entries, timestamps, known failures, and real-device inventory.

**Specs / acceptance (canonical path):** `spec/08-testing-and-evidence.md` sections 5-14; `acceptance/EVIDENCE_TEMPLATE.md`; `AC-UI-001`, `AC-UI-002`, `AC-UI-005`, `AC-UI-007` checkpoints; `AC-DOC-001`, `AC-DOC-003`. Do not create a filename alias for the testing spec.

**Evidence:** a dry run at `artifacts/acceptance/<run-id>/manifest.json` and `summary.md`, with 84 `NOT VERIFIED` entries before feature evidence is attached.

- [ ] **Step 1: Write the failing manifest contract**

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { countAcceptanceIds } from '../../scripts/verify/count-acceptance.mjs';

describe('acceptance metadata', () => {
  it('counts every normative acceptance ID including A11Y', async () => {
    const markdown = await readFile('acceptance/ACCEPTANCE_CRITERIA.md', 'utf8');
    expect(countAcceptanceIds(markdown)).toHaveLength(84);
  });

  it('keeps the package manifest count synchronized', async () => {
    const manifest = JSON.parse(await readFile('DOCUMENT_MANIFEST.json', 'utf8')) as { acceptance_criteria: number; unique_acceptance_criteria: number };
    expect(manifest).toMatchObject({ acceptance_criteria: 84, unique_acceptance_criteria: 84 });
  });
});
```

- [ ] **Step 2: Verify the intended failure**

Run: `pnpm test -- tests/contracts/evidence-manifest.test.ts`

Expected: FAIL because the counter module is missing and the current manifest reports 78.

- [ ] **Step 3: Implement the counter and evidence run skeleton**

`scripts/verify/count-acceptance.mjs`:

```js
export function countAcceptanceIds(markdown) {
  return [...new Set(markdown.match(/^## AC-[A-Z0-9]+-[0-9]{3}/gm)?.map((heading) => heading.slice(3)) ?? [])].sort();
}
```

`create-run.mjs` reads the 84 IDs, creates the standard directory tree, writes every ID with status `NOT VERIFIED`, and records the current SHA/dirty state without including environment values. Update both acceptance counts in `DOCUMENT_MANIFEST.json` to 84. Expand the Task 5 Playwright configuration while preserving its `PLAYWRIGHT_VIDEO=on` behavior, adding screenshot on failure, trace on first retry plus explicit acceptance trace mode, video retention for acceptance flows, and projects for Chromium, Firefox, and WebKit.

- [ ] **Step 4: Verify pass and artifact honesty**

Run: `pnpm test -- tests/contracts/evidence-manifest.test.ts && node scripts/acceptance/create-run.mjs --environment local --app-url http://127.0.0.1:4173`

Expected: tests pass; a run directory contains 84 entries, all initially `NOT VERIFIED`; no token, anon key, service key, password, or email value appears in its files.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md playwright.config.ts scripts/acceptance scripts/verify tests/contracts/evidence-manifest.test.ts tests/e2e/foundation-routes.spec.ts artifacts/acceptance/.gitkeep DOCUMENT_MANIFEST.json package.json pnpm-lock.yaml
git commit -m "test: add honest acceptance evidence harness"
```

### Task 7: Start and verify the real Supabase local stack

**Reviewer gate:** Accept only if the checked-in config starts real local Auth/PostgreSQL/Storage, health checks pass without ignoring health, and evidence contains no keys.

**Files:**
- Create: `supabase/config.toml`, `supabase/seed.sql`
- Create: `scripts/test-db.sh`
- Create: `tests/contracts/supabase-local.test.sh`
- Create: `tests/integration/supabase-health.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml`, `tsconfig.node.json`

**Interfaces:**
- Consumes: Docker, Supabase CLI, ports defined in `supabase/config.toml`.
- Produces: `LocalSupabaseRuntime` at API `http://127.0.0.1:54321` and DB `54322`; real Auth health endpoint; `pnpm test:db` command; typed integration-test ownership through the Node TypeScript project.

**Specs / acceptance:** `spec/02-system-architecture.md` section 6; `spec/03-data-model-and-rls.md` section 9; `spec/08-testing-and-evidence.md` section 2; `spec/11-reference-standards.md` Supabase local-development rule; `AC-ENV-002` stack/reset checkpoint.

**Evidence:** sanitized status plus Auth health JSON at `artifacts/acceptance/phase-1a-task-07/reports/`; Docker container health summary.

- [ ] **Step 1: Write the failing local-stack contract**

```bash
#!/usr/bin/env bash
set -euo pipefail
test -f supabase/config.toml
rg -q '^project_id = "colorplay"$' supabase/config.toml
pnpm exec supabase start
curl --fail --silent http://127.0.0.1:54321/auth/v1/health | rg -q 'GoTrue'
pnpm exec supabase db reset --local
```

- [ ] **Step 2: Verify failure before configuration exists**

Run: `bash tests/contracts/supabase-local.test.sh`

Expected: non-zero with `supabase/config.toml` missing.

- [ ] **Step 3: Add the minimum local backend configuration**

Run:

```bash
pnpm add -D supabase@latest
pnpm exec supabase init
```

Set `project_id = "colorplay"`, API port `54321`, DB port `54322`, Studio port `54323`, Inbucket port `54324`, Auth site URL `http://127.0.0.1:4173`, and additional redirect URL `http://127.0.0.1:4173/**`. Keep `supabase/seed.sql` transactional and empty of product records in Phase 1A. Implement `scripts/test-db.sh` to start Supabase, reset local DB, run `supabase test db`, and exit non-zero on any failure.

- [ ] **Step 4: Verify real local services**

Run:

```bash
bash tests/contracts/supabase-local.test.sh
pnpm test:db
curl --fail --silent http://127.0.0.1:54321/auth/v1/health > artifacts/acceptance/phase-1a-task-07/reports/auth-health.json
```

Expected: Supabase reports healthy containers; reset succeeds from empty DB; Auth health returns HTTP 200; no credential is written to evidence.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/seed.sql scripts/test-db.sh tests/contracts/supabase-local.test.sh tests/integration/supabase-health.test.ts package.json pnpm-lock.yaml
git commit -m "build: add real Supabase local runtime"
```

### Task 8: Add CI, Vercel build settings, and SPA fallback contracts

**Reviewer gate:** Accept only if CI exercises the foundation from a clean install and `vercel.json` preserves deep links with the exact approved build/output settings.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `vercel.json`
- Create: `tests/contracts/delivery-config.test.ts`
- Create: `tests/e2e/spa-deep-link.spec.ts`
- Create/generated: `tests/e2e/app-shell.visual.spec.ts-snapshots/login-320x812-chromium-linux.png`
- Create/generated: `tests/e2e/app-shell.visual.spec.ts-snapshots/login-375x812-chromium-linux.png`
- Create/generated: `tests/e2e/app-shell.visual.spec.ts-snapshots/login-768x1024-chromium-linux.png`
- Create/generated: `tests/e2e/app-shell.visual.spec.ts-snapshots/login-1440x900-chromium-linux.png`
- Create: `docs/deployment/vercel.md`
- Modify/support: `playwright.config.ts`, using an explicit `PLAYWRIGHT_BASE_URL` without starting the development server so deep-link evidence can target the built preview.
- Modify/support: `tests/contracts/evidence-manifest.test.ts`, starting one explicit local Vite server for retention integration runs that intentionally supply an external base URL.

**Interfaces:**
- Consumes: pnpm scripts, Supabase local config, Vite build, GitHub commit.
- Produces: `DeliveryConfig = { buildCommand: 'npm run build'; outputDirectory: 'dist'; rewrite: '/(.*)' -> '/index.html' }`; required GitHub check `foundation-ci`.

**Specs / acceptance:** `spec/02-system-architecture.md` sections 6-7; `spec/08-testing-and-evidence.md`; `spec/09-nonfunctional-requirements.md` sections 2, 9-10; `spec/11-reference-standards.md` official-source and version rules; `AC-ENV-001`, `AC-ENV-003` configuration checkpoint, `AC-SEC-006` checkpoint, `AC-COMPAT-001` foundation smoke, `AC-LEARN-004` deep-link foundation.

**Evidence:** CI log, headed deep-link screenshots/trace for `/login`, `/app`, `/unauthorized`; delivery config test report.

- [ ] **Step 1: Write the failing delivery contract**

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('delivery configuration', () => {
  it('uses the approved Vercel Vite SPA settings', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as Record<string, unknown>;
    expect(config).toMatchObject({
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      rewrites: [{ source: '/(.*)', destination: '/index.html' }],
    });
  });

  it('runs frozen install, quality, build, DB, and browser jobs', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    for (const command of ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm typecheck', 'pnpm test:coverage', 'npm run build', 'pnpm test:db', 'pnpm test:e2e']) {
      expect(workflow).toContain(command);
    }
  });
});
```

- [ ] **Step 2: Verify the red state**

Run: `pnpm test -- tests/contracts/delivery-config.test.ts`

Expected: FAIL because `vercel.json` and CI workflow do not exist.

- [ ] **Step 3: Implement exact delivery configuration**

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Create `ci.yml` with Node setup, pnpm setup using `packageManager`, frozen install, lint, format check, typecheck, coverage, build, Supabase start/reset/DB tests, and Chromium E2E. Upload reports/traces only after secret scanning. Document `main` production behavior, Preview behavior, environment separation, and the two allowed browser variables in `docs/deployment/vercel.md`.

- [ ] **Step 4: Verify config and headed deep links**

Run:

```bash
pnpm test -- tests/contracts/delivery-config.test.ts
npm run build
pnpm preview --host 127.0.0.1 > /tmp/colorplay-vite-preview.log 2>&1 &
PREVIEW_PID=$!
trap 'kill "$PREVIEW_PID"' EXIT
pnpm playwright test tests/e2e/spa-deep-link.spec.ts --headed --trace on
```

Expected: contract tests pass; direct navigation and refresh of all three non-root routes return the React application with no 404; Chromium/Firefox/WebKit foundation smoke passes locally.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml vercel.json tests/contracts/delivery-config.test.ts tests/e2e/spa-deep-link.spec.ts docs/deployment/vercel.md
git commit -m "ci: enforce foundation and Vercel delivery contracts"
```

## Phase 1B — Real Supabase Auth/Profile Vertical Slice

### Task 9: Add the profiles schema, grants, RLS, SQL tests, and generated types

**Reviewer gate:** Accept only if an empty local reset creates profiles safely, users can read/update only permitted own columns, role escalation and cross-user access fail, and generated TypeScript matches the schema.

**Files:**
- Create: `supabase/migrations/20260713000100_create_profiles.sql`
- Create: `supabase/tests/001_profiles_rls.test.sql`
- Replace generated: `src/types/database.ts`
- Create: `tests/contracts/database-types.test.sh`
- Modify: `scripts/test-db.sh` (keep the Task 7 runtime smoke phase-neutral and run permanent pgTAP files)
- Modify: `eslint.config.js`, `.prettierignore` (exclude only the exact generated DB type file from authored-source style gates)
- Modify: `.gitattributes` (accept the pinned generator's terminal whitespace for only the generated DB type file)

**Interfaces:**
- Consumes: Supabase local runtime from Task 7; authenticated JWT `sub`.
- Produces: `public.app_role = 'student' | 'teacher' | 'admin'`; `public.profiles(id, display_name, role, timezone, created_at, updated_at)`; generated `Database`; safe own-profile SELECT and limited own UPDATE.

**Specs / acceptance:** `spec/03-data-model-and-rls.md` sections 1-5, 7; `spec/04-security-and-privacy.md` sections 3-4; `AC-ENV-002` migration/reset checkpoint, `AC-AUTH-004`, `AC-SEC-003`, `AC-DOC-002`.

**Evidence:** `artifacts/acceptance/phase-1b-task-09/db/profiles-rls.tap`, schema/type diff report, reset log.

- [ ] **Step 1: Write the failing SQL and type contracts**

`supabase/tests/001_profiles_rls.test.sql`:

```sql
begin;
select plan(8);
select has_table('public', 'profiles', 'profiles exists');
select has_column('public', 'profiles', 'role', 'profiles.role exists');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls.one@colorplay.test', crypt('LocalOnly-Rls1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rls.two@colorplay.test', crypt('LocalOnly-Rls2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.profiles), 1, 'student reads only own profile');
select lives_ok($$update public.profiles set display_name = '學生一' where id = '10000000-0000-0000-0000-000000000001'$$, 'student updates own display name');
select throws_ok($$update public.profiles set role = 'teacher' where id = '10000000-0000-0000-0000-000000000001'$$, '42501', null, 'student cannot update role');
select is((select count(*)::integer from public.profiles where id = '10000000-0000-0000-0000-000000000002'), 0, 'student cannot read another profile');
select results_eq($$with changed as (update public.profiles set display_name = '越權' where id = '10000000-0000-0000-0000-000000000002' returning 1) select count(*)::integer from changed$$, array[0], 'student cannot update another profile');
select throws_ok($$delete from public.profiles where id = '10000000-0000-0000-0000-000000000002'$$, '42501', null, 'student has no delete privilege');
select * from finish();
rollback;
```

`tests/contracts/database-types.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
pnpm exec supabase gen types typescript --local > "$tmp"
diff -u src/types/database.ts "$tmp"
```

- [ ] **Step 2: Verify database tests fail**

Run: `pnpm exec supabase db reset --local && pnpm exec supabase test db`

Expected: FAIL at `has_table` because `public.profiles` does not exist.

- [ ] **Step 3: Implement the minimal migration**

```sql
create type public.app_role as enum ('student', 'teacher', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  role public.app_role not null default 'student',
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
for select to authenticated using (id = auth.uid());

create policy profiles_update_own on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(
        left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 30),
        ''
      ),
      'ColorPlay 使用者'
    )
  );
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create index profiles_role_idx on public.profiles(role);
```

Reset local DB, generate the exact type file, and do not hand-edit it:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase gen types typescript --local > src/types/database.ts
```

Update the Task 7 runtime smoke to assert PostgreSQL availability instead of the superseded Phase 1A zero-product-table state, and make `pnpm test:db` run both permanent pgTAP files and the ephemeral runtime smoke.

Keep `src/types/database.ts` compiled by TypeScript and protected by the exact CLI diff contract, but exclude that exact generated file from ESLint and Prettier authored-source style checks. Do not ignore the surrounding directory or suppress individual rules.

Configure Git whitespace handling for only `src/types/database.ts` so the pinned generator's terminal blank line remains byte-exact without making the repository whitespace gate red.

- [ ] **Step 4: Verify migration, RLS, and generated types**

Run: `pnpm exec supabase test db | tee artifacts/acceptance/phase-1b-task-09/db/profiles-rls.tap && bash tests/contracts/database-types.test.sh && pnpm typecheck && pnpm test:db`

Expected: pgTAP reports 8 successful assertions; cross-user read/update, delete, and role escalation attempts fail as specified; generated type diff is empty; typecheck and the phase-neutral Task 7 database runtime gate exit 0.

- [ ] **Step 5: Commit**

```bash
git add .gitattributes .prettierignore docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md eslint.config.js scripts/test-db.sh supabase/migrations/20260713000100_create_profiles.sql supabase/tests/001_profiles_rls.test.sql src/types/database.ts tests/contracts/database-types.test.sh
git commit -m "feat: add profile schema and RLS"
```

### Task 10: Seed deterministic local Auth identities through the real Admin API

**Reviewer gate:** Accept only if local reset plus seed produces teacher, two students, and outsider accounts that can sign in through GoTrue, with no service key committed or logged.

**Files:**
- Create: `tests/contracts/test-boundaries.test.ts`
- Create: `tests/fixtures/users.ts`
- Create: `scripts/supabase/local-environment.ts`
- Create: `scripts/supabase/seed-auth.ts`
- Create: `tests/integration/auth-fixtures.test.ts`
- Create: `vitest.integration.config.ts`
- Create: `supabase/migrations/20260714000100_grant_controlled_profile_role_admin.sql`
- Create: `supabase/tests/002_profiles_service_role.test.sql`
- Create: `pnpm-workspace.yaml`
- Modify: `vitest.config.ts`, `tsconfig.node.json`, `scripts/test-db.sh`, `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md`

**Interfaces:**
- Consumes: local `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and process-only `SUPABASE_SERVICE_ROLE_KEY` read from `supabase status -o env` through a strict `API_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY` allowlist without echoing, redirecting, or persisting status output.
- Produces: `TEST_USERS` with the four approved local-only email/password records; separate `TEST_USER_ROLES` with teacher=`teacher` and the remaining fixtures=`student`; validated `LocalAdminEnvironment`; idempotent `seedAuthUsers(): Promise<void>`; real Auth sessions and own-profile RLS reads.
- Test boundary: `pnpm test` and `pnpm test:coverage` use `vitest.config.ts` and exclude `tests/integration/**` plus `**/*.integration.test.*`; `pnpm test:integration` uses Node-only `vitest.integration.config.ts` and includes both `tests/integration/**/*.test.ts` and future `src/**/*.integration.test.{ts,tsx}`.

**Specs / acceptance:** `spec/03-data-model-and-rls.md` section 9; `spec/04-security-and-privacy.md` sections 2-3; `AC-ENV-002` identity-seed checkpoint, `AC-AUTH-001`, `AC-ENV-004`.

**Evidence:** sanitized account count and sign-in HTTP status report; bundle scan proving fixture passwords and service key are absent from `dist`.

- [ ] **Step 1: Write and prove the failing test-boundary contract**

`tests/contracts/test-boundaries.test.ts` asserts the unit/coverage commands contain no one-off integration exclusion, the unit config excludes both integration patterns, the explicit integration script/config exists with Node environment and both include patterns, and `tsconfig.node.json` owns scripts, fixtures, and both Vitest configs.

Run: `pnpm exec vitest run tests/contracts/test-boundaries.test.ts`

Expected before the config change: two failures because the health test is special-cased in the unit scripts and the separate integration command/config do not exist.

- [ ] **Step 2: Establish separate unit and real-stack Vitest ownership**

Create `vitest.integration.config.ts`; generalize `vitest.config.ts` exclusions; set `test`, `test:coverage`, and `test:integration` to the exact commands in the interface; add all authored support files to `tsconfig.node.json`; and clarify the workflow step names so coverage is visibly stack-independent while `test:db` owns seeded real-stack integration.

Install exactly `tsx@4.23.0`. Record only the required `esbuild: true` lifecycle-script approval in `pnpm-workspace.yaml`; do not approve package scripts broadly.

Run: `pnpm exec vitest run tests/contracts/test-boundaries.test.ts`

Expected: two passing tests.

- [ ] **Step 3: Write the failing real-Auth integration test**

```ts
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { TEST_USERS } from '../fixtures/users';

describe('local Auth fixtures', () => {
  it.each(['teacher', 'studentOne', 'studentTwo', 'outsider'] as const)(
    'signs in fixture %s through real GoTrue and reads its own role',
    async (label) => {
      const { url, anonKey } = readValidatedLocalPublicEnvironment(process.env);
      const client = createClient<Database>(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: createStatusTrackingFetch(label) },
      });
      const { data, error } = await client.auth.signInWithPassword(TEST_USERS[label]);
      expect(error === null).toBe(true);
      expect(data.user !== null).toBe(true);
      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id, role')
        .single();
      expect(profileError === null).toBe(true);
      expect(profile?.id).toBe(data.user?.id);
      expect(profile?.role).toBe(TEST_USER_ROLES[label]);
      await client.auth.signOut();
    },
  );
});
```

`tests/fixtures/users.ts` exports exactly:

```ts
export const TEST_USERS = {
  teacher: { email: 'teacher@colorplay.test', password: 'LocalOnly-Teacher1!' },
  studentOne: { email: 'student.one@colorplay.test', password: 'LocalOnly-Student1!' },
  studentTwo: { email: 'student.two@colorplay.test', password: 'LocalOnly-Student2!' },
  outsider: { email: 'outsider@colorplay.test', password: 'LocalOnly-Outsider1!' },
} as const;
```

Keep the role mapping separate so the approved `TEST_USERS` shape remains exact. Test titles and evidence use fixture labels only; evidence records count, HTTP status, and verified-role count without email, password, user ID, key, or environment value.

- [ ] **Step 4: Verify four real GoTrue sign-ins fail before seeding**

Reset the real local database, load only the validated public URL/anon values in process without printing status output, then run:

`pnpm exec vitest run --config vitest.integration.config.ts tests/integration/auth-fixtures.test.ts`

Expected: exactly four label-only failures at the sign-in assertion after real GoTrue returns invalid credentials. Missing-environment failures do not qualify.

- [ ] **Step 5: Implement controlled and idempotent Admin API seeding**

`readLocalAdminEnvironment(process.env)` accepts only the exact local API URL and a non-empty key with the expected safe character set. The Admin client disables session persistence/refresh. It paginates `listUsers`, creates a missing fixture or resets an existing fixture's local password/confirmation, then updates the trigger-created `profiles.role` to `TEST_USER_ROLES[label]`. All failures throw stable codes only; never serialize the client, request options, response payload, or key.

Add a pgTAP RED proving `service_role` initially lacks the profile privileges required by the Admin client. Add the narrow migration granting table `SELECT` and column-only `UPDATE(role)`; keep direct profile `INSERT` and `DELETE` denied. The migration changes grants only, so the pinned generated `Database` type must remain byte-exact.

Update `scripts/test-db.sh` to strictly parse only the three allowed status assignments in process, validate the exact local URL and safe key characters, seed, immediately unset the service value on success or EXIT, run permanent/runtime pgTAP, and finally run `pnpm test:integration`. Never echo, redirect, log, or save `supabase status -o env`.

- [ ] **Step 6: Verify first seed, second seed, roles, and bundle secrecy**

Run:

```bash
pnpm test:db
bash tests/contracts/database-types.test.sh
npm run build
! rg -n 'LocalOnly-|service_role|SUPABASE_SERVICE_ROLE_KEY' dist
```

Repeat the same strict allowlist -> seed -> immediate service-value unset sequence once without resetting. Query count/role aggregates only (never identity values). Expected after each seed: exactly four matching Auth identities, four trigger-created profiles, three students, one teacher, four successful anon sign-ins, four own-profile RLS role matches, and no duplicate row. The generated-type diff and bundle scan are empty.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md package.json pnpm-lock.yaml pnpm-workspace.yaml scripts/supabase scripts/test-db.sh supabase/migrations/20260714000100_grant_controlled_profile_role_admin.sql supabase/tests/002_profiles_service_role.test.sql tests/contracts/test-boundaries.test.ts tests/fixtures/users.ts tests/integration/auth-fixtures.test.ts tsconfig.node.json vitest.config.ts vitest.integration.config.ts
git commit -m "test: seed real local Auth identities"
```

### Task 11: Implement the typed Auth repository against Supabase

**Reviewer gate:** Accept only if the repository maps real Supabase sessions to a minimal public type, maps invalid credentials to a stable code, and signs out without retaining a session.

**Files:**
- Create: `src/features/auth/types.ts`
- Create: `src/features/auth/api/auth-repository.ts`
- Create: `src/features/auth/api/auth-repository.integration.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient<Database>` and Email/password credentials.
- Produces: `AuthSession = Readonly<{ userId: string; email: string }>`; `SignInInput`; `AuthErrorCode`; `AuthRepository` methods `signIn`, `signOut`, `getSession`, `onAuthStateChange`.

**Specs / acceptance:** `spec/01-user-roles-and-flows.md` AUTH-Flow-01; `spec/04-security-and-privacy.md` section 3; `AC-AUTH-001`, `AC-AUTH-002`, `AC-AUTH-003` repository checkpoints.

**Evidence:** real local Auth network report with response bodies redacted to schema/key names and HTTP statuses.

- [ ] **Step 1: Write the failing repository integration test**

```ts
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../../types/database';
import { TEST_USERS } from '../../../../tests/fixtures/users';
import { createAuthRepository } from './auth-repository';

describe('AuthRepository with local Supabase', () => {
  it('signs in, returns a minimal session, and signs out', async () => {
    const client = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const repository = createAuthRepository(client);
    const session = await repository.signIn(TEST_USERS.studentOne);
    expect(session.email).toBe(TEST_USERS.studentOne.email);
    await repository.signOut();
    expect(await repository.getSession()).toBeNull();
  });

  it('maps invalid credentials to AUTH_INVALID_CREDENTIALS', async () => {
    const client = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    await expect(createAuthRepository(client).signIn({ email: 'student.one@colorplay.test', password: 'wrong-value' })).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });
});
```

- [ ] **Step 2: Verify the red state**

Run: `pnpm test:integration src/features/auth/api/auth-repository.integration.test.ts`

Expected: FAIL because `createAuthRepository` does not exist.

- [ ] **Step 3: Implement the minimal repository contract**

```ts
export type SignInInput = Readonly<{ email: string; password: string }>;
export type AuthSession = Readonly<{ userId: string; email: string }>;
export type AuthErrorCode = 'AUTH_INVALID_CREDENTIALS' | 'AUTH_NETWORK' | 'AUTH_UNKNOWN';
export class AuthRepositoryError extends Error {
  constructor(public readonly code: AuthErrorCode) { super(code); }
}
export type AuthStateListener = (session: AuthSession | null) => void;
export interface AuthRepository {
  signIn(input: SignInInput): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  onAuthStateChange(listener: AuthStateListener): () => void;
}
```

Implement `createAuthRepository(client)` with Supabase `signInWithPassword`, `signOut`, `getSession`, and `onAuthStateChange`. Map only the known invalid-credentials error to `AUTH_INVALID_CREDENTIALS`; map fetch/network failures to `AUTH_NETWORK`; use `AUTH_UNKNOWN` for safe fallback. Return only user ID and email.

- [ ] **Step 4: Verify real integration**

Run: `pnpm test:integration src/features/auth/api/auth-repository.integration.test.ts && pnpm typecheck`

Expected: both integration tests pass against local GoTrue and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/types.ts src/features/auth/api
git commit -m "feat: add typed Supabase Auth repository"
```

### Task 12: Add Auth context, bootstrap loading, and the authenticated-route guard

**Reviewer gate:** Accept only if bootstrap has a visible loading state, unauthenticated access preserves the intended route, authenticated access renders the protected outlet, and the guard is documented as UX rather than authorization.

**Files:**
- Create: `src/features/auth/context/auth-context.tsx`
- Create: `src/features/auth/context/auth-context.test.tsx`
- Create: `src/features/auth/components/require-auth.tsx`
- Create: `src/features/auth/components/require-auth.test.tsx`
- Create: `src/features/auth/components/auth-bootstrap.tsx`
- Modify: `src/app/providers/app-providers.tsx`, `src/app/router/create-app-router.tsx`
- Create: `tests/e2e/auth-guards.spec.ts`

**Interfaces:**
- Consumes: `AuthRepository`, `AuthSession` from Task 11.
- Produces: `AuthContextValue = { status: 'loading' | 'anonymous' | 'authenticated'; session: AuthSession | null; signIn(input): Promise<void>; signOut(): Promise<void> }`; `useAuth()`; `RequireAuth`.

**Specs / acceptance:** `spec/01-user-roles-and-flows.md` sections 1, 5-6; `spec/04-security-and-privacy.md` section 4; `AC-AUTH-001`, `AC-AUTH-003`, `AC-UI-006` Auth loading state.

**Evidence:** headed route sequence showing loading -> login redirect with the intended `/app` path retained; authenticated protected-outlet screenshot; trace.

- [ ] **Step 1: Write failing context and guard tests**

```tsx
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthContext } from '../context/auth-context';
import { RequireAuth } from './require-auth';

describe('RequireAuth', () => {
  it('redirects an anonymous user and preserves the intended path', async () => {
    const value = { status: 'anonymous', session: null, signIn: async () => undefined, signOut: async () => undefined } as const;
    render(
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route path="/login" element={<h1>登入</h1>} />
            <Route element={<RequireAuth />}><Route path="/app" element={<h1>學習大廳</h1>} /></Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Verify the red state**

Run: `pnpm test -- src/features/auth/context/auth-context.test.tsx src/features/auth/components/require-auth.test.tsx`

Expected: FAIL because Auth context and guards do not exist.

- [ ] **Step 3: Implement minimal bootstrap and guards**

`RequireAuth` returns `RouteLoading` while status is loading, redirects anonymous users with `state={{ from: location }}`, and renders `<Outlet />` when authenticated. `AuthBootstrap` subscribes once, cleans up the listener, and never stores formal profile or role state in localStorage.

- [ ] **Step 4: Verify unit and headed guard sequences**

Run: `pnpm test -- src/features/auth/context src/features/auth/components && pnpm playwright test tests/e2e/auth-guards.spec.ts --headed --trace on`

Expected: context/guard tests pass; headed sequence shows visible loading, preserves the intended route, renders the outlet after real local sign-in, and has no console error.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/context src/features/auth/components src/app/providers/app-providers.tsx src/app/router/create-app-router.tsx tests/e2e/auth-guards.spec.ts
git commit -m "feat: add Auth bootstrap and route guards"
```

### Task 13: Build the accessible Email/password login flow

**Reviewer gate:** Accept only if the form uses visible labels, one primary action, stable Traditional Chinese errors, pending lock, keyboard-safe layout, and real local Auth.

**Files:**
- Create: `src/features/auth/schemas/sign-in-schema.ts`
- Create: `src/features/auth/pages/login-page.tsx`, `src/features/auth/pages/login-page.test.tsx`
- Modify: `src/app/router/create-app-router.tsx`
- Create: `tests/e2e/login.spec.ts`
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `useAuth().signIn(SignInInput)` and preserved `location.state.from`.
- Produces: `SignInValues = { email: string; password: string }`; accessible `/login` UI; navigation to intended route after authoritative Auth success.

**Specs / acceptance:** `spec/01-user-roles-and-flows.md` AUTH-Flow-01; `spec/07-ui-visual-system.md` UI-ACTION, UI-MAP, UI-KBD, UI-STATE; `AC-AUTH-001`, `AC-AUTH-002`, `AC-UI-009`, `AC-UI-010` automated checkpoint, `AC-UI-015`, `AC-A11Y-002` login subset.

**Evidence:** 375x812, 768x1024, 1440x900 headed screenshots; invalid-login sequence; pending screenshot; trace and video; no real-device PASS claim.

- [ ] **Step 1: Write the failing component behavior test**

```tsx
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  it('groups labeled inputs and one primary submit action', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('密碼')).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: '登入' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: '登入' }));
    expect(await screen.findByText('請輸入有效的 Email')).toBeVisible();
  });
});
```

- [ ] **Step 2: Verify the red state**

Run: `pnpm test -- src/features/auth/pages/login-page.test.tsx`

Expected: FAIL because `LoginPage` does not exist.

- [ ] **Step 3: Implement the minimal form**

Run: `pnpm add react-hook-form@latest @hookform/resolvers@latest`

Define a Zod schema requiring a valid Email and password length 8-128. Implement a semantic `<form data-interaction-group="login">` with visible labels, contextual errors linked by `aria-describedby`, one submit button, `aria-live` status, and disabled/pending lock. Map repository codes to: `AUTH_INVALID_CREDENTIALS` -> `Email 或密碼不正確`; `AUTH_NETWORK` -> `網路連線失敗，請稍後重試`; fallback -> `登入失敗，請使用追蹤代碼回報`. Do not render raw Supabase messages.

- [ ] **Step 4: Verify component and real browser behavior**

Run:

```bash
pnpm test -- src/features/auth/pages/login-page.test.tsx
PLAYWRIGHT_VIDEO=on pnpm playwright test tests/e2e/login.spec.ts --headed --trace on
```

Expected: component tests pass; invalid credentials keep the user anonymous with a Traditional Chinese error; one valid local student flow uses only Tab/Shift+Tab/Enter and navigates to `/app`; one request is sent while pending; focus remains visible; three viewport screenshots, video, and trace are written.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/schemas src/features/auth/pages src/app/router/create-app-router.tsx tests/e2e/login.spec.ts package.json pnpm-lock.yaml
git commit -m "feat: add accessible Email password login"
```

### Task 14: Deliver the safe own-profile vertical slice and role navigation

**Reviewer gate:** Accept only if the logged-in user sees their real DB profile, cannot read or mutate another profile, cannot change role, and navigation derives from authoritative profile role.

**Files:**
- Create: `src/features/profile/types.ts`
- Create: `src/features/profile/api/profile-repository.ts`
- Create: `src/features/profile/api/profile-repository.integration.test.ts`
- Create: `src/features/profile/hooks/use-my-profile.ts`
- Create: `src/features/profile/components/profile-summary.tsx`, `src/features/profile/components/profile-summary.test.tsx`
- Create: `src/features/profile/pages/profile-foundation-page.tsx`
- Create: `src/features/auth/components/require-role.tsx`, `src/features/auth/components/require-role.test.tsx`
- Modify: `src/app/router/create-app-router.tsx`, `src/app/shell/app-shell.tsx`
- Create: `tests/helpers/signed-in-client.ts`
- Create: `tests/e2e/profile-vertical-slice.spec.ts`

**Interfaces:**
- Consumes: authenticated Supabase client and generated `Database`.
- Produces: `SafeProfile = Readonly<{ id: string; displayName: string; role: 'student' | 'teacher' | 'admin'; timezone: string }>`; `getMyProfile(): Promise<SafeProfile>`; Query key `['profile', 'me']`; `RequireRole({ allowed: readonly SafeProfile['role'][] })`; profile UI and role-aware navigation.

**Specs / acceptance:** `spec/01-user-roles-and-flows.md` sections 2, 5; `spec/03-data-model-and-rls.md` sections 2-5; `spec/04-security-and-privacy.md` section 4; `AC-AUTH-001`, `AC-AUTH-004`, `AC-AUTH-005` UI route checkpoint, `AC-SEC-003`, `AC-DOC-002`.

**Evidence:** headed login -> `/app` profile sequence; DB/RLS report; network response showing only safe profile fields; screenshot/trace/video.

- [ ] **Step 1: Write failing real repository and component tests**

```ts
import { describe, expect, it } from 'vitest';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { TEST_USERS } from '../../../../tests/fixtures/users';
import { createProfileRepository } from './profile-repository';

describe('ProfileRepository with RLS', () => {
  it('returns only the signed-in profile', async () => {
    const client = await signedInClient(TEST_USERS.studentOne);
    const profile = await createProfileRepository(client).getMyProfile();
    expect(profile.role).toBe('student');
    expect(profile.displayName).toBe('student.one');
  });

  it('cannot update role directly', async () => {
    const client = await signedInClient(TEST_USERS.studentOne);
    const { error } = await client.from('profiles').update({ role: 'teacher' }).eq('id', (await client.auth.getUser()).data.user!.id);
    expect(error).not.toBeNull();
  });
});
```

`src/features/auth/components/require-role.test.tsx` sets the profile hook result to a student, renders a `/teacher` child under `<RequireRole allowed={['teacher']} />`, and asserts that the router renders `/unauthorized` instead of the teacher child. It also asserts a pending profile query renders `RouteLoading`.

- [ ] **Step 2: Verify the red state**

Run: `pnpm test:integration src/features/profile/api/profile-repository.integration.test.ts && pnpm test -- src/features/auth/components/require-role.test.tsx`

Expected: FAIL because the profile repository, signed-in helper, and `RequireRole` do not exist.

- [ ] **Step 3: Implement the minimal profile read model**

```ts
export type SafeProfile = Readonly<{
  id: string;
  displayName: string;
  role: 'student' | 'teacher' | 'admin';
  timezone: string;
}>;
```

Implement `getMyProfile()` using `.from('profiles').select('id, display_name, role, timezone').single()` and map snake_case once at the repository boundary. `useMyProfile` uses TanStack Query with key `['profile', 'me']` and disables retries for authorization errors. `ProfileSummary` renders display name and role text; it does not render Email. `RequireRole` waits for the authoritative profile query, shows loading while unresolved, renders `<Outlet />` for an allowed role, and redirects a mismatch to `/unauthorized`; it is a UX boundary and never replaces RLS. `AppShell` shows teacher navigation only for the authoritative `teacher` role. The `/app` route renders `ProfileFoundationPage` with loading, inline error/retry, and profile states; the protected `/teacher` foundation route uses `RequireRole`.

- [ ] **Step 4: Verify real UI, DB denial, and payload shape**

Run:

```bash
pnpm test:integration src/features/profile/api/profile-repository.integration.test.ts
pnpm test -- src/features/profile/components/profile-summary.test.tsx
pnpm test -- src/features/auth/components/require-role.test.tsx
pnpm exec supabase test db
PLAYWRIGHT_VIDEO=on pnpm playwright test tests/e2e/profile-vertical-slice.spec.ts --headed --trace on
```

Expected: own profile renders from PostgreSQL; cross-user SELECT and permitted-column UPDATE each affect zero rows, DELETE is rejected by grants, and role update is rejected; student UI has no teacher link and direct `/teacher` access reaches `/unauthorized`; network artifact has no other profile or secret fields.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile src/features/auth/components/require-role.tsx src/features/auth/components/require-role.test.tsx src/app/router/create-app-router.tsx src/app/shell/app-shell.tsx tests/helpers/signed-in-client.ts tests/e2e/profile-vertical-slice.spec.ts
git commit -m "feat: add RLS protected own profile slice"
```

### Task 15: Prove session recovery, intended routes, logout, and shared-device isolation

**Reviewer gate:** Accept only if refresh restores the same account, login returns to the intended safe route, logout clears protected UI, browser Back cannot reactivate it, and a second account never sees the first profile.

**Files:**
- Modify: `src/features/auth/context/auth-context.tsx`, `src/features/auth/pages/login-page.tsx`, `src/features/auth/components/require-auth.tsx`
- Create: `tests/e2e/session-lifecycle.spec.ts`
- Create: `tests/e2e/shared-device.spec.ts`

**Interfaces:**
- Consumes: `AuthContextValue`, `location.state.from`, profile query cache.
- Produces: deterministic `clearUserScopedQueries(): Promise<void>` on sign-out; restored route/session flow; shared-device isolation proof.

**Specs / acceptance:** `spec/01-user-roles-and-flows.md` sections 2, 5-6; `spec/04-security-and-privacy.md` section 3; `AC-AUTH-001`, `AC-AUTH-003`, `AC-LEARN-004` route subset, `AC-REL-002` retry-state checkpoint.

**Evidence:** headed sequences with at least five screenshots each, videos, traces, network logs, and profile IDs redacted in human-readable summary.

- [ ] **Step 1: Write failing lifecycle E2E tests**

```ts
import { expect, test } from '@playwright/test';

test('restores session and intended route, then protects after logout', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill('student.one@colorplay.test');
  await page.getByLabel('密碼').fill('LocalOnly-Student1!');
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.reload();
  await expect(page.getByText('student.one')).toBeVisible();
  await page.getByRole('button', { name: '登出' }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('student.one')).not.toBeVisible();
});
```

- [ ] **Step 2: Verify at least one lifecycle assertion fails**

Run: `PLAYWRIGHT_VIDEO=on pnpm playwright test tests/e2e/session-lifecycle.spec.ts tests/e2e/shared-device.spec.ts --headed --trace on`

Expected: FAIL because sign-out does not yet clear user-scoped Query cache and the intended-route return is incomplete.

- [ ] **Step 3: Implement minimal lifecycle cleanup**

On successful sign-in, validate `location.state.from.pathname` as an internal path beginning with `/`; navigate there or `/app`. On sign-out, await Supabase sign-out, cancel active queries, remove every query whose key is user-scoped, set Auth state anonymous, and navigate with replacement to `/login`. Make the lifecycle spec perform the logout action with keyboard focus and Enter, and assert focus is visible. Do not persist profile data outside Supabase session storage and TanStack Query memory.

- [ ] **Step 4: Verify headed lifecycle and shared-device isolation**

Run: `PLAYWRIGHT_VIDEO=on pnpm playwright test tests/e2e/session-lifecycle.spec.ts tests/e2e/shared-device.spec.ts --headed --trace on`

Expected: both flows pass; refresh retains the first session; logout plus Back shows login; student two login displays only `student.two`; console errors, unexpected failed requests, and 5xx are zero.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth tests/e2e/session-lifecycle.spec.ts tests/e2e/shared-device.spec.ts
git commit -m "feat: secure Auth session lifecycle"
```

### Task 16: Run the Phase 1 gate, publish source, and connect GitHub to Vercel

**Reviewer gate:** Accept only if the full Phase 1 command is green locally, evidence is honest, governance/source are present in public GitHub, GitHub CI is green, distinct Supabase projects back Preview/Production, and direct Vercel deep-link refresh does not 404.

**Files:**
- Create: `scripts/acceptance/run-phase-1.sh`
- Create: `tests/acceptance/phase-1.spec.ts`
- Modify: `scripts/acceptance/run.sh`, `package.json`, `README.md`, `docs/deployment/vercel.md`
- External state: existing public `peiyi-liu/colorplay`, two real Supabase projects, one Vercel project linked to `origin/main`

**Interfaces:**
- Consumes: all Tasks 1-15; `StagingSupabasePublicConfig = { projectRef; url; anonKey }`; `ProductionSupabasePublicConfig = { projectRef; url; anonKey }`; interactive DB passwords; authenticated GitHub/Vercel/Supabase CLIs.
- Produces: `Phase1AcceptanceRun`; public Git source; required GitHub check; Vercel Preview and Production URLs; automatic deployments from Git branches; SPA fallback evidence.

**Specs / acceptance:** `spec/02-system-architecture.md` section 6; `spec/08-testing-and-evidence.md`; `spec/09-nonfunctional-requirements.md` section 10; `AC-ENV-001`, `AC-ENV-002` Phase checkpoint, `AC-ENV-003`, `AC-ENV-004`, `AC-UI-003`, `AC-UI-006`, `AC-UI-007`, `AC-A11Y-001` Phase-route checkpoint, `AC-DOC-001`, `AC-DOC-002`, `AC-DOC-003`.

**Evidence:** complete Phase 1 run directory; GitHub Actions URL; Vercel deployment URLs; headed screenshots/traces/videos for login, profile, refresh, logout, unauthorized, and three deep links; DB/RLS and secret scan reports.

- [ ] **Step 1: Write the failing phase-gate acceptance test**

```ts
import { expect, test } from '@playwright/test';

test('deployed Phase 1 supports login, profile, and SPA refresh', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.ACCEPTANCE_STUDENT_EMAIL!);
  await page.getByLabel('密碼').fill(process.env.ACCEPTANCE_STUDENT_PASSWORD!);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('student.one')).toBeVisible();
  await page.reload();
  await expect(page.getByText('student.one')).toBeVisible();
});
```

- [ ] **Step 2: Verify the gate fails before orchestration/deployment**

Run: `bash scripts/acceptance/run-phase-1.sh`

Expected: non-zero because the phase runner or live deployment configuration does not exist; it must not silently downgrade to headless or fake endpoints.

- [ ] **Step 3: Implement the exact Phase 1 gate**

`scripts/acceptance/run-phase-1.sh` runs, in order:

```bash
set -euo pipefail
export ACCEPTANCE_STUDENT_EMAIL='student.one@colorplay.test'
export ACCEPTANCE_STUDENT_PASSWORD='LocalOnly-Student1!'
pnpm install --frozen-lockfile
pnpm exec supabase start
pnpm exec supabase db reset --local
eval "$(pnpm exec supabase status -o env | rg '^(API_URL|ANON_KEY)=' | sed 's/^API_URL=/SUPABASE_URL=/;s/^ANON_KEY=/SUPABASE_ANON_KEY=/')"
export SUPABASE_URL SUPABASE_ANON_KEY
export VITE_SUPABASE_URL="$SUPABASE_URL"
export VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
pnpm test:db
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:coverage
npm run build
pnpm preview --host 127.0.0.1 > /tmp/colorplay-phase-1-preview.log 2>&1 &
PREVIEW_PID=$!
trap 'kill "$PREVIEW_PID"' EXIT
mkdir -p artifacts/acceptance/phase-1/reports
pnpm exec lighthouse http://127.0.0.1:4173/login --quiet --only-categories=accessibility --output=json --output-path=artifacts/acceptance/phase-1/reports/lighthouse-login.json --chrome-flags='--headless=new'
node -e "const r=require('./artifacts/acceptance/phase-1/reports/lighthouse-login.json'); if ((r.categories.accessibility.score ?? 0) < 0.95) process.exit(1)"
pnpm test:e2e
PLAYWRIGHT_VIDEO=on pnpm playwright test tests/acceptance/phase-1.spec.ts --headed --project=chromium --trace on
node scripts/acceptance/create-run.mjs --environment local --app-url http://127.0.0.1:4173
```

The script fails if headed display is unavailable, any required artifact is missing, any test is skipped, any console/unhandled/5xx event occurs, or secret scanning finds a credential. It reports final MVP criteria outside Phase 1 as `NOT VERIFIED`.

- [ ] **Step 4: Verify locally and commit the final source state**

Run: `bash scripts/acceptance/run-phase-1.sh`

Expected: exit 0 for Phase 1 gates; evidence manifest records the current dirty state before commit; normative MVP criteria outside Phase 1 remain `NOT VERIFIED`.

```bash
git add scripts/acceptance tests/acceptance package.json README.md docs/deployment/vercel.md
git commit -m "test: enforce Phase 1 foundation acceptance"
git status --short
```

Expected: clean worktree after commit.

Run the gate once more against the committed SHA:

```bash
bash scripts/acceptance/run-phase-1.sh
git status --short
```

Expected: the second run exits 0, the evidence manifest identifies the clean committed SHA, and generated acceptance artifacts remain ignored so `git status --short` is empty.

- [ ] **Step 5: Push the reviewed feature branch and verify CI**

```bash
git remote get-url origin
FEATURE_BRANCH="$(git branch --show-current)"
test "$FEATURE_BRANCH" != 'main'
git push -u origin "$FEATURE_BRANCH"
```

Expected: remote URL is `https://github.com/peiyi-liu/colorplay.git`; the feature-branch push succeeds; GitHub contains governance, legacy reference, plan, source, tests, and migrations on that branch; `foundation-ci` passes for the exact feature-branch SHA. Do not update `main` before this check is green.

- [ ] **Step 6: Apply the migration to distinct real Supabase projects**

Authenticate interactively with `pnpm exec supabase login`. For staging, link using its real project ref, enter its DB password only at the prompt, run `supabase db push`, and seed one synthetic acceptance user through the Admin API with process-only Email, password, and remote service key. The staging account must not reuse the committed local `TEST_USERS` values. For production, link its different real project ref, enter its DB password at the prompt, and run `supabase db push` without synthetic users. Verify the two project refs and URLs differ before continuing.

Run pattern:

```bash
pnpm exec supabase link --project-ref "$COLORPLAY_STAGING_PROJECT_REF"
pnpm exec supabase db push
pnpm exec supabase link --project-ref "$COLORPLAY_PRODUCTION_PROJECT_REF"
pnpm exec supabase db push
test "$COLORPLAY_STAGING_PROJECT_REF" != "$COLORPLAY_PRODUCTION_PROJECT_REF"
test "$COLORPLAY_STAGING_SUPABASE_URL" != "$COLORPLAY_PRODUCTION_SUPABASE_URL"
```

Expected: both projects contain the same migration version; staging has synthetic accounts; production has no test account or test data.

- [ ] **Step 7: Link Vercel Git deployment and set scoped public variables**

Authenticate with `pnpm dlx vercel@latest login --github`, then:

```bash
pnpm dlx vercel@latest link --yes --project colorplay
printf '%s' "$COLORPLAY_STAGING_SUPABASE_URL" | pnpm dlx vercel@latest env add VITE_SUPABASE_URL preview
printf '%s' "$COLORPLAY_STAGING_SUPABASE_ANON_KEY" | pnpm dlx vercel@latest env add VITE_SUPABASE_ANON_KEY preview
printf '%s' "$COLORPLAY_PRODUCTION_SUPABASE_URL" | pnpm dlx vercel@latest env add VITE_SUPABASE_URL production
printf '%s' "$COLORPLAY_PRODUCTION_SUPABASE_ANON_KEY" | pnpm dlx vercel@latest env add VITE_SUPABASE_ANON_KEY production
pnpm dlx vercel@latest git connect --yes
```

Expected: Vercel uses `npm run build`, serves `dist`, treats `main` as production, and maps non-production branches to Preview. Public anon keys may be present in browser configuration; no server secret is present.

- [ ] **Step 8: Verify deployed deep links and capture headed evidence**

Run:

```bash
FEATURE_BRANCH="$(git branch --show-current)"
test "$FEATURE_BRANCH" != 'main'
git commit --allow-empty -m "chore: verify automatic Vercel deployment"
git push origin "$FEATURE_BRANCH"
# After the Preview deployment is Ready, set VERCEL_PREVIEW_URL to its HTTPS URL.
PLAYWRIGHT_VIDEO=on PLAYWRIGHT_BASE_URL="$VERCEL_PREVIEW_URL" ACCEPTANCE_STUDENT_EMAIL="$STAGING_ACCEPTANCE_EMAIL" ACCEPTANCE_STUDENT_PASSWORD="$STAGING_ACCEPTANCE_PASSWORD" pnpm playwright test tests/acceptance/phase-1.spec.ts --headed --project=chromium --trace on
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git push origin 'HEAD:main'
# After the Production deployment is Ready, set VERCEL_PRODUCTION_URL to its HTTPS URL.
PLAYWRIGHT_BASE_URL="$VERCEL_PRODUCTION_URL" pnpm playwright test tests/e2e/spa-deep-link.spec.ts --headed --project=chromium --trace on
```

Use the Preview URL for staging-authenticated flow evidence and update `main` only after that flow passes. The ancestry check requires a fast-forward; if `origin/main` changed independently, the command stops and the branch must be reconciled and fully reverified without force-push. Expected: Preview login/profile succeeds against staging; the fast-forward push triggers Production; `foundation-ci` is green for `main`; `/login`, `/app`, and `/unauthorized` direct Production refreshes return the React app rather than 404; Production contains no synthetic login; screenshots, trace, video, DB proof, and deployment metadata are attached to the Phase 1 evidence run.

## Acceptance-to-Task Matrix

`Complete` means Phase 1 contains enough behavior and evidence to satisfy that criterion. `Checkpoint` means a defined subset is verified while the criterion remains `NOT VERIFIED` for the full MVP. `Outside Phase 1` identifies the owning follow-on plan without introducing mock behavior here.

| Acceptance ID | Task | Phase 1 status |
|---|---|---|
| AC-ENV-001 | 2, 8, 16 | Complete |
| AC-ENV-002 | 7, 9, 10, 16 | Checkpoint: reset/Auth/profile seed only; curriculum/Blooks absent |
| AC-ENV-003 | 8, 16 | Complete when distinct real project evidence exists |
| AC-ENV-004 | 3, 10, 16 | Complete |
| AC-AUTH-001 | 10, 11, 12, 13, 14, 15 | Complete |
| AC-AUTH-002 | 11, 13 | Complete |
| AC-AUTH-003 | 11, 12, 15 | Complete |
| AC-AUTH-004 | 9, 14 | Complete |
| AC-AUTH-005 | 14 | Checkpoint: role-aware route and profile API denial; teacher feature APIs absent |
| AC-AUTH-006 | — | Outside Phase 1 — classroom/RLS plan |
| AC-AUTH-007 | — | Outside Phase 1 — classroom/RLS plan |
| AC-LEARN-001, AC-LEARN-002, AC-LEARN-003 | — | Outside Phase 1 — curriculum/review plan |
| AC-LEARN-004 | 8, 15 | Checkpoint: foundation routes only |
| AC-QUIZ-001, AC-QUIZ-002, AC-QUIZ-003, AC-QUIZ-004, AC-QUIZ-005, AC-QUIZ-006, AC-QUIZ-007, AC-QUIZ-008, AC-QUIZ-009, AC-QUIZ-010, AC-QUIZ-011, AC-QUIZ-012 | — | Outside Phase 1 — quiz core plan |
| AC-GAME-001, AC-GAME-002, AC-GAME-003, AC-GAME-004, AC-GAME-005, AC-GAME-006, AC-GAME-007, AC-GAME-008, AC-GAME-009 | — | Outside Phase 1 — economy/shop/leaderboard plan |
| AC-TCH-001, AC-TCH-002, AC-TCH-003, AC-TCH-004, AC-TCH-005, AC-TCH-006, AC-TCH-007, AC-TCH-008, AC-TCH-009, AC-TCH-010 | — | Outside Phase 1 — teacher/import/analytics/export plans |
| AC-SEC-001, AC-SEC-002 | — | Outside Phase 1 — economy/security plan |
| AC-SEC-003 | 9, 14 | Complete for profiles; criterion remains checkpoint until sessions/answers exist |
| AC-SEC-004, AC-SEC-005 | — | Outside Phase 1 — quiz/security plan |
| AC-SEC-006 | 8, 16 | Checkpoint: Vercel headers/config; production candidate gate remains |
| AC-SEC-007 | 3, 10, 16 | Complete for current tree/history/artifacts |
| AC-UI-001 | 5, 6, 13, 14, 16 | Checkpoint: Phase 1 states only, not 12 MVP states |
| AC-UI-002 | 6, 13, 14, 15 | Checkpoint: Auth/profile sequences only |
| AC-UI-003 | 5, 8, 16 | Checkpoint: existing Phase 1 routes only |
| AC-UI-004 | 5, 13 | Checkpoint: existing Phase 1 controls only |
| AC-UI-005 | 5, 6 | Checkpoint: foundation baselines only |
| AC-UI-006 | 4, 12, 14 | Checkpoint: existing Phase 1 queries/routes only |
| AC-UI-007 | 4, 6, 16 | Checkpoint: existing Phase 1 states only |
| AC-UI-008 | 5 | Checkpoint: foundation/login/profile only |
| AC-UI-009 | 5, 13 | Checkpoint: login only |
| AC-UI-010 | 13 | Checkpoint: automated visual viewport only; real-device proof absent |
| AC-UI-011, AC-UI-012 | — | Outside Phase 1 — dialog/quiz interaction plan |
| AC-UI-013, AC-UI-014 | 5, 14 | Checkpoint: existing Phase 1 shell/profile only |
| AC-UI-015 | 5, 13 | Checkpoint: existing Phase 1 interactions only |
| AC-A11Y-001 | 5, 6, 13, 16 | Checkpoint: Phase 1 routes only |
| AC-A11Y-002 | 13, 15 | Checkpoint: login/profile/logout only |
| AC-A11Y-003 | — | Outside Phase 1 — teacher UI plan |
| AC-A11Y-004, AC-A11Y-005 | 5, 13 | Checkpoint: Phase 1 states only |
| AC-A11Y-006 | — | Outside Phase 1 — quiz feedback plan |
| AC-PERF-001 | 2, 8, 16 | Checkpoint: foundation bundle and route splitting contract |
| AC-PERF-002, AC-PERF-003 | — | Outside Phase 1 — staging performance plan after core flows exist |
| AC-COMPAT-001 | 6, 8 | Checkpoint: foundation/Auth smoke without quiz/result |
| AC-REL-001 | — | Outside Phase 1 — transactional command plans |
| AC-REL-002 | 11, 13, 15 | Checkpoint: Auth/profile network errors only |
| AC-REL-003 | — | Outside Phase 1 — quiz concurrency plan |
| AC-DOC-001 | 1, 6, 16 | Complete: every ID has a task or explicit outside-Phase owner |
| AC-DOC-002 | 9, 14, 16 | Complete |
| AC-DOC-003 | 1, 6, 16 | Complete |

## Phase Boundaries and Reviewer Stop Points

### Phase 1A exit

Tasks 1-8 are accepted independently. Phase 1A stops with a tracked governance/legacy baseline, strict reproducible build, typed public configuration, route/App shell boundaries, flat-design baseline, evidence harness, real Supabase local health, CI configuration, and Vercel SPA contract. It contains no functional Auth, profile schema, product migration, curriculum, quiz, reward, shop, leaderboard, or teacher feature.

### Phase 1B exit

Tasks 9-16 are accepted independently. Phase 1B stops with one real vertical slice: local Supabase Email/password -> authenticated session -> RLS-protected own profile -> refresh recovery -> logout/shared-device isolation. It includes the initial profile migration and real positive/negative RLS tests, then publishes the verified source and connects GitHub/Vercel only when two real remote Supabase project configurations are available.

## Specifications Intentionally Not Implemented in Phase 1

- `spec/00-project-charter.md`: Phase 1 proves the engineering foundation and Auth/profile subset; the full curriculum, quiz, economy, teacher, research, and post-launch success metrics remain outside this plan.
- `spec/01-user-roles-and-flows.md`: classroom join, complete student curriculum/quiz/shop/leaderboard flows, and teacher product flows.
- `spec/02-system-architecture.md`: secure quiz/economy/import/export RPC and Edge Function implementations, full audit events, and production monitoring alerts.
- `spec/03-data-model-and-rls.md`: classrooms, curriculum, questions, quiz, economy, Blooks, import/audit/export tables and their RLS matrices.
- `spec/04-security-and-privacy.md`: answer/score protection, XLSX security, full abuse rate limits, research retention execution, and final production header assessment.
- `spec/05-game-mechanics.md`: score, XP, Token, decay, finalize reward transaction, Level, shop, and leaderboard.
- `spec/06-content-and-question-bank.md`: content hierarchy, review cards, question versions, authoring, media, validation, and XLSX import.
- `spec/07-ui-visual-system.md`: product screens beyond shell/login/profile, dialogs, Quiz states, results, shop, teacher UI, and real Android Back evidence.
- `spec/08-testing-and-evidence.md`: the full 36-screen inventory and six complete MVP sequences; Phase 1 produces only its scoped evidence.
- `spec/09-nonfunctional-requirements.md`: final staging performance samples, production backup/restore, complete monitoring, and full-browser product smoke.
- `spec/10-migration-roadmap.md`: migration phases 3-8.
- `spec/11-reference-standards.md`: its official-source, accessibility, research-trace, and version principles constrain Phase 1 work; dialog-specific reference rules remain outside this plan because no dialog is implemented.
- Production research launch remains prohibited until retention/deletion-or-anonymization policy and Supabase backup plan are approved.

## Plan Quality Gate

Before execution handoff, run:

```bash
PLAN=docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md
test "$(rg -c '^### Task [0-9]+:' "$PLAN")" = '16'
test "$(rg -o 'AC-[A-Z0-9]+-[0-9]{3}' acceptance/ACCEPTANCE_CRITERIA.md | sort -u | wc -l | tr -d ' ')" = '84'
test -z "$(comm -23 <(rg -o 'AC-[A-Z0-9]+-[0-9]{3}' "$PLAN" | sort -u) <(rg -o 'AC-[A-Z0-9]+-[0-9]{3}' acceptance/ACCEPTANCE_CRITERIA.md | sort -u))"
test -z "$(comm -13 <(rg -o 'AC-[A-Z0-9]+-[0-9]{3}' "$PLAN" | sort -u) <(rg -o 'AC-[A-Z0-9]+-[0-9]{3}' acceptance/ACCEPTANCE_CRITERIA.md | sort -u))"
git diff --no-index --check /dev/null "$PLAN" >/dev/null 2>&1; test $? -le 1
```

Expected: no prohibited wording; exactly 84 valid acceptance IDs with complete coverage; no whitespace error; all Task 11-15 type/function names match the interfaces produced by prior tasks.
