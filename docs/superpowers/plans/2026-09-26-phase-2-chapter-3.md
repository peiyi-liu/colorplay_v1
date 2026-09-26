# Phase 2 通用內容工作平台＋第三章實作計畫

- 日期：2026-09-26（Asia/Taipei）
- 設計基準：protected `staging@9c42ba3d9e6552e4c135d3d52efad783dc526f57`（2026-09-26 唯讀重驗）
- 核准設計：`../specs/2026-09-26-colorplay-content-studio-design.md`，commit `85ba401`
- 原型結論：A 三欄編輯工作區＋C 全部內容清單，throwaway verdict commit `36573cf`
- 狀態：candidate implementation plan，待 Owner 一次核准；尚未授權產品實作或外部 mutation

## 1. Outcome

交付一套可支援全部章節、但先以第三章完成真實資料與驗收的 Admin Content Studio：

- `/admin/content` 管理 Course／Chapter／Section／Subtopic、RC、QB、CR、LT 與 Question；
- A 是預設三欄編輯工作區，C 是同頁的全部內容／批次管理模式；
- manual edit、XLSX／CSV＋media ZIP 共用同一 normalized authoring seam；
- 所有外部匯入只建立 draft；發布、封存與 rollback 由 server 產生 immutable version／event；
- 圖片保存 private master，產生 320／800／optional 1200 WebP immutable derivatives；
- Current Progress 只認 current published versions：非語意修正保留進度，新增 required content 或語意變更要求重做／重測；
- 第三章通過 Local 與另行授權的 Staging gate 後，其他章能以輸入內容為主，不再由工程師直接改 DB。

本 Phase 不新增其他題型 runner、不完成其他章內容、不改 XP／Token／Blook／成就規則、不操作 Production，也不執行 Phase 3 progression UI 改版。

## 2. Delivery topology

`staging` 會觸發 Vercel 自動部署，因此七個 bounded task PR **不得逐一直接合併 `staging`**：

1. Owner 核准本 plan 後，先把已核准的 rebaseline／spec／AC 文件整理成 docs-only commit；補齊 Admin identity、curriculum CRUD、A／C 模式、media、history／rollback 與 readiness 的缺漏 acceptance 條款，但不降低既有 AC-TCH／AC-PROG／AC-UI。
2. 從重新確認的 protected `staging` exact SHA 建立 `codex/phase2-ch3-integration`。
3. 每個 task branch 只包含一個 PR 範圍，依序 PR 到 integration branch；前一個合併後才建立下一個，避免 migration／generated types 衝突。
4. 每個 task PR 綠燈、完成一次 reviewer／一次 response 後刪除 task branch；不保留平行長壽命 feature branches。
5. 七個 task 完成與 Local gate 通過後，只建立一個 integration → `staging` final PR。Owner 核准 exact head 與 Hosted 順序後才合併，讓 Vercel 只更新一次完整 candidate。

Vercel PR Preview 只能視為 UI preview，不能替代 Local／Staging Supabase migration、Storage、RLS 或 content proof。

## 3. Fixed Module seams

正式實作建立 `src/features/content-studio/`，不得把新 authoring 行為繼續塞進已達 492 行、同時承擔 analytics 的 `teacher-content-repository.ts`。

| Module             | 小 Interface                                                                 | 隱藏的 implementation                                                               |
| ------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ContentAuthoring   | `listScope`、`readEditorState`、`saveDraft`、`validateDraft`、`previewDraft` | taxonomy／bank／RC／Question tables、revision conflict、Admin/MFA、safe projection  |
| ContentPublication | `publish`、`archive`、`rollback`、`listHistory`                              | frozen diff、impact classifier、transaction、current pointer、audit／retry receipt  |
| ContentMedia       | `createUpload`、`processUpload`、`readManifest`                              | quarantine、magic bytes、WASM resize／encode、hash、immutable objects、cleanup      |
| ContentImport      | `previewPackage`、`commitDrafts`                                             | ZIP／XLSX／CSV parsing、normalization、diff、warning confirmation、idempotency      |
| ContentReadiness   | `buildChapterReport`                                                         | parent／bank routing、versions、media、access matrix、source digest、migration head |

