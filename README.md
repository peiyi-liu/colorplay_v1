# ColorPlay

ColorPlay 是技術型高中設計群「色彩原理」遊戲式教學平台。Frontend 使用 React + TypeScript + Vite；Supabase 提供 Auth、PostgreSQL、RLS、Storage、Realtime、RPC 與 Edge Functions；Vercel 負責靜態 SPA 部署。瀏覽器不可信，正式答案、分數、XP、Token、進度、購買、排名與角色權限都由後端決定。

## Current verified baseline

- App shell、Supabase Auth、profile/RLS 與 playable quiz/result vertical slice。
- 45 題 teacher spreadsheet pipeline：第三章 37 題、第四章 8 題。
- Server-authoritative answer submission、timeout、idempotency 與 finalized result。
- React/Vite delivery contract、Supabase CLI local stack、Vitest/RTL/Playwright/pgTAP 基礎。

Economy、Achievements、Classroom/Leaderboard、Assignments、ColorPlay Live、完整 learning progress、teacher tools、research export 與 Production release 仍依 `spec/10-migration-roadmap.md` 分 phase 實作；文件規格不等於功能完成。

## Start here

1. 讀 `AGENTS.md`，再讀任務直接相關的 1–2 份 spec。
2. 安裝 Node/pnpm/Docker 後執行 `pnpm install --frozen-lockfile`。
3. 一般檢查：`pnpm lint && pnpm typecheck && pnpm test`。
4. Local Supabase/DB gate：`pnpm test:db`；browser 流程使用 `bash scripts/test-e2e-local.sh`。
5. 每個新 phase 先完成 Superpowers brainstorming、核准 design、writing-plans，再於 worktree 執行。

`pnpm acceptance` 與 Foundation Task 16 依 ADR 0001 延後到 Phase 8 release gate。日常 task 不執行、不建立 screenshot evidence directory。

## Repository map

```text
src/                  React app and feature boundaries
supabase/             migrations, functions, seeds, DB/RLS tests
scripts/              acceptance, content, Supabase and verification tools
tests/                contracts, integration, E2E, fixtures and visual tests
spec/                 normative product/architecture/testing specifications
acceptance/           measurable release criteria and evidence template
docs/adr/              approved architecture decisions
docs/deployment/       environment, Vercel and Production controls
docs/migration/        colorplay-new parity/content/database audit records
docs/superpowers/      approved designs and implementation plans
legacy/                immutable original HTML UX reference
```

## Environment contract

| Context    | Frontend                      | Supabase                      | Data                      |
| ---------- | ----------------------------- | ----------------------------- | ------------------------- |
| Local      | Vite dev/built preview        | Supabase CLI                  | Deterministic synthetic   |
| Staging    | Vercel Preview                | Rebuilt legacy hosted project | Synthetic acceptance only |
| Production | Vercel Production from `main` | New clean project             | Approved formal data only |

Browser configuration allowlist：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`service_role`、database password、JWT/SMTP/backup/monitoring secrets 不得使用 `VITE_`、不得進 repo/browser/log/evidence。完整契約見 `docs/deployment/environment-matrix.md`、`docs/deployment/production-readiness.md` 與 ADR 0002。

## Deployment decisions

- GitHub repository：`peiyi-liu/colorplay`。
- Vercel Production Branch：`main`。
- Build Command：`npm run build`；Output Directory：`dist`。
- `vercel.json` 提供 SPA fallback，deep-link refresh 不得 404。
- Preview 使用 Staging public values；Production 使用 distinct Production public values。
- Production database migration 是獨立 protected gate，不由 frontend deployment 盲推。

## Manual release inputs

Phase 8 前仍需由 project owner 指派 primary/backup operations contacts、選定 formal domain/Sender、核准 retention/research policy、確認 Supabase plan 能達 RPO 24 hours/RTO 8 hours，並授權 destructive Staging reset。這些是明確人工 release inputs，不由 agent 猜測或代填。

## Non-negotiable boundaries

- `legacy/colorplay-original.html` 唯讀；不得複製或改寫。
- `colorplay-new` 只作 product/content/UI reference；不移植 Next.js/mock/client-authoritative code 或 legacy SQL/RLS。
- Acceptance 不使用 mock application API；Production 不跑 automated mutation tests。
- UI phase/release evidence 需 real browser；`AC-UI-010`／`AC-UI-012` 的 OS keyboard/Android Back 由人類實機提供。
