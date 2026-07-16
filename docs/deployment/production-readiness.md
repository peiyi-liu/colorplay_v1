# Production readiness control register

Phase 0 defines controls only. Every hosted action below is `NOT EXECUTED` until the Phase 8 release plan authorizes it. A named human may hold multiple roles, but both primary and backup operations contacts must be assigned before release.

## Owner roles

| Role                  | Responsibility                                                                        |
| --------------------- | ------------------------------------------------------------------------------------- |
| Project owner         | Approves formal domain, data use, release, and destructive Staging reset              |
| Production operator   | Creates/configures hosted services and executes approved release runbook              |
| Backup operator       | Confirms backup/restore independently and can act when the primary is unavailable     |
| Security reviewer     | Reviews RLS, secrets scan, headers, dependency/security findings, and incident access |
| Content owner/teacher | Approves question/review content, rights, terminology, and publication                |
| Research/data steward | Approves retention, deletion, pseudonymous export, and authorized recipients          |

## Release controls

| Control                     | Required owner                          | Entry evidence                                                | Pass condition                                                                                          | Phase 0 state  |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------- |
| Formal domain               | Project owner                           | Domain decision and DNS ownership record                      | HTTPS canonical domain selected and controlled                                                          | `NOT EXECUTED` |
| GitHub/Vercel link          | Production operator                     | Project/repository and Git SHA mapping                        | `peiyi-liu/colorplay`, Production Branch `main`, required CI check                                      | `NOT EXECUTED` |
| Vite delivery               | Production operator                     | Vercel project configuration                                  | Build `npm run build`, output `dist`, SPA fallback passes deep-link refresh                             | `NOT EXECUTED` |
| New Production Supabase     | Production operator                     | Project identity recorded in private operations register      | Distinct from Staging; empty before migrations                                                          | `NOT EXECUTED` |
| Staging reset               | Project owner + production operator     | ADR 0002 inventory and reset approval                         | Legacy schema/data removed; tracked migrations and synthetic seed only                                  | `NOT EXECUTED` |
| Environment values          | Production operator + security reviewer | Vercel scope names and target fingerprints without raw values | Preview targets Staging; Production targets Production; only two browser variables                      | `NOT EXECUTED` |
| Auth URL/redirects          | Production operator                     | Sanitized Site URL/redirect list                              | Canonical Site URL, exact Production redirects, Staging wildcard isolated                               | `NOT EXECUTED` |
| Custom SMTP                 | Production operator                     | Sender/domain verification and test-delivery report           | Formal sender name, verified domain, server-only credential, failure alert                              | `NOT EXECUTED` |
| Migration release           | Production operator                     | Migration range, Staging result, backup state, approver       | Migration zero through release version applied without Dashboard drift                                  | `NOT EXECUTED` |
| Production content          | Content owner/teacher                   | Import provenance, validation report, approval                | Only approved content; 45-question baseline preserved; no invalid legacy rows                           | `NOT EXECUTED` |
| Production identity hygiene | Security reviewer                       | Sanitized user/count query                                    | No seed, Staging, demo, or legacy Auth user                                                             | `NOT EXECUTED` |
| Security controls           | Security reviewer                       | RLS negative tests, secret scan, headers/dependency reports   | No unresolved Critical/High issue or browser secret                                                     | `NOT EXECUTED` |
| Monitoring/alerts           | Production operator + backup operator   | Alert routing and synthetic failure test                      | Both contacts receive deployment, Auth, RPC, Live, import/export, ledger, capacity, and backup failures | `NOT EXECUTED` |
| Provider backup             | Backup operator                         | Provider schedule/status                                      | Daily provider backup supports RPO 24 hours                                                             | `NOT EXECUTED` |
| Logical backup              | Backup operator                         | Encrypted backup object and access log                        | Weekly encrypted logical backup stored outside the primary project                                      | `NOT EXECUTED` |
| Storage backup              | Backup operator                         | Asset inventory/count/hash report                             | Published Storage assets recover independently of database backup                                       | `NOT EXECUTED` |
| Restore drill               | Backup operator + security reviewer     | Timestamp, duration, row/asset reconciliation                 | Quarterly Staging restore meets RTO 8 hours and RPO 24 hours                                            | `NOT EXECUTED` |
| Rollback                    | Production operator                     | Known frontend SHA and database forward-fix procedure         | Frontend rollback and expand/contract recovery rehearsed                                                | `NOT EXECUTED` |
| Incident contacts           | Project owner                           | Private primary/backup contact register and escalation test   | Both contacts acknowledge security/availability escalation                                              | `NOT EXECUTED` |
| Research governance         | Research/data steward                   | Approved retention/export/deletion policy                     | Authorized pseudonymous export and deletion workflow tested                                             | `NOT EXECUTED` |
| Release evidence            | Project owner                           | Phase 8 manifest/reviewer sign-off/human device evidence      | All blocking criteria proven and source SHA clean                                                       | `NOT EXECUTED` |

## Backup and recovery minimum

- Objective: RPO 24 hours and RTO 8 hours.
- Provider backup runs daily; encrypted logical backup runs weekly; Storage assets have a separate backup.
- A quarterly restore drill uses Staging or an isolated recovery target, never the active Production project.
- The drill records backup timestamp, restore start/end UTC time, migration version, table row reconciliation, ledger reconciliation, Auth exclusion checks, Storage object/hash reconciliation, and operator/reviewer outcome.
- A backup schedule without a successful restore drill is not release evidence.

## Alert and incident minimum

Alerts cover deployment failure, migration failure, Auth error rate, unexpected 5xx, answer/Live RPC error and p95 latency, import/export failure, unauthorized/RLS anomaly, ledger mismatch, database/storage capacity, backup failure, and restore failure. Alert messages contain request/correlation IDs and safe aggregates only; they exclude Email, JWTs, answers, database URLs, and credentials.

## Manual decisions still required before Phase 8

The project owner must assign the human names behind each owner role, select the formal domain and sender identity, approve data retention/research procedures, select a Supabase plan that can meet the objectives, and authorize the Staging reset. These are explicit release inputs, not evidence that Phase 0 is incomplete.