React、XLSX／CSV、Supabase RPC／Edge Function 與 CLI 是 Adapters；它們不得各自重做 stable-code、scope、impact 或 media validation。既有 `/teacher/content`、`/teacher/import` retirement 保持不變，不重新開放教師 authoring route。

## 4. Stop gates and invariants

- 開始 Task 1 前重驗 `origin/staging` exact SHA、clean worktree、migration lineage 與 Local Supabase exclusive window；任一不符即停。
- Schema 全部 additive／forward-compatible。不得 delete 或 rewrite historical attempt、completion、session、reward、audit 或舊 media object。
- 現有 published 第三章資料是 baseline；安裝 schema／backfill bank identity 本身不得降低任何人的 progress。
- Anonymous／Student／Teacher 不得讀 Admin drafts、correct answer、original master、quarantine、internal object path 或 publication internals。
- Browser 不決定 impact、正解、scope、hash、image validity 或 readiness；所有 mutation 重新驗 Admin identity、有效 MFA、expected revision、request ID。
- 新 migrations、generated DB types、shared content functions 與 Local Supabase stack 同時只能由目前 task owner 修改。
- 未另行授權不得 push integration branch、建立／合併 GitHub PR、執行 Hosted migration／import／Storage upload、部署或操作 Production。

## 5. Task PR sequence

### PR 1 — Canonical domain、bank 與 persistent draft foundation

**Goal:** 先建立所有後續功能共用的資料模型與 ContentAuthoring Interface，不接 UI。

**Owned files:**

- new forward migration `*_content_studio_foundation.sql`；
- `src/features/content-studio/api/{contracts,content-authoring-repository}.ts` 與 focused tests；
- generated `src/types/database.ts`；
- new pgTAP `074_content_studio_foundation.test.sql`。

**RED first:**

- QB／LT 只能屬於 Section bank，CR 只能屬於 Chapter bank；Question 恰屬一個 bank；
- duplicate stable code、parent mismatch、cross-kind move、published stable-code rename、invalid sort order 全被拒絕；
- Student／Teacher／Anonymous 讀 draft／correct option 為 0 rows 或 stable denial；
- stale expected revision 不可覆蓋較新 draft；相同 request ID 只回原 receipt。

**Implementation:**

- 新增 explicit `assessment_banks`，以 constraint 固定 `QB|LT + section`、`CR + chapter`；
- 對既有 QB／CR／LT rows 做 deterministic bank backfill，歷史 `legacy` rows 保留、不得冒充 current bank；
- Question current authoring 改以 `bank_id` 為 canonical parent；既有 frozen session references 不變；
- 新增 server-persisted `content_drafts` 與 revision／base-version／source／request identity；draft payload 只能經 trusted command 寫入；
- 提供 Admin-only tree／list／editor-state projection 與 save／validate command；projection 不暴露 table shape；
- 保持現有學生 Quiz／Live selector 行為，這個 PR 只建立 canonical identity 與 shadow verification，不做 publication cutover。

**Done:** focused Vitest、pgTAP 074、database type contract、lint、typecheck、`git diff --check` 綠；一次 review 完成。

### PR 2 — Server-authoritative publication、history、rollback 與 Current Progress impact

**Goal:** 把 draft 轉成 immutable current version，並讓 progress 對新內容版本做正確反應。

**Owned files:**

- new migration `*_content_studio_publication.sql`；
- ContentPublication contracts／repository／classifier tests；
- learning-path／Quiz／Live selector 的必要 DB functions；
- new pgTAP `075_content_studio_publication.test.sql`。

**RED first:**

