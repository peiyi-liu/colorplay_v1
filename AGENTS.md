# ColorPlay AGENTS.md

> 本檔案是 Codex、Superpowers 與所有自動化開發代理的第一讀取入口。它是「專案地圖與工作契約」，刻意保持精簡：規則的目的是產出正確的產品，而不是產出流程證據。

## 1. 專案摘要

ColorPlay 是瀏覽器執行的遊戲式教學平台（第一領域：技術型高中設計群－色彩原理），從單一 HTML 原型重構為 React + TypeScript + Supabase。核心價值：學生複習答題拿 XP／代幣／排行榜；教師管理題庫與班級；研究者匯出不可竄改的學習歷程。所有正式成績、獎勵、權限由後端決定。

原型 `legacy/colorplay-original.html` 只作 UX 參考，唯讀，**任何情況下不得複製、內嵌或將其內容帶入 diff／review／報告**。

## 2. 按需閱讀（不是全部讀完）

- 開始任務只需讀：`AGENTS.md` + 與任務**直接相關**的 1–2 份 `spec/*.md`。
- `acceptance/ACCEPTANCE_CRITERIA.md` 只在規劃 phase 或執行 phase 驗收時整份讀；平時只查任務對應的 AC 編號段落。
- **禁止**每個任務或每個 subagent 都重讀整個 spec 套件。若任務簡報（brief）已含必要規格摘錄，以簡報為準，不再回頭讀原文。

spec 對照表：架構/API → `02`；資料表/RLS → `03`；登入/安全 → `04`；分數/XP/排行榜 → `05`；題庫 → `06`；UI/RWD → `07`；測試 → `08`；效能 → `09`。

## 3. 文件優先級

衝突時：1. `acceptance/ACCEPTANCE_CRITERIA.md`（僅適用於 phase 驗收）→ 2. `spec/*.md` → 3. `AGENTS.md` → 4. 已核准 ADR → 5. 既有實作。規格真矛盾時停止該範圍實作並提出 ADR。

## 4. 固定技術方向

React + TypeScript + Vite、Tailwind（CSS variables tokens）、React Router、TanStack Query、RHF + Zod、Zustand（僅 client ephemeral）、Supabase（Auth/PostgreSQL/RLS/Storage/Edge Functions）、Vitest + RTL、Playwright、pnpm。無核准 ADR 不得更換；不得引入 Angular/Vue/Next.js/Firebase 或第二套資料庫。

## 5. 可信邊界（非談判規則）

前端一律不可信。前端只能：顯示介面、暫存未提交操作、呼叫 API、呈現後端結果、存非關鍵偏好。前端禁止：決定答案/分數/XP/代幣/購買/排名；持有 `service_role` 或任何秘密；取題時收到 `correct_answer`；直接寫錢包/排行榜/成績/審計；只靠隱藏按鈕保護教師功能。敏感狀態變更必須走 RLS/RPC/Edge Function 且以交易完成。

## 6. 專案結構

以 feature 切分（`src/features/{auth,learning,quiz,rewards,leaderboard,profile,teacher}`），共用放 `components/`、`lib/`、`styles/`、`types/`；DB 相關放 `supabase/{migrations,functions,seed.sql,tests}`；測試放 `tests/{e2e,visual,fixtures,acceptance}`；證據放 `artifacts/acceptance/`（不進 git）。單檔超過 500 行需說明理由或拆分。

## 7. 分級工作流程（取代「凡事走完整儀式」）

依變更規模選流程，**不得升級小任務的儀式**：

| 級別 | 範例 | 必要流程 |
|---|---|---|
| S（小） | typo、文案、單檔 bug fix、設定調整、文件修正 | 直接改 + 跑受影響的測試。不需 brainstorm、不需 plan、不需獨立 review、不需證據目錄 |
| M（中） | 已核准 plan 內的單一 task、新增元件/hook/migration | 依 brief 實作 + 單元/整合測試通過 + **一次** code review。不重跑 brainstorm/plan |
| L（大） | 新 feature、跨層架構變更、新 phase | Superpowers brainstorming → design doc → plan（每個 phase 一次，不是每個 task 一次）→ worktree → 逐 task 以 M 級執行 |

