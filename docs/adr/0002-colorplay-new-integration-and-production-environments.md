# ADR 0002: `colorplay-new` integration and Production environments

- Status: Accepted
- Decision date: 2026-07-16
- Implementation baseline: `feat/playable-vertical-slice` at `394c58f`
- Supersedes: any assumption that the legacy hosted Supabase project is Production-ready

## Context

The verified `colorplay` repository already owns the React/Vite/Supabase foundation, server-authoritative quiz path, RLS baseline, and the approved 45-question import. `colorplay-new` contains useful product and presentation references, but its Next.js architecture, mock state, client authority, and legacy database policies do not satisfy the ColorPlay trust boundary.

The legacy hosted project also contains malformed imported identifiers, invalid question rows, personal test identities, and anonymous access to data that must be private. Reusing it as Production would transfer unknown history and unsafe authorization into the formal student environment.

## Decision

1. The canonical implementation remains the verified `colorplay` Vite repository. `colorplay-new` is a read-only product/content reference and is never merged wholesale.
2. A new clean Supabase project, created from repository migrations beginning at migration zero, is the only Production database candidate.
3. The legacy hosted project may become Staging only after its sanitized inventory is committed, its unsafe schema/data is destructively reset, all repository migrations are replayed, and it is seeded with synthetic test identities and approved content only.
4. Production never receives Staging Auth users, synthetic acceptance records, invalid remote rows, Dashboard-only schema edits, or legacy RLS policies.
5. Repository migrations, generated database types, reviewed seed/import inputs, and acceptance evidence are the deployment authority. Hosted Dashboard edits cannot replace tracked changes.
6. Vercel Preview maps to Staging. Vercel Production from `main` maps to the new Production project. Browser configuration contains only the two approved public variable names; server credentials remain outside the Vite/browser boundary.
7. Existing credentials are not migration inputs. Rotation, hosted project creation, project linking, environment-value upload, reset, and deployment are `NOT EXECUTED` in Phase 0.

## Migration gates

### Staging reset gate

- Preserve only this sanitized inventory and reviewed aggregate counts.
- Confirm no unique valid content exists outside the verified import pipeline.
- Rotate credentials according to the environment runbook.
- Reset the hosted project and replay tracked migrations without manual schema repair.
- Create synthetic users through the reviewed seed workflow.
- Run the applicable phase RLS, integration, and acceptance gates before it serves Preview.

### Production creation gate

- Create a distinct Supabase organization/project target with named primary and backup operations owners.
- Apply migrations from zero through a protected release workflow.
- Import only teacher-approved content with provenance and validation records.
- Configure exact Site URL/redirects, custom SMTP, backup, monitoring, and restore evidence.
- Verify there are no seed users, Staging identities, anonymous product reads, or browser secrets.

## Consequences

- Product ideas are rebuilt as secure vertical slices instead of copied as code.
- Two hosted projects incur additional setup and operational cost, but prevent test activity and weak legacy policy from contaminating formal student data.
- The old hosted project can be destroyed only during the separately approved Staging reset operation; this ADR does not authorize that mutation.
- Reversing the clean-Production decision requires a replacement ADR with a new security audit, migration proof, and explicit project-owner approval.

## Acceptance traceability

This decision is enforced by `AC-ENV-003`, `AC-ENV-005`–`AC-ENV-008`, `AC-MIG-001`–`AC-MIG-005`, `AC-SEC-007`, and `AC-DOC-001`.
