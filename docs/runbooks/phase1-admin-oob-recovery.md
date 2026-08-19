# Phase 1 Admin Out-of-Band (OOB) Recovery Runbook

Spec §4.2, §8.1 (runbook operation), §12, §14.4.

This runbook is for the **owner only**, executed through the Supabase SQL
editor or a controlled `psql` session connected with the project's
`service_role` (or a direct Postgres superuser/owner role) — **never through
the product UI**. The product UI has no admin-lifecycle bypass by design
(AGENTS.md §5): every procedure below exists precisely because the normal
enrollment/challenge/reset flows cannot reach these states on their own.

## Ground rules

- Every procedure runs under a fresh `runbook_operation_id` (`uuidgen`), used
  as the `p_runbook_operation_id` argument to every RPC call in that
  procedure. Never reuse an operation ID across procedures or across
  attempts — each attempt gets a new one, so the audit trail never has to
  guess which invocation a given event belongs to.
- No step in any procedure bypasses TOTP enrollment or MFA challenge. These
  procedures move an identity between lifecycle states (or sever a mapping);
  they never fabricate a bound factor or an authenticated privileged session.
- Do not include the OOB service functions' output, this document, or any
  operator notification in a place where secrets could leak — none of these
  functions accept or return a TOTP secret, password, or session token, but
  copy-pasting raw `jsonb` output into a shared channel is still discouraged.
  Record only the operation ID, the affected `user_id`/`principal_id`, and
  the `outcome`.
- Every function below is `service_role`-only (`revoke ... from public, anon,
authenticated`); it cannot be called from the browser or from any
  `anon`/`authenticated` session no matter what UI state a user reaches.
- After every procedure, confirm the resulting `admin_audit_events` row has
  `actor_type = 'owner_out_of_band'` and `runbook_operation_id` equal to the
  operation ID just used. If it does not, stop and investigate before
  treating the procedure as complete — the absence of that row means the
  change did not go through the OOB path this runbook assumes.

## Procedure 1 — First Admin bootstrap

Use when there is no Admin identity yet and the owner needs to promote the
very first Admin user (spec §4.2). This is also how the local/CI fixture
seeding path (`scripts/supabase/seed-auth.ts`, local-only per spec §12)
provisions its Admin fixtures — the same function, the same invariant.

**Pre-check** — confirm the target `auth.users` row exists and has no
existing Admin identity yet. `svc_admin_bootstrap_identity` is idempotent
(a second call against an existing identity returns
`{"outcome":"ok","idempotent":true}` without re-running the promotion), so
running the pre-check is about knowing whether you are creating a new
identity or confirming an existing one — not a hard precondition the call
enforces itself:

```sql
select id, email from auth.users where email = '<owner-provided email>';

select admin_user_id, state
from public.admin_security_identities
where admin_user_id = '<user_id from above>';
-- expect: 0 rows (first bootstrap) or a row you already recognize (idempotent re-run)
```

**Operation**:

```sql
select public.svc_admin_bootstrap_identity(
  '<user_id>'::uuid, '<runbook_operation_id>'::uuid);
```

`role='admin'` is promoted **inside this function only** — do not run a
manual `update profiles set role='admin' ...` before or instead of this
call. A manually-set role with no corresponding `admin_security_identities`
row is invisible to every admin RPC's authorization check and will not
behave like a real Admin identity.

**Post-check**:

```sql
select role from public.profiles where id = '<user_id>';
-- expect: 'admin'

select admin_user_id, state, bound_factor_id
from public.admin_security_identities
where admin_user_id = '<user_id>';
-- expect: state = 'active_pending_mfa', bound_factor_id is null
```

**Audit confirmation**:

```sql
select actor_type, action, result, runbook_operation_id
from public.admin_audit_events
where action = 'owner_bootstrap'
  and runbook_operation_id = '<runbook_operation_id>'::uuid;
-- expect: exactly 1 row, actor_type = 'owner_out_of_band', result = 'success'
```

The user can now sign in through the normal teacher-login form and will be
routed to `/admin/mfa/enroll` to bind their own TOTP factor. No further
owner action is required.

## Procedure 2 — Last-Admin factor incident / loss

Use when an Admin's TOTP device is lost, compromised, or otherwise
unrecoverable through self-service, **and this is the last remaining way to
reach that identity's factor** (if another Admin session is still live and
trusted, prefer the in-product `revoke_admin_session` command over this
runbook — see `docs/deployment/phase1-production-smoke-manifest.md` for
where that command is allowed to run outside a full incident).

