# Phase 0A／0B Release Foundation Rebaseline：Owner 決策紀錄

- 日期：2026-09-11（Asia/Taipei）
- 狀態：Owner 已選擇方案 A，核准 Phase 0 執行範圍拆分與後續規劃
- 基準：`origin/staging` `877d7abcb1cdd49f01d1f22cdb372f04c9b54eb3`
- 性質：current-program execution rebaseline；不是 Hosted mutation、Production
  migration、secret retirement、push、merge 或 deployment 授權
- 執行計畫：
  `docs/superpowers/plans/2026-09-11-phase-0a-staging-foundation-closeout.md`

## 1. 決策

原 Phase 0 計畫把 Local、Staging、Production migration、Production promotion、
永久 Staging rebuild 與 final release gate 綁成一條 18-task 串行路徑。這使已可
使用的 Local／Staging foundation 因 Production 專案位置、免費方案名額、Sydney
退役、Tokyo 建置、B2／Cloudflare 權威證據與人工 release proof 尚未完成而無法
關閉，也使 Phase 1–6 的後續工作被一個過大的 release phase 長期阻塞。

Owner 決定拆成兩個可獨立判定的 milestone：

1. **Phase 0A — Local＋Staging Foundation Closeout**：完成目前程式與
   exact-SHA Staging 自動化基礎、修復阻擋驗收的 stale fixture、完成一個隔離的
   restore drill，並關閉 Staging API-key incident。0A 可單獨標記完成。
2. **Phase 0B — Production Migration and Release**：Sydney 保存／退役、Tokyo
   Production Candidate、Production 資料遷移、B2／Cloudflare 權威證據、正式
   promotion、完整人工裝置與 Production release proof。0B 延後至 Phase 8 release
   lane；本次不執行。

`Phase 0A COMPLETE` 不等於 `Phase 0 COMPLETE`、`Phase 0B COMPLETE`、
`Production-ready` 或 `Production released`。在 0B／Phase 8 通過前，任何文件與
介面都不得作上述宣稱。

## 2. 舊 Task 13–18 的重新歸屬

| 原 task                           | Phase 0A                                                                                   | Phase 0B／Phase 8                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Task 13 hosted controls           | Staging branch／Environment／Vercel／Supabase bindings 與 incident closure                 | Production GitHub／Vercel／Supabase／Cloudflare／B2 權威配置                               |
| Task 14 backup／restore           | 已合併程式的 exact-SHA contract proof，加上一個隔離 synthetic encrypted restore drill 成功 | protected Production backup、lifecycle／Object Lock、RPO／RTO 與 Production reconciliation |
| Task 15 Candidate Staging gate    | 改為目前 permanent Staging 的 exact-SHA automated foundation gate                          | Candidate 專案建立與 Production-config artifact                                            |
| Task 16 Production promotion      | 不適用                                                                                     | 全部移至 0B／Phase 8                                                                       |
| Task 17 permanent Staging rebuild | 現有 `onkxnkzeixpezetkmocf` 保持 Staging，不 reset                                         | Sydney／Tokyo cutover 後再依新 topology 決定，禁止沿用舊 two-slot 假設                     |
| Task 18 final closeout            | 只關閉 0A 並列明 0B deferred                                                               | 完整 Production release closeout                                                           |

舊 `2026-08-06-phase-0-environment-release-foundation.md` 保留為歷史設計與已完成
實作的追溯來源；其 Task 13–18 執行順序與完成定義由本決策及新計畫 supersede，
不回寫或刪除舊證據。

## 3. 0A 完成後解鎖什麼

Phase 0A 完成後：

- Phase 1 可在同一 exact-SHA Staging foundation 上執行自己的 Hosted Admin gate。
- Phase 2–6 可依各自已核准的 interface dependency 做 Local／Staging 開發與 gate，
  不必等待 Tokyo Production Candidate。
- 任何 Production mutation、Production promotion、Sydney delete 或 Tokyo create
  仍需 0B／Phase 8 的獨立計畫與 owner gate。
- 共用 Local Supabase 的 destructive gate 仍須使用 exclusive window；本決策沒有
  放寬並行安全規則。

## 4. 2026-09-11 基準事實

- `origin/staging` 為 `877d7abcb1cdd49f01d1f22cdb372f04c9b54eb3`。
- Phase 0 foundation 與 API-key resolver 已合併；最近 Staging run 的 deployment、
  synthetic student／teacher smoke 與 monitoring proof 可通過。
- Staging `phase-acceptance` 目前被 review-card manifest 的 stale generated fixture
  阻擋：fixture 為 28 cards 且重複 `3-3`，但 owner-accepted import report 與 seed
  都是 8 cards（3／3／2）。這是 0A 的第一個實作 task，不是產品需求變更。
- Restore 實作已經過大量 contract hardening；owner 提供的最近一次真實執行報告
  顯示 DB target 已通過但停於 Storage。因該結果未形成目前 exact-SHA 的成功
  evidence，0A 仍需一次新的成功 drill。
- Named secret selector path 已有 Staging 成功證據；publishable-key bundle fingerprint、
  legacy anon／service-role retirement，以及意外建立的
  `ADMIN_TEACHER_AUTH_EMAIL_NAMESPACE` Hosted 值仍須 fail-closed 收斂。
- `colorplay-web`／Sydney `xdjumzdqyexpyndanwkp`、Tokyo Candidate、B2、Cloudflare 與
  Production promotion 均不在 0A mutation 範圍。

以上是有日期的 snapshot。每個 task 開始前仍須重新 fetch、驗證 exact SHA、
working tree、provider binding 與上一 task 的 evidence；歷史綠燈不能代替當前證據。

## 5. 非談判邊界

- Codex 負責 decision、plan、task brief 與一次 bounded review；Claude Code 依 brief
  逐 task 實作。不得由實作者自行擴大 milestone 或改寫完成定義。
- 每個 task 最多一位 reviewer、一輪往返；同一根因不得以連續 diagnostics PR
  取代修復 SSOT。
- Hosted mutation、legacy-key retirement、real restore、push、merge 與 deployment
  仍各自需要明確 owner authorization。
- Production `colorplay-web`、Sydney delete／restore、Tokyo create、Production DNS、
  Production B2 與 Cloudflare 不得出現在 0A 的實作 diff 或操作中。
- 完整 `pnpm acceptance`、Production smoke、完整三瀏覽器 headed／real-device release
  proof 依目前 `AGENTS.md` 與 `spec/10-migration-roadmap.md` 留到 Phase 8。
