# Phase 0A Local＋Staging Foundation Closeout Plan

> **Owner-approved scope:** 2026-09-11 選擇方案 A。決策與 0A／0B 邊界見
> `docs/superpowers/specs/2026-09-11-phase-0a-0b-rebaseline-decision.md`。

**目標：**以目前 canonical `staging` 為基礎，關閉 Local／Staging release
foundation；不建立 Production Candidate、不遷移 Production、不刪 Sydney。

**完成估算：**3–5 個專注工作天，外加 owner approval／CI 等待時間。每個 task
獨立執行、驗證、一次 Codex review；前一 task 未通過不得偷跑下一 task 的 Hosted
mutation。

## 0. 完成定義

Phase 0A 只有在下列五項都完成時才能標記 `PHASE 0A COMPLETE`：

1. review manifest SSOT regression 已修，report／seed／generated fixture 一致為 8
   cards（3／3／2），相關 contract 綠。
2. 同一個 canonical exact SHA 的 Staging automated foundation jobs 通過：build／
   deploy、environment fingerprint、synthetic student＋teacher Auth/profile、monitoring
   proof、read-only smoke、browser/RWD 與 `phase-acceptance`。
3. 該 exact SHA 的 Phase 0 contracts 通過，並完成一次明確授權、隔離、無殘留的
   encrypted synthetic DB／Auth-exclusion／Storage restore drill；成功 evidence 經
   verifier 驗證。
4. Staging publishable＋named secret cutover 有 bundle／function 正向證據；舊 legacy
   anon／service-role 已在 owner gate 後失效，且 old-negative／new-positive 與 secret
   scan 通過；意外 Hosted namespace 已正確處置。
5. `CONTEXT.md`、canonical roadmap 與 handoff 記錄同一 exact SHA、evidence、
   deferred 0B 與 remaining unknown；無 unresolved Critical／High finding。

0A 不要求 Production smoke、Production RPO／RTO、Tokyo Candidate、Sydney retirement、
B2 Object Lock 權威證據或 human real-device release proof。這些項目保持
`NOT VERIFIED — deferred to Phase 0B / Phase 8`，不得改寫為 PASS。

### 0.1 Phase 0A automated evidence manifest（0A-5 的必要輸入）

`PHASE 0A COMPLETE` 不得只憑敘述宣稱；必須先有一份獨立、sanitized、綁定同一
exact Staging SHA 的 evidence manifest／receipt，至少彙整：

- **環境 fingerprint**：exact Git SHA、Vercel deployment ID、Staging Supabase
  project ref（`onkxnkzeixpezetkmocf`）與 public-key fingerprint。
- **automated gates**：0A-2 各項 Staging automated foundation job（build／deploy、
  synthetic student＋teacher Auth/profile、monitoring proof、read-only smoke、
  browser/RWD、`phase-acceptance`）的通過結果與 run ID。
- **restore evidence**：0A-3 該次成功 restore drill 的 evidence schema、cleanup
  `verified=true` 與 residual containers/networks=0 的結果。
- **deferred real-device／0B 項目清單**：明列仍是
  `NOT VERIFIED — deferred to Phase 0B / Phase 8` 的項目（Production smoke、
  RPO／RTO、Tokyo Candidate、Sydney retirement、B2 Object Lock 權威證據、human
  real-device release proof），不得留白也不得改寫為 PASS。

manifest 不含任何 secret value、raw log 或未 sanitize 的 URL／DOM 內容。沒有這份
經 verifier 驗證過的 manifest，Task 0A-5 不得把 0A 標記 `COMPLETE`。

### 0.2 實作者與治理判定分工

0A-1 至 0A-4 由 Claude Code 逐 task 實作，每 task 完成後保持 unstaged，交 Codex
做一次 bounded review；0A-5 的 evidence 彙整與 `PHASE 0A COMPLETE` 判定，是 Codex
的治理判定，不是 Claude Code 可自行宣告的實作產出。若 0A-5 需要 Claude Code 編輯
`CONTEXT.md`、canonical roadmap 或 `docs/handoff.md` 等 closeout 文件，僅能在 Codex
已確認 0A-1～0A-4 evidence 狀態、並下達明確 task brief 之後，執行 bounded mechanical
edit（依 brief 更新指定欄位／連結／狀態字串），不得由 Claude Code 自行判定證據是否
足以宣告 `COMPLETE`。

