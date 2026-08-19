# Phase 1 Production Smoke Manifest

Spec §4.2, §8.1, §12, §14.4. This manifest defines what "read-only" means for
a Phase 1 Admin smoke check against Production, and exactly which control-plane
writes are pre-authorized as part of exercising that check. It does not
authorize hosted execution by itself — see `docs/deployment/production-readiness.md`
and the approved release gates in `docs/roadmap-colorplay-next.md` for when a
Production smoke is actually allowed to run.

## Definition: read-only

A Phase 1 Admin smoke run is **read-only** with respect to every domain
table — it never inserts, updates, or deletes rows in any table that holds
student, teacher, content, learning, assessment, Live, or reward data (spec
§12). "Read-only" does **not** mean zero writes anywhere: exercising the
Admin identity/session/audit machinery necessarily writes to the Admin
security control-plane tables listed below. Those writes are the smoke
check's own instrumentation, not a side effect to be avoided.

There is **no seeded Admin fixture in Production** (spec §12; enforced
technically as of the Task 14 review — `scripts/supabase/seed-auth.ts` fails
closed with `ADMIN_FIXTURE_PRESENT_ON_NON_LOCAL_URL` if either fixture email
is ever found on a non-local project, and never creates them there in the
first place). A Production smoke run authenticates as a real Admin identity
provisioned through `docs/runbooks/phase1-admin-oob-recovery.md`'s bootstrap
procedure, not a fixture.

## Allowed control-plane writes

Anything outside this table is a gate failure — stop the smoke run and treat
it as a defect, not something to work around.

| Table                          | Allowed writes                                                                                                                                                                                                                                                                                           | Source                                                                                                                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin_sessions`               | insert (new session on challenge success); update of `last_activity_at`/`last_totp_verified_at`; revoke, either `revoke_reason='revoked_by_admin'` (an explicit `revoke_admin_session` command probe against the smoke run's own session) or the automatic supersede path on a second concurrent session | Challenge and every subsequent authorized touch                                                                                                                                                                                                                  |
| `admin_security_identities`    | update of `failed_totp_attempts`/`locked_until`/`updated_at` only, via `svc_admin_record_totp_outcome` on every TOTP challenge attempt (success or failure) — never `state`, `bound_factor_id`, or `role`                                                                                                | A successful challenge is the first step of any smoke run, so this write is unavoidable, not optional instrumentation                                                                                                                                            |
| `admin_audit_events`           | insert only (append-only; no update/delete grant exists at the schema level)                                                                                                                                                                                                                             | Every operation the smoke run performs, success or denial                                                                                                                                                                                                        |
| `admin_denial_counters`        | upsert                                                                                                                                                                                                                                                                                                   | Any expected denial probe the smoke run includes (e.g. confirming a stale-session redirect)                                                                                                                                                                      |
| `admin_security_operations`    | insert/update, **but only** the no-op touches made by the `admin-reconcile` scan                                                                                                                                                                                                                         | The reconciliation scan runs on its own schedule regardless of the smoke run; a smoke run must not itself start, advance, or manually retry a `reset_admin_mfa` or `factor_incident_isolation` operation — those are incident/runbook actions, not routine smoke |
| `admin_command_authorizations` | insert/consume                                                                                                                                                                                                                                                                                           | Only if the smoke run includes a command probe (see below)                                                                                                                                                                                                       |
| `admin_command_executions`     | insert                                                                                                                                                                                                                                                                                                   | Only if the smoke run includes a command probe (see below)                                                                                                                                                                                                       |

### Command probe scope

If the smoke run includes an admin-command probe at all, it is limited to
`revoke_admin_session` targeting **the smoke run's own session** — proving
the command path denies/executes correctly without touching any other
Admin's live session. Any other command name (`invite_admin`, an OOB-only
service function, or anything that mutates `admin_security_identities`
beyond what challenge/session-refresh already does) is out of scope for a
smoke run; those get exercised in Staging (spec §12's fixture-identity
environment), not Production.

## Explicitly prohibited

A Production smoke run must never:

- Create an admin invitation (`admin_session_invitations` insert) — this is
  a real onboarding action with real consequences, not something to probe
  incidentally.
- Reveal any real personal field (`admin_reveal_field` against a live user's
  actual data) at all. There is no exception for this — a smoke run only
  ever probes the reveal _denial_ paths (missing purpose, stale session); it
  never completes a real reveal, regardless of how genuine or well-purposed
  the reveal request would be. Verifying that a real reveal succeeds and is
  correctly audited is a Staging-gate check (spec §12's fixture-identity
  environment), not a Production smoke check.
- Deactivate, tombstone, reset, or otherwise change the lifecycle `state` of
  any Admin identity — including the smoke run's own. The only in-scope
  state-adjacent write for the smoke run's own identity is the
  `admin_security_identities` TOTP-attempt bookkeeping listed in the
  allowed-writes table above; `state`, `bound_factor_id`, and `role` must
  never change as part of a smoke run, full stop.
- Touch any table outside the Admin security schema (`admin_*`) — in
  particular, `profiles.role` must never be written directly by a smoke run;
  the only writer of `role='admin'` is `svc_admin_bootstrap_identity`
  (`docs/runbooks/phase1-admin-oob-recovery.md`), which is an owner OOB
  runbook action, not a smoke check.
- Run with `service_role` or any Supabase secret embedded in a script that a
  non-owner could trigger. A Production smoke run authenticates as a real
  Admin browser session, the same way an actual Admin would (AGENTS.md §5).

## What "gate failure" means here

If a Production smoke run's actual writes (verified by querying
`admin_audit_events`/`admin_sessions`/etc. for the run's time window and
correlating by `admin_session_id`/`correlation_id`) include anything outside
the allowed table above, or touch any domain table at all, treat that as a
release-blocking defect: do not promote, and do not re-run the smoke to try
to get a "clean" pass without first understanding why the extra write
happened.