TDD 適用於**有行為的產品程式碼**；git/檔案追蹤、設定檔、文件變更不需要 RED-GREEN 儀式，驗證方式改為執行一次對應檢查命令。

## 8. Review 與 Token 紀律

- 每個 task 最多**一輪** review（一位 reviewer，一次往返）。不設 spec-reviewer、quality-reviewer、code-reviewer 三重關卡。
- Review diff 必須排除：`pnpm-lock.yaml`、`legacy/**`、`artifacts/**`、`coverage/**`、`dist/**`、visual snapshot 圖檔、任何產生型檔案。diff 超過 1500 行時先摘要，不整份貼入。
- 報告精簡：變更摘要、對應 AC 編號、修改檔案、命令與結果、風險，各一節即可；**不得**重複貼上規格原文或完整 log。
- 禁止複製大型檔案來「保存基線」——用 git 的歷史與 SHA 記錄即可。
- 截圖與圖片證據不回讀進代理 context；以檔案路徑與 manifest 記錄即可。

## 9. 必須提供的 npm scripts

`dev / build / preview / lint / typecheck / test / test:coverage / test:db / test:e2e / test:visual / acceptance`。`pnpm acceptance` 為 **phase 驗收專用**（真實 Supabase 測試環境 + 證據流程），日常任務不執行。

## 10. 程式與資料規範

TypeScript `strict: true`；不用未說明的 `any`/`@ts-ignore`/skip；DB 型別由 Supabase schema 產生；所有 schema 變更走 migration；public tables 全開 RLS 且預設拒絕；RLS policy 需正向與越權負向測試；UI 文案繁中、identifiers 英文；時間存 UTC 顯示 `Asia/Taipei`；金額/代幣/XP 用整數；mutation 考慮 idempotency。

## 11. UI 規則

學生端 UI 遵守 `spec/07-ui-visual-system.md`：扁平 2D、每畫面 1 個 primary action、問句與提交按鈕同一容器、軟鍵盤下 input 與 primary action 可見、Dialog 有明確關閉、不用 SOS 圖示、進度/題號持續可見、狀態不能只靠顏色。細節與 AC-UI-008～015 於 phase 驗收時比對。

## 12. 測試與證據：分兩層

**每個 task（日常）**：lint、typecheck、受影響的 unit/integration 測試通過即可宣稱 task 完成。不產生截圖證據目錄。

**每個 phase 驗收（里程碑，一個 phase 只做一次）**：完整測試套件 + 真實 Supabase local/staging + 三種 viewport 截圖 + 核心流程 trace + 一次 headed run + console error 為 0 + 證據 manifest 符合 `acceptance/EVIDENCE_TEMPLATE.md`。真實行動裝置證據（AC-UI-010/012）由**人類**在 phase 驗收時提供，代理不得嘗試模擬或反覆重試，只需在報告標記「待人工裝置驗證」。

Visual snapshot 基線更新視為 S 級任務：更新基線、附一行原因，不重跑整個驗收管線。

## 13. 禁止的蒙混方式

假 API/mock 資料冒充正式功能完成；只測 happy path；把失敗測試改 skip 或刪 assertion；前端 bundle 放答案或秘密；未更新規格私改 XP/代幣/排行榜規則；以 headless 截圖冒充 headed 驗收（僅適用 phase 驗收層）。

## 14. Definition of Done

- **Task 級**：實作在核准範圍內、有自動測試、lint/typecheck/相關測試綠、報告列出 AC 編號與風險。
- **Phase 級**：上述全部 + 第 12 節 phase 驗收證據 + RLS 負向測試 + 無未解 Critical/High 安全問題。

不得只回「已完成」，也不得把 task 級完成宣稱為 phase 級驗收通過。