## Task 0A-1：修復 review manifest SSOT regression

**級別：**M（跨兩檔的新 fail-closed contract＋generated fixture rebaseline，保留一次
Codex bounded review）

**實作者：**Claude Code

**Reviewer：**Codex，一次 bounded review

**允許修改：**

- `tests/fixtures/review-manifest.generated.ts`
- `tests/contracts/review-card-import.test.ts`

**行為與證據：**

- 先新增 contract，驗證 `subtopicId` 唯一、`cardCount` 等於 title 數量、manifest
  total 等於 `docs/content/review-import-report.md` published count，也等於
  `supabase/seeds/content-review-cards.sql` 的 unique `RC*` stable-code count。
- 現行 28-card／重複 `3-3` fixture 必須先 RED；不能靠直接寫死 `8` 讓測試假綠。
- 將 fixture 恢復到已知正確的 3／3／2 內容；可用 commit
  `7834666cfb1666fb6ec900fe6c34ef80006db6a8` 作 byte-level 參考。
- 不執行 `content:fetch`／`content:import`，不修改產品、Hosted content 或 seed。

**驗證：**scoped Prettier／ESLint、`pnpm typecheck`、直接相關 Vitest、兩個 diff
check。完成後保持 unstaged，先交 Codex review。

## Task 0A-2：建立單一 exact-SHA Staging automated foundation receipt

**前置：**0A-1 經 review、protected PR checks、owner approval 與正常 merge；重新
fetch 後 `origin/staging` 必須是該 merge SHA。

**執行：**

1. 只監看 merge 自動觸發的 Staging workflow，不先手動重跑。
2. 驗證 deployed marker、Git SHA、Vercel project、Staging Supabase ref
   `onkxnkzeixpezetkmocf` 與 public-key fingerprint 綁定同一 artifact。
3. 要求 deploy、synthetic student／teacher Auth/profile、monitoring proof、read-only
   smoke、browser/RWD 與 `phase-acceptance` 全部 success。
4. 若失敗，只取得 artifact／固定 sentinel 做一次根因分類；不得連續建立
   diagnostic-only PR。若為 fixture／test SSOT，修 SSOT；若為產品 bug，另建 bounded
   product task；若為 transient，只能在 owner 明確授權下重跑 failed jobs 一次。

`real-device-approval` 與依賴它的 final `record-staging-gate` 不作 0A 自動 foundation
完成條件；依目前 `AGENTS.md`，完整 human real-device release proof 留到 Phase 8。
0A closeout 必須明記這兩項為 deferred，而非 PASS。

## Task 0A-3：完成 exact-SHA isolated restore drill

**前置 owner gate：**指定 exclusive Local Supabase／Docker 時窗，核准唯一一次真實
restore E2E；先唯讀盤點既有 container／network／temp roots，既有資源只記錄不清除。

**執行契約：**

- 使用 0A-2 的 canonical source SHA；`phase0:contracts` 先通過且 real E2E 維持
  explicit opt-in。
- preflight 必須確認 Docker daemon、必要工具（包含 `aws`）與隔離名稱可用；缺少
  prerequisite 直接 fail closed，不得在測試途中安裝或改全域 PATH。
- owner 核准後只執行一次 encrypted synthetic restore E2E。成功結果必須驗證
  DB target、canonical Storage inventory、Auth exclusions、evidence schema、cleanup
  `verified=true`、residual containers/networks=0、temp root removed。
- 執行前後資源集合必須一致；不得順手清理歷史孤立資源。失敗時停止，以固定
  sentinel 與 sanitized evidence 回到 Codex，不自行重跑。

這是 foundation implementation drill，不替代 Phase 8 的 Production backup、
Object Lock、RPO≤24h、RTO≤8h 或 Production reconciliation proof。

