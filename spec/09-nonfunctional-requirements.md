# 非功能需求規格

## 1. 效能

### Frontend

- Production initial JS gzip 目標 ≤ 300 KiB；若超過 350 KiB 必須有 bundle analysis 與核准理由。
- Route-level code splitting：teacher 與 student heavy routes 分離。
- Core Web Vitals staging 目標：LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1，在驗收 mobile profile 下測量。
- 圖片 lazy load；首屏必要資源例外。

### API

在 seeded staging、排除已記錄 cold start 情境：

- published content read p95 ≤ 500ms。
- submit answer p95 ≤ 800ms。
- finalize quiz p95 ≤ 1,000ms。
- leaderboard read p95 ≤ 700ms。
- teacher dashboard p95 ≤ 1,500ms。

### 同步尖峰開發規則

- 新增或修改 Auth、登入後 bootstrap、章節讀取、Quiz、Live、排行榜時，必須按「同一班級同步操作」而非平均流量設計；PR／task 報告需列出每位使用者的 request fan-out、cache、timeout 與 retry 行為。
- 讀取重試必須有上限與 jitter；429、Auth、權限與 validation error 不得自動重試。mutation 不得盲目重送，必須使用既有 idempotency／command-status 契約。
- Realtime subscription 必須有 bounded event payload、卸載 cleanup 與 reconnect 上限；不得以每秒 polling 代替現有 Realtime phase projection。
- 新增 production 圖片必須通過 `pnpm assets:check`；非首屏圖片 lazy load，route-specific 大圖不得進入其他 route 的 initial transfer。
- 影響上述關鍵路徑的 phase gate 必須包含 30+ 個獨立 Staging synthetic accounts 的同步尖峰；不得共用帳號，不得對 Production 壓測。若當下沒有真實校園網路／裝置環境，需在 `docs/handoff.md` 明列 deferred gate，不能宣稱多人容量通過。

## 2. 可用性與相容性

支援最近兩個穩定 major：

- Chrome／Edge。
- Safari。
- Firefox。

正式驗收至少 Chromium；release 前 smoke Safari/WebKit 與 Firefox。

最小寬度 320px；不得要求橫向螢幕才能作答。

## 3. 可靠性

- 所有敏感 mutation idempotent。
- DB transaction 失敗不得留下部分獎勵或半套 import。
- 使用者看到成功訊息前，後端 authoritative commit 必須完成。
- 網路中斷後可重試，不重複發獎。
- 前端 error boundary 捕捉 render failure 並提供追蹤 ID。

## 4. 可維護性

- TypeScript strict。
- ESLint errors／warnings = 0。
- 無循環依賴。
- Feature boundaries 由 lint rule 或測試保護。
- 公開 domain functions 與 RPC 有簡短 contract documentation。
- migrations 不修改已部署 migration；新增修正 migration。

## 5. Accessibility

- WCAG 2.2 AA 目標。
- Lighthouse Accessibility ≥ 95 核心頁面。
- axe critical／serious violations = 0。
- 鍵盤可完成登入、複習、quiz、商店與教師主要流程。
- reduced motion 生效。

## 6. 資料完整性

- ledger reconciliation 差異 = 0。
- quiz session totals 與 answers 聚合差異 = 0。
- export row count 與 query count 一致 = 100%。
- foreign key orphan = 0。
- published single-choice questions with correct-option-count != 1 = 0。

## 7. 備份與恢復

Production：

- 啟用符合方案能力的自動備份。
- 至少每季執行 staging restore drill；正式研究期間建議每月。
- Restore drill 記錄 backup timestamp、restore duration、row count checks。
- 目標 RPO ≤ 24 小時、RTO ≤ 8 小時；若 Supabase 方案無法達成，需升級或修正規格。

## 8. 日誌與監控

監控：

- auth failure rate。
- answer submission error rate。
- function p95 latency。
- unexpected 5xx。
- RLS denial spikes。
- DB storage／connections。

Alert 門檻至少：

- 5 分鐘內核心 mutation error rate > 2%。
- 5 分鐘內 unexpected 5xx ≥ 10。
- submit answer p95 > 2 秒持續 10 分鐘。

## 9. 安全品質門檻

- Known Critical vulnerabilities = 0。
- Known High vulnerabilities = 0，除非有文件化不可利用性與期限明確的修補計畫；正式 release 原則上不接受。
- Secrets scan findings = 0。
- Service role in client bundle = 0。
- RLS negative test pass rate = 100%。

## 10. 部署

- Build reproducible，lockfile 提交。
- 每次 deployment 綁定 git SHA。
- Migration 先在 staging 驗證。
- Production 部署需 health check 與 smoke tests。
- 失敗可回滾前端；DB destructive migration 必須採 expand/contract，不依賴瞬間 rollback。

## 11. PWA／離線

MVP 不承諾完整離線作答。可 cache 靜態資源與已發布複習內容，但：

- 正式答案提交與獎勵需連線確認。
- Offline UI 必須明確顯示未同步。
- 不得在離線時先發正式 XP／Token。
