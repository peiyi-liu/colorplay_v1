# ColorPlay React + Supabase Platform Design

## Status

Design baseline prepared for review. The detailed normative requirements are intentionally split across `spec/` and `acceptance/` so Codex can load only the relevant domain while retaining a single source of truth.

## Goal

Rebuild the legacy single-file ColorPlay prototype as a deployable browser-based game-based learning platform using React, TypeScript, Vite, Tailwind CSS and Supabase, with server-authoritative scoring, central data, RLS authorization and evidence-based acceptance.

## Architecture Summary

- React SPA handles presentation and user interaction.
- TanStack Query owns server state; Zustand is restricted to ephemeral quiz UI state.
- Supabase Auth identifies users.
- PostgreSQL + RLS enforces resource ownership and classroom authorization.
- Sensitive multi-table commands use secure RPC/Edge Functions.
- Quiz answers, rewards, purchases and final results are server-authoritative and idempotent.
- Playwright acceptance uses real Supabase and requires headed screenshots, sequences, traces and DB/network proof.
- Student UI follows Flat Design and cognitive-load controls; software-keyboard and Android Back behavior require real-device evidence.

## Normative References

- `../../../AGENTS.md`
- `../../../spec/00-project-charter.md`
- `../../../spec/01-user-roles-and-flows.md`
- `../../../spec/02-system-architecture.md`
- `../../../spec/03-data-model-and-rls.md`
- `../../../spec/04-security-and-privacy.md`
- `../../../spec/05-game-mechanics.md`
- `../../../spec/06-content-and-question-bank.md`
- `../../../spec/07-ui-visual-system.md`
- `../../../spec/08-testing-and-evidence.md`
- `../../../spec/09-nonfunctional-requirements.md`
- `../../../spec/10-migration-roadmap.md`
- `../../../acceptance/ACCEPTANCE_CRITERIA.md`

## Deliberate MVP Boundaries

Included: auth, classroom roles, published learning content, single-choice quiz, server scoring, XP/token/level, Blook shop, classroom leaderboard, teacher content/import/analytics/export, audit and acceptance evidence.

Deferred: real-time multiplayer engine, AI authoring, native apps, SCORM/LTI, payment, 3D game, adaptive learning engine and additional interaction types.

## Design Review Checklist

- [ ] Product scope is appropriate for the thesis/pilot timeline.
- [ ] Auth method is selected: Email/password or magic link.
- [ ] Research identity policy is selected: pseudonymous display by default.
- [ ] Reward decay policy is accepted.
- [ ] Classroom leaderboard can be disabled/anonymized by teacher.
- [ ] Data retention period is aligned with ethics/consent documentation.
- [ ] Deployment provider for React static assets is selected.
- [ ] Supabase plan supports required backup/RPO/RTO.

After approval, use Superpowers `writing-plans` to create one implementation plan per migration phase rather than one oversized plan for the entire platform.