- client 嘗試把語意／正解變更降級為 `compatible` 必須被拒；
- typo／排版／非語意 alt 修正保留 current qualification；
- RC 語意或教學 media 變更要求 recompletion；Question／bank／selection semantics 變更要求 requalification；
- inserted required RC 對所有既有／新 learner 生效，無 grandfather／cutoff／人工 exemption；
- rollback 建立新 version/event，不刪舊版；相同 request 重送不重複發布；
- historical session、attempt、completion、timestamp、reward ledger 全部原樣保留。

**Implementation:**

- 擴充 `content_versions`／`content_publication_events` 的 entity identity、frozen payload/hash、impact、reason、changed-field digest 與 retry identity；以 DB rule 保護 append-only；
- 建立 publish／archive／rollback trusted commands：transaction 內重驗 revision、scope、media manifest、current version 與 actor/MFA；
- server classifier 採 allowlisted diff；缺漏或不明確時使用該 content type 最嚴格 impact；
- 將當時 current published 第三章接受為 baseline，不製造 publication event、不重設 progress；
- 將 Quiz／Live／review current selectors 切到 canonical bank/version，同時保留 frozen historical selectors。

**Acceptance:** AC-TCH-002、AC-PROG-014、AC-PROG-015、AC-PROG-008。Focused Vitest、pgTAP 075、lint、typecheck、`git diff --check` 綠；一次 review 完成。

### PR 3 — Trusted media processing and private delivery

**Goal:** 從 Admin 原圖產生較小、可驗證、不可覆寫的學生圖片，不再依賴人工 Canvas 成品作正式 authority。

**Owned files:**

- one short ADR for the pinned Deno-compatible WASM image processor；
- new migration `*_content_media_pipeline.sql`；
- `supabase/functions/content-media/**` 與 shared contracts/tests；
- `src/features/content-studio/api/content-media-repository.ts`；
- pgTAP `076_content_media_pipeline.test.sql` 與 focused contracts。

**Processor gate before implementation:**

- 在 Local fixture 證明 JPG／PNG／WebP decode、EXIF orientation、alpha、320／800 resize、WebP encode 與 deterministic manifest；
- color-critical gradient／swatch fixture 必須通過 visual/SSIM 門檻；若 package 無法保留教學辨識度或不能在 Supabase Edge runtime 執行，本 PR 停止並回報，不更換架構或偷用 browser output。

**Implementation:**

- private `content-media-quarantine` 與 immutable `content-media` paths；master 與 derivatives 分開、`upsert=false`；
- Admin/MFA 取得 run-scoped signed upload，Edge 重驗 magic bytes、MIME、2 MiB、4096px、hash、alpha/orientation；拒絕 SVG、polyglot、path traversal；
- 由 master 直接產生 320px（20–40 KiB）、800px（60–120 KiB）與必要的 color-critical 1200px lossless/高品質 variant（≤250 KiB）；品質不足時 blocking warning／reject；
- manifest 保存 source／pixel semantic／output hashes、dimensions、bytes、MIME、quality mode、processor version；ContentAuthoring 只接受 verified manifest identity；
- failure 只清理該 run quarantine；不掃描或刪除其他 run／舊 object；
- Student 只透過 current published card/question projection 取得短期 signed URLs；`srcset`／`sizes`、width／height、first eager、others lazy＋async decode。

**Done:** processor fixtures、Edge tests、pgTAP 076、Storage RLS positive/negative、cleanup/idempotency contracts、lint、typecheck、`git diff --check` 綠；一次 review 完成。

### PR 4 — Unified XLSX／CSV＋media ZIP import Module

**Goal:** 取代互相衝突的 CLI／Sheet／三-sheet contract，所有外部來源只經同一 normalized import seam 建立 draft。

**Owned files:**

- `src/features/content-studio/import/**` parser／normalizer／template contracts；
- `supabase/functions/content-import/**` trusted Adapter；
- new migration `*_content_import_v2.sql`；
- existing `scripts/content/*` 改為相同 Interface 的 CLI Adapters；
- downloadable template fixtures、focused tests、pgTAP `077_content_import_v2.test.sql`。

**RED first:**

