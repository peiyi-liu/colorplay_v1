# Vercel delivery contract

Authority: the approved
[Phase 0 design](../superpowers/specs/2026-08-05-phase-0-environment-release-foundation-design.md)
and
[implementation plan](../superpowers/plans/2026-08-06-phase-0-environment-release-foundation.md).
Status: **LOCAL IMPLEMENTATION ONLY — HOSTED CONFIGURATION NOT EXECUTED**.

The tracked `vercel.json` defines the Vite build, `dist` output, and SPA
fallback. Git integration must not auto-assign the Production domain. `main`
does not automatically deploy Production.

## Staging

A protected push to `staging` checks out the exact SHA, builds with
`COLORPLAY_DEPLOYMENT_ENVIRONMENT=staging`, deploys to
`colorplay-staging-web`, deploys Edge Functions from the same checkout, and may
alias only `staging.colorplayapp.com`. The gate requires the visible Staging
marker, read-only health, Phase acceptance, Chromium/Firefox/WebKit, the three
approved responsive sizes, RLS negatives, and protected real-device approval.

## Production Candidate and Promotion

Candidate uses Production public configuration and the separate Candidate
credential:

```text
vercel deploy --prebuilt --prod --skip-domain
```

It must remain protected at an isolated Vercel URL and cannot change a domain.
The GitHub `production` Environment exposes the distinct Promotion credential
only after human approval. Promotion executes:

```text
vercel promote <checksummed-candidate-url>
```

It performs no build and no second deployment. Three read-only smoke samples
must pass before `main` is fast-forwarded to the approved SHA. Vercel source,
`main`, and the UTC Production tag must match before the tag and Release exist.

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` may enter the browser
bundle. Database URLs, service credentials, SMTP credentials, provider access
credentials, backup keys, and MFA recovery material remain server-only and are
never included in source, logs, or artifacts.

HTTP 200 or Vercel READY is insufficient release evidence. A failed web release
must fail three consecutive samples before the checksum-bound web-only rollback
may restore the previous deployment. Data/security failures stop automation.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Documentation, source control, logs, and evidence contain names only—never
their deployed values. `VITE_SUPABASE_ANON_KEY` is retained as the application
contract name, but hosted environments must store the current
`sb_publishable_…` key in it. The key remains low-privilege and depends on Row
Level Security.

Never place a Supabase `service_role` key, database URL or password, JWT
secret, access token, SMTP password, or any other server credential in a
`VITE_*` variable or client bundle. Server-only credentials belong in
Supabase or another server-only secret store and must not be exposed to this
static frontend.

Supabase Edge Functions consume `SUPABASE_PUBLISHABLE_KEYS` and
`SUPABASE_SECRET_KEYS` from the hosted secret store. During a zero-downtime
migration they may fall back to the legacy variables only when the new key set
is absent. After browser, Edge Function, CI and script smoke checks pass,
deactivate the legacy `anon`／`service_role` keys; never rotate the shared
legacy JWT secret as the first response to a service credential exposure.

Database deployment is a separate protected gate: feature CI proves migrations
locally, Staging receives the reviewed release candidate, and Production
requires explicit approval plus pre/post migration checks. A Vercel frontend
deployment must never push database migrations blindly.

## Pre-deployment authentication gate

Before assigning or promoting `staging.colorplayapp.com`, verify the hosted
artifact itself, not only dashboard configuration or a local build:

1. Bind the deployment to the intended Git SHA and confirm its hosted bundle
   contains the Staging Supabase URL and matching public-key fingerprint.
2. Use a valid synthetic Staging student fixture to sign in through the public
   login page, complete profile bootstrap, and reach `/app` without required
   console or network errors.
3. If the release touches Auth, shared App Shell/bootstrap, teacher navigation,
   permissions, or teacher UI, repeat the real sign-in flow with a valid
   synthetic teacher fixture and reach the teacher landing route.
4. Record the deployment ID, Git SHA, Supabase project ref, fixture role (never
   its password), route reached, and result before changing the public alias.

An HTTP 200, Vercel `READY`, asset loading, or an invalid-credential probe is
necessary diagnostic evidence but is not a successful-login test. Any missing
or failing step blocks the Staging alias/promotion.

Production must not contain synthetic test identities. Promotion instead
requires the exact Git SHA that passed the Staging gate, explicit owner
approval, and the approved read-only Production smoke after promotion.

## Manual setup checklist for Production go-live

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

## Production go-live authentication boundary

Local Steps 1–4 are implemented by `pnpm acceptance` and do not mutate any
remote system. Hosted setup remains an account-owner operation and is
blocked until GitHub, Supabase, and Vercel authentication is available. An
automation agent must not push a branch, log in, create or link projects,
upload environment values, seed a remote project, update `main`, or fabricate
deployment evidence without that explicit authenticated session.

The local manifest therefore records remote environment isolation, production
headers, automatic deployment, public CI, and deployed deep-link evidence as
`NOT VERIFIED`. After authentication is provided, execute the reviewed
Production go-live runbook in order: feature-branch CI first, rebuilt Staging and new clean Production Supabase
projects second, Vercel Git/environment linkage third, then Preview and
Production headed deep-link verification. Never write synthetic acceptance
data to Production and never print DB passwords, status keys, service-role
values, or access tokens into logs or evidence.

Official references: [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json),
[Vercel Git deployments](https://vercel.com/docs/git), and
[Vercel deployment environments](https://vercel.com/docs/deployments/overview).
