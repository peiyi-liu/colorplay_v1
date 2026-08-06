# Production readiness control register

Authority: the approved
[Phase 0 design](../superpowers/specs/2026-08-05-phase-0-environment-release-foundation-design.md)
and
[implementation plan](../superpowers/plans/2026-08-06-phase-0-environment-release-foundation.md).
Current status: **LOCAL IMPLEMENTATION ONLY — HOSTED CONFIGURATION NOT
EXECUTED**. OWNER GATE 0 still blocks hosted operations.

| Gate            | Required evidence                                                                                         | State                                              |
| --------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Human readiness | MFA/recovery custody, separate SMTP credentials, offline encrypted recovery copy                          | Blocked until OWNER GATE 0 is complete             |
| Backup          | encrypted DB/Storage set, checksum/decryption/inventory pass, B2 Compliance Object Lock, 30-day retention | Repository controls implemented; hosted run absent |
| Migration       | frozen SHA, repo/hosted inventory, classified zero drift, clean replay                                    | Repository controls implemented; hosted run absent |
| Staging         | exact target, approved destructive record, fixture-only rebuild, three-browser/RWD/real-device gate       | Repository controls implemented; hosted run absent |
| Candidate       | exact green SHA, fresh Staging/backup evidence, protected URL, zero fixtures, formal content              | Repository controls implemented; artifact absent   |
| Production      | GitHub `production` Environment approval, exact-artifact promotion, three read-only samples, SHA parity   | Repository controls implemented; promotion absent  |

## Non-negotiable release rules

- `main` does not automatically deploy Production.
- Candidate creation uses `vercel deploy --prebuilt --prod --skip-domain`;
  approval then uses `vercel promote` on the same deployment.
- Candidate and Promotion credentials are separate. Browser configuration is
  limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Production smoke is GET/HEAD-only. It never signs in, creates fixtures, or
  writes student data.
- HTTP 200 or Vercel READY is insufficient. Checksummed record, approval,
  smoke, and Git/Vercel/tag parity are all required.
- Automatic rollback is web-only and starts only after three consecutive
  verified web failures. Security or data-corruption incidents require manual
  recovery; database down/reset is never an automatic rollback.

## Backup and recovery objective

Daily encrypted database and Storage backups go to Backblaze B2. Each object
uses Compliance-mode Object Lock with 30-day retention; verification uses a
separate read-only recovery key. RPO 24 hours and RTO 8 hours are operating
objectives, not provider guarantees. Restore drills run in isolated Local or an
approved Candidate target, never active Production.

## Remaining human gates

Before hosted work: finish OWNER GATE 0, assign the real Environment reviewers,
create distinct Staging/Production SMTP credentials, configure protected
provider variables without exposing values, and authorize each destructive or
promotion operation from its fresh mutation record. Repository implementation
does not pre-authorize any hosted change.
