# ColorPlay environment matrix

Authority: the approved
[Phase 0 design](../superpowers/specs/2026-08-05-phase-0-environment-release-foundation-design.md)
and
[implementation plan](../superpowers/plans/2026-08-06-phase-0-environment-release-foundation.md).
Status: **LOCAL IMPLEMENTATION ONLY — HOSTED CONFIGURATION NOT EXECUTED**.

| Control           | Local                   | Staging                        | Production                                 |
| ----------------- | ----------------------- | ------------------------------ | ------------------------------------------ |
| Git               | worktree                | protected `staging`            | protected `main`, updated only after smoke |
| Vercel            | Vite/preview            | `colorplay-staging-web`        | `colorplay-web`                            |
| Domain            | loopback                | `staging.colorplayapp.com`     | `colorplayapp.com`                         |
| Supabase          | CLI stack               | permanent Staging project      | clean Production project                   |
| Data              | deterministic fixtures  | approved content plus fixtures | formal content and authorized users only   |
| Mutation tests    | after clean Local reset | allowed with fixture accounts  | forbidden                                  |
| Release authority | developer               | CI plus real-device approval   | GitHub `production` Environment            |

No environment shares Supabase projects, Auth users, SMTP credentials, service
credentials, database passwords, student records, or backup credentials. The
browser allowlist is exactly `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`; no other `VITE_*` credential is permitted.

Auth redirects are exact: Local uses the approved loopback ports, Staging uses
only `https://staging.colorplayapp.com` application routes, and Production uses
only `https://colorplayapp.com` application routes. Vercel candidate URLs do
not receive Auth callback or recovery permission.

## Free-plan two-slot order

The approved two-slot rotation keeps the current service available while a
clean Candidate is verified: create the second project, temporarily exercise it
as Staging, remove fixtures and rebuild it as Production, promote the exact web
artifact, then rebuild the former project as permanent Staging. At no time may
two public sites write to one Supabase project.

## Release boundary

A protected Staging merge runs hosted acceptance. The accepted SHA is built in
the Production project with `vercel deploy --prebuilt --prod --skip-domain`.
`main` does not automatically deploy Production. After owner approval, the
Promotion workflow calls `vercel promote` on the checksummed deployment, runs
three read-only smoke samples, then fast-forwards `main` to the same SHA.

Production backups use encrypted Backblaze B2 objects with Compliance-mode
Object Lock and 30-day retention. The operating objective is RPO 24 hours and
RTO 8 hours; these are team targets, not a Free Plan SLA.
