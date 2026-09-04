# Admin C：完整平台型 Admin Deferred Option

- 日期：2026-09-02（Asia/Taipei）
- 狀態：**DEFERRED／NOT AUTHORIZED**
- 目的：保存未來可升級的完整建議與實作邊界
- 前置：Admin B Local＋Hosted gate 通過，且 Owner 另行啟動新的 L 級 phase

本文件不是 current roadmap、implementation plan 或 mutation 授權。任何代理不得
因本文件存在就建立 route、RPC、migration、export、hosted resource 或 fixture。

## 1. 何時才考慮啟動

只有在 Admin B 已可安全營運，且實際出現跨教師內容、平台支援、Live 事故或平台
分析需求時才評估 C。啟動前 Owner 必須重新確認：

1. Admin 與 Teacher 的責任分界。
2. 內容 maker／reviewer／publisher 是否分權。
3. 跨班級與個資介入的合法目的、保存與通知。
4. 補償／rollback、two-person approval 與 emergency break-glass。
5. 研究匯出、去識別與再識別風險。

## 2. 建議資訊架構

```text
Admin
├─ 安全與身分
├─ 教師帳號
├─ 內容生命週期
├─ 學習／班級支援
├─ Live operations
├─ 平台分析與匯出
├─ 稽核與治理
└─ 系統健康
```

Read-only browser 與 mutation workbench 必須分離。導覽可以共用 domain，但每個
mutation 必須是具名 operation；禁止 raw SQL、任意 table editor 或一頁一 RPC 的
shallow pass-through。

## 3. Content lifecycle module

### Interface

- 建立／編輯 draft。
- Bulk import validation 與 preview。
- Submit for review、approve/reject、publish、archive。
- Current-version projection、歷史版本、rollback proposal。
- Media integrity、rights／alt-text／hash validation。

### Implementation rules

- 正式答案、題目與 media 發布由 server transaction 決定。
- Maker 與 reviewer/publisher 可依風險分離；高風險 rollback 需 two-person approval。
- Publish receipt 綁 content version set、hash、actor、reason、request ID。
- Rollback 建立新 publication event，不覆寫舊 version 或歷史 attempt。
- Import failure 不留下部分 rows；未驗證內容不能因 Admin role 跳過 validator。

## 4. Platform support module

### Interface

- 跨教師查詢 classroom/membership/student support case。
- 受控轉班、停權、恢復、資料修復與補償。
- 每次命令先顯示 target preview、受影響 rows、可逆性與後果。

### Implementation rules

- 每個 case 有合法 purpose、actor、target、ticket/reference、before/after、receipt。
- Ledger／progress correction 使用 compensating entry/event，不直接改歷史 totals。
- 高風險跨班級操作要求 re-auth、二次確認，必要時 two-person approval。
- Student/Teacher 可見通知與申訴流程需在啟動 phase 時另行裁定。

## 5. Live operations module

### Interface

- 平台場次查詢、事件 timeline、Realtime/participant/host 診斷。
- 受控取消／終止、stuck transition reconciliation、incident isolation。

### Implementation rules

- 不取代 Teacher 日常主持流程。
- 不允許任意改寫 answer、score、rank、reward；修復只能重播權威 finalize 或寫
  compensating ledger/event。
- 命令驗 session state/version、actor purpose、idempotency 與 affected participants。
- Incident view 不洩漏學生 Email、raw token 或未授權 raw answers。

## 6. Platform analytics and export module

### Interface

- 平台健康、內容品質、使用、營運與安全指標。
- 明確 dataset schema 的受控 export request／status／download。

### Implementation rules

- 每個 metric 定義 numerator、denominator、time window、timezone、version。
- Export purpose-bound、最小欄位、預設 pseudonymous；download URL 短效且單次／
  可撤銷，產生與下載都可 audit。
- Research dataset、retention、consent/ethics、re-identification 必須另有 privacy
  design；Admin role 不是自動合法目的。
- 大型 export 使用 durable job 與明確 failure/expiry，不在 browser 即時計算。

## 7. Governance module

- 所有 domain command 重用 Admin B privileged session、fresh MFA、authorization
  receipt、idempotency、typed outcome、append-only audit、operation/reconciliation。
- Sensitivity catalog 擴充用途、mask、reveal、search/filter/sort/export 權限；
  unknown resource/column default deny。
- 高風險操作依 trust class 要求 re-auth、雙重確認、two-person approval 或 OOB。
- Break-glass 需明確 incident ID、時限、自動撤權與事後 review，不能是永久超級帳號。
- Audit 不保存 secret、完整個資、正確答案 payload 或 raw research rows。

## 8. 建議 route families

```text
/admin/content/**
/admin/support/cases/**
/admin/live/operations/**
/admin/analytics/**
/admin/exports/**
/admin/governance/**
```

實際 routes 必須由未來 brainstorming/design 決定；此處只保留資訊架構方向。不得
提前放空白頁、mock dashboard 或可猜測 mutation endpoint 冒充進度。

## 9. Minimum acceptance if activated

- 每個 mutation：正向、越權、重送、競爭、部分失敗、補償與 audit tests。
- Admin／Teacher／Student／anonymous 完整 RLS/RPC/Edge 角色矩陣。
- Frontend bundle 無 forbidden schema、secret、service-role credential、未作答正解。
- 內容發布、個資揭露、匯出及高風險支援皆需 exact-SHA Hosted proof。
- Fixture、一次性 secret、download artifact 與 operation cleanup 完成後才能關 gate。
- 三 viewport、鍵盤、focus、aria-live、狀態不只靠顏色；真實裝置項由人類驗證。

## 10. Explicitly rejected shortcuts

- 以 Supabase Dashboard 或 service-role table editor 當產品 Admin UI。
- 將 Teacher 頁面複製到 `/admin` 並只換 route guard。
- 通用 `update_any_table`／`run_sql` RPC。
- 用 client 產生 score、rank、publication status、teacher account 或 rollback result。
- 在 Admin B 實作中「順手」加入本文件能力。

## 11. Future activation output

若 Owner 後續由 B 升級 C，需先產出：獨立 design doc、privacy/security ADR、資料
模型／RLS diff、command catalog、implementation plan、migration/rollback plan、
Local gate 與 Hosted fixture cleanup manifest。未具備前述文件時維持 deferred。
