# Vercel delivery contract

ColorPlay is a static Vite single-page application. The tracked `vercel.json`
is authoritative for the Vercel framework, build command, output directory,
and SPA fallback. Vercel must run `npm run build`, publish `dist`, and rewrite
`/(.*)` to `/index.html` so React Router can restore deep links.

## Git-based deployment flow

After the repository is connected to Vercel in Task 16, GitHub and Vercel run
their automatic flows independently:

- GitHub Actions exposes the required `foundation-ci` check for pushes and
  pull requests targeting `main`.
- Vercel creates Preview deployments for pull requests and non-`main`
  branches.
- `main` is the documented Vercel Production Branch. A merge or push to
  `main` creates a Production deployment.

Task 8 does not connect GitHub, create or link a Vercel project, configure
branch protection, upload environment values, or deploy. The account owner
performs those manual dashboard/CLI steps in Task 16, then verifies the
GitHub check, commit SHA, automatic deployments, production security headers,
and deployed deep-link refreshes.

## Environment separation

The three application environments must never share Supabase projects or
configuration values:

| Application environment | Frontend target                          | Supabase target             | Data policy                       |
| ----------------------- | ---------------------------------------- | --------------------------- | --------------------------------- |
| Local                   | Vite development server or built preview | Supabase CLI local stack    | Deterministic synthetic test data |
| Staging                 | Vercel Preview deployment                | Separate staging project    | Synthetic acceptance data only    |
| Production              | Vercel Production deployment from `main` | Separate production project | No automated mutation tests       |

Vercel's Preview scope supplies staging configuration to pull requests and
non-production branches. Its Production scope supplies the distinct
production configuration to `main`. An acceptance manifest must identify
`local` or `staging`; automated acceptance must never write to Production.

## Browser configuration allowlist

Only these Supabase variable names are allowed in browser configuration:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Documentation, source control, logs, and evidence contain names only—never
their deployed values. The anon key is browser-publishable but remains
low-privilege and depends on Row Level Security.

Never place a Supabase `service_role` key, database URL or password, JWT
secret, access token, SMTP password, or any other server credential in a
`VITE_*` variable or client bundle. Server-only credentials belong in
Supabase or another server-only secret store and must not be exposed to this
static frontend.

## Manual setup checklist for Task 16

1. Connect the public GitHub repository to a Vercel project.
2. Confirm the project root and Vite framework detection.
3. Set the Production Branch to `main`.
4. Add the two allowlisted browser variable names separately to Preview and
   Production, using distinct staging and production values.
5. Require `foundation-ci` before merging to protected `main`.
6. Verify each deployment is bound to the expected Git commit SHA.
7. Verify HTTPS and the production CSP, HSTS, `nosniff`, and Referrer-Policy.
8. Run headed deep-link checks against the deployed Preview and Production
   URLs before making a production-candidate claim.

Official references: [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json),
[Vercel Git deployments](https://vercel.com/docs/git), and
[Vercel deployment environments](https://vercel.com/docs/deployments/overview).
