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
