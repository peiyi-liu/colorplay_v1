# Staging operations entry point

Authority: the approved
[Phase 0 design](superpowers/specs/2026-08-05-phase-0-environment-release-foundation-design.md)
and
[implementation plan](superpowers/plans/2026-08-06-phase-0-environment-release-foundation.md).
Current status: **LOCAL IMPLEMENTATION ONLY — HOSTED CONFIGURATION NOT
EXECUTED**. OWNER GATE 0 and a fresh hosted-mutation record are required.

The old bootstrap is retired and always fails. Never restore its Management API
path, manually insert migration ledger rows, push directly to `main`, paste
credentials into a command, or add broad Auth redirect wildcards.

## Rebuild sequence

1. Follow [manual readiness](deployment/manual-readiness.md) and verify the
   target/ref/SHA immediately before mutation.
2. Complete [migration reconciliation](deployment/runbooks/migration-reconciliation.md).
3. Verify the newest encrypted B2 backup, Compliance-mode Object Lock, and
   30-day retention. RPO 24 hours and RTO 8 hours are operating objectives.
4. Obtain owner authorization for the exact destructive record.
5. Run `scripts/staging/rebuild-staging.sh --preflight-only`; only a fully green
   preflight may be rerun with the separately protected execution confirmation.
6. Require database reset, Auth cleanup, Storage cleanup, migration parity,
   approved content import, and fixture creation checkpoints. Auth and Storage
   counts must both be zero before fixtures are created.

See [the guarded rebuild runbook](deployment/runbooks/staging-rebuild.md) for
the protected variable names and evidence contract. It intentionally contains
no credential value or fixture password.

## Deployment and acceptance

A merge to protected `staging` triggers `.github/workflows/staging-deploy.yml`.
It may target only `colorplay-staging-web`, the exact Staging Supabase ref, and
`staging.colorplayapp.com`. The gate checks the Staging marker, hosted smoke,
affected Phase acceptance, RLS cross-account denials, Chromium/Firefox/WebKit,
1280×720, 812×375, 375×812, console/network health, and a protected real-device
result.

The Site URL and callback/recovery routes must use only the exact stable Staging
domain. Preview URLs receive no Auth email links. Staging and Production SMTP
credentials are separate, tracking is disabled, and no credential enters the
browser bundle.

HTTP 200 or Vercel READY is insufficient. Only the recorded deployment ID, SHA,
Edge Function list, hosted evidence, and human gate may set `staging-gate`
successful. Production remains a separate Candidate/Promotion workflow using
`vercel deploy --prebuilt --prod --skip-domain` followed by owner-approved
`vercel promote`; `main` does not automatically deploy Production.