## Task 0A-4：關閉 Staging API-key incident

**前置 owner gate：**只讀驗證目前 secret names／targets／timestamps 與 artifact
fingerprint；不得列出 key value。Owner 必須另行提供或確認正確 Hosted
`ADMIN_TEACHER_AUTH_EMAIL_NAMESPACE` disposition。

**順序：**

1. 證明 GitHub `staging` Environment 與 Vercel `colorplay-staging-web` Production＋
   Preview 均使用新 publishable key；實際 Staging bundle fingerprint 必須吻合 owner
   receipt，且不再是 legacy fingerprint
   `287e53db8aa9e39769d1063303af8595c4cee0be211ffd4c34427e1890c1d0ae`。
2. 證明 Supabase Functions 的 `SUPABASE_PUBLISHABLE_KEYS`、
   `SUPABASE_SECRET_KEYS` 與 `COLORPLAY_SUPABASE_SECRET_KEY_NAME` 路徑由 0A-2
   exact artifact 使用；不得把 default fallback 可用誤稱 named cutover 通過。
3. 處置 CLI 意外建立的 `ADMIN_TEACHER_AUTH_EMAIL_NAMESPACE`：若是 local-only
   placeholder，必須在獨立 owner mutation 中改為核准 Hosted 值或移除並證明
   fail-closed；不得讀回或在 log 顯示 secret value。
4. 取得 owner 明確 retirement 授權後才停用 Staging legacy anon／service-role；
   立即執行 old-negative／new-positive、Admin Functions、synthetic Auth/profile 與
   source／bundle／artifact／log secret scan。

不得碰 `colorplay-web`、Production Vercel env、Sydney／Tokyo project 或 Production
legacy keys。若任何 new-positive 失敗，停止並保留可回復路徑，不得連續輪替。

## Task 0A-5：Phase 0A closeout 與 Phase 1 handoff

Codex 只在 0A-1 至 0A-4 證據全部綁定同一 canonical lineage，且已依 §0.1 彙整出
verified 的 automated evidence manifest／receipt 後執行：

- 更新 `CONTEXT.md`、`docs/roadmap-colorplay-next.md` 與 append-only
  `docs/handoff.md`，列出 exact SHA、workflow／restore receipts、key retirement
  receipt、deferred 0B 與 remaining unknown。若這段文件更新指派給 Claude Code
  執行，依 §0.2 僅能是 Codex 已確認狀態後的 bounded mechanical edit。
- 沒有 §0.1 的 verified manifest，不得將 0A 標記 `COMPLETE`。有了 manifest 才
  將 0A 標記 `COMPLETE`；Phase 0 整體標記 `0A COMPLETE / 0B DEFERRED`，不得只寫
  `PHASE 0 COMPLETE`。
- 宣告 Phase 1 Hosted Admin gate 可在該 exact Staging foundation 上另行排程；這不
  自動核准它的 fixture mutation、Hosted DB mutation 或 Production gate。
- 執行一次文件／evidence consistency review；不重跑完整 Phase 8 acceptance。

## Phase 0B／Phase 8 deferred queue

0B 不得由任何 0A task 自動開始。它至少包含：Sydney project 可恢復 inventory 與
backup、刪除前 owner destructive gate、Tokyo `ap-northeast-1` Candidate、Production
zero-replay／data reconciliation、B2 lifecycle／Object Lock／capacity、Cloudflare
權威 DNS/proxy/TLS、Production exact artifact promotion、read-only smoke／rollback、
RPO／RTO 與 human real-device release proof。

0B 啟動前須另寫以當時 provider topology、方案名額與 owner custody 為基準的
Phase 8 plan；不得直接照搬 2026-08-06 的 two-slot destruction sequence。

## Claude Code 交付節奏

每次只收到一個 task brief。Claude Code 完成後保持 unstaged並回報修改檔、命令、
結果與風險；Codex 做唯一一次 bounded review。只有 review PASS 後，Codex 才提出
stage／commit／PR 或 Hosted owner gate 的下一個 prompt。Claude Code 不自行跳到
下一 task，也不自行更新 milestone 完成狀態。
