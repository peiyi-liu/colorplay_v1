# 從單檔原型遷移至 React + Supabase 路線圖

## 1. 原則

- 保留原型的 UX 參考價值，不逐行翻譯舊 JavaScript。
- 先建立可信資料與身份，再搬遊戲功能。
- 每個階段都產生可執行、可測試的 vertical slice。
- 不在同一 PR 同時重做所有頁面、schema、Auth 與遊戲規則。

## 2. Phase 0：基線與規格鎖定

交付：

- 將舊 HTML 放入 `legacy/`。
- 保存核心畫面 reference screenshots。
- 建立本文件集、ADR template、acceptance harness skeleton。
- 明確標示舊原型中：真功能、模擬功能、已知 bug。

退出條件：文件審查通過，無未決核心架構問題。

## 3. Phase 1：專案骨架與 CI

- Vite React TypeScript。
- Tailwind tokens。
- Router、QueryClient、ErrorBoundary。
- Vitest、RTL、Playwright、Supabase CLI。
- package scripts 與 CI。

退出條件：空殼 app 在三 viewport 有截圖；lint/typecheck/test/build 通過。

## 4. Phase 2：Supabase schema、Auth、RLS

- profiles、classrooms、memberships。
- Auth flow 與 role bootstrap。
- RLS positive／negative tests。
- seed identities。

退出條件：Student／Teacher／Outsider 權限矩陣測試 100% 通過。

## 5. Phase 3：內容閱讀 vertical slice

- course/chapter/section/subtopic/review_cards。
- Teacher 建立 draft、publish。
- Student 只讀 published。
- RWD 與 accessibility。

退出條件：真實 DB 內容在 student UI 顯示，draft 不可見。

## 6. Phase 4：Quiz 核心

- questions/options/versioning。
- create session、public payload、submit answer、timeout、finalize。
- refresh recovery、idempotency。
- result／wrong answer UI。

退出條件：E2E-001 至 E2E-005 及安全 payload 檢查通過。

## 7. Phase 5：Rewards、Level、Shop、Leaderboard

- XP／Token ledgers。
- finalize reward policy。
- Blook purchase/equip。
- classroom leaderboard。

退出條件：ledger reconciliation 0 差異；重送不重複發獎。

## 8. Phase 6：Teacher content/import/analytics

- 題庫 CRUD。
- XLSX template、validation、preview、transaction commit。
- analytics views。
- export。

退出條件：合法／不合法匯入、跨班越權、export count tests 通過。

## 9. Phase 7：完整 UI、效能、安全硬化

- 完成所有核心頁面與狀態。
- visual baselines。
- CSP、rate limiting、monitoring。
- bundle／Lighthouse／axe。

退出條件：完整 acceptance suite 與 headed evidence run 通過。

## 10. Phase 8：Staging pilot

- 使用合成資料與少量測試使用者。
- 記錄 usability、錯誤率、效能。
- 不在未經同意情況使用正式學生個資。

退出條件：阻塞性問題修正，研究／校務程序核准後才能 production。

## 11. 不應採用的遷移方式

- 將 784 行舊 HTML 原封不動塞進單一 React component。
- 先做完整漂亮 UI，再補 RLS。
- 把 localStorage 資料同步到 Supabase 就稱為安全。
- 讓前端繼續決定正解與 reward，再只把結果 POST 後端。
- 在 Dashboard 手動建表而不建立 migrations。