- 缺 sheet/file、mixed XLSX＋CSV authority、duplicate code、invalid parent/bank、bad answer、unsafe text、missing media/alt、formula/path injection、ZIP traversal/bomb、oversize/depth/row limit 全部 fail closed；
- dry-run 寫入 0 rows；error 阻止整批 commit；warning 未 explicit confirm 不可 commit；
- DB failure 全 transaction rollback；replay 回原 receipt；套件缺少既有 code 不 archive/delete；
- commit 結果只有 drafts，Student projection 不變。

**Implementation:**

- 套件格式固定為 `content.xlsx` 或 `csv/*.csv` 加 `media/`，不接受 Sheet image、data URL 或任意 remote URL；
- browser parse 只供快速 preview；trusted Edge Adapter 從 quarantine object 重新解析、normalize、驗證並呼叫 DB transaction；
- diff 分 create／update／no-op／warning／error，receipt 保存 source digest、actor、request ID、每個 stable code disposition 與 draft revision；
- Manual Editor、XLSX、CSV 與既有 Google Sheet compatibility Adapter 共用 normalized types／rules；PostgreSQL/current published content 才是 SSOT；
- 下載範本必須能由 Excel／LibreOffice／SheetJS 開啟，包含 Course／Chapter／Section／Subtopic／RC／QB／CR／LT／Media sheets 與合法 example rows。

**Acceptance:** AC-TCH-003～008。Focused parser/property tests、Edge tests、pgTAP 077、XLSX round-trip、lint、typecheck、`git diff --check` 綠；一次 review 完成。

### PR 5 — Admin Content Studio A＋C manual authoring UI

**Goal:** 先讓 Admin 不靠匯入即可管理所有結構、RC、bank 與 Question drafts。

**Owned files:**

- `src/features/content-studio/pages/admin-content-page.tsx`；
- content tree／list／editor／preview components、hooks、query keys、CSS 與 tests；
- `src/app/router/create-app-router.tsx`；
- `src/features/admin/components/admin-shell.tsx` 與 navigation tests；
- dev harness／focused Playwright spec。

**Implementation:**

- `/admin/content` 仍在 `RequireAdminIdentity`＋`RequirePrivilegedSession`＋`AdminShell` 內；非 Admin route／direct RPC 均拒絕；
- 預設 A：左側 hierarchy/banks、中間 scoped list、右側 editor；C：同頁全部內容搜尋、filter、status/error/media 檢查與批次選取；
- A／C 切換保留可合理保留的 chapter／section、filter、selected entity；新增／編輯回 A；
- RHF＋Zod 表單管理 Curriculum Node、Review Card、Assessment Bank、共用 Question；stable code 發布後 readonly；
- 所有 edit 都只 save persistent draft；提供 server validation、safe student preview、unsaved-change guard、revision conflict reload/compare；
- loading／empty／error／permission／stale revision／partial network failure 均有可操作狀態；不顯示 mock success；
- 使用核准原型的資訊架構，但重新實作正式型別、錯誤與 accessibility；不得複製 prototype JS/CSS。

**Acceptance:** AC-TCH-002、AC-UI-003／004／006／011／015。RTL/Vitest、router/security contracts、375×812、812×375、1280×720 focused Playwright、console/network health、lint、typecheck、build 綠；一次 review 完成。

### PR 6 — Import、media、publication and history operator workflows

**Goal:** 把 PR 2–4 的可信任能力接到同一 Admin 工作台，完成端到端內容操作。

**Owned files:**

- import wizard、media uploader/manifest view、publish-impact dialog、history/rollback drawer；
- content-studio repositories/hooks and focused UI tests；
- import/browser harness fixtures；
- existing media/import operator docs update。

**Implementation:**

