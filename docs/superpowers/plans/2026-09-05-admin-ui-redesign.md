# Admin UI redesign 分段實作計畫（已核准）

依據：`../specs/2026-09-05-admin-ui-redesign-design.md`。基準 `2a37a0931ff838c7f16580d225ad02b99e21edda`。Owner 已核准設計 A 與 Task 1–7 完整實作及 Staging Web 部署；Hosted DB 與 Admin B lifecycle 仍維持原邊界。

## 順序與共同要求

Owner 已確認保留既有受控憑證流程，一般狀態與診斷不得含秘密；此項不再待決。設計方向與 task 範圍已核准。實作前建立 `codex/` 分支、重核 HEAD／dirty state／遠端差異；沿用此 worktree。每 task 為 M 級，有行為的改動先寫失敗測試、實作、lint／typecheck／相關測試、單一 reviewer 一輪往返。測試符合要求後停止擴張驗證；不執行全域 acceptance。所有 CSS 變更限定 Admin，避免改學生視覺。

## Task 1：安全的 response 與狀態模型

責任檔：`src/features/admin/api/admin-client.ts`、對應測試、新的 safe outcome parser／status model、`components/admin-status-banner.tsx` 與新的原位狀態元件。教師 repository 保留 strict schema，以 adapter 接入。

先測：unknown shape／不合法 ID／原始 secret marker 不進 DOM；retryable 缺失、false、true；ok 非終態；teacher completed／compensated；network unknown 與 server denial 不混用。

完成條件：typed safe envelope 不傳 Error.message、raw payload 或 args 給狀態元件；read failure 與 mutation unknown 分開。命令別成功語意逐項列 mapping，未驗證者不顯示完成。AC-ADM-002／005／006。

## Task 2：共用 shell 與查詢狀態

責任檔：`components/admin-shell.tsx`、新的 Admin page header／query-state 元件與 hook、`src/styles/globals.css` 受影響 Admin 區段及新的 Admin styles。視需求僅抽出本次修改規則，不大搬整份 globals。

先測：刷新失败保留舊列、初次空狀態、denial 隱藏資料、30 秒過期語意、44px／穩定按鈕、drawer 與 dialog focus。實作新導覽順序／繁中名稱／breadcrumb／最後取得時間／手動刷新，局部 skeleton 保留幾何。

完成條件：single main、切頁關 drawer、窄版不擠壓內容；不得改 RequireAdminIdentity／RequirePrivilegedSession 的權限契約。AC-ADM-002、AC-UI-009／011／014／015。

## Task 3：命令確認與未知結果恢復

責任檔：`components/admin-command-dialog.tsx`、`admin-reveal-dialog.tsx`、新的記憶體 operation controller、相關測試；只依現有 API，不新增 migration。

先測：pending 阻擋連點、10 秒可停止等待但不取消 server、關閉後延遲回應仍正確對應原操作、network loss 不自動重送、新舊 args/key 不混用、stale session 不重送、MFA reset ok 不假完成、replayed 不揭露、未知或被截斷 lookup 不推論 not_found。

完成條件：確認框固定目標與具體動作；結果原位保留、安全追蹤碼可複製。一般安全命令缺 lookup 時採安全轉交；不得趁 UI redesign 增加自助 reconcile endpoint。AC-ADM-002／006、AC-UI-011／015。

## Task 4：教師營運流程

責任檔：`pages/admin-teachers-page.tsx`、`admin-teacher-detail-page.tsx`、`components/teacher-account-form.tsx`、`teacher-secret-receipt.tsx`（保留已確認的受控交付契約）、相關測試。

先測：搜尋無結果／無教師、下一頁 transport failure、建立成功但列表 refresh 失敗、更新清空 Email 確認、同 key manual retry、completed 與 compensated、待對帳導向、available_commands 限制、一次性憑證清除與 cache／history 不洩漏。

完成條件：主資訊為帳號／名稱／狀態；重設與一般編輯分層；教師 operation status 沿用 server legal_follow_up；不能新增學生支援、批次 reset 或自助 Email recovery。AC-ADM-003／004／005／006。

## Task 5：安全總覽、存取與健康

責任檔：`pages/admin-overview-page.tsx`、`admin-access-{admins,invitations,sessions}-page.tsx`、`admin-health-page.tsx`、相關測試。

先測：大於 50 筆／truncation、過期但未撤銷 session 不標有效、來源之一失敗獨立呈現、所有 action_kind、manual retry 被授權後 pending、不以對帳受理當修復、停用最後 Admin 拒絕、撤銷自己後退出。

完成條件：首頁不重複大表與不正確 KPI；健康列優先解釋合法動作與時間，ID 收次要細節。手動重試與 OOB 清楚分開，teacher reconciliation 仍遵守後端 owner_oob。AC-ADM-002／006。

## Task 6：資料查核、稽核與 pre-privileged 表單

責任檔：`pages/admin-data-{index,browser,detail}-page.tsx`、`admin-audit-page.tsx`、`admin-invitation-accept-page.tsx`、`admin-mfa-{enroll,challenge}-page.tsx`、`components/admin-data-table.tsx`、相關測試。不得修改 recovery URL／部署設定。

先測：安全目錄搜尋、unknown resource、首／後頁 denial 一致、opaque cursor 原樣使用、揭露明文生命週期、稽核 filter 修正、MFA factor lookup failure 重查、鎖定／隔離不能繞過、成功 refresh 後 return intent；憑證流程依設計第 8 節已確認邊界。

完成條件：所有 14 routes 有一致空／載入／失敗／成功與導覽。不得新增 export、request ID server filter 或下載完整 catalog。AC-ADM-001／002／004／006。

## Task 7：一次整合 UI 驗證

責任檔：必要的 Admin 本機 harness 與 scoped Playwright config／測試，沿用既有 E2E 行為要求。明確標註 harness 為 UI 狀態注入，不能宣稱真實後端完工。

執行：全 Admin unit、lint、typecheck；本機 Chromium 320×568、393×852、768×1024、1024×768、1440×900，涵蓋 keyboard／200% zoom／reduced motion／long ID／大量列、pending 超過 10 秒、dialog／focus、局部表格滾動、無整頁溢位，檢查 console／network 非預期錯誤。既有 test:e2e 若需要真實 fixture mutation 不直接執行，留到已核准的統一窗口。

完成條件：一位 reviewer 一輪，task 報告區分本機 UI 驗證與 Hosted lifecycle；真實裝置仍標待人工。無 release-ready／Admin B phase gate 通過宣稱。

## 檢查命令與停點

- 各 task：`pnpm exec vitest run <受影響檔案>`、`pnpm lint`、`pnpm typecheck`、受影響檔案 Prettier、`git diff --check`。
- UI 整合：`pnpm exec vitest run src/features/admin`，scoped browser command 於新增／確認 Admin harness config 後寫入 task brief，不使用全域 acceptance。
- 任一新需求涉及 server aggregate、通用 operation lookup、Hosted DB、DB reset、權限／憑證交付契約變更：停止該部分，附具體契約差異交 owner 決定。其餘核准範圍照常進行。
- Recovery 修正與本輪碰到同檔時保留另一 session 改動，再依 exact diff 整合；不修改其部署設定。PR #14、Production 不在範圍。

基準 Admin unit 28 files／267 tests PASS。Task 1–7 實作與單一 reviewer 各一輪已完成，同輪修正回饋；最終整合檢查與部署證據記於 docs/handoff.md。瀏覽器命令：`pnpm exec playwright test --config playwright.admin-console-harness.config.ts`。此 harness 使用合成 UI 回應，不是 Hosted lifecycle 證據。