This is a two-step, deliberately-separated procedure: isolate immediately
(safety first, no identity check beyond "does this admin_user_id have an
identity"), then only complete recovery after the owner has independently
verified who they are talking to.

**Step 2a — isolate immediately**:

```sql
select public.svc_admin_isolate_factor_incident_oob(
  '<user_id>'::uuid, '<runbook_operation_id>'::uuid);
```

This call is the OOB-specific entry point — it is a distinct function from
`svc_admin_isolate_factor_incident` (the automatic Edge-triggered detection
path). Never substitute one for the other: the OOB entry point is the only
one that records `actor_type = 'owner_out_of_band'` with this operation ID,
and using the automatic path here would misattribute the isolation in the
audit trail.

Effect (verify against the post-check below, do not assume): the identity
moves to `recovery_pending` with `bound_factor_id` cleared, every active
`admin_sessions` row for that user is revoked with
`revoke_reason = 'factor_incident'`, and a `factor_incident_isolation`
operation row is created.

**Post-check for 2a**:

```sql
select admin_user_id, state, bound_factor_id
from public.admin_security_identities
where admin_user_id = '<user_id>';
-- expect: state = 'recovery_pending', bound_factor_id is null

select id, revoked_at, revoke_reason
from public.admin_sessions
where admin_user_id = '<user_id>' and revoked_at is not null
order by revoked_at desc limit 5;
-- expect: every previously-active session now has revoke_reason = 'factor_incident'
```

**Between 2a and 2b — clear the compromised factor and verify identity**:
Outside this runbook's SQL, using the Supabase Auth Admin API (not the
product UI, not this runbook's `psql`/SQL-editor session — this step
specifically needs the MFA factor management API, which is a different
surface), remove the affected user's bound TOTP factor(s) so a fresh
enrollment is possible. Then independently verify the requester's identity
through an out-of-band channel the owner already trusts (this runbook does
not — and cannot — specify what that channel is; it is an organizational
control, not a technical one).

**Step 2b — complete recovery, after identity is verified**:

```sql
select public.svc_admin_complete_oob_recovery(
  '<user_id>'::uuid, '<runbook_operation_id>'::uuid);
```

Use a **new** `runbook_operation_id` for step 2b — it is a separate
operation from 2a, executed after a real-world verification gap, and the
audit trail should reflect that gap rather than implying both steps
happened atomically.

This moves the identity from `recovery_pending` straight to
`active_pending_mfa` — **never directly to `active`**. The affected Admin
must re-enroll a TOTP factor through the normal `/admin/mfa/enroll` flow
before they can do anything privileged again. If the identity is not
currently in `recovery_pending` (e.g. step 2a was never run, or a different
recovery already completed), the call denies with `SECURITY_OPERATION_PENDING`
instead of silently doing nothing — treat that denial as a signal to stop
and re-read the identity's actual current state before retrying.

**Post-check for 2b**:

```sql
select admin_user_id, state, bound_factor_id
from public.admin_security_identities
where admin_user_id = '<user_id>';
-- expect: state = 'active_pending_mfa', bound_factor_id is null
```

**Audit confirmation** (check both operation IDs):

```sql
select actor_type, action, result, runbook_operation_id
from public.admin_audit_events
where action in ('factor_incident_isolated', 'oob_recovery_completed')
  and runbook_operation_id in
    ('<step_2a_operation_id>'::uuid, '<step_2b_operation_id>'::uuid)
order by occurred_at asc;
-- expect: 2 rows, both actor_type = 'owner_out_of_band', both result = 'success'
```

## Procedure 3 — Lawful principal tombstone

Use for a legally-required removal of the mapping between an audit principal
and a real user (e.g. a data-subject deletion request), without deleting the
audit trail itself — the events an Admin generated remain permanently, only
the link back to who they were is severed (spec §10).

**Pre-check**:

```sql
select id, user_id, tombstoned_at
from public.admin_audit_principals
where user_id = '<user_id>';
-- note the principal_id for the operation below; expect tombstoned_at is null
```

**Operation**:

```sql
select public.svc_admin_tombstone_principal(
  '<principal_id>'::uuid, '<runbook_operation_id>'::uuid);
```

This call is idempotent — calling it again on an already-tombstoned
principal returns `{"outcome":"ok","idempotent":true}` without touching
anything further.

**Post-check**:

```sql
select id, user_id, tombstoned_at
from public.admin_audit_principals
where id = '<principal_id>';
-- expect: user_id is null, tombstoned_at is not null

select count(*) from public.admin_audit_events
where actor_principal_id = '<principal_id>' or target_principal_id = '<principal_id>';
-- expect: unchanged from before the tombstone — every event this principal
-- ever appeared in (as actor or target) still exists, only the principal's
-- own user_id link is now null
```

**Audit confirmation**:

```sql
select actor_type, action, result, runbook_operation_id
from public.admin_audit_events
where action = 'principal_tombstoned'
  and runbook_operation_id = '<runbook_operation_id>'::uuid;
-- expect: exactly 1 row, actor_type = 'owner_out_of_band', result = 'success'
```

If the underlying `auth.users` row also needs to be deleted (a full account
deletion, not just severing the audit mapping), that is a separate Supabase
Auth Admin API action outside this runbook's scope — the tombstone above
must run first, since `admin_audit_principals.user_id` references
`auth.users(id)` and the constraint on that table requires the mapping to be
cleared before the referenced row can safely go away.

## What this runbook explicitly does not cover

- Routine session revocation while another trusted Admin session is live —
  use the in-product `revoke_admin_session` command instead (see the smoke
  manifest for its allowed-write scope).
- The automatic `reset_admin_mfa` saga (self-service reset with a fresh
  factor re-bind) — that path is entirely in-product and does not touch this
  runbook's functions.
- Any notification content or channel for telling an affected Admin their
  identity changed state — that is an organizational process, not a
  technical step this runbook can specify.