- Import：Upload → trusted validation → diff preview → warning confirm → draft commit；逐列顯示 sheet/file、row、field、code、message；
- Media：原檔 preview、alt／semantic role／order、processing progress、derivative summary、blocking quality state；browser preview 不是 formal manifest；
- Publish：顯示 frozen field/media/scope diff 與 server-derived impact，二次確認後才送 command；client 無 impact override；
- History：current/draft/archived versions、actor/time/reason、safe diff；rollback 以舊版建立新 draft，經同一 validator 發布成新的 current version/event；
- archive／bulk action 顯示受影響 scope，禁止 hard delete referenced content；
- 所有成功畫面以 server receipt 為準，request retry 不生成重複 draft/version/object/event。

**Acceptance:** AC-TCH-003～008、AC-PROG-014／015、AC-UI-006／011／015。Focused browser sequence至少涵蓋合法套件、逐列錯誤、media failure、revision conflict、publish、rollback；lint、typecheck、build 綠；一次 review 完成。

### PR 7 — Chapter 3 canonical package、readiness authority and Local phase gate

**Goal:** 用第三章真實內容證明通用架構可用，並建立唯一 readiness authority；不碰 Hosted。

**Owned files:**

- versioned Chapter 3 XLSX/CSV package＋media manifest/source digest（不得含 secret 或 signed URL）；
- `src/features/content-studio/readiness/**` 或等價 script Module；
- `scripts/acceptance/run-content-studio-ch3.sh` 與 finalizer；
- focused readiness contracts、Chapter 3 pgTAP、ignored `artifacts/acceptance/` manifest。

**Required report:**

- exact Course／Chapter／Section／Subtopic、RC、QB／CR／LT bank 與 Question counts；
- stable-code uniqueness、parent/scope/bank routing、draft/current version、impact/history、source digest；
- media master/derivative manifest/hash/alt/semantic role/current mapping；
- dry-run／commit receipt equality、migration head、zero unresolved error/warning；
- Anonymous／Student／Teacher/Admin access matrix，且 student RPC/types/fixtures/build 無 `is_correct`、draft、master、quarantine 或 internal path；
- current progress fixtures證明 compatible 保留、semantic/new required content 降低 current percentage 並要求重做，而歷史 facts/rewards 不變。

**Local gate commands:**

- scoped Prettier／ESLint、`pnpm lint`、`pnpm typecheck`、`pnpm build`；
- focused ContentAuthoring／Publication／Media／Import／Readiness Vitest；
- pgTAP 074–077、既有 003／020／021／026／027／028／049／050／070；
- focused Chromium browser journeys at three viewports；
- one phase review／one response round，無 unresolved Critical／High。

只可宣稱 `Phase 2 Content Studio + Chapter 3 Local slice PASS`。不得宣稱 Hosted、其他章、Production、容量或 Phase 8 release proof。

## 6. Staging gate — separate Owner authorization

Local gate 後提供一張 mutation manifest，列出：final integration head SHA、migration range/checksums、Staging Supabase ref、content package digest、media source/output hashes、預計新增／修改／不變 counts、cleanup targets、GitHub final PR 與 Vercel project。

建議順序：

1. Owner 核准 exact final head 與一次 Staging mutation window。
2. 先套用 additive migrations並驗 migration ledger／RLS；舊 Staging frontend 必須保持可用。
3. 將 media/package 建成 drafts並核對 receipt，仍不 publish。
4. Owner 另行核准 final integration PR merge；GitHub `staging` merge 自動觸發 Vercel。
5. 驗證 Vercel deployment exact SHA、Admin A＋C、publish/rollback、student current progress/media，以及 cleanup；不得手動 rerun 失敗 gate。

成功後只能宣稱 `Phase 2 通用內容工作平台＋第三章內容 slice PASS`。Production、其他章輸入、真人裝置 proof 與 Phase 8 仍未驗證。

## 7. Estimated execution

- 文件／worktree preflight：1 個 focused session。
- PR 1–4 backend/data：每個 1–2 個 focused sessions。
- PR 5–6 Admin UI/workflows：每個 2–3 個 focused sessions。
- PR 7 Local gate：1–2 個 focused sessions。
- 合計約 11–17 個 focused implementation sessions；Hosted 等待／Owner gates 不計入。
