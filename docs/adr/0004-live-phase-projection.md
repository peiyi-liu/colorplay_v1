# ADR 0004: The client projects Live phase; Postgres stays the only authority

- Status: **Accepted**（owner 2026-07-25 裁定）
- 相關：`CONTEXT.md`（Phase / Host / Projector / Participant）、
  `supabase/migrations/20260717000800_live_play_commands.sql`

## Context

A Live Session's state machine is owned by Postgres: the `live_session_state` enum,
and plpgsql guards that reject an illegal transition (`live_play_commands.sql:106-148`,
including the end-of-quiz rule at `:143`). The client never computes the next state.

What the client does own is the _projection_ of those guards — which actions to offer
the Host right now, and what each audience should see. That projection had been written
four separate times across the Live pages and components, and one copy re-derived the
end-of-quiz rule independently.

## Decision

The projection stays on the client, consolidated into one module per audience
(`participantView` / `hostConsoleView` / `projectorView`). Postgres remains the only
authority on what is legal. A table-driven test encodes the SQL guard matrix as a
fixture so a drifting projection fails CI.

## Considered and rejected

**Have the server return `availableTransitions` on `get_live_session_state`.** This
removes drift structurally — the client would never re-derive a rule. Rejected because
it puts UI affordances behind a database migration: every change to which buttons a
Host is offered would require editing SQL, regenerating types, and updating pgTAP,
for a class of change that is otherwise pure front-end. The failure mode we accept
instead is bounded: a wrong projection shows a wrong button label, the transition is
refused with `INVALID_TRANSITION`, and `useLiveTransition` already invalidates session
state on settle, so the screen self-corrects.

Anyone proposing to move the transition menu server-side should read this first — the
objection is not that it wouldn't work, it is the migration cost per UI change.

## Consequences

- Client-side transition rules are legitimate, but only in one place per audience.
  A second copy is a defect, not a style preference.
- The guard-matrix fixture test must be updated whenever the SQL guards change;
  that test failing means the client is wrong, not the database.
- Adding or reordering Host actions needs no migration.
