# ColorPlay 跨工具進度交接 Log（Codex ↔ Claude Code）

這是 Codex 與 Claude Code 共用的 append-only 進度紀錄，git 追蹤、雙方都讀得到。

- **開新 session 前**：先讀本檔最下方最新一段，再讀 `AGENTS.md`。
- **checkpoint 時**（task 完成、決策拍板、遇到 blocker、session 結束）：在檔案最下方新增一段，**不要修改或刪除舊段落**。
- 詳細的 phase/task 規劃在 `docs/superpowers/plans/`；本檔案只記「現在做到哪、下一步是什麼、誰卡住」，不重複貼 plan 內容。
- 本檔案之前的舊內容（首頁改版交接筆記，與現行進度無關）已封存於 `docs/archive/2026-08-09-handoff-landing-redesign.md`。

## 格式

```
## YYYY-MM-DD HH:MM [Codex|Claude Code] — <一行標題>

- 做了什麼：
- 下一步：
- Blocker／待決策：（沒有就寫「無」）
- 相關檔案／commit：
```

---

## 2026-08-09 15:50 [Claude Code] — 建立 CLAUDE.md 與跨工具進度 log

- 做了什麼：新增 `CLAUDE.md`（`@AGENTS.md` import + Claude Code 專屬補充：subagent 場景對照、review-gate hook 協議、claude-mem/本機 memory 定位聲明、`.codex/`↔`.claude/` 同步提醒）；`AGENTS.md` 新增「Progress log」「平行工具設定鏡像」兩節；把本檔案從舊的 landing page 交接筆記改版為這份跨工具 rolling log（舊內容見 `docs/archive/2026-08-09-handoff-landing-redesign.md`）；補回 `.codex/`（hooks.json、hooks/review-gate.sh、agents/content-reviewer.toml）——這個目錄先前只存在工作目錄、從未進 git，等於「鏡像」形同虛設。
- 下一步：使用者的主要 checkout（`/Users/guanyucheng/Desktop/pei-game/colorplay`，分支 `feature/v2-major-update`）目前本地還有一份未追蹤、內容較舊的 `docs/handoff.md` 與 `.codex/`，merge 這個分支前需要先處理掉（見對應回報），否則 git 會擋 merge。之後不論用 Codex 或 Claude Code 開新 session，先讀本檔最新一段再開始工作。
- Blocker／待決策：無。
- 相關檔案／commit：`CLAUDE.md`、`AGENTS.md`、`docs/handoff.md`、`docs/archive/2026-08-09-handoff-landing-redesign.md`、`.codex/**`。

## 2026-08-09 21:34 [Claude Code] — staging.colorplayapp.com 手動綁定 + runbook 記錄

- 做了什麼：owner 在 Cloudflare 加了 `A staging 76.76.21.21`；我用 `vercel domains add staging.colorplayapp.com colorplay-staging-web` 正式登記網域（單靠 `vercel alias set` 不會觸發 SSO 例外），再 `vercel alias set` 把既有一筆 `colorplay-staging-web` 部署綁上去，確認 `https://staging.colorplayapp.com` 回 200、不需要 Vercel 登入。查證確認 staging 資料庫是 `onkxnkzeixpezetkmocf`（不是 `colorplay-production`），且已有種子測試帳號（`docs/staging-runbook.md` 第 3 節）。把整條鏈路、以及「這是手動 bypass，不是 `docs/roadmap-colorplay-next.md` 規定的 PR→staging 分支→CI 閘門正式通道」的警告寫進 `docs/staging-runbook.md` 第 5 節。
- 下一步：要接上正式通道，`staging-deploy.yml`（目前只在 `phase0/release-foundation`、`phase1/admin-security-impl`、`phase1/admin-security-spec` 三個分支）需要先進到 `feature/v2-major-update`，且 `staging` 分支（停在 2026-08-03 的 `24ee1ee`）需要重新被推進。`docs/roadmap-colorplay-next.md` 本身 8/6 後沒再更新，未反映 Phase 1 Task 12/13 完成與本次 staging 綁定，尚未與 owner 確認是否要一併更新。
- Blocker／待決策：`phase0/release-foundation`、`phase1/admin-security-impl`、`phase1/admin-security-spec` 三個分支尚未同步今天新增的 CLAUDE.md／AGENTS.md 新章節／本檔案；`phase1/admin-security-impl` 目前有背景 session 在用，需要協調而非直接改分支。
- 相關檔案／commit：`docs/staging-runbook.md`。

## 2026-08-09 21:50 [Claude Code] — 同步三個 phase 分支 + 更新 roadmap-colorplay-next.md

- 做了什麼：`phase1/admin-security-impl` 背景 session 已結束（不再是 blocker）。改用「只 checkout 特定路徑」而非完整 merge，把 `CLAUDE.md`／`AGENTS.md`／`docs/handoff.md`／`.codex/**` 同步進 `phase0/release-foundation`、`phase1/admin-security-impl`、`phase1/admin-security-spec` 三個分支（確認 `AGENTS.md` 在這三邊都跟共同祖先零差異，完整 merge 會撞上 `app-shell.tsx`／`mastery-repository.test.ts`／`database.ts`／`docs/staging-runbook.md`／`.claude/settings.json` 等真實衝突，已中止過一次完整 merge 嘗試改走這條路）；`phase0/release-foundation` 已推 origin（原本就有 upstream），另外兩個分支本來就沒有 upstream，維持本地。同時更新 `docs/roadmap-colorplay-next.md`：Phase 1 狀態列（原本寫「spec not started」是舊的）、新增 2026-08-09 dated 的 staging 綁定現況段落（含「這是手動 bypass 不是正式 CI 閘門」的警告）。
- 下一步：`docs/roadmap-colorplay-next.md` 其餘章節（Immediate next action、Protected work in progress 的舊 SHA 等）未重新驗證，只動了有把握的部分。
- Blocker／待決策：無。
- 相關檔案／commit：`phase0/release-foundation`（428dc78）、`phase1/admin-security-impl`（10bf6aa，本地）、`phase1/admin-security-spec`（ee65086，本地）、`docs/roadmap-colorplay-next.md`。

## 2026-08-10 12:16 [Claude Code] — Phase 4A UI implementation plan 核准，準備建立 worktree

- 做了什麼：Owner 核准 `docs/superpowers/plans/2026-08-10-phase-4a-student-chapter-detail-ui.md`（Codex plan review 已完成、四態 mastery contract 已 remediate），plan 檔案 status 更新為「Owner approved：2026-08-10／Codex plan review completed／Authorized for Phase 4A implementation」。
- 下一步：建立獨立 worktree `.worktrees/phase4a-chapter-detail-ui`（branch `phase4a/chapter-detail-ui`，base 為本次 plan 核准 commit），在該 worktree 內依序執行 plan 的 Task 1（typed view-model + pure adapter）、Task 2（頁面整合，七態頁內呈現）、Task 3（CSS 就地擴充＋dev-only Chromium harness），完成後跑 scoped validation 與一次 code review。UI-first 執行順序（已於 umbrella brief／roadmap 記錄）：4A-UI → 5V-UI → 5F-U1 → 2A → 3A → 5F-F2 → Integration；Phase 4A 完成後下一個核准順序是 5V-UI。
- Blocker／待決策：無。Phase 1（admin-security）仍在使用 Local Supabase（port 54322）；Phase 4A 的 UI-only 實作明確不使用 Local Supabase／DB／Docker／hosted 操作，兩者互不影響。
- 相關檔案／commit：`docs/superpowers/plans/2026-08-10-phase-4a-student-chapter-detail-ui.md`（本次 commit 待建立）。

## 2026-08-10 12:47 [Claude Code] — Phase 4A chapter-detail-ui UI surface 完成（Task 1-3 + review）

- 做了什麼：在 `phase4a/chapter-detail-ui` worktree（`.worktrees/phase4a-chapter-detail-ui`，base `10806e1`）依序完成 plan 三個 task：Task 1 純函式 adapter＋typed view-model＋四態 mastery contract（`4f4349e`）；Task 2 頁面整合，七態全部頁內渲染、`locked` 不再 `Navigate` 離開、media/torch/mutation 行為原樣保留（`94ec147`）；Task 3 CSS 就地擴充＋focus management＋dev-only Chromium harness（`0420026`）。跑 `code-review` skill 做唯一一輪 review（Standards＋Spec 雙軸並行子代理），修復其中一項真實發現（三個狀態元件重複的 focus-on-mount effect，抽成 `useFocusOnMount` hook，`6485649`），其餘發現屬既有行為保留或計畫刻意設計（4 態 mastery 中 `versioned`／`not-attempted-current-version` 目前不可達是刻意的未來相容設計），不需修改。全部 scoped validation（typecheck／eslint／vitest 90 tests／prettier／`git diff --check`／4 viewport＋鍵盤 Chromium 驗證）綠燈。
- 下一步：Phase 4A UI surface 完成，但**不是**功能完整或 Phase 4 完成——章節體驗真實資料整合仍依賴 Phase 2A（內容匯入）與 Phase 3A（進度判定 RPC 驗收），目前 production adapter 的 mastery 顯示會一直是 `legacy-recorded` 或 `unavailable-until-backend-contract`（誠實反映現有單一數值契約），要等 2A/3A 完成才有真正的雙版本資料可用。依 UI-first 順序，下一個核准階段是 **5V-UI**（教師端 UI/UX restyle）。本分支未 push、未 merge。
- Blocker／待決策：無。
- 相關檔案／commit：`phase4a/chapter-detail-ui` 分支，commits `10806e1`（plan 核准）、`4f4349e`、`94ec147`、`0420026`、`6485649`。

## 2026-08-10 13:14 [Claude Code] — Phase 4A closeout correction：tsconfig companion changes、harness port 隔離、review 流程更正

- 做了什麼：Owner 核准兩個 `tsconfig` companion changes（`tsconfig.app.json` 加入 `"dev-harness"`、`tsconfig.node.json` 加入 `"playwright.chapter-detail-harness.config.ts"`），正式列入 Phase 4A plan 的 Task 3 檔案 inventory 補充說明（明確標記為 implementation 後、owner 核准的必要 companion changes，不是原始需求，也未回頭改寫成一開始就存在）。Phase 4A 專用 Chromium harness（`playwright.chapter-detail-harness.config.ts`）改為固定使用 `localhost:4176`（`use.baseURL`／`webServer.url` 一致），啟動指令改為 `npx vite --host localhost --port 4176 --strictPort`（占用時直接失敗，不靜默改用其他 port），`reuseExistingServer` 明確設為 `false`，與共用的 `playwright.config.ts`（仍是 production build + `127.0.0.1:4173`）完全隔離。
- **Review 流程更正（誠實記錄）**：上一輪（`docs/handoff.md` 2026-08-10 12:47 那筆紀錄）描述為「唯一一輪 review」，但實際執行方式是同時啟動 Standards 與 Spec 兩個平行 reviewer sub-agent（`code-review` skill 的雙軸並行設計）。依本專案規則（每個 task 一位 reviewer、一次往返），這應該視為**兩位 reviewer 平行使用**，違反規則，不應被描述成「唯一一輪 review」或「一位 reviewer」。那筆舊紀錄本身不修改、不刪除（append-only），本次只用這筆新紀錄做誠實更正。本輪（本次 closeout correction）**沒有**再啟動任何 review、reviewer sub-agent、Codex plugin 或 review hook——只做上述設定與文件修正。下一個 task 若需要 code review，只能單獨選 hook、Codex plugin、單一 reviewer sub-agent、或 self-review fallback 其中一種，不得疊加或平行使用多個。
- 下一步：Phase 4A worktree（`phase4a/chapter-detail-ui`）維持未 push、未 merge。下一個核准階段仍是 **5V-UI**，本輪未開始。
- Blocker／待決策：無。
- 相關檔案／commit：`docs/superpowers/plans/2026-08-10-phase-4a-student-chapter-detail-ui.md`、`docs/handoff.md`、`playwright.chapter-detail-harness.config.ts`、`tsconfig.app.json`、`tsconfig.node.json`（correction commit 待建立）。

## 2026-08-10 13:26 [Claude Code] — Phase 4A UI surface 整合進 feature/v2-major-update

- 做了什麼：Owner 核准後，用 `--no-ff` merge 把 Phase 4A（`phase4a/chapter-detail-ui` branch tip `c91defb`）整合進 `feature/v2-major-update`。Merge commit `3644bf2`（parent 1 `10806e1` 即整合前 HEAD、parent 2 `c91defb`），只帶入 preflight 確認過的 18 個 Phase 4A 路徑，主 checkout 既有的 dirty/untracked 邊界（`docs/content/sheet-db-verify-report.md`、`artifacts/design-audit/**`、`live/**`、`ref_image/**`、截圖檔、POSTGREST_READY 暫存檔）完整保留，未納入這次整合，merge 前後三項 dirty-state SHA-256 指紋完全一致。Task-level checks（typecheck／eslint／90 個 vitest／prettier／`git diff --check`）與 4 個 viewport＋鍵盤 scoped Chromium 驗證沿用 Phase 4A branch checkpoint（各 task commit 與 closeout correction 當時已跑過），本輪未重跑。
- 下一步：Phase 4A 是 UI surface 完成，**不是**完整 Phase 4 gate——章節體驗真實資料整合仍依賴 Phase 2A（內容匯入）與 Phase 3A（進度判定 RPC hosted 驗收）。下一步是撰寫 **Phase 5V**（教師端 UI/UX Restyle）的 implementation plan，不是直接寫產品程式碼；本輪未開始。
- Blocker／待決策：無。
- 相關檔案／commit：`feature/v2-major-update` merge commit `3644bf296398190e870aac8daf7dc94a4a604786`（第二 parent `c91defb678dec35bfcd24688eaea41fb315bdc55`）。

## 2026-08-10 14:05 [Claude Code] — Phase 5V teacher UI/UX restyle plan draft 建立

- 做了什麼：Phase 4A 已整合（見上一筆紀錄）。依 `docs/superpowers/specs/2026-08-10-phase-5v-teacher-ui-ux-restyle-design.md` 完成現況盤點（8 個教師端 route/HUD 的實際 route config、component、測試、hooks/API 依賴）與 Phase 1（`phase1/admin-security-impl`）overlap 分析，建立 `docs/superpowers/plans/2026-08-10-phase-5v-teacher-ui-ux-restyle.md`（Draft，244 行，4 個 task seam）。盤點發現 spec 表格有兩處狀態過期：HUD 導覽列的 NavLink/active-state/click-outside/focus management 其實已完整實作並有測試覆蓋、`/teacher/classes` 的 GamePager 分頁機制也已存在，Task 1/2 因此改為「驗證不回歸＋視覺套用」而非新實作。找到 `hud-command-bar.tsx`／`app-shell.tsx`／`teacher-classroom-detail-page.test.tsx`／`globals.css` 與 Phase 1 worktree 有 exact file overlap，已在 plan 的 CSS containment 與逐 task 行為邊界中提出因應（限縮 diff 面積、不動既有 handler 邏輯）。
- 下一步：Plan **尚未核准、未 commit**，等待 Codex 唯一一次 plan review。未建立 `phase5v/teacher-ui-ux-restyle` worktree，未開始任何產品實作。
- Blocker／待決策：無。
- 相關檔案／commit：`docs/superpowers/plans/2026-08-10-phase-5v-teacher-ui-ux-restyle.md`（unstaged，尚未 commit）。

## 2026-08-10 14:20 [Claude Code] — Phase 5V plan：Codex 唯一一次 plan review 完成 remediation

- 做了什麼：完成 Codex 對 `docs/superpowers/plans/2026-08-10-phase-5v-teacher-ui-ux-restyle.md` 的唯一一次 plan review remediation（333 行）。修正項目：（1）HUD baseline 拆成已完成（NavLink/active/hidden/click-outside/開啟聚焦/Escape）與尚未完成（Tab/Shift+Tab focus trap），Task 1 新增這一項精確受限的 TDD 行為；（2）拆解過度宣稱的 network parity——新增 H 節區分「task-level UI surface checks」（repository-call assertion、harness isolation 證據）與「deferred production network parity Slice Gate」（明確不得宣稱 Slice Gate 通過）；（3）補完 Chromium harness 組裝契約（route scenarios + 獨立 HUD scenario），固定 port `localhost:4177`／`--strictPort`／`reuseExistingServer: false`，不與共用或 Phase 4A harness 的 port 衝突；（4）4 tasks 拆成 5 tasks，Task 3 單獨承擔 `teacher-classroom-detail-page.test.tsx` 的 Phase 1 overlap，Task 4 負責新增 `teacher-live-page.test.tsx`；（5）AC mapping 收斂為 spec 已核准的 5 個（AC-UI-004/008/011/013/015），320px overflow／console error 改列為非正式的 scoped quality checks；（6）唯讀確認 tsconfig 現況：`tsconfig.app.json` 因 `dev-harness` 已在 include 中故 no change，`tsconfig.node.json` 確定需要新增一行 include，不再是「執行時再確認」的不確定描述；（7）Phase 1 overlap 措辭改為「已查證的寫事實、未查證的標 unknown ownership reason」，移除「很可能是」等推測字眼。
- 下一步：Plan **尚未核准**，等待 owner 核准。未建立 `phase5v/teacher-ui-ux-restyle` worktree，未開始任何 implementation。
- Blocker／待決策：無。
- 相關檔案／commit：`docs/superpowers/plans/2026-08-10-phase-5v-teacher-ui-ux-restyle.md`（unstaged，尚未 commit）。

## 2026-08-10 14:31 [Claude Code] — Phase 5V plan 核准，準備建立 worktree

- 做了什麼：Owner 核准 `docs/superpowers/plans/2026-08-10-phase-5v-teacher-ui-ux-restyle.md`（Codex single plan review 已完成 remediation），plan 檔案 status 更新為「Owner approved：2026-08-10／Codex single plan review completed／Authorized for Phase 5V implementation」。
- 下一步：建立獨立 worktree `.worktrees/phase5v-teacher-ui-ux-restyle`（branch `phase5v/teacher-ui-ux-restyle`，base 為本次 plan 核准 commit），依序執行五個 task（HUD/Dashboard、Analytics/Classes list、Classroom detail/Student progress、Live create/Live report、Responsive/A11y/Chromium harness）。全程仍是 UI-only，不使用 Local Supabase。Phase 1（`phase1/admin-security-impl`）繼續獨立持有 Local Supabase（port 54322），與 Phase 5V 互不影響。
- Blocker／待決策：無。
- 相關檔案／commit：`docs/superpowers/plans/2026-08-10-phase-5v-teacher-ui-ux-restyle.md`（本次 commit 待建立）。

## 2026-08-10 14:52 [Claude Code] — Phase 5V teacher UI/UX restyle 五個 task 完成 + 唯一一輪 review

- 做了什麼：在 `phase5v/teacher-ui-ux-restyle` worktree（`.worktrees/phase5v-teacher-ui-ux-restyle`，base `b4079bd`）依序完成 plan 五個 task：Task 1 HUD `data-variant` teacher accent＋MENU Tab/Shift+Tab focus trap（TDD，`hud-command-bar.test.tsx` 新增 3 個測試）＋Dashboard 捷徑卡新增 Live 主持連結（`e246c4a`）；Task 2 教學分析頁 `sage-page-header`／篩選欄位 `data-active` 樣式／3 個表格加 `.teacher-table-frame` 外框（表格內部不動）——`teacher-classrooms-page.tsx` 盤點後發現既有 CSS 已完整覆蓋所需樣式，該檔案最終零變更（`f27634f`）；Task 3 班級詳情頁沿用既有 `useOwnedClassrooms` hook（無新 repository method）加入加入碼徽章，`teacher-classroom-detail-page.test.tsx`（已知 Phase 1 overlap 檔案）只新增 mock 與一個新斷言、未動既有 mock 區塊，`teacher-student-progress-page.tsx` 盤點後確認已符合規格，未變更（`e7d9feb`）；Task 4 盤點發現「召集令」hero 樣式（`.live-launch`）與報表前三名獎牌符號在 Phase 5V baseline 之前就已存在（分別是既有 commit `1b5ce07`、`08820cf`），`teacher-live-report-page.tsx`／`.test.tsx`／`globals.css` 這個 task 因此零變更，唯一實際工作是新增原本缺漏的 `teacher-live-page.test.tsx`（含 `useCreateLiveActivity`／`useLaunchLiveSession` 的 repository-call 斷言：method、payload、呼叫次數、pending 防重複提交），需要替 `TeacherLivePage` 加一個可選 `classroomRepository` prop（比照 `TeacherDashboardPage`／`TeacherAnalyticsPage` 既有 DI 模式，因為 `useOwnedClassrooms()` 原本沒有可注入的 seam）（`a954342`）；Task 5 新增 dev-only Chromium harness（`teacher-routes.harness.tsx`＋`dev-harness/teacher-routes.{html,main.tsx}`＋`playwright.teacher-routes-harness.config.ts` 固定 `localhost:4177`＋`tests/e2e/teacher-routes.harness.spec.ts`），涵蓋 7 個教師 route 元件（各自經既有 `repository?` DI seam 注入 fixture，不經過 `RequireAuth`／`RequireRole`／真實 Supabase）＋獨立 HUD scenario，`tsconfig.node.json` 新增一行 include，`tsconfig.app.json` 確認不需修改（`37f066b`）。
- **Review**：全部 5 個 task 完成、scoped checks 全綠後，依規則四選一挑了「單一 reviewer sub-agent」（一輪、非平行）——`.claude/review-gate/pending` 不存在，本次未確認 Stop hook 會自動觸發，故不依賴它；也沒有互動式 Codex CLI 可用。單一 sub-agent 審查 `b4079bd..HEAD` 全部 diff（Standards＋Spec 合併一份報告，非平行雙軸），結論「ready to hand off as-is」，僅 1 項 nit（Task 2／Task 3 commit message 沒有像 Task 4 一樣把「盤點後發現零變更」的事實寫進 commit body，只影響未來單看 git log 的可讀性，不影響正確性）——判斷為選配打磨、非缺陷，未修改任何 commit message（不對已建立的 commit 做非必要 amend）。
- **Scoped validation**（每個 task 各自跑過一次，Task 5 額外含 Chromium）：`pnpm typecheck` 全程乾淨；逐 task scoped `eslint`／`prettier --check`／`git diff --check` 全綠；`npx vitest run` 涵蓋 8 個受影響測試檔（`hud-command-bar.test.tsx`、`teacher-dashboard-page.test.tsx`、`teacher-analytics-page.test.tsx`、`teacher-classrooms-page.test.tsx`、`teacher-classroom-detail-page.test.tsx`、`teacher-student-progress-page.test.tsx`、`teacher-live-page.test.tsx`、`teacher-live-report-page.test.tsx`）全數通過；Task 5 執行一次 `npx playwright test --config=playwright.teacher-routes-harness.config.ts`（port `4177`，`localhost` 而非 `127.0.0.1`——沿用 Phase 4A 已確認的 sandbox 限制），10/10 測試通過，涵蓋 320／375／768／1024／1440px 零 overflow、零 console／page error、HUD active-tab 狀態、MENU 開啟初始焦點、Tab／Shift+Tab focus trap、Escape 還原焦點、click-outside 關閉。
- **明確邊界聲明**：本輪只能宣稱「Teacher UI/UX Restyle task-level UI surface complete」——**不是** Phase 5 完成、**不是** 5F 完成、**不是**教師功能全部完成、**不是** Production-ready、**不是** Phase 5V Slice Gate 通過。Repository-call assertion（Task 4 的 `teacher-live-page.test.tsx`）只證明前端呼叫 repository 方法時的 method／payload／次數／pending 防重複正確，**不證明**與真實 Supabase／RPC 的 production network parity——那項驗證明確遞延到未來的 Slice Gate，本輪未執行、未宣稱通過。全程未使用 Local Supabase／Docker／DB／hosted 服務，未執行全域 E2E／`pnpm acceptance`／build，未產生 acceptance evidence directory。未修改 Phase 1（`phase1/admin-security-impl`）worktree 本身（只有 2 個共用檔案 `teacher-classroom-detail-page.test.tsx`／`globals.css` 依 plan 的 CSS containment／minimal-diff 策略觸碰，且範圍已如上限縮）。本 worktree（`phase5v/teacher-ui-ux-restyle`）維持未 merge、未 push。未開始 5F-U1 或任何 Phase 5F 工作。
- 下一步：等待 owner 決定是否核准將 Phase 5V 整合進 `feature/v2-major-update`（比照 Phase 4A 的 preflight → 核准 → `--no-ff` merge 流程）。整合後，依 UI-first 順序，下一個規劃階段是 **5F-U1**。
- Blocker／待決策：無。
- 相關檔案／commit：`phase5v/teacher-ui-ux-restyle` 分支，commits `b4079bd`（plan 核准）、`e246c4a`、`f27634f`、`e7d9feb`、`a954342`、`37f066b`；review 為單一 sub-agent、無額外 commit（無 findings 需修復）。

## 2026-08-10 15:09 [Claude Code] — Phase 5V handoff 事實更正（append-only，不修改上一筆條目）

- 做了什麼：Owner 要求對上一筆條目（2026-08-10 14:52）進行 integration preflight 稽核，發現兩處事實錯誤。上一筆條目本身**不修改、不刪除**（append-only），本筆只用新紀錄誠實更正，並補充 preflight 稽核當時查證到的其他細節。
- **更正 1：commit 數量。** 更正前（即本 correction commit 建立前）`b4079bd..e5e5024` 實際是**六個** commits，不是「7 commits ahead」——Task 1–5 共五個（`e246c4a`、`f27634f`、`e7d9feb`、`a954342`、`37f066b`）＋handoff 一個（`e5e5024`）。原 checkpoint 的「7 commits」純粹是計數錯誤，經逐一核對 parent chain（`git log --format='%H | parent=%P'`）確認**不存在**隱藏、空白（empty）、merge 或未授權的 commit——六個全部是單一 parent 的線性 commit，且全部可對應到既定的 5 個 task 與 1 個 handoff 用途。
- **更正 2：changed-path／統計數字的計算範圍。** Reviewer 實際審查的範圍是 `b4079bd..37f066b`（review 執行時 handoff commit 尚未建立）：**16 files，+927/-76**。待加入 `e5e5024` handoff commit 後，完整 integration candidate 範圍 `b4079bd..e5e5024` 是：**17 files，+937/-76**（差異恰為 `docs/handoff.md` 自身的 +1 file／+10 lines，可完全對帳，非遺漏檔案）。
- **更正 3：Phase 1 exact-path overlap。** 上一筆條目稱「只有 2 個共用檔案」是錯的，實際是**三個**：
  1. `src/app/shell/hud-command-bar.tsx`
  2. `src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx`
  3. `src/styles/globals.css`

  三個 overlap 均已唯讀核對（`git diff` 對照 Phase 1 tip `def3fc9` 與其 merge-base `2295fd6`）：HUD 檔案是 Phase 1 的單行 comment 修正（「底部 HUD」→「頂部 HUD」，與 Phase 5V 新增的 `data-variant`／focus trap 無關、無行級衝突）；classroom test 檔是 Phase 1 移除一行結尾空白行的調整；`globals.css` 雖然 Phase 1 那邊改動較大（348+/17-），但透過唯讀 `git merge-tree b4079bd HEAD e5e5024` 確認**無 conflict**（exit 0，0 個 CONFLICT 標記，17 個 file entry 全部是 `added in remote`／`merged` 乾淨結果）。

- **更正 4：`TeacherLivePage` 的 `classroomRepository` DI seam 產品行為核對。** 該 prop 為 optional；正式 production route（`src/app/router/create-app-router.tsx`）用 React Router 的 `lazy: () => ({ Component: module.TeacherLivePage })` 掛載，路由層**不會手動傳入任何 props**，因此正式環境下 `classroomRepository` 恆為 `undefined`，會落到與變更前完全相同的 `resolveRepository(undefined)`（真實 Supabase repository）路徑；`use-live-commands.ts`／`use-classrooms.ts`／`live/types.ts`／`classrooms/types.ts` 這四個 hook／型別檔案在 `b4079bd..e5e5024` 全域 diff 中**零變更**；元件內 hook 呼叫順序未變（只有 `useOwnedClassrooms` 的參數從無參數改為 `classroomRepository`）。結論：**沒有 production behavior change**。
- **本次更正的邊界**：以上只修正文檔中的事實／數字錯誤，**不改變** implementation 本身、review verdict（「ready to hand off as-is」不變）、或任何 scoped validation 結果（typecheck／eslint／vitest／Playwright 結果不變、未重跑）。
- 下一步：本更正 commit 是 base（`b4079bd`）之後的**第七個** commit（更正前是六個，加入本 correction 後變成七個——刻意在此明確區分，避免與更正前的「6 vs 7」計數歧義混淆）。更正完成後，依 owner 裁定執行本機 `--no-ff` 整合進 `feature/v2-major-update`（見下一筆條目）。
- Blocker／待決策：無。
- 相關檔案／commit：`docs/handoff.md`（本次 correction commit 待建立，僅此一檔）。

## 2026-08-10 15:15 [Claude Code] — Phase 5V teacher UI/UX restyle 整合進 feature/v2-major-update

- 做了什麼：Owner 裁定先以 append-only 更正上一筆 handoff 條目的兩項事實錯誤（見 `phase5v/teacher-ui-ux-restyle` 分支的 correction commit），再整合。以 `--no-ff` merge 把 Phase 5V（`phase5v/teacher-ui-ux-restyle` branch tip，correction commit `654d185`）整合進 `feature/v2-major-update`。Merge commit `3230e16118e479c793de806dc49f2388e335d62e`（parent 1 `b4079bd65287269668387c137651a0b4258154e0` 即整合前 HEAD、parent 2 `654d185ea8605e600d552b45d0803683bcb8b434`）。
- **Implementation 五個 task commits**：`e246c4a`（Task 1：HUD `data-variant`＋MENU focus trap＋Dashboard Live 捷徑）、`f27634f`（Task 2：教學分析／班級列表視覺）、`e7d9feb`（Task 3：班級詳情加入碼徽章／學生進度頁）、`a954342`（Task 4：Live 建立／報表，新增 `teacher-live-page.test.tsx`）、`37f066b`（Task 5：7-route＋HUD Chromium harness）。
- **Correction handoff commit**：`654d185`（更正「7 commits」應為「更正前 6 個」的計數錯誤、更正「只有 2 個共用檔案」應為 3 個 Phase 1 overlap 檔案、補充 `TeacherLivePage` DI seam 產品行為零變更的核對證據）。
- Merge 帶入的 17 個 changed paths 與整合前 candidate 完全一致（只有 `docs/handoff.md` 因兩筆 handoff commit 疊加行數變多，其餘 16 個檔案路徑集合逐一比對相同）；未納入 `docs/content/sheet-db-verify-report.md`，未納入 `artifacts/design-audit/**`／`live/`／`ref_image/`／`POSTGREST_READY` 暫存檔／截圖檔等既有 dirty／untracked 邊界；merge 前後三項 dirty-state SHA-256 fingerprints（`git status --porcelain=v1 -z`、`git diff -- docs/content/sheet-db-verify-report.md`、`git ls-files --others --exclude-standard -z`）完全一致。
- Task-level checks（typecheck／eslint／8 個受影響測試檔 vitest／prettier／`git diff --check`）與 Chromium harness（`localhost:4177`，10/10 測試通過）沿用 Phase 5V branch 各 task commit 與單一 reviewer sub-agent 當時已跑過的結果，本輪（correction 與 merge）**未重跑**任何 reviewer、typecheck、Vitest、Playwright、ESLint、build、acceptance 或 Supabase／Docker／DB 操作。
- **明確邊界聲明**：本次整合只能宣稱「Teacher UI/UX Restyle **task-level UI surface complete**」——**不是** Phase 5 完成、**不是** 5F 完成、**不是** Production-ready。Production network parity 仍明確 **deferred**，Phase 5V Slice Gate **未通過**、本輪未執行、未宣稱通過。既有主 checkout 的 dirty／untracked paths（`docs/content/sheet-db-verify-report.md`、`artifacts/design-audit/**`、`live/**`、`ref_image/**`、截圖檔、`POSTGREST_READY` 暫存檔）維持原樣，未納入本次整合。
- 下一步：下一個規劃階段是 **Phase 5F-U1 的 implementation planning**——是規劃，不是直接實作；本輪未開始。
- Blocker／待決策：無。
- 相關檔案／commit：`feature/v2-major-update` merge commit `3230e16118e479c793de806dc49f2388e335d62e`（第二 parent `654d185ea8605e600d552b45d0803683bcb8b434`）。

## 2026-08-10 15:35 [Claude Code] — Phase 5F-U1／F2 delivery-boundary remediation（文件層，無實作）

- 做了什麼：Phase 4A、5V 的 UI surface 皆已整合進 `feature/v2-major-update`（見前兩筆條目）。Owner 再確認 UI-first 順序 `4A-UI → 5V-UI → 5F-U1 → 2A → 3A → 5F-F2 → Integration` 不變，並裁定較晚的 UI-first program sequencing 正式取代先前把 LivePresenter 視覺與功能視為單一不可拆分整體的舊框架——**但這不是授權建立假的靜態介面**，5F-U1 必須在既有 production-wired 的 LivePresenter 上直接施工。本輪只做規格盤點與文件修訂：唯讀盤點 `/teacher/live/:sessionId` route（`teacher-live-session-page.tsx`、`live-presenter.tsx`、`live-phase-view.ts`、既有 249 行單元測試＋`live-pages.test.tsx` host console 區塊、既有 86 個 `.live-presenter*` CSS 選擇器），確認 LivePresenter 現有 7 態 typed 投影規則（`ProjectorPhaseView`／`HostConsolePhaseView`）已可誠實驅動 U1 的呈現層工作，唯一現況缺口是 `cancelled` 態主體區塊目前渲染空白（型別已存在，只缺 JSX 分支）。同時發現舊 umbrella 文字把教師統計區塊（Live 參與紀錄）與 LivePresenter 一起併入「5F-U1」範圍、且要求用 test/dev-only fixtures 開發——這與該區塊完全沒有既有 production 資料矛盾（用 fixture 呈現會變成假裝功能存在），本輪已將其完整移出 U1、併入 5F-F2。
- 修改／新增文件：`docs/superpowers/specs/2026-08-10-phase-5f-teacher-live-functional-design.md`（新增第 13 節 Delivery Slices，不刪除既有第 1-12 節任何產品規則）、新增 `docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`（259 行 Draft，含 Objective／Explicit Non-Goals／Existing-Contract Matrix／Typed UI States／Presenter Viewport Contract／Interaction Contract／Visual Direction／AC Mapping／Test Boundary（規劃不執行）／Completion Boundary／Dependency-Deferred Table／Open Questions／盤點來源）、`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`（同步 5F-U1 範圍收斂為 LivePresenter 專屬、補充決策歷程與目前進度）、`docs/roadmap-colorplay-next.md`（同步同一段落）。
- 舊規則與新裁定：舊框架把 LivePresenter 視覺與功能語意視為同一個不可拆分整體；較晚 owner UI-first 裁定正式取代此框架，改為 5F-U1（LivePresenter 視覺，使用既有 production route/hooks/handlers，零新增 API/RPC/schema，不宣稱通過 5F Slice Gate）／5F-F2（統計、reconnect/finalize 等功能語意，2A/3A 之後）的正式分工。
- 下一步：新文件交給 **Codex 做唯一一次 5F-U1 spec review**，remediation 完成、owner 核准後才進入 implementation plan——本輪尚未撰寫 implementation plan，也未建立對應 worktree。
- Blocker／待決策：無。已知未同步項目（刻意，超出本輪授權範圍）：umbrella brief 第 7 行與 roadmap.md 第 47 行的「implementation planning not yet authorized」措辭，對 5V 而言已經過時（5V 已實作並整合），但本輪指示只授權同步 5F-U1/F2 相關措辭，不得改寫其他 phase 狀態，故保留原樣，留待未來一輪一併處理。
- 相關檔案／commit：`docs/superpowers/specs/2026-08-10-phase-5f-teacher-live-functional-design.md`、`docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`（新增）、`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`、`docs/roadmap-colorplay-next.md`（本次 commit 待建立，純文件、無產品程式碼變更）。

## 2026-08-10 16:51 [Claude Code] — Codex 唯一一次 5F-U1 spec review remediation 完成（文件層，無實作）

- 做了什麼：完成 Codex 對 `docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md` 的唯一一次 spec review remediation，未啟動第二個 reviewer。
- **Findings 與 remediation 結果**：
  1. **`draft` 態空白**——先前版本錯誤假設 `draft` 態經現有進場路徑不可達、不需特別設計。已更正：`draft`／`cancelled` 皆是 production union 的合法狀態，deep link／refresh／transition race 下可能停留在 `draft`。已為兩者定案主體契約（`draft`＝「場次準備中」＋既有 `startSession`／`cancel` actions；`cancelled`＝「本場已取消」＋既有 `onExit`，不顯示 provisional rank 或百分比），皆不新增資料或 handler，不新增第三套 phase union，不修改 `projectorView()`／`hostConsoleView()`。
  2. **Root overflow 未收緊**——先前版本把 `.live-presenter` 既有的 `overflow:auto` 視為足夠。已更正：根層在四個投影尺寸下不得捲動，`overflow:auto` 不構成通過條件；只有 participant chips wall 與 standings list 兩處允許有界子容器 overflow（需鍵盤可達＋accessible label＋不遮 header/footer）。新增 too-small predicate（`width<1024 || height<720`，四個正式尺寸絕對不觸發，過小時仍保留安全離開路徑）。
  3. **錯誤的 modal dialog semantics**——先前版本把 LivePresenter 定義為 `role="dialog" aria-modal="true"`。已更正：LivePresenter 是 full-screen route region 非 modal overlay，改為 `role="region"`＋`aria-label="Live 投影模式"`；既有離開流程（`onExit` 只在 podium/cancelled 出現）不變，不新增離開 transition 或 server mutation。AC Mapping 同步移除 AC-UI-011 的正式適用宣稱（不再是 Dialog），保留 AC-UI-008/013/015。
  4. **Reduced-motion 測試層未區分 JSDOM 與 Chromium 能力邊界**——已更正：RTL 只驗證 draft/cancelled 渲染、handler binding、pending、accessible semantics，明確聲明不得宣稱 JSDOM 能驗證實際 media-query CSS；Chromium 用 `page.emulateMedia({reducedMotion:'reduce'})` 驗證動畫 `animation-name:none` 或 `duration:0s`，同時驗證正常模式仍保留核准的一次性提示。Chromium 專用 port 定案為 `localhost:4178`（`--strictPort`、`reuseExistingServer:false`），不與既有 `4173`／`4176`／`4177` 衝突。
  5. **Production content bounds 未查證**——唯讀查證 `supabase/migrations/*.sql`（61 個檔案）的 CHECK constraint 與 RPC `limit` 子句：question prompt 1–1000 字元、option text 1–500 字元、option count 2–4、display name 1–30 字元、podium 硬上限 3 筆、standings 硬上限 5 筆，六項核心內容全數查得明確硬上限。唯一沒有硬上限的是 participant count（`classroom_members`／`live_participants` 無對應 CHECK），但依本輪指示歸類為非核心可捲動區域，不構成 blocker。新增完整 viewport fixture matrix（draft／lobby-boundary／question-boundary／paused-boundary／reveal-boundary／podium-boundary／cancelled／too-small／reduced-motion），全部使用查證到的真實邊界值，不得以短文案 fixture 宣稱契約通過。
  6. **Umbrella／roadmap DAG 未反映 U1/F2 的正確依賴關係，且 5V 狀態文字過時**——已更正 umbrella brief 第 4 節 DAG 與 bullet（5F-U1 獨立於 2A/3A 可先完成；5F-F2 依賴 2A/3A；取消歷史/lifecycle 測試可獨立實作但整體 F2 Slice Gate 仍需母文件逐項判定；5F 完整 Slice Gate 需 U1+F2 皆完成），並修正 umbrella 標頭與 roadmap.md 兩處「5V implementation planning not yet authorized」的過時措辭，改為明確記錄 5V 已實作並以 merge commit `3230e16118e479c793de806dc49f2388e335d62e` 整合（task-level UI surface complete，非 feature complete）。此為本輪明確授權範圍內的修正，未改寫其他 phase 狀態或歷史。
- **是否存在 production content-bound owner blocker**：**不存在**。全部六項核心內容皆有明確硬上限可直接用於 fixture；唯一無硬上限的 participant count 屬於已預先分類的非核心可捲動例外，不需 owner 裁定。
- 5F-U1 spec 全文重寫（`docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`，259→334 行），Open Questions 段落中先前 3 項（cancelled 文案、port 選號、root overflow 策略）本輪全數定案收斂，不再保留。
- 下一步：**尚未核准、未建立 implementation plan**——等待 owner 對本輪 remediation 結果核准。核准後才進入 implementation planning，本輪未建立對應 worktree。
- Blocker／待決策：無（見上方 owner blocker 判定）。
- 相關檔案／commit：`docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`（全文 remediation）、`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`（DAG＋5V 狀態修正）、`docs/roadmap-colorplay-next.md`（同步修正）（本次 commit 待建立，純文件、無產品程式碼變更）。

## 2026-08-10 17:10 [Claude Code] — 5F-U1 spec owner 核准，Codex／Claude Code 角色正式交換

### 已完成

- Phase 4A UI surface 已整合進 `feature/v2-major-update`（merge commit `3644bf2`）。
- Phase 5V UI surface 已整合進 `feature/v2-major-update`（merge commit `3230e16118e479c793de806dc49f2388e335d62e`）。
- 5F-U1／5F-F2 delivery boundary 已定案（母文件第 13 節「Delivery Slices」）。
- 5F-U1 spec 已通過 Codex 唯一一次 spec review 與 remediation。
- Production content bounds（question prompt／option text／option count／display name／podium／standings）已唯讀查證，全數有明確硬上限。
- **無 owner blocker**——participant count 雖無硬上限，但歸類為非核心可捲動區域，不構成 blocker。
- Owner 已正式核准 5F-U1 spec，狀態更新為「Owner approved：2026-08-10／Codex single spec review completed／Remediation completed／Authorized for implementation planning」。

### 5F-U1 核准契約摘要

- 在既有 production-wired 的 LivePresenter（`/teacher/live/:sessionId`）上直接施工，不重寫元件、不重新設計互動流程。
- 複用既有 7 個 typed phases（`draft`／`lobby`／`question`／`paused`／`reveal`／`podium`／`cancelled`），不新增第三套 phase union。
- `draft`（「場次準備中」）與 `cancelled`（「本場已取消」）補上誠實主體，皆沿用既有 handler，零新資料。
- LivePresenter 定義為 full-screen region（`role="region"`＋`aria-label="Live 投影模式"`），不是 modal dialog——移除 `role="dialog"`／`aria-modal="true"`。
- 根層 `.live-presenter` 在四個投影尺寸下不可捲動；只有 participant wall／standings list 兩處允許有界子容器 overflow。
- Too-small predicate：`width < 1024px` 或 `height < 720px` 顯示「投影視窗過小」，四個正式尺寸絕不觸發，過小時仍保留安全離開路徑。
- 四個投影 viewport 契約：1024×768／1280×720／1366×768／1920×1080。
- `prefers-reduced-motion` 以 Chromium（`page.emulateMedia`）驗證，JSDOM 不宣稱能驗證實際 media-query CSS。
- Dev-only Chromium harness 固定 `localhost:4178`（`--strictPort`、`reuseExistingServer:false`）。
- 不新增任何 API／RPC／schema／query／mutation，不修改 hosting semantics（開場／開題／收題／暫停／續行／推進／結算／取消的判斷邏輯）。
- Test-only harness fixtures 不得被 production route import，production runtime 不得顯示 sample data。
- U1 完成只能宣稱「5F-U1 LivePresenter UI surface complete」，不宣稱 5F／Phase 5／Slice Gate 完成。

### 角色交換

- **Codex** 從本次交接起是 5F-U1 的主要實作者：撰寫 implementation plan、建立 implementation worktree、TDD、產品程式碼、scoped validation、review findings remediation、integration preflight 建議。
- **Claude Code** 從本次交接起轉為 5F-U1 的唯一 reviewer：審查 Codex 的 implementation plan 與 implementation diff、驗證 spec conformance／behavioral regression／accessibility 與 viewport 契約／scope boundary／validation evidence 合理性。Claude Code 不得直接修改 Codex 的 implementation worktree、不得代替 Codex 修復 finding、不得使用 reviewer sub-agent 或 Codex plugin／CLI 來 review Codex 自己的實作、不得疊加第二位 reviewer、不得為了讓檢查通過而自行修改產品碼。若 Stop hook 沒有 pending marker，Claude 不主動建立 marker 觸發 Codex review——Claude 本身就是 reviewer。
- **Owner** 維持 spec／plan 範圍變更、新資料／新 API／新互動語意、blocker 裁定、merge／push／hosted 操作授權。
- Review 回覆格式（Claude 審查 Codex 產出時）：先給 `ALLOW:` 或 `BLOCK:` 結論，findings 依 Critical／High／Medium／Low 排序，每項附檔案與行號、具體改法，明確區分事實／推測／需查證資訊；無 finding 直接寫 `ALLOW: 未發現阻塞性問題`；不用 sub-agent 建立 Standards／Spec 雙軸；不自行修改程式碼。Plan review 與 implementation review 是不同 artifact，各自一次；修復後只重跑受影響的 scoped validation，不啟動第二位 reviewer。
- 下一步：由 **Codex** 撰寫 `docs/superpowers/plans/2026-08-10-phase-5f-u1-teacher-live-presenter-ui.md`（implementation plan）。Claude Code 本輪未撰寫此 plan、未寫產品碼、未建立 worktree、未開始 implementation。
- Blocker／待決策：無。
- 相關檔案／commit：`docs/superpowers/specs/2026-08-10-phase-5f-teacher-live-functional-design.md`、`docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`、`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`、`docs/roadmap-colorplay-next.md`（本次 commit 待建立，純文件、無產品程式碼變更）。

## 2026-08-10 17:15 [Codex] — 5F-U1 implementation plan draft 完成，發現最大內容契約 blocker

- 做了什麼：核對 `feature/v2-major-update` HEAD `9b4e459dc35158c985fb285f811d3e5ebd6ee58b`、核准的 U1／母功能 spec、現有 `LivePresenter`／route wrapper／RTL／phase projection／CSS 與 Phase 4A／5V harness 慣例，建立 `docs/superpowers/plans/2026-08-10-phase-5f-u1-teacher-live-presenter-ui.md`。Plan 固定既有 `LivePresenter` props 為唯一 production interface，切成 3 個 TDD task（seven-state/region semantics、四 viewport harness/layout、keyboard/focus/pending/reduced-motion），保留 Claude Code 為 plan 與 implementation 各自唯一 reviewer，未建立 worktree、未開始產品實作。
- 下一步：先由 owner 裁定 plan D 節的內容上限選項並回寫核准 spec，再交 Claude Code 做唯一一次 plan review；兩者完成且 owner 核准 plan 後，才可建立 `.worktrees/phase5f-u1-live-presenter-ui`。
- Blocker／待決策：核准 spec 同時要求 1000 字 prompt＋4×500 字 options 在 1024×768 全文可讀、零裁切、核心區零捲動。最多 3000 字即使以 16×16 px 計算已約占 768,000 px²，而整個 viewport 僅 786,432 px²，尚未計 header/footer/timer/間距，四條要求客觀無法同時成立。建議新增並強制 Live 專用內容上限；次選是修 spec 允許 question/options 成為第三個有界 scroll region；動態縮到不可讀或裁切已排除。
- 相關檔案／commit：`docs/superpowers/plans/2026-08-10-phase-5f-u1-teacher-live-presenter-ui.md`、`docs/handoff.md`（本輪未 commit）。

## 2026-08-10 17:44 [Codex] — 5F-U1 plan review remediation 完成，implementation 已授權

- 做了什麼：依 Claude Code 唯一一次 plan review 的 `BLOCK`（4 High／4 Medium／1 Low）逐項 remediation：補正全域 reduced-motion baseline 與單一 `animation-name:none` 策略；too-small 收斂為 `cancelled`／podium 原有 exit phase；加入四 viewport 全控制項 `>=44×44px`；確認 `LiveSectionOption` 不含題幹／選項，故 U1 不新增 query/data，真正內容強制移交 2A import gate 或 5F-F2且不阻塞 U1；補齊 phase tests、每 task changed-path／harness-import 機械檢查、pending 可辨識契約與 CSS selector 實測值。同步更正核准 spec 第 8.4 節原稱「沒有任何 prefers-reduced-motion 覆寫」的錯誤事實，並修正 too-small 與 8.5 的離開路徑邊界。
- 下一步：本 planning/spec checkpoint commit 後，記錄主 checkout dirty fingerprints，建立 `.worktrees/phase5f-u1-live-presenter-ui`／`phase5f/u1-live-presenter-ui`，依三個 task TDD 實作。Task 2 先以 Chromium 量測 prompt 74／option 50 與候選組合，不縮小既有 51.2px／32px 字級，再定案 LivePresenter 專用內容上限並回寫 spec／plan。
- Blocker／待決策：無。Owner 已裁定採用 Live 專用內容上限；具體數值由 Task 2 Chromium 實測定案。若無合理組合能在 1024×768 通過，依停止條件回報。
- 相關檔案／commit：`docs/superpowers/plans/2026-08-10-phase-5f-u1-teacher-live-presenter-ui.md`、`docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`、`docs/handoff.md`（planning remediation commit 待建立；無產品碼）。

## 2026-08-10 18:28 [Codex] — 5F-U1 LivePresenter UI surface implementation 完成，待 Claude Code 唯一一次 implementation review

- 做了什麼：先完成 Claude Code 唯一一次 plan review 的 4 High／4 Medium／1 Low remediation，並回寫核准 spec：第 8.4 節更正全域 `prefers-reduced-motion` 與 podium fireworks 既有覆寫的事實；第 6 節收旂 too-small 只在 podium／cancelled 沿用既有 exit，進行中 phase 不新增離開路徑；Task 3 補齊四 viewport 控制項 `>=44×44px`；內容強制邊界保持 U1 零新 API／RPC／schema／query／mutation，真正 import／server guard 移交 2A 或 5F-F2且不阻塞 U1。專用 worktree 為 `.worktrees/phase5f-u1-live-presenter-ui`，branch `phase5f/u1-live-presenter-ui`，base `e559a5c32d7c685fb950033f97405680292cb1e5`。
- 內容上限實測：真實最長題幹 74 字／選項 50 字在 1024×768 的初始 baseline 為 presenter `scrollHeight 1411px / clientHeight 768px`。Chromium 最終定案**題幹 36 字／每個選項 21 字／4 個選項**，四個正式 viewport 均保留題幹 `51.2px`／`52px`與選項 `32px`、全文可見、無 document／presenter root 捲動；最緊的 1280×720 主體高 `581px`，與 header／footer 各留約 `6.25px`，37／21 與 36／22 均越界。已回寫 spec 第 5／7 節與 plan Task 2；重算 `artifacts/content/questions.csv` 得 11／62 題題幹與 22／248 個選項需改寫。
- 三個 task commits：`bdc0e21` 補齊 draft／cancelled 主體、named route region 與既有 pending／handler 契約；`774dbaf` 建立 dev/test-only Chromium harness、七態×四 viewport 有界版面、too-small cancelled exit、wall／standings 唯二 scroll regions 與 36／21 邊界；`b0ac1f2` 補齊 keyboard order、品牌黃 3px focus ring（對夜底 `>=3:1`）、pending disabled 可辨識、四尺寸 44px 觸控區與 reduced-motion `animation-name:none`。`projectorView()`／`hostConsoleView()`／route transition payload 均零修改；LivePresenter JSX 相對 base 為 30 insertions／5 deletions，未觸發「新增超過約 50 行 JSX」停止條件。
- Scoped validation：Task 1 的 TypeScript／ESLint／Prettier／diff-check 全綠，4 個 Vitest 檔共 51 tests 通過；Task 2 的 TypeScript／ESLint／Prettier／diff-check／production harness-import 機械檢查全綠，Chromium 32／32 通過；Task 3 的 TypeScript／ESLint／Prettier／diff-check 全綠，7 個 Vitest 檔共 65 tests 與 Chromium 39／39 通過。`pnpm typecheck` wrapper 在獨立 worktree 因 `node_modules` metadata 觸發自動安裝，sandbox 無網路而中止；實際 typecheck 使用同版本 root `node_modules/.bin/tsc -b --pretty false` 通過，兩次工具產生的 partial modules 皆已移到 `/private/tmp`，未納入 git。Phase 1 tip 仍為 `def3fc96`，無新 `.live-presenter*` selector overlap。
- 下一步：交 Claude Code 做本 artifact 的唯一一次 implementation review（只 review，不直接改 Codex worktree）。本輪只宣稱**「5F-U1 LivePresenter UI surface complete」**；不宣稱 5F／Phase 5／Slice Gate／production-ready。merge／push／hosted 操作仍需 owner 另行授權。
- Blocker／待決策：無實作 blocker；待 Claude Code implementation review 結果。
- 相關檔案／commit：`phase5f/u1-live-presenter-ui` branch，base `e559a5c`，implementation tip `b0ac1f2`（handoff append commit 待建立）。

## 2026-08-10 18:48 [Codex] — 5F-U1 implementation review remediation 完成，交 owner 核准

- Review 結論：Claude Code 作為唯一 reviewer 對 `e559a5c..180c573` 給出 `BLOCK`（1 High／1 Medium／2 Low）；本輪未啟動第二位 reviewer，也未進行第二輪完整 review。
- Findings remediation：H1 先在既有 draft／cancelled RTL 測試加入題號負向斷言，兩態皆精準 RED，再把 header 映射收斂為 draft「尚未開始」／cancelled「已取消」／lobby 沿用「等待室」／其餘 phase 沿用既有題號；M2 採首選方案，移除無條件覆蓋正解列 `scale(1.06)` 的高 specificity 規則，改以 chart `width:100%`＋`padding-right:6%` 容納右緣外擴，保留既有正解放大強調與 reduced-motion `transform:none`；L3 把 too-small 警示改為 `role="alert"`；L4 不改程式碼，只在 spec 第 6 節記錄 header／footer 刻意保留、主體隱藏，footer transition 是否停用待 owner 裁定。Spec 第 9 節亦補記 M2 視覺決策與原因。
- Scoped validation：H1 RED 為 2 failed／13 passed，GREEN 後 `live-presenter.test.tsx` 15／15；Chromium harness 維持 39／39，並在四個正式 viewport 驗證 reveal 正解列仍為 `scale(1.06)` 且位於主體範圍內，1280×720 最緊尺寸仍通過；`npx tsc -b --pretty false`、scoped ESLint、5 個 affected files Prettier、`git diff --check`、production harness-import 機械檢查皆 exit 0。Forbidden paths 相對 base 維持零 diff；Phase 1 tip 仍為 `def3fc96`，無新增 `.live-presenter*` overlap。
- Remediation commit：`0bcd53a9a6c77ce711be275ea5ba3f5e48f0ec51`（`fix(live): remediate H1 M2 L3 and document L4`，5 paths，22 insertions／7 deletions）。
- 下一步：本 checkpoint 直接交 owner 依 findings、remediation 與 validation 核准，不再交第二輪 review。只可宣稱「5F-U1 LivePresenter UI surface complete」；不是 5F／Phase 5／Slice Gate／production-ready。Merge／push／hosted 操作仍分別以 owner 授權與 staging runbook 為準。

## 2026-08-10 18:59 [Codex] — Current UI 已可在公開 staging 檢視；Git staging branch 受必要 checks 阻擋

- Owner 授權先把目前 UI 放上 staging 檢視學生端；鎖定的應用程式來源是 clean `phase5f/u1-live-presenter-ui` SHA `2423c0955fb1305f6fd4cbc5634c206eb6f04507`。在 owner 隨後指定 GitHub staging branch 通道前，Vercel CLI deployment 已完成：project `colorplay-staging-web`、deployment `dpl_9toTbRS3VR5BBSQ6cMBgqfAonTfi`、狀態 `READY`，並 alias 至 `https://staging.colorplayapp.com`；根路徑與 `/login` deep link 均實測 HTTP 200。這是 runbook 第 5 節的 interim visibility deployment，不是正式 Staging gate。
- GitHub 通道：`git push --dry-run origin HEAD:staging` 確認可由 `24ee1ee` fast-forward 到 `2423c095`；實際 direct push 被 GitHub `GH013` 拒絕，原因是受保護 `staging` 必須經 PR 且 9/9 required status contexts 必須存在。未 force、未 admin bypass。
- 已把 feature branch 推至 `origin/phase5f/u1-live-presenter-ui` 並建立 [PR #4](https://github.com/peiyi-liu/colorplay_v1/pull/4)（base `staging`、初始 head `2423c095`）。兩個 Vercel project checks 與 Vercel Preview Comments 均通過，但 PR 仍為 `BLOCKED`；缺少的 contexts 是 `format`／`lint`／`typecheck`／`unit-coverage`／`production-build`／`local-database`／`chromium-e2e`／`credential-scan`／`owner-approval`。
- Root cause：目前 branch 的 `.github/workflows/ci.yml` 只監聽 PR→`main` 且只有 `foundation-ci` job；可產生前八個 staging-required contexts 的 Feature CI 仍只存在 `phase0/release-foundation`，尚未整合進本線。這是既有 delivery wiring 缺口，不是本次 U1 測試失敗；本輪未擴大 scope 搬入 CI／staging-deploy workflows，也未偽造 status context。Remote `staging` 因此仍為 `24ee1ee9c03539e44c99dba5f36c13599cf434cd`。
- 下一步／待 owner 裁定：若目前只需 UI 檢視，可直接使用公開 staging URL；若要求 Git `staging` 與部署 SHA 正式對齊，需另行授權整合 Phase 0 Feature CI／owner-approval wiring，再讓 PR #4 跑完 required checks。此 checkpoint 不宣稱正式 Staging gate、5F、Phase 5、Slice Gate 或 production-ready。

## 2026-08-10 20:47 [Codex] — UI 修正四條線完成並發布公開 staging

- 做了什麼：依 owner 指定的四條線完成可見 UI task-level 修正。首頁加入 Codédex 深藍村落背景與 pixel 標題層次；登入頁重排垂直空間並保留完整欄位；學生學習地圖改為可換行的章節標示，移除省略與文字互壓。教師端實際修改 `teacher-classrooms-page.tsx`、`teacher-student-progress-page.tsx`、`teacher-live-report-page.tsx`、`teacher-live-session-page.tsx`，並沿用 Phase 4A token 套用共用 sage workshop 外框；Live feedback 作答統計改為水平、垂直置中，同時保留正解長條 `scale(1.06)` 與右側安全空間。
- 第三章內容：重新抓取 owner 最新 Google Sheet，修正 importer 不支援「單一 subtopic 多張卡」的根因，改以全域複習卡 identifier 產生 stable code；結構 gate 由 18 項錯誤降為 0。staging project `onkxnkzeixpezetkmocf` 已以單一 transaction 匯入，結果為 published 26、draft 1、archived 3、3-3 cards 7、published media 0、duplicate stable codes 0。舊卡採 archive，不刪除進度關聯。
- 附件邊界：最新版 Sheet 有 `331301 圖3-2`、`332102 圖3-3`、`332104 圖3-4`、`332201 圖3-5` 四個附件標籤，但 XLSX 沒有這四張可部署來源檔。已移除錯誤的 `color-wheel.svg` placeholder 並在 import report 明列缺件；不得宣稱四張圖片已正確匯入，下一步需 owner 提供實際素材檔。
- 截圖與機械驗收：`artifacts/design-audit/ui-content-correction/manifest.json` 記錄 title／login／learning-map／classes／student-progress／live-report／live-session／live-feedback 各 1280 與 393 的 16 張截圖。visible UI 在 320／375／393／1280／1440、教師 routes 在 320／375／393／768／1024／1280／1440 均通過 `scrollWidth/clientWidth`、文字 bounding-box overlap、console error 與水平捲動檢查；教師 route group 7/7，LivePresenter Chromium 42/42，visible UI 15/15。
- Scoped validation：`tsc -b`、affected ESLint、Prettier、`git diff --check`、production harness-import guard、9 個 Vitest 檔 85 tests、Vite production build 全綠；內容 contracts 另為 4 檔 33 tests 全綠。未刪 assertion、未 skip、未新增 mock 正式功能。
- Commits：`08c54a3` public learning surfaces、`a494456` teacher workshop surface、`e5a159b` Live feedback centering、`bd02543` global identifier content import、`607fc0e` Live session 與 design audit；branch `codex/ui-content-correction`。
- Staging：GitHub feature branch 已推至 `peiyi-liu/colorplay_v1`，Vercel project `colorplay-staging-web` deployment `dpl_2gzxweKZwSjR5MfZLF6ipfEoPN3j` 為 READY；Vercel metadata 核對 `source=git`、ref `codex/ui-content-correction`、SHA `607fc0e0d558848e0d306d4d5103c9014819855a`。`https://staging.colorplayapp.com` alias 已切換，根路徑與 `/login` 均 HTTP 200。未修改 Git `staging` branch、PR #4 CI wiring、production hosting 或 production database。
- 完成邊界：只宣稱「ColorPlay UI 修正四條線 task-level complete 並可在公開 staging 檢視」；不宣稱 Phase 2A、5F、Phase 5、Slice Gate 或 production-ready。真實行動裝置 AC-UI-010/012、缺少的四張複習卡附件與 Phase 8 release gate 仍未完成。

## 2026-08-10 22:26 [Codex] — Owner 選定 JRPG App Shell「C：連續世界旅程」

- 做了什麼：Owner 從三個 JRPG App Shell 草圖中選定 C「連續世界旅程」作為全站改版方向。固定決策包含：深藍夜空 App Shell 與 HUD 跨 route 穩定、內容以道路／橋樑／霧帶／階梯／光線連成世界段落、不再使用包住主要內容的頁面級大外框、手機版重新構圖、閱讀→小節測驗→複習→章節總測驗以可見旅程節點呈現，並要求每個 route-level 畫面在實作前產生桌機與 393px 草圖供 owner 確認；畫面與場景之間需有轉場。
- 下一步：先完成 App Shell／HUD／世界連接方式／轉場 storyboard 的設計確認，再分批生成首頁與 Auth、學生核心學習循環、其餘學生功能、教師端、Live／投影等逐頁草圖；全部仍是設計階段，尚未授權產品實作。
- Blocker／待決策：需由 owner 選定跨 route 的主要轉場語彙（短距道路推進＋霧幕、門扉／地標遮罩、或純 crossfade）；功能層的「移除課後任務實戰、加入小節測驗與章節總測驗」另需明確 route／資料契約，不能只靠 UI 換標籤完成。
- 相關檔案／commit：`artifacts/design-audit/jrpg-app-shell/selected/continuous-world-journey-c.png`、`artifacts/design-audit/jrpg-app-shell/selected/selection-manifest.md`（設計參考，未 commit）；本筆 handoff 尚未 commit，無產品程式碼變更。

## 2026-08-10 23:10 [Codex] — JRPG App Shell 第一批核准與第二批功能畫面待審

- 做了什麼：Owner 核准第一批 01 固定學生 HUD、03 登入公會櫃台、04 道路推進／霧幕轉場、05 六章學習地圖；02 首頁要求桌機版「開始冒險」移至右下，已另存 `02-home-world-entrance-v2.png`，手機版維持不變，待 owner 確認。依 owner 追加範圍完成第二批草圖：06 複習閱讀、07 小節測驗、08 Live 學生端、09 Live 教師主持台、10 Live 投影、11 教師登入後固定選單、12 教師表格、13 商店。Codex 在交 owner 前主動否決 09-v1（誤加教師等級／點數）與 12-v1（誤用學生 XP／金幣 HUD），已產生 09-v2／12-v2 修正候選。
- 下一步：Owner 逐張核准或提出修改；完成第二批核准後才繼續生成章節總測驗／結果、錯題、進度、成就、排行榜、其餘教師 route 與系統狀態。仍未撰寫 implementation plan、未修改產品程式碼、未部署。
- Blocker／待決策：02-v2 與第二批 06–13 尚待 owner 核准。生成圖的教育內容、數值與中文字形均為示意，不得直接成為正式產品內容。
- 相關檔案／commit：`artifacts/design-audit/jrpg-app-shell/batch-01/**`、`artifacts/design-audit/jrpg-app-shell/batch-02/**`、`docs/handoff.md`（均尚未 commit；無產品程式碼變更）。

## 2026-08-10 23:37 [Codex] — 複習／測驗／Live 流程 v2 草圖完成

- 做了什麼：依 owner 回饋重畫第二批核心畫面。06-v2 改為桌機近滿版雙頁書、手機單頁直向閱讀；07-v2 桌機答案改 2x2 四宮格並示範長選項換行／有下限縮字，手機結構維持；08-v2 學生 Live 只顯示 A／B／C／D 與「請看投影幕作答」，不顯示題目；新增 14 Live 六位加入代碼頁；09 拆成 09A 建立 Live（班級、小節單選／多選、20 秒預設倒數）與 09B 全螢幕主持（加入代碼、人數、暱稱、開始遊戲與進行中控制）；10-v2 投影 storyboard 補齊等待、題目倒數、公布正解／作答統計、排名四態。所有草圖已存入 batch-02 並記錄 SHA-256。
- 下一步：等待 owner 逐張核准或修正；確認「20 秒」究竟是每題作答倒數或 Lobby 等候時間後，才可把 Live 設計寫成正式契約。後續仍需產生章節總測驗／結果、錯題、進度、成就、排行榜與其餘教師 route。
- Blocker／待決策：學生端只顯示選項會讓只使用螢幕閱讀器的學生缺少題目語意；正式設計需決定是否提供視覺隱藏但 AT 可讀的題目，或把此模式明確限定為必須觀看教室投影的同步活動。生成圖內教育文字、排名、分數與暱稱均非權威內容。
- 相關檔案／commit：`artifacts/design-audit/jrpg-app-shell/batch-02/{06-review-reading-v2,07-student-section-quiz-v2,08-live-student-options-only-v2,09a-live-create,09b-live-fullscreen-host,10-live-projector-phases-v2,14-live-join-code}.png`、`artifacts/design-audit/jrpg-app-shell/batch-02/manifest.md`、`docs/handoff.md`（尚未 commit；無產品程式碼變更）。

## 2026-08-10 23:55 [Codex] — JRPG Continuous World 全站設計契約與實作計畫草案

- 做了什麼：把 owner 已選定的「連續世界旅程」整理成全站設計契約，涵蓋固定夜空 App Shell／HUD、取消奶黃色頁底與頁面級大外框、route 霧幕轉場、公開/Auth、學生學習循環、Quiz／結果／錯題、商店／成就／排行榜、教師固定選單與表格、Live join／participant／create／host／projector／report；另建立 implementation plan，順序為 Foundation → Public/Map → Learning → Student Meta → Teacher → Live。唯讀確認現況：Live `screen_only` 與每題預設 20 秒已有正式 repository contract；Live 多小節目前只有單一 `quizTemplateId`／`sectionId`，小節測驗也缺 authoritative template/gate，兩者列為獨立功能切片，不以假 UI 冒充完成。
- 下一步：owner 確認 plan B 節的四個測試 seams 後，重新確認 `feature/v2-major-update` tip 與 dirty fingerprints，建立 `.worktrees/jrpg-continuous-world-shell`，從 Task 1 固定 Shell／HUD／背景／轉場開始 TDD。未核准的 route 草圖仍先產生並由 owner 確認，再進對應頁面 task。
- Blocker／待決策：依 TDD skill，任何測試前必須由 owner 確認公開測試 seams；02 首頁 v2 與尚未生成的結果／錯題／進度／成就／排行榜／其餘教師狀態仍需依先前決策逐頁核准。Live 多小節與小節測驗需新 server contract，不能納入純 UI task。
- 相關檔案／commit：`docs/superpowers/specs/2026-08-10-jrpg-continuous-world-app-shell-design.md`、`docs/superpowers/plans/2026-08-10-jrpg-continuous-world-app-shell.md`、`docs/handoff.md`（均未 commit；尚未建立 worktree或修改產品碼）。

## 2026-08-11 00:08 [Codex] — 全站改版改採 generated-board visual parity first

- 做了什麼：Owner 修改執行順序，裁定以 `artifacts/design-audit/jrpg-app-shell/` 目前生成的非 rejected／非 superseded 圖片作為 UI／UX implementation references，先把畫面更新為相同的場景、構圖、色彩、HUD、資訊層級與 desktop/mobile composition，再逐項加入新功能。Codex 重寫設計契約與 implementation plan：以 JourneyAppShell、RouteWorldStage、BookReadingSurface、BattleChoiceSurface、TeacherWorkSurface、LiveStageSurface 六個深 Visual Modules 消化 14 張 boards；UI 分為 Shell → Public/Auth/Map → Book/Battle/Market → Teacher → Live 五波，新功能改為 missions removal → journey progress → subtopic Quiz → chapter final gate → Live multi-section 五個獨立 vertical slices。同步把 batch-01 的 02-v2 與 batch-02 所有有效 v2 boards 標為 owner adopted visual references。
- 下一步：Owner 確認新版 plan D 節四個 seams 後，重新確認 `feature/v2-major-update` tip 與主 checkout dirty fingerprints，建立 `.worktrees/jrpg-generated-board-ui`／`phase6/jrpg-generated-board-ui`，從 UI-1 Shell／HUD／夜空／轉場開始 TDD。現有 hooks／repository／handlers 在 restyle 時保持連線，不先拔除再用 mock 補回。
- Blocker／待決策：pre-code TDD seam confirmation 尚未完成。Generated board 的錯字、假數值、假資料、任意角色／圖示不具權威性；visual parity 只約束 layout／scene／hierarchy，正式 DOM copy、server data、a11y 優先。
- 相關檔案／commit：`docs/superpowers/specs/2026-08-10-jrpg-continuous-world-app-shell-design.md`、`docs/superpowers/plans/2026-08-10-jrpg-continuous-world-app-shell.md`、`artifacts/design-audit/jrpg-app-shell/batch-{01,02}/manifest.md`、`docs/handoff.md`（均未 commit；本輪無產品碼、無 worktree、無 push／deploy）。

## 2026-08-11 00:12 [Codex] — Generated-board UI plan seams 核准，UI-1 implementation 授權

- 做了什麼：Owner 回覆「是」，核准新版 plan D 節四個 pre-code test seams：JourneyAppShell、typed Visual Modules、production route adapters、production browser／dev-only harness isolation。Plan status 更新為 owner approved／four implementation test seams confirmed／authorized for UI-1 implementation。Codex 重新讀取 `codebase-design` 與 `tdd` skills、`CONTEXT.md`、current roadmap、design spec 與 UI acceptance contract；本 checkpoint 尚未寫產品測試或產品碼。
- 下一步：建立 planning checkpoint commit；記錄 `feature/v2-major-update` tip 與主 checkout dirty fingerprints；建立 `.worktrees/jrpg-generated-board-ui`／`phase6/jrpg-generated-board-ui`。UI-1 依 Shell seam 一個 behavior slice 一次 RED → GREEN：先 avatar＋nickname identity，再 HUD role/geometry，再 deep-navy root／RouteWorldStage，再 reduced-motion transition。
- Blocker／待決策：無。生成 PNG 約 40MB，只作主 checkout 的只讀視覺參考，不放入產品 bundle，也不把整張圖當 runtime background。
- 相關檔案／commit：`docs/superpowers/plans/2026-08-10-jrpg-continuous-world-app-shell.md`、`docs/superpowers/specs/2026-08-10-jrpg-continuous-world-app-shell-design.md`、`artifacts/design-audit/jrpg-app-shell/batch-{01,02}/manifest.md`、`docs/handoff.md`（planning checkpoint commit 待建立）。


## 2026-08-11 01:27 [Codex] — 首頁／登入／註冊修正版待 owner 逐頁核准

- 做了什麼：依 owner 回饋只修正目前公開與認證場景，未前進學習地圖。首頁改為唯一「開始冒險」主行動並導向 `/login`，移除「已有帳號？登入」，縮小 ColorPlay 與「色彩王國的冒險旅程」並強制單行；原 64×64 裁圖 icon 已替換為 1254×1254 透明高畫質像素風藍金寶典（深藍書體、金色書角／書脊、六色色相環、金色羽筆）。登入桌機將「歡迎回來，冒險者。」置於人物上方，手機將「冒險者公會」定位於木牌，帳號／密碼改為設計圖的直角深藍框。註冊保留真實 OTP／欄位／提交流程，改為同一公會場景，桌機雙欄表單固定右側、手機單欄接續場景；匿名公開／Auth route 不再插入學生頁專用的「轉橫體驗更佳」橫幅。
- 驗證：RTL 5 檔 72 tests 全綠；TypeScript build、scoped ESLint、Prettier、`git diff --check` 全綠；Chromium 1280×720／393×852 共 6/6，全數通過水平溢出、文字／控制內容寬度與 44px 觸控高度檢查。證據 manifest：`artifacts/design-audit/jrpg-auth-revision/manifest.md`。
- 下一步：owner 依序審核首頁、登入、註冊；未明確核准前停止，不開始學習地圖或任何下一個畫面。核准後才建立本批 commit，再進下一頁。
- Blocker／待決策：等待 owner 視覺核准；目前未 push、未 deploy、未修改資料／API／權威學習規則。
- 相關檔案／commit：`src/app/router/title-page.tsx`、`src/features/auth/pages/{login-page,register-page}.tsx`、`src/styles/globals.css`、`public/colorplay-grimoire-pixel.png` 與對應 unit／Chromium tests；本批尚未 commit。

## 2026-08-11 01:54 [Codex] — 登入固定視窗與註冊三步驟修正待 owner 核准

- 做了什麼：依 owner 最新裁定將註冊改為固定三步驟（1 基本資料、2 E-mail 驗證、3 帳號與密碼），每次只顯示該步驟欄位，桌機與 393px 手機皆固定在畫面右側且不可捲動；保留既有真實 OTP、註冊提交與錯誤處理契約。註冊標題上方的 icon／「冒險者公會」／「建立你的冒險者通行證」已移除；登入與註冊共用藍銀雙層直角像素窗框、輸入框等高對齊；Auth 場景原本疊在表格下方的村莊房屋剪影已移除。登入桌機保留「歡迎回來，冒險者。」，手機保留木牌上的「冒險者公會」。
- 驗證：登入＋註冊 RTL 2 檔 26 tests 全綠；`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；Chromium 1280×720／393×852 共 4/4，機械驗證 document/main 零垂直捲動、portal/frame 完整位於 viewport、控制項 ≥44px、房屋 pseudo-element 不存在，教師登入增加班級序號後亦未溢出。證據 manifest：`artifacts/design-audit/jrpg-auth-revision/manifest.md`。
- 下一步：owner 先於本機預覽逐頁審核登入與註冊；未核准前不做學習地圖、不 commit、不 push、不 deploy。
- Blocker／待決策：等待 owner 視覺核准。註冊第三步需完成真實 E-mail OTP 才能由 production browser 進入；第三步欄位與送出契約已由 RTL 覆蓋，未用 mock 頁面冒充瀏覽器成品。
- 相關檔案／commit：`src/features/auth/pages/register-page.tsx`、`src/features/auth/pages/register-page.test.tsx`、`src/styles/globals.css`、`tests/e2e/auth-{guild-desk,register-guild}.visual.spec.ts`、`docs/handoff.md`；本批仍未 commit。

## 2026-08-11 02:08 [Owner] — Auth 視覺未完成，下一畫面改做學生 HUD

- 未完成、後續再優化：登入與註冊雖已實作共用藍銀直角像素窗框，但尚未通過 owner 視覺驗收，不得標記為核准完成。
- 未完成、後續再優化：登入桌機「歡迎回來，冒險者。」與手機木牌「冒險者公會」雖已進入目前實作，但呈現仍未通過 owner 視覺驗收，不得標記為核准完成。
- 下一步：暫停 Auth 視覺修正，下一個且唯一的畫面改為學生端固定 HUD；以 `artifacts/design-audit/jrpg-app-shell/batch-01/01-stable-student-hud.png` 為 owner 已核准參考，保留真實 profile／economy／inventory 與既有 navigation／MENU 行為，不把生成圖示意資料寫入 production。
- 邊界：學生 HUD 未經 owner 視覺核准前，不前進學習地圖或其他頁面；本筆只有 handoff 狀態更新，未 commit、未 push、未 deploy。

## 2026-08-11 02:15 [Codex] — 學生 HUD 修正版待 owner 視覺核准

- 做了什麼：依 owner 核准的 `batch-01/01-stable-student-hud.png` 將學生 identity、Level／XP／Token、正式導覽與 MENU 收進單一穩定 HUD。桌機為一列藍黑像素介面；393px 為兩列 composition，關閉時主列收斂為 MENU，開啟後仍保留「學習大廳／Live 課堂／商店」三個正式 route。商店直接連既有 `/app/shop`，MENU 移除重複的「裝備商店」；其餘既有 route 與登出／focus trap 行為維持。生成圖的數值未帶入 production，正式 profile／economy／inventory hooks 仍是資料來源。
- 驗證：`tsc -b`、scoped ESLint、Prettier、`git diff --check`、production harness import boundary 全綠；AppShell／HudCommandBar／EconomySummary 3 檔 44 tests 全綠；Chromium 1280×720／393×852 共 2/2，通過單一 HUD 高度、水平溢出、重要文字內容寬度、可見控制項 >=44×44、手機 MENU 內三個正式 route 等機械檢查。
- 審核入口：本機 `http://127.0.0.1:4181/dev-harness/student-hud.html`；截圖 manifest：`artifacts/design-audit/jrpg-student-hud/manifest.md`。截圖僅供 owner 視覺比對，不是 staging／production evidence。
- 下一步：等待 owner 對學生 HUD 核准或提出修改；未核准前不做學習地圖或其他頁面。
- 邊界：Auth 兩項仍維持上一筆「未完成、後續再優化」；本批未 commit、未 push、未 deploy。

## 2026-08-11 02:39 [Codex] — 學生 HUD 頭像／資訊排列／像素金幣修正待 owner 核准

- 做了什麼：依 owner 回饋讓 equipped Blook 圖以 `width/height:100% + object-fit:cover` 貼滿圓形頭像內容區，未用 transform 製造隱性溢出；暱稱與 `Lv.` 改為相鄰排列，XP 區塊固定在其右側；通用 outline coin SVG 改為專用 8-bit 八角像素金幣，Token 數值仍使用正式 economy summary。393px 將 economy 與 MENU 分成獨立 grid 欄，避免 XP 與 MENU 盒子重疊。
- 驗證：coin DOM 契約先 RED 後 GREEN；AppShell／HudCommandBar／EconomySummary 3 檔 44 tests 全綠；Chromium 1280×720／393×852 共 2/2，新增 avatar/name、name/level、level/XP、XP/token、token/navigation、compact XP/MENU bounding-box 零重疊檢查，並維持零水平溢出與 >=44×44 控制項；`tsc -b`、scoped ESLint、Prettier、`git diff --check`、production harness import boundary 全綠。
- 教師端後續參考：owner 指定 `artifacts/design-audit/jrpg-app-shell/batch-02/12-teacher-table-v2.png`，但本輪明令先完成學生端，因此未修改任何教師頁。
- 下一步：owner 於 `http://127.0.0.1:4181/dev-harness/student-hud.html` 審核學生 HUD；未核准前不開始教師端或下一頁。
- 邊界：未 commit、未 push、未 deploy；Auth 兩項仍是未完成、後續再優化。

## 2026-08-11 02:48 [Codex] — 學生 HUD 垂直身份層級與 32-bit 金幣修正待 owner 核准

- 做了什麼：依 owner 最新回饋把暱稱與等級改為上下顯示，XP 在桌機與 393px 手機皆固定於兩者右側；手機最右欄維持金幣在上、MENU 在下。Token 圖示由先前 8-bit 版本升級為 24×24 CSS 32-bit 像素金幣，保留正式 economy summary 數值來源。教師端參考圖已記錄，但本輪未修改教師頁或下一個學生畫面。
- 驗證：先新增 `XP.left >= max(暱稱.right, 等級.right)` 的 Chromium 幾何契約，修正前 393px 如預期 RED（XP left 74、需求 >=224），修正後 1280×720／393×852 共 2/2；另驗 XP／Token／MENU 零重疊、零水平溢出、HUD 固定高度與可見控制項 >=44×44。AppShell／HudCommandBar／EconomySummary 3 檔 44 tests、`pnpm typecheck`、scoped ESLint、Prettier、`git diff --check`、production harness import boundary 全綠。
- 下一步：owner 於 `http://127.0.0.1:4181/dev-harness/student-hud.html` 審核本版學生 HUD；未核准前不開始教師端、學習地圖或下一畫面。
- 邊界：未 commit、未 push、未 deploy；Auth 兩項仍標記未完成、後續再優化。

## 2026-08-11 09:34 [Codex] — 學習大廳／六章連續世界地圖待 owner 視覺核准

- 做了什麼：依 owner 指定的 `batch-01/05-student-learning-map.png`，把 `/app` 舊白天六格廣場與羊皮紙標題替換為桌機／手機各自構圖的深夜連續世界。兩張新地形只包含夜空、懸崖、森林、道路、橋、瀑布、燈火與恰好六個空地；六棟既有 chapter sprite、正式 chapter access state、chapter link、標題與 CTA 仍由 semantic DOM／正式 hook 資料提供。畫面預設顯示已完成／進行中／未解鎖，主要行動依正式選取章節顯示「開始／繼續／查看第 X 章」，未加入假 API 或假權威資料。
- 建築對齊：桌機與手機各自保存六組 ground anchors；每個 building container 使用 bottom-center transform。Chromium 首輪抓到 `<button>` line box 造成圖片底部距 anchor 7px，已以 block／zero-line-height 修正；最後六棟建築在 1280×720 與 393×852 的圖片底部中心誤差皆 <=1.5 CSS px，未放寬 assertion。
- 資產：`src/assets/learning-map/continuous-world-{desktop,mobile}.webp`（1672×941／941×1672，合計 611,924 bytes），由 OpenAI built-in image generation tool 建立 environment-only 32-bit pixel terrain；首版各多出第七空地而拒用，saved versions 經 targeted edit 收斂為六空地。PNG 中間檔已移至 `/private/tmp/colorplay-continuous-world-*-source.png`，未刪除且不進 repository。
- 驗證：Learning Map 6 檔 38 tests、`pnpm typecheck`、scoped ESLint、Prettier、`git diff --check`、production harness import boundary 全綠；Chromium 1280×720／393×852 共 2/2，通過六章狀態數、唯一 CTA、desktop/mobile source、底部中心 anchor、重要文字／CTA 零裁切與零重疊、水平 overflow <=1px、控制項 >=44×44、地圖緊接固定 HUD。對應 AC-UI-008～012 的瀏覽器子集；真實手機仍待人工裝置驗證。
- 審核入口：`http://127.0.0.1:4181/dev-harness/learning-map.html`；manifest：`artifacts/design-audit/jrpg-learning-map/manifest.md`。等待 owner 視覺核准，未核准前不開始章節頁或教師端。
- 邊界：未 commit、未 push、未 deploy；Auth 兩項仍標記未完成、後續再優化。

## 2026-08-11 09:40 [Codex] — 學習地圖手機章節文字統一移至建築右側

- 做了什麼：依 owner 回饋只修改 393px 直式構圖，移除偶數章原本把 label／status 放在建築左側的規則；六章的「第 X 章」與「已完成／進行中／未解鎖」現在全部從建築圖片右緣外 4px 開始。桌機版定位未修改。
- 驗證：先加入 `label.left >= buildingArt.right - 1` 與 `status.left >= buildingArt.right - 1` 的方向性 Chromium assertion，修正前 393px 如預期 RED；修正後 1280×720／393×852 共 2/2，並維持文字／CTA 零裁切、零 bounding-box overlap、document 水平 overflow <=1px、六棟建築 bottom-center anchor <=1.5px。
- 下一步：owner 於 `http://127.0.0.1:4181/dev-harness/learning-map.html` 審核手機直式版本；未核准前不開始下一畫面。
- 邊界：未 commit、未 push、未 deploy；本輪未修改正式資料、API、解鎖規則或桌機 map geometry。

## 2026-08-11 09:57 [Codex] — JRPG 公開頁與學生介面以 GitHub Source 部署至 staging

- 做了什麼：依 owner 本輪授權，把首頁、登入、註冊、固定學生 HUD 與六章連續世界學習地圖整理為 `50d3f3f847c4715cfa8b0a2c8beb2fcd59fc95fb`（`feat(ui): integrate JRPG public and student surfaces`），推送至 GitHub `phase6/jrpg-generated-board-ui`。Vercel `colorplay-staging-web` 由該 GitHub commit 自動建立 preview `dpl_UEJTdQWr9mT742BQTa62HwviUvbU`，再 promote 為 staging-project production deployment `dpl_ADWkrxn8MnMy5AGDuM2SwR1pP2oJ`；`staging.colorplayapp.com` 已指向後者。Vercel metadata 的 `gitSource.type=github`、repo=`peiyi-liu/colorplay_v1`、ref=`phase6/jrpg-generated-board-ui`、SHA=`50d3f3f847c4715cfa8b0a2c8beb2fcd59fc95fb` 均吻合，不再是本機原始碼直接上傳來源。
- 驗證：`pnpm typecheck`、scoped ESLint／Prettier、`git diff --check`、production harness import boundary、11 檔 105 tests、`pnpm build` 全綠；本機 Chromium 五頁 1280／393 共 10/10。Hosted routes `/`、`/login`、`/register`、`/app` 與新寶典、桌機／手機登入背景、桌機／手機 continuous-world 資產皆 HTTP 200；首頁／註冊 hosted Chromium 4/4。登入 hosted 2 項停在測試只接受未雜湊 `guild-desk-*.png` 的檔名，實際 computed style 已載入 Vite 雜湊後的 `guild-desk-desktop-CQHx_IGl.png`／`guild-desk-mobile-Dfr8F5rp.png` 且兩資產 HTTP 200，屬測試環境字串限制，不是畫面或資產缺失。
- Git 邊界：直接推送 GitHub `staging` 被 GH013 正常拒絕，因該 protected branch 強制 PR 且等待 9/9 required status contexts；未 force push、未繞過 GitHub 規則。遠端 `staging` 仍為 `24ee1ee9c03539e44c99dba5f36c13599cf434cd`，本次改以 GitHub feature-branch deployment promote 到專用 staging Vercel target。若要讓 GitHub `staging` branch 本身前進，仍需另行補齊 required checks／PR merge。
- Owner 檢視邊界：本次 staging 是視覺檢視版本，不是 Phase／Slice Gate／production-ready 宣告。Auth 的藍銀窗框與歡迎文案仍保留先前「待 owner 後續優化」標記；學生 HUD 與學習地圖可由 owner 在 staging 登入後檢視，真實手機仍待人工裝置驗證。
- 下一步：owner 檢視 `https://staging.colorplayapp.com`；逐頁回報差異後再做下一畫面。GitHub `staging` 的 PR／required-check 問題留在 release workflow 範圍，不在本次 UI 部署中私自改動。

## 2026-08-11 10:22 [Owner／Codex] — Staging／Production Supabase 映射列為不可違反規則

- Owner 再次明確裁定：`colorplay-staging-web`／`staging.colorplayapp.com` 一律連 `https://onkxnkzeixpezetkmocf.supabase.co`；Production 的 `colorplay-web`／`colorplayapp.com` 才連 `https://xdjumzdqyexpyndanwkp.supabase.co`。兩組 URL／public key 不得交叉混用。此規則已同步補到 `docs/roadmap-colorplay-next.md` 的 Target topology 旁。
- 根因與修復：原 staging hosted bundle 實測為 `xdjum…` URL 搭配 `onkx…` anon key，E-mail Auth 回 `401 Invalid API key`，一般帳號的 `auth-login` 回 `net::ERR_FAILED`，分別造成「登入失敗，請使用追蹤代碼回報」與「網路連線失敗」。Vercel `colorplay-staging-web` 的 Preview／Production `VITE_SUPABASE_URL` 已明確更新為 `onkx…`，並從 GitHub SHA `9999d0dabbe19e2e7235eac769681c6d29e8e839` 建立全新 production build `dpl_3hNo5tQvWoAnbZgvk6AWn6iC2MqP`；`staging.colorplayapp.com` 已切至該 deployment。
- 修復證據：hosted bundle `/assets/index-ZCtTZJE_.js` 讀得 host=`onkxnkzeixpezetkmocf.supabase.co`，bundle public-key SHA-256 指紋與 onkx 專案現行 anon key 相符。無效 E-mail 探針收到 `400 invalid_credentials`，無效一般帳號探針收到 `401 AUTH_INVALID_CREDENTIALS`，兩者 UI 都正確顯示「帳號或密碼不正確」，Chromium 2/2。
- 永久防呆：每次 staging／production Vite deployment 後，驗證「實際 hosted bundle host＋public-key 指紋＋無效憑證 Auth 探針」；不以 HTTP 200、Vercel Ready 或 Dashboard env 當作資料庫連線完成證據。Preview promote 前須先證明 Preview 與目標環境 env 完全一致，否則必須從 GitHub source 建立目標環境的新 build。
- 邊界：未修改 Supabase schema、資料、RLS、Edge Function 或登入產品碼；本次只修正 Vercel staging env／deployment。Production environment 未觸碰。

## 2026-08-11 10:29 [Owner／Codex] — 上線前真實登入測試列為硬性閘門

- Owner 裁定：之後任何 Staging／Production 上線或 alias／promotion 前都必須先測試；Vercel `READY`、HTTP 200、資產載入成功、bundle host／key 正確或無效帳密能正確失敗，均不得單獨視為可上線證據。
- Staging 必測：使用有效的合成學生帳號走公開 hosted 登入頁，完成真實 Auth、profile bootstrap 並成功進入 `/app`；若變更涉及 Auth、共用 App Shell／bootstrap、教師導覽、權限或教師 UI，另以有效合成教師帳號登入並進入正式教師 landing route。證據記錄 deployment ID、Git SHA、Supabase project ref、測試角色與到達 route，不記錄密碼。
- Production 邊界：Production 不建立合成測試帳號；只允許 promote 已通過上述 Staging 閘門的同一 Git SHA，再執行核准的 Production 唯讀 smoke。任何有效登入證據缺失或失敗一律 fail closed，不得切換公開 alias。
- 已同步：`docs/roadmap-colorplay-next.md` 與 `docs/deployment/vercel.md`。本筆為部署治理規則，未修改產品程式碼、Vercel alias、Supabase 或任何線上資料。
- 下一步：目前 staging 真實有效帳號仍登入失敗，因此現況未通過此閘門；下一步繼續診斷有效 fixture／Auth bootstrap，而不是把先前無效帳密 2/2 當作修復完成。

## 2026-08-11 10:40 [Codex] — 第三章小節複習卡入口 05a 草圖待 owner 核准

- 做了什麼：依 owner 指示補上學習地圖 Board 05 與全頁書本複習 Board 06-v2 之間的中介畫面。新草圖以深夜學院書庫為連續世界場景，不使用頁面級大外框；桌機以兩條書庫路徑呈現 `3-1 色彩三要素與色名的表示` 與 `3-2 色彩體系`，各自配置三個複習卡書本節點；手機重排為縱向旅程，節點文字位於書本右側。單一「繼續複習」主行動導向下一個全頁書本閱讀畫面。
- 資料邊界：草圖中的暱稱、等級、XP、金幣與完成進度只作構圖示意；正式實作須沿用 profile／economy／chapter review hooks。小節與卡片名稱由正式 chapter review data 帶入，不把生成圖內容寫死，不新增測驗、鎖定或進度規則。
- 參考檔：主 checkout `artifacts/design-audit/jrpg-app-shell/batch-01/05a-chapter-review-card-entry.png`，SHA-256 `33b3f493b564bc9375100e923f564352c3ef4d14303258af9c471b151fcbd583`；batch-01 manifest 已標記為 candidate awaiting owner approval。
- 下一步：等待 owner 核准或提出單一視覺修改。核准前不重現正式網頁；核准後只改 `/app/chapters/:chapterId` 的章節入口／複習卡選擇 surface，之後再銜接 Board 06-v2 閱讀頁。
- 邊界：本輪只產生與保存視覺草圖、更新 manifest／handoff；未修改產品程式碼、資料、API、Supabase、Vercel 或 hosted alias。

## 2026-08-11 10:46 [Codex] — 05a-v2 統一學生 HUD，待 owner 核准

- 做了什麼：依 owner 回饋只修改 05a 的桌機／手機 HUD，書庫場景、章節標題、兩個小節、六個書本節點、狀態、進度與主要行動均維持原構圖。桌機 HUD 改為目前正式版的一列式結構：頭像、暱稱／等級上下排列、右側 XP、32-bit 金幣與「學習大廳／Live 課堂／商店／MENU」；手機改為目前正式版的關閉狀態單列 HUD，不再額外顯示第二排主導覽。
- 參考檔：主 checkout `artifacts/design-audit/jrpg-app-shell/batch-01/05a-chapter-review-card-entry-v2.png`，SHA-256 `9fb68069b32a4b742c8bc9b695fa667fd06634c4d6ea7ca3ddc32c9c7bccb9f5`。v1 保留並在 manifest 標為 superseded；v2 標為 candidate awaiting owner approval。
- 資料邊界：生成圖中的身份與數值仍只作構圖示意，正式網頁必須使用真實 profile／economy data；本輪未修改產品程式碼或部署。
- 下一步：等待 owner 核准 05a-v2；核准後才開始重現 `/app/chapters/:chapterId` 網頁。

## 2026-08-11 11:18 [Codex] — 05a-v2 章節複習旅程已實作，待 owner 本機視覺核准

- 做了什麼：依 owner 授權把 `/app/chapters/:chapterId` 的 ready state 改為 05a-v2 連續世界入口，並套回正式學生 HUD。桌機以兩個小節、各三個語意化書本節點呈現；393px 改為書本在左、卡名與狀態在右的縱向路徑。完成／進行中／尚未開始由既有 review completion 資料衍生，不新增鎖定規則；「繼續複習」打開第一張未完成的真實複習卡，既有「完成複習」與「開始挑戰」行為保留，尚未實作 06-v2 全頁書本閱讀。
- 視覺與結構：新增無 UI／無文字的 1672×941 32-bit 像素檔案館背景 `src/assets/chapter/chapter-archive-world.png`；所有標題、進度、節點、狀態與控制仍是 HTML。專屬樣式拆為 426 行 base 與 103 行 responsive／motion 檔，未繼續擴張既有 `globals.css`。Locked／content-preparing／content-readiness-error／error 等既有 typed states 維持原行為。
- 驗證：TDD 先由缺少「第三章複習旅程」語意區域 RED，完成後 RTL 13/13；`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；Chromium 7/7，覆蓋 320／375／1024／1440 狀態回歸與 1280×720／393×852 的六節點、唯一 primary action、零文字裁切、水平 overflow <=1px、手機文字在書本右側、可見控制 >=44×44、HUD 後鍵盤可達重試。
- 審核入口：`http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`；manifest：`artifacts/design-audit/jrpg-chapter-entry/manifest.md`。等待 owner 視覺核准或提出本頁修改；未核准前不進 06-v2。
- 邊界：本輪未新增 API／schema／RPC／query／mutation，未修改權威進度規則，未 commit、未 push、未 deploy。Auth 既有待優化事項與 staging 真實登入 blocker 均未在本輪擴大處理。

## 2026-08-11 11:42 [Codex] — 05a-v2 改為設計圖同構雙背景與 full-bleed 場景

- 做了什麼：依 owner 回饋淘汰上一版泛用庭院方向，使用核准 05a-v2 board 作 style／composition reference，重新產生 desktop 1672×941 與 mobile 941×1672 兩張 environment-only 32-bit 像素背景。桌機為左側月夜森林石門、右側藍色彩繪玻璃書庫與兩排六座空石台；手機為同一世界的縱向構圖，六座空石台沿左側路徑排列、右側保留文字空間。兩圖都不含書本、HUD、文字、狀態、按鈕或大外框，等待 owner 後續提供正式書本素材。
- Full-bleed 修正：新增 `#main-content:has(> .chapter-archive)` 零 padding 契約，並以 05a 專屬 selector 覆蓋舊 `.chapter-dungeon` 900px 寬度。Chromium 首輪實測桌機 root 左緣仍為 190px、手機 computed background 為 `none`，已分別修正舊寬度 specificity 與 mobile background shorthand／specificity；未以文字宣告冒充無外框。
- 驗證：05a Chromium 1280×720／393×852 2/2，確認各自載入 desktop／mobile v2 asset、root 左右貼齊 viewport、四邊 border=0、零水平溢出、零文字裁切、手機文字維持書本右側、可見控制 >=44×44；Prettier、scoped ESLint、`git diff --check` 全綠。manifest：`artifacts/design-audit/jrpg-chapter-entry/manifest.md`。
- 下一步：owner 重新整理本機 05a 預覽確認背景；待提供書本素材後再做六節點的素材替換與 pedestals anchor 校準。未開始 06-v2，未 commit、未 push、未 deploy。

## 2026-08-11 12:16 [Codex] — 05a-v2 接入 batch-03／04 書本基座與可擴充背景

- 做了什麼：依 owner 提供的 batch-03／04 素材，固定選用書本 02／03／04／06／08／10 與基座 01／03／04／05／07／09，形成六組不重複的 semantic review nodes；不是每次 render 真隨機，避免畫面與測試資料跳動。`01-color-wheel-book.png` 未進節點，裁成 512×512 後替換網站 `/colorplay-grimoire-pixel.png` icon。素材從原 1536×1024 各自縮為 512×341 runtime derivatives，十二張節點素材加網站 icon 合計約 2.2MB，batch 原檔未修改。
- 背景與可擴充性：使用 imagegen 對 v2 desktop／mobile 精準編修，移除背景內固定六座石台與 cyan slot 路線，補成連續石板地面，增加少量暖金路燈與藍色水晶燈；v3 只提供 HUD 下 full-bleed 環境，卡片與基座由 CSS Grid／DOM 流動排列，未來同一小節超過三張卡會自動換列。淘汰的三張未引用背景已移至 `/private/tmp/colorplay-05a-rejected-backgrounds/`，仍可恢復。
- 互動與木牌：`ChapterReviewNode` 從 563 行頁面拆出，頁面降至 447 行；current／展開節點及 hover／keyboard focus 時，書本＋基座整組以金藍 drop-shadow 發光。兩個小節標題改為木製告示牌，文字仍來自正式 chapter review data，沒有烤進圖片。
- 驗證：素材 DOM 契約先 RED（0 books，預期 6）後 GREEN；Chapter Detail＋Title RTL 14/14、TypeScript、scoped ESLint、Prettier、`git diff --check` 全綠；Chromium 7/7，包含 320／375／1024／1440 typed-state 回歸及 1280×720／393×852 的 v3 asset、HUD 下緣貼齊、full-bleed、六本不同書、六個不同基座、木牌、selected／hover glow、零文字裁切與觸控區檢查。
- 審核入口：`http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`；manifest：`artifacts/design-audit/jrpg-chapter-entry/manifest.md`。等待 owner 視覺核准；未 commit、未 push、未 deploy，未開始 06-v2。

## 2026-08-11 12:34 [Codex] — 05a-v2 路徑裝飾移除與書台排版校正

- 做了什麼：依 owner 回饋移除舊 `.review-accordion__summary` 滲入的黃色左線與灰色 hover 方框，也移除章節節點間的 cyan／藍色虛線；鍵盤 focus 不再畫矩形框，改由書本＋石台本體的金藍 drop-shadow 維持可見焦點。沒有修改卡片資料、完成行為、route、API 或權威進度規則。
- 排版：桌機石台放大為 240px、書本 190px，書本定位在石台上方；兩個小節的三欄節點左右交錯至少 32px。縮短的是透明 layout 佔位，不縮小素材；Chromium 實測六組書／石台與底部操作列均落在 1280×720 內。393px 維持書本／石台在左、文字在右，修正 selector specificity 後沒有回退成上下排列。
- 驗證：先以 Chromium RED 確認舊 hover 背景為 `rgb(242, 244, 247)`，修正後 1280／393 目標測試 2/2、完整 chapter harness 7/7；Chapter Detail RTL 13/13、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠。機械檢查涵蓋黃色 border=0、虛線 pseudo-element `content:none`、hover 背景透明／outline none、桌機 stagger、platform width >=200px、真實書本／石台／操作列 bottom <=720px、零文字裁切與手機書左文右。
- 審核入口：`http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`；最新 capture 與 SHA 已更新於 `artifacts/design-audit/jrpg-chapter-entry/manifest.md`，截圖未回讀進代理 context。等待 owner 本機核准；未 commit、未 push、未 deploy，未開始 06-v2。

## 2026-08-11 13:21 [Codex] — 05a 改為穩定選卡並接續 06-v2 閱讀

- 做了什麼：依 owner 最新決策移除 05a 全部石頭基座，六本書直接成為可選節點；hover／選取／鍵盤 focus 只對書本本體加金藍光，不再使用會改變幾何的 `translateY`。未使用的縮圖衍生檔移至 `/private/tmp/colorplay-05a-removed-review-platforms/` 保留可恢復副本，batch-04 原始素材未動。
- 桌機排版：章節學習進度與精熟程度固定於 HUD 下方左上角，章節標題移至其右側；小節告示牌、兩排書本與底部操作列重新分配間距。新增成對碰撞檢查後，首輪實測抓到進度／標題、進度／副標、第一排書／副標及跨小節書本共 10 組碰撞；調整後 1280×720 的進度、標題、副標、告示牌、六個節點與操作列碰撞清單為空，所有書本與操作列均留在 viewport 內。
- 互動：`<details>` 展開模式已移除。點書只切換單一 `aria-pressed`／`data-selected` 狀態，不插入文章、不改節點高度；Chromium 比對選取前後六節點的 top／left／width／height 完全一致。按唯一 primary action「進入複習」後，同 route 切換到使用真實卡片內容、媒體與既有完成指令的 06-v2 全頁書本閱讀 region，並提供「返回選卡」；未新增假 route、API、schema 或進度規則。
- 驗證：行為測試先 RED（舊節點缺少 `data-selected`）再 GREEN；Chapter Detail RTL 13/13、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；Chromium chapter harness 7/7，含 1280／393 選取不位移、零石台、遮擋檢查及進入閱讀 surface。05a capture 與 SHA 已更新於 manifest，截圖未回讀進代理 context。
- 審核入口：`http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`。05a 與已連線的 06-v2 初版等待 owner 本機視覺確認；未 commit、未 push、未 deploy。

## 2026-08-11 13:45 [Codex] — 共用學生 HUD 縮高與 05a 響應式置中

- 共用 HUD：`--journey-student-hud-height` 由 92px 收斂為桌機 72px，手機由原 146px 單獨雙列改為 76px 單列；同步縮小 avatar／導航控制與內距，但所有可見連結、按鈕仍 >=44×44px。身份、等級、XP、Token 與 MENU 的 bounding boxes 在 1280／393 皆不重疊，學習地圖既有 generated-board Chromium gate 2/2 通過。
- 05a 響應式修正：移除依賴 `margin-left:340px` 的桌機標頭偏移，章節標題與「選擇複習卡，再進入複習」提示改用內容自身 `fit-content + margin-inline:auto` 對 viewport 置中；Chromium 於 1024／1280／1440 實測中心誤差均 <=1px。章節進度／精熟程度仍固定在 HUD 下方左上角，與置中標題、提示及節點碰撞清單為空。
- 小節與操作：兩個木製小節標示改為書本列左上對齊；底部重複的「複習 1/3」已移除，進度只保留在左上進度區及 06-v2 閱讀內容脈絡。05a「進入複習」、章節挑戰、06-v2 返回／完成控制統一為新版直角像素按鈕語彙，primary 使用與學習地圖相同的藍色漸層、白框、硬位移陰影與右箭頭。
- TDD／驗證：RED 分別確認 HUD 仍為 92px、1024 標題偏心 160px、底部仍存在複習計數；GREEN 後 AppShell＋ChapterDetail RTL 41/41、Student HUD Chromium 2/2、Chapter Chromium 7/7、Learning Map Chromium 2/2、`tsc -b` 通過。最新 HUD／05a capture 與 SHA 已更新於各自 manifest，截圖未回讀進代理 context。
- 審核入口：`http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`。未 commit、未 push、未 deploy。

## 2026-08-11 14:10 [Codex] — 05a 小節目錄與六本分頁完成

- 小節導覽：05a 新增左側「小節目錄」，一次只渲染目前選取小節的複習書本。小節編號與完整標題只在目錄顯示，書本區不再重複第二份木牌；切換小節會回到第一頁並選取該小節第一張未完成卡，避免「進入複習」指向已隱藏的書本。
- 六本上限：每頁固定最多 6 本；超過時顯示 48×48px 上一頁／下一頁與 `第 n / m 頁`。Harness 的 3-1 提供 10 張，驗證第一頁 6 張、第二頁 4 張；3-2 提供 5 張且不顯示多餘分頁。這些數量只屬 dev/test fixture；production 元件仍使用真實 chapter-review data，可支援任意小節與卡片數。
- 排版：桌機目錄固定在書庫左欄，內容列與提示文字增加間隔；手機目錄改為可橫向捲動的小節列，書本仍維持左圖右文。縮短桌機書本佔位並調整兩列間距後，1280×720 的進度、標題、目錄、六本書、分頁與操作列均無遮擋，選取不改變幾何。
- TDD／驗證：先以缺少「第三章小節」navigation 的 RTL 失敗確認 RED，完成後 Chapter Detail RTL 13/13；Chromium 7/7 覆蓋 320／375／1024／1440 狀態、1280／393 構圖、小節切換、6+4 分頁、5 張免分頁、文字裁切、水平溢出、碰撞與 >=44×44px 控制。最新 captures 與 SHA 已更新於 `artifacts/design-audit/jrpg-chapter-entry/manifest.md`，未回讀截圖內容。
- 審核入口：`http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`。未 commit、未 push、未 deploy；等待 owner 本機視覺核准。

## 2026-08-11 14:14 [Owner／Codex] — 05a 書本、分頁與底部操作間距定稿

- 依 owner 即時回饋加大提示文字與書庫、桌機上下兩排書本、手機逐本書之間的間距；分頁控制固定排在「進入複習」上方，兩者保留獨立留白。桌機章節 surface 改為 column layout，主操作列落在 1280×720 內容區最下方安全邊界，不與分頁或書本重疊。
- 最終驗證：Chapter Detail RTL 13/13、Chromium 7/7、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠。1280×720 操作列 bottom <= viewport，393×852 維持無水平溢出、零文字裁切與可見控制 >=44×44px；captures SHA 已再次更新於 manifest。
- 本機入口維持 `http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`；未 commit、未 push、未 deploy，等待 owner 視覺核准。

## 2026-08-11 14:41 [Owner／Codex] — 學生 HUD 完全收合與 05a 控制位置調整

- HUD：桌機 fine-pointer 模式改為完全退到 viewport 外，不再露出 10px HUD；頂端另設透明 8px 感應區，滑鼠移到頂端立即展開。滑鼠離開後延遲收合，鍵盤 focus／MENU 面板互動期間以 `:focus-within` 保持展開，展開層覆蓋場景且不改 scene 幾何，因此 route 內容不跳動。手機／觸控裝置沒有 hover，維持 76px 完整 HUD。`prefers-reduced-motion` 下取消轉場但保留收合功能。
- 05a：依 owner 最新裁定，複習進度與精熟程度回到左上角，距場景頂端 24px；章節標題維持 viewport 置中且同樣保留至少 24px 頂端間隔。「開始挑戰」獨立固定於桌面右下角（右側 24–40px、底部 16–32px），「進入複習」維持底部中央；手機的挑戰控制在底部操作區右對齊，不做浮動遮罩。
- 驗證：HUD Chromium 2/2（完全收合、頂端 hover 展開、focus 保持、手機固定）、Chapter Chromium 7/7、learning-map generated-board harness 2/2。正式登入型 learning-map E2E 另有既有 Auth blocker：兩個案例在 `waitForURL(/app/)` timeout，未進入 HUD／地圖斷言，第三個案例由 Codex 中止以免重複等待；不得將其算成 UI 回歸失敗或綠燈。
- Captures 與 SHA 已更新於 `artifacts/design-audit/jrpg-student-hud/manifest.md`、`artifacts/design-audit/jrpg-chapter-entry/manifest.md`，截圖未回讀進 context。本機入口維持 `http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`；未 commit、未 push、未 deploy。

## 2026-08-11 15:01 [Owner／Codex] — HUD 改為空間感應收合並消除 MENU 震動

- Owner 最終裁定取消 HUD 的 10 秒／2 秒時間限制；桌機改為純空間感應。頂端開啟感應帶由 8px 加大為 24px，HUD 下方新增 28px 離開緩衝帶；游標在頂緣、HUD、MENU 或緩衝帶內維持展開，真正離開互動範圍才完全收合。手機／觸控 HUD 維持 76px 固定顯示。
- MENU 穩定性：正式 App Shell 與 dev harness 共用 `StudentHudAutoHide` 狀態容器；MENU 面板與鍵盤 focus 納入同一互動區，不再讓 hover／收合狀態在點擊時往返。Chromium 機械量測確認 MENU 開啟前後 HUD top 與 `#main-content` top 完全一致，畫面不再上下震動。
- TDD／驗證：新契約先在頂端 y=20 時維持收合（HUD y=-72）而 RED，實作後 Student HUD Chromium 4/4；AppShell＋HudCommandBar RTL 40/40、`tsc -b`、scoped ESLint 通過。截圖 SHA 未變，manifest 已更新為 24px／28px 空間感應契約。
- 邊界：未修改 route、資料、API、Supabase 或 Vercel；未 commit、未 push、未 deploy。本機預覽仍由 `http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress` 檢視。

## 2026-08-11 15:22 [Owner／Codex] — 06-v2 複習卡全頁書本閱讀完成

- 實作：05a 選書後的 `ChapterReviewReader` 已依 owner 核准的 batch-02 `06-review-reading-v2.png` 重做。桌機為近滿版雙頁書與中央書脊；393px 為單頁直向書。背景沿用同一章節連續世界，沒有新增頁面級大外框；章名、小節名、卡片標題、卡片序位、正文與附件皆由正式 view model／repository 帶入，不寫死生成圖示意資料。
- 長內容：正文依實際瀏覽器 column layout 流入邏輯書頁，不以縮字換取塞入；上一頁／下一頁更新 scroll position、`第 n / m 頁` 與 `本頁閱讀進度`。`完成複習` 保持唯一 primary action並沿用既有 trusted completion command；完成、pending、附件載入失敗與 completion error 行為保留。
- RWD／可讀性：1280 實測 `column-count:2` 且 gutter 可見；393 實測 `column-count:1` 且 gutter 隱藏。兩尺寸的章節標題、頁碼與控制零裁切，返回鍵與標題零重疊，書本位於 footer 之前、footer 不超出 reader，文件水平 overflow <=1px，所有可見按鈕 >=44×44px。首輪實測抓到 pixel heading 的 2px 垂直 overflow，已透過行高修正，未用裁切掩蓋。
- 測試／證據：RTL 13/13；Chapter 05a＋06-v2 Chromium 9/9（reader 2/2）；`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠。Reader E2E 拆至新的 161 行 `tests/e2e/chapter-review-reader.harness.spec.ts`，沒有再擴張既有 530 行 05a harness。captures／SHA 與 DEV/TEST fixture 邊界記於 `artifacts/design-audit/jrpg-review-reader/manifest.md`。
- 邊界：未新增 API／RPC／schema／query／mutation，未改完成規則、route 或 Supabase／Vercel。未 commit、未 push、未 deploy；等待 owner 於本機預覽視覺核准。

## 2026-08-11 16:08 [Owner／Codex] — 05a 挑戰入口重排與 06-v2 生成書本／背景接入

- 05a 選卡頁：移除右下角「開始挑戰」，在「小節目錄」下新增「小節挑戰」與「章節總挑戰」。章節總挑戰沿用 repository 提供的真實 chapter template route；目前 production view model 沒有 subtopic template ID，依已核准 F-3 邊界將小節挑戰明確顯示為 disabled「題庫準備中」，未把章節題庫誤接成小節測驗、未用 dead control 冒充功能完成。桌機／手機挑戰入口、六本分頁及底部「進入複習」均通過零碰撞與文字裁切檢查。
- 06-v2 閱讀頁：以核准 batch-02 06-v2 為 art direction 生成並接入四張 runtime asset：透明桌機雙頁書、透明手機單頁書、桌機森林書庫背景、手機直式森林書庫背景。生成圖片不含文字、頁碼、HUD 或控制；教材內容、媒體與控制仍全部由 DOM／正式 view model 呈現。桌機書底顯示左右頁碼，393 直式固定使用單頁書與置中頁碼；返回／上下頁改為「返回複習卡選擇」「閱讀上一頁」「閱讀下一頁」，完成按鈕套用與選卡頁相同的藍色直角像素 primary action。
- TDD／驗證：RTL 先確認舊「開始挑戰」與缺少書內頁碼的 RED，修正後 Chapter Detail 13/13；Chromium Chapter＋Reader 9/9（320／375／1024／1440 typed states、1280×720、393×852），確認兩種背景與兩種書本實際載入、桌機 2 columns／手機 1 column、書內頁碼、正文與控制零裁切、水平 overflow <=1px、可見控制 >=44×44px。`tsc -b`、scoped ESLint、Prettier 通過；captures／素材 SHA 與 prompt 摘要已更新於 `artifacts/design-audit/jrpg-chapter-entry/manifest.md`、`artifacts/design-audit/jrpg-review-reader/manifest.md`。
- 邊界：未新增 API／RPC／schema／query／mutation，未改進度／完成權威規則，未 commit、未 push、未 deploy。本機入口維持 `http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`；小節挑戰啟用仍屬後續 F-3 vertical slice。

## 2026-08-11 16:31 [Owner／Codex] — 06-v2 固定書面座標與換頁零位移驗證

- 響應式根因修正：淘汰會依容器比例拉伸書本、再靠獨立 inset 猜文字位置的做法。桌機雙頁書固定 1683:935、手機單頁書固定 931:1690；書本、正文 viewport、書脊與頁碼共用同一個比例座標系，不同比例多出的空間留在書外，因此 1024×768、1280×720、1440×900、375×812、393×852 都不會把文字推離紙面，也沒有透過縮小正文字級換取通過。
- 換頁審查：新增 page 1 → page 2 前後 12 個關鍵區塊的 bounding-box 比對，涵蓋 header、返回鍵、標題、book stage、書本、正文、頁碼、footer、上一頁、頁數、下一頁及完成按鈕，允許差異上限 0.5 CSS px。首輪確實抓到手機「完成複習」位移 1px；根因是游標由「進入複習」留在相同座標後觸發繼承的 `hover translateY(-1px)`，點下一頁後游標移開才回落。閱讀頁現改為 hover 只換配色、不改 transform，未放寬測試容許值。
- 視覺與控制：直立式大書、書內頁碼、藍銀返回／上下頁按鈕及亮藍完成按鈕維持；disabled 控制為不透明灰藍，文字與按鈕沒有裁切。生成圖只承載書本與環境，教材、附件、進度與操作仍是 DOM／正式 view model。
- 驗證：Chapter Detail RTL 13/13；Reader Chromium 5/5；Chapter 05a＋Reader 整合 Chromium 12/12；`tsc -b`、scoped ESLint、`git diff --check` 通過。Prettier 僅發現 reader manifest 排版並已格式化後重查。證據與最新 capture SHA 記於 `artifacts/design-audit/jrpg-review-reader/manifest.md`。
- 邊界：未新增 API／RPC／schema／query／mutation，未改 route、完成權威規則或 Supabase／Vercel。未 commit、未 push、未 deploy；本機入口維持 `http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`，等待 owner 視覺核准。

## 2026-08-11 16:55 [Owner／Codex] — 06-v2 真正紙面分頁與翻頁動畫

- 分頁機制：依 owner 核准方向移除閱讀內容的 `overflow-x:auto`／`scrollLeft` 換頁。新增 `BookPaginator` module，以單一 interface 接收語意內容區塊與實際紙面量測元素；等待字型／圖片與 ResizeObserver 尺寸穩定後，依固定 PageRect 逐頁填入，長段落只在中文字元或標點邊界拆分。桌機每個 view 渲染兩個獨立紙頁，手機渲染一頁；頁面切換直接替換 active page DOM，內部 scrollLeft 維持 0。
- 響應式與可及性：書本比例、PageRect、書脊與頁碼仍使用同一座標系；縮放時重新分頁而非縮小正文字級，紙面外只留下 letterbox 空間。完整線性教材另外保留為螢幕閱讀器可讀來源，視覺分頁標為 presentation，避免雙重朗讀；正式教材、媒體與完成指令仍由 production view model／repository 提供。
- 動畫：加入 340ms、以書脊為 transform-origin 的羊皮紙翻頁與墨色 settle 動畫；只有覆蓋紙張做 rotateY／opacity，書本、正文 PageRect、footer 與控制列幾何不變。`prefers-reduced-motion: reduce` 時 pseudo sheet 不建立、所有翻頁動畫為 none，內容立即切換。
- TDD／驗證：1280 tracer test 先以找不到兩個 `.chapter-review-reader__book-page` 呈 RED，實作後五個 viewport 的固定頁數、零紙面水平／垂直 overflow、零內部橫向捲動、換頁內容確實改變、頁碼前進及 12 個區塊換頁前後差異 <=0.5px 全綠；另加 reduced-motion 測試。Reader Chromium 6/6、Chapter 05a＋Reader 整合 13/13、Chapter Detail RTL 13/13、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠。
- 證據／邊界：最新 1280／393 captures 與 SHA、分頁 interface 和動畫契約已更新於 `artifacts/design-audit/jrpg-review-reader/manifest.md`，截圖未回讀進 context。未新增 API／RPC／schema／query／mutation，未改 route、完成權威規則或 Supabase／Vercel；未 commit、未 push、未 deploy，等待 owner 於本機預覽視覺核准。

## 2026-08-11 17:01 [Codex] — 06-v2 單輪 scoped review remediation

- Review 邊界：依 AGENTS.md M 級一次 review 上限，只審查本次 `BookPaginator`、Reader、reader CSS 與 E2E；code-review skill 的雙 reviewer 預設與專案單一 reviewer 規則衝突，因此採單一 scoped review，未啟動 sub-agent／第二 reviewer。Security axis 跳過，diff 未觸及信任邊界。
- Finding／修復：唯一 Standards finding 是 `chapter-review-reader.css` 達 602 行，超過單檔 500 行門檻。將 150 行 mobile／reduced-motion 規則拆至 `chapter-review-reader-responsive.css`，主檔降為 451 行，並由 `chapter-detail-page.tsx` 在 base CSS 後匯入。首次錯把 responsive 以檔首 `@import` 載入，Chromium 立即抓到 base cascade 蓋掉手機頁碼與 reduced-motion；未用 `!important` 掩蓋，改為正確入口順序。
- Remediation 驗證：Reader Chromium 6/6 再次全綠，涵蓋 1280×720、1024×768、1440×900、393×852、375×812 與 reduced-motion；`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠。captures SHA 未變。Review 無其餘 Standards／Spec finding；未 commit、未 push、未 deploy。

## 2026-08-11 17:21 [Owner／Codex] — 06-v2 手機全頁單書與三鍵控制

- 手機構圖：依 owner 決策保留桌面雙頁版不變；393／375 手機改為 HUD 下方整面單頁書，book carrier 與 PageRect 共用同一個滿版容器。左上顯示縮小的 `‹ 返回`，但保留完整 `aria-label="返回複習卡選擇"`；右上只保留章節標題與小節標題兩排小字，隱藏舊複習卡位置列。中央 14%–85% 為測量後的文字分頁區，與上方 header／下方控制沒有碰撞。
- 底部控制：移除手機 separate progress bar、footer 頁數及書內頁碼的可見呈現；書頁下緣固定三欄 52px 控制，依序為 `上一頁`、`完成複習 n%`、`下一頁`。中央百分比由目前頁數／總頁數計算並於換頁後更新，完成按鈕仍呼叫既有 trusted completion command；按鈕可及名稱維持「閱讀上一頁／完成複習／閱讀下一頁」。
- TDD／驗證：393 tracer 先以完成按鈕缺少百分比呈 RED；GREEN 後 Reader Chromium 6/6、Chapter 05a＋Reader 整合 13/13、Chapter Detail RTL 13/13、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠。手機機械檢查涵蓋書本四邊貼齊 reader、header／PageRect／footer 分離、三鍵左中右同列、百分比換頁更新、按鈕 >=44×44px、零文字裁切及紙面零 overflow；三個桌面 viewport 回歸全綠。
- Review／邊界：本 task 唯一一次 scoped review 僅檢查 mobile Reader JSX、responsive CSS 與 E2E，無 Standards／Spec finding；四個相關檔案皆低於 500 行。captures／SHA 與手機契約已更新於 `artifacts/design-audit/jrpg-review-reader/manifest.md`，未回讀截圖。未新增 API／RPC／schema／query／mutation，未改 route、內容、完成權威規則或 Supabase／Vercel；未 commit、未 push、未 deploy，等待 owner 本機視覺核准。

## 2026-08-11 17:28 [Owner／Codex] — 06-v2 手機移除場景背景並放大書頁

- 視覺調整：只修改手機 reader；移除 `review-reader-world-mobile.png` 與夜景 gradient，書後改為不含 background image 的羊皮紙底色。單頁書 carrier 仍四邊貼齊 HUD 下方 reader，書圖本身由 100%×100% 放大為 112%×106%，讓頁面邊緣填滿小螢幕；桌面背景與 1683:935 雙頁書完全不變。
- 文字契約：owner 指定的文字區 `inset: 14% 9% 15%` 原值未動，BookPaginator 仍依同一 PageRect 量測分頁。右上章節／小節改深褐色，書名與正文維持墨色，不使用白字；只有三顆藍色操作按鈕保留白字確保對比。
- 驗證：Reader Chromium 6/6，涵蓋三個桌面尺寸、393×852、375×812 與 reduced-motion；機械檢查新增 mobile `background-image:none`、book `background-size:112% 106%` 及章節／小節／書名／正文 computed color 不得為白色。`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠。最新 mobile capture SHA 已更新於 reader manifest；未 commit、未 push、未 deploy。

## 2026-08-11 17:40 [Owner／Codex] — 06-v2 直橫向動態文字安全區

- 版面：手機單頁書的文字 PageRect 改為動態上下安全區；頂端取 `14%` 與「header 起點 + 56px」較大值，底端取 `15%` 與「footer 起點 + 64px」較大值。直式保留原本較寬鬆的紙面留白，橫式則確保文字與返回／章節標題、下排三顆按鈕各至少相隔 10 CSS px，沒有用縮字或裁切掩蓋內容。
- 旋轉：React 分頁判定與 CSS 共用同一 breakpoint；393×852、375×812、852×393、812×375 都使用手機單頁書，1280×720、1024×768、1440×900 維持桌機雙頁，不會在旋轉後出現雙頁 DOM 套用單頁樣式。
- TDD／驗證：新增 852×393 契約先因實際渲染 2 頁而 RED；修正後 Reader Chromium 8/8、Chapter 05a＋Reader 整合 15/15，並確認每頁零水平／垂直 overflow、文字零裁切、控制 >=44×44px、換頁幾何差 <=0.5px。`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；1280／393 capture SHA 未變。未 commit、未 push、未 deploy。

## 2026-08-11 18:06 [Codex] — JRPG UI Git checkpoint 與 Sheet 匯入前 gate

- UI checkpoint：`fb9a0cd` 收錄 05a 選卡、06-v2 閱讀、HUD 空間感應收合、runtime assets、1280／393 實作 captures，以及 batch-01／batch-02／selected 核准參考圖。新增 `docs/jrpg-ui-development-workflow.md`，把多 session 改為「共同 staging baseline＋每個 session 擁有不重疊畫面／檔案＋每 task 一輪 review」，避免多人重複 review 同一 diff 或同時修改全站 CSS。
- 驗證：`pnpm build`、全域 lint、AppShell／HUD／Chapter／Sheet contract 62/62 通過；首頁／地圖／HUD Chromium 8/8、章節選卡＋閱讀 15/15，認證 4 個 viewport 案例亦在較長命令被環境截斷前逐一通過。較長 27-case 命令本身沒有完成結論，未列為綠燈證據。
- Sheet preflight：重新下載 owner 最新 Google Sheet，取得 140 題、8 張複習卡與 1 列過濾佔位。匯入器原先只認「題號」，已以 RED→GREEN contract 補上新版「題庫序號」相容（fetch-sheet 9/9）。結構 gate 仍以 1 項錯誤 BLOCK：`3-2-38` 與 `3-2-39` 題幹完全重複，但選項／答案不同；未自動跳過或猜改。
- 附件 preflight：複習卡「附件」欄只有 `圖3-2`、`圖3-5` 圖號；XLSX 內只有 1 張 JPEG media，另有多組 Office drawing shapes，尚未形成兩張可追蹤的 web asset path＋alt text。現行 `reviewCardMedia` 仍是舊示意圖，不得冒充最新版附件。因兩項資料 blocker 未解除，本輪沒有產生新 seeds、沒有寫入 `onkxnkzeixpezetkmocf`，staging DB 維持原狀。

## 2026-08-11 18:14 [Codex] — PR #5 單輪 review finding remediation

- Git 狀態：feature branch 已推到 GitHub `8beb44c`；直接快轉 `HEAD:staging` 被 branch rules 正確拒絕（需 resolved conversations＋9/9 required checks）。既有 PR #5 已自動更新至同一 SHA，`colorplay-staging-web` Git Preview build 顯示 SUCCESS，但尚未合併至 staging／更新 custom domain。
- 三項 Copilot inline findings 均確認有效並於原 task 唯一 review round 修復：Codex stop hook 改為 repo-relative `bash .codex/hooks/review-gate.sh`；Claude allowlist 移除 `/Users/guanyucheng/...` 本機絕對路徑、保留 `$HOME` 版本；quiz 只有在 `CHAPTER_LOCKED` 建立失敗時才 enable chapter-map query，既有 quiz session 不再多打一支 RPC。
- TDD／驗證：新增 existing-session query-disabled assertion 先收到 hook 無參數而 RED；GREEN 後 Quiz＋chapter-map hook 14/14、scoped ESLint／Prettier 通過，`.codex`／`.claude` 已無 `/Users/guanyucheng` 命中。待推 remediation commit 後回覆並 resolve 3 個 conversation；9 required contexts 的 workflow 缺口仍是 staging merge 的獨立 blocker。

## 2026-08-11 18:23 [Codex] — 最新 Google Sheet 匯入前 gate 仍阻擋

- 依 owner 指示嚴格採用「先檢查、通過後才匯入」。重新執行 `pnpm content:fetch`，最新版仍取得題目 140 列（其中 1 列為佔位而過濾）與複習卡 8 列。
- `pnpm content:verify --gate --xlsx artifacts/content/question-bank.xlsx` 結果為結構錯誤 1、人工覆核提示 0：`3-2-38` 與 `3-2-39` 題幹完全重複。這屬教材內容決策，未自行猜改 Sheet SSOT、未略過 gate。
- 本輪沒有執行 `content:import`、沒有產生或套用新 seed、沒有寫入 staging Supabase `onkxnkzeixpezetkmocf`。下一步需 owner／教師先修正兩題題幹差異，再重抓、重跑 gate；通過後才審查附件映射與執行 staging 匯入／表↔庫 audit。

## 2026-08-11 21:25 [Owner／Codex] — RC／QB／CR 新序號契約通過結構 gate，兩題內容矛盾待裁定

- Owner 裁定題幹相同但選項組不同可視為不同題目，並以 Apps Script 產生 `RC＋章＋小節＋兩位題號`、`QB＋章＋小節＋兩位題號`、`CR＋章＋三位題號`。重新抓取最新版 Sheet，確認三個正式分頁為 `(RC)各單元複習大廳`、`(QB)各單元隨機測驗題庫`、`(CR)章節總複習`；取得 RC 8 張、QB 139 題、CR 64 題，203 個題目序號與 8 個複習卡序號皆無缺漏、重複或格式／章節歸屬錯誤。
- TDD 已讓 fetch／verify／review-card importer 接受新版分頁與序號，重複內容判定改為「題幹＋選項組」；負向題的「故選項 X 正確」不再被誤判。結構 gate 現為 0，人工提示由 7 降為 2，兩項皆為真實答案／解析矛盾：`QB3226` 正解 D 但解析稱 D 錯誤；`QB3311` 正解 C 但解析稱 C 錯誤。
- RC 附件欄仍只有 `圖3-2`／`圖3-5` 圖號，沒有 web asset path 與 alt；已移除舊 `/media/review/color-wheel.svg` 示意映射，避免錯圖再上線，並在 review report 明列未建立媒體列。
- 因內容矛盾尚未獲 owner 裁定，本輪尚未把任何 seed 套用至 staging Supabase `onkxnkzeixpezetkmocf`，也尚未更新 `staging`／custom domain。工作樹保留未提交的管線 WIP；下一步先由 owner 決定兩題應修改正解、解析或題幹，再完成題池 migration／小節挑戰與 Live／章節總挑戰串接、staging audit 與 GitHub-source 部署。

## 2026-08-12 01:12 [Owner／Codex] — RC／QB／CR 路由與圖片私有化完成，待 staging 套用

- 最新 SSOT 再抓為 QB 139、CR 64、RC 8；`QB3238`／`QB3239` 依 owner 裁定保留為題幹相同、選項組不同的兩題。結構 gate 為 0 error／0 warning，stable code disposition 已逐筆記入匯入報告。RC 附件只保留 P301～P305 代號，沒有實體檔與 alt，因此本批刻意產生 0 筆媒體 mapping。
- 路由完成：RC 供複習閱讀、QB 供小節挑戰／Live／mastery、CR 只供章節總挑戰；小節 template 由 `section_id` 鎖定。Live 拒絕 chapter-wide／null section，mastery 只抽 QB 且保留既有 chapter access guard，所有受影響 consumer 與 progress denominator 同步更新。
- 唯一一輪 implementation review 的 findings 已處理：重複 ID 與 QB 小節不一致改為 fail-closed；published seed 不再原地改寫 question/options/card/media，語意差異回 `CONTENT_VERSION_REQUIRED`；移除 mastery 動態 hint 測試遮罩；圖片 bucket 改 private，只允許已發布目前卡片版本的 authenticated SELECT，前端使用 1 小時 signed URL；P301～P305 後補須走 `publish_review_card` 新版本流程。`import-questions.mjs` 超過 500 行的理由已寫於檔頭：同一 validated dataset 必須原子產生 seed／fixtures／report，共用解析與驗證已拆模組。
- 驗證：本機 clean reset 完整套用 5 migrations 與三份 seeds；首次 23 檔 pgTAP 為 473/474，抓到 mastery chapter lock 被覆寫，補回後代表性 7 檔 152/152 全綠；Vitest 8 檔 92/92、`pnpm typecheck`、`pnpm lint`、`pnpm build`、scoped Prettier、`git diff --check` 全綠。remote migration preflight 確認 linked project ref 為 `onkxnkzeixpezetkmocf`，遠端只缺 `20260811000100`～`00500`；本筆記錄時尚未執行 remote write／push／Vercel 更新。

## 2026-08-12 09:08 [Owner／Codex] — RC／QB／CR 已匯入 staging，GitHub-source UI 已更新公開 alias

- Git／資料：`94ea5437f86ca7ec02928609490c88f31af725e5`（`feat(content): route RC QB CR content pools`）已推至 GitHub `phase6/jrpg-generated-board-ui`。已先 dry-run，再把 `20260811000100`～`00500` 套用至 staging Supabase `onkxnkzeixpezetkmocf`，migration history local／remote 對齊；依序執行 questions、review cards、hints seeds。遠端唯讀 audit 為 QB 139、CR 64、RC 8、section templates 20；P301～P305 尚無圖片檔與繁中 alt，因此 media 0，沒有建立假附件資料。
- 圖片安全：`review-card-media` 確認為 private、單檔上限 2 MiB；目前學生端只會為「已發布卡片目前版本」取得短效 signed URL。圖片後補須依 `docs/content/review-card-media-import.md` 上傳檔案並走 `publish_review_card` 建立新版，不得直接 update published card／media。
- Hosted：GitHub source preview `dpl_5js1w39f6g49s4jUmctJo6chNmVD` metadata 明確為 repo `peiyi-liu/colorplay_v1`、ref `phase6/jrpg-generated-board-ui`、SHA `94ea543…`。bundle 掃描只命中 `onkxnkzeixpezetkmocf.supabase.co`，未命中 production ref；合成學生已在 preview 完成 Auth／profile bootstrap 到 `/app`。通過後 promote 為 staging-project production deployment `dpl_F9ZiU8hYvxAXV8PDaicYcRYsN3VP`，`staging.colorplayapp.com` 已指向該 deployment；公開 alias 再次以同一學生登入到 `/app`，首頁／登入／`/app` HTTP 200。
- 已知交付邊界：PR #5 仍因 staging branch rules 要求的 `format`、`lint`、`typecheck`、`unit-coverage`、`production-build`、`local-database`、`chromium-e2e`、`credential-scan`、`owner-approval` contexts 未由現有 workflow 產生而無法正常 merge；本輪沒有 `--admin` bypass、沒有修改 rules／CI。公開 staging 更新採既有 GitHub-source preview promotion，不是本機 source upload；PR／branch protection 缺口仍需 owner 另行授權處理。

## 2026-08-12 10:18 [Owner／Codex] — Vercel staging 更新並確認 P301～P305 已上傳

- Storage 唯讀盤點確認 `onkxnkzeixpezetkmocf` 的 private `review-card-media` 已有 `chapter-3/P301.webp`～`P305.webp` 五張 WebP，單檔 418,786～1,965,636 bytes，皆低於 2 MiB；目前 `review_card_media` 尚未把這五張圖綁定至 RC3101／RC3103／RC3201／RC3202，既有唯一 mapping 仍是舊卡片的 `/media/review/color-wheel.svg`，不得視為本次附件完成。
- Vercel：最新 GitHub-source preview `dpl_At5x6JMv5CXYsbJpg67rBwPQ2PVe` 已確認 repo `peiyi-liu/colorplay_v1`、ref `phase6/jrpg-generated-board-ui`、SHA `a8845ba05bcec25e9a32458127dbf8fe4ab1df7b`，bundle 只命中 staging Supabase `onkxnkzeixpezetkmocf`；有效合成學生登入至 `/app` 通過後，promote 為 `colorplay-staging-web` production deployment `dpl_8jRnXHGyEiQNQoTdJ6dTHg9pfvEN`。`staging.colorplayapp.com` 已指向該 deployment，公開 alias 再次完成學生 Auth／bootstrap 至 `/app`。
- 邊界：本次先完成 owner 指定的 Vercel 更新；Storage 上傳不需要重新 build，且只有物件檔不會自動顯示。下一步仍需為 P301～P305 補繁中 alt，並經 `publish_review_card` 建立新卡片版本與 media mapping；不得直接 update 已發布卡片。

## 2026-08-12 16:02 [Owner／Codex] — 學生返回、Quiz 作廢與章節／HUD 版面調整

- 學生返回：`/app` 維持學習大廳且不顯示返回鍵；其他學生 route 左上顯示具文字的「返回」。同一 AppShell 內已知的上一頁優先 `navigate(-1)`，直接開啟子頁或沒有站內 history 時回 `/app`；replace navigation 不會被誤算成新的站內上一頁。
- Quiz 離開：進行中 session 的站內連結、左上返回與 browser Back 統一先顯示「要離開挑戰嗎？」；繼續作答會保留 route/session，確認離開則先呼叫 server-authoritative `abandon_quiz_session`，成功才離頁，失敗留在原頁。新增 `quiz_session_status.abandoned`、`abandoned_at`、terminal-state trigger 與 idempotent RPC；作廢不發 XP／Token，assignment attempt 若存在也同步 abandoned，再開挑戰會建立新 session。已作廢 session 深連結回 `/app`。對應 AC-UI-011／012／013／014 的 task-level 自動契約已覆蓋；AC-UI-012 Android system Back 依規格仍為 `NOT VERIFIED`，留待 phase gate 人工裝置證據。
- HUD／章節：Level 與 XP progress 改為同一 progression row，1280／393 無重疊或水平 overflow。章節進度框改至右上內容區，新增獨立「學習狀態」標籤，狀態 pill、複習進度與精熟內容全部受框內 containment 測試；目錄、複習卡、小節挑戰、章節總挑戰維持原排列並以 1004px 內容寬置中。「進入複習」與頁底保留至少 24px。`chapter-archive.css` 與 chapter harness 已拆分；本次新增檔、QuizSession production 與主要 chapter CSS／harness 均低於 500 行。既有 `app-shell.test.tsx`／`quiz-session.test.tsx` 原已超過上限，本次只加入必要 mock／assertion，未在此 UI task 擴張範圍重構。
- 驗證：完整本機 pgTAP 51 files／1149 tests 全綠；Supabase generated types 與 `src/types/database.ts` 完全一致。受影響 Vitest 8 files／87 tests、全域 lint、typecheck、production build 全綠；Chapter Chromium 7/7（320／375／393／1024／1280／1440 與鍵盤），HUD Chromium 4/4（1280／393）全綠；`git diff --check` 通過。唯一一輪 scoped self-review 檢查 trust boundary、navigation/history、Dialog、responsive containment 與 500-line 規則，無未解 finding。全域 `pnpm test` 另有既存 tokens／chapter-sequence stale contract 與 sandbox localhost EPERM 測試失敗，未改舊測試假裝全綠。
- 邊界：migration 只套用並驗證於本機 Supabase；未寫 staging／production，未 commit、未 push、未 deploy。工作樹保留本 task 未提交變更，下一步由 owner 先做本機視覺確認，再決定是否 commit／部署。

## 2026-08-12 17:04 [Owner／Codex] — 學生導覽與 Quiz 作廢整合發布至 staging

- 整合來源：`a8845ba05bcec25e9a32458127dbf8fe4ab1df7b` 已確認為本次 feature commit `dd59bd74fd67464d8493a5446072babc78f84f8e` 的祖先；因此公開 staging 同時包含既有 content import 與本次學生返回、Quiz 中途作廢、HUD XP、章節狀態／置中／間距調整。branch `phase6/jrpg-generated-board-ui` 已推至 GitHub。
- Staging DB：dry-run 只列出 `20260812000100_abandon_quiz_session.sql` 與 `20260812000200_abandon_quiz_session_command.sql`，已套用至 `onkxnkzeixpezetkmocf`；遠端 migration history 再查確認兩筆 local／remote 對齊。push 完成後 CLI 的 pg-delta catalog cache 曾出現本機 CA 檔 ENOENT warning，不影響遠端 migration 成功結果。
- Hosted：GitHub-source preview `dpl_7kwu8qy2YZvDK5gxaLK5sQ8rAdCW` 經 Git metadata、bundle staging host／anon-key fingerprint 與合成學生 Auth／bootstrap 至 `/app` 通過後 promote；公開 production deployment 為 `dpl_635Hhfgs89Ebu64tiYJu7BvE5Ra8`，其 Git provenance 仍是 `dd59bd74…`，`staging.colorplayapp.com` 已指向該 deployment。公開 alias 的 `/`、`/login`、`/app` 均為 HTTP 200，bundle 只命中 `onkxnkzeixpezetkmocf`、未命中 production ref，合成學生登入至 `/app` 再次通過。
- 邊界：本次只更新 staging，未部署 `colorplayapp.com` production；Android system Back 的實體裝置證據仍待 phase gate 人工驗證。

## 2026-08-12 17:54 [Owner／Codex] — 固定學生 HUD、統一返回鍵與章節標題同列

- 學生 HUD 改為固定在視窗頂端且永遠顯示，移除 hover／感應區自動收合；HUD 仍在 AppShell 正常版面流中，所有學生 route 的主內容由 HUD 下緣開始，桌機與手機都不會被遮住。返回鍵統一為 HUD 左上角的單一實例；學習大廳不顯示，其他學生頁維持「優先回站內前一頁，沒有站內歷史才回學習大廳」。複習卡閱讀頁移除原本第二顆返回鍵，改由同一 HUD 按鈕執行「返回複習卡選擇」。
- 章節選卡頁桌機將置中的章節標題與右上學習狀態框排在同一列，左右採對稱欄維持標題的 viewport 真置中；窄螢幕在空間不足時安全堆疊。Reader 高度改為填滿 HUD 下方剩餘區域，修正翻頁後標題可能捲到 HUD 下方的裁切問題。
- 驗證：受影響 Vitest 4 files／47 tests、HUD Chromium 4/4、Chapter Chromium 7/7、Reader Chromium 8/8、全域 lint、typecheck、production build 與 `git diff --check` 全綠。唯一一次 scoped self-review 檢查單一返回鍵、override cleanup、HUD／內容幾何、responsive 版面、教師端協作邊界與 500-line 規則，無未解 finding。
- 協作邊界：未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live page 或教師專屬 CSS；共享 `app-shell.tsx`、`globals.css` 只包含本輪既有學生端 HUD 整合。未合併教師 branch、未 push、未 deploy。下個動作是提交本學生端 checkpoint，保留本機 `http://127.0.0.1:4178/dev-harness/chapter-detail.html?scenario=in-progress` 供 owner 檢視。

## 2026-08-12 18:20 [Owner／Codex] — 返回鍵移至 HUD 下方並修正場景背景起點

- 返回鍵從 HUD DOM 移至學生 `#main-content`，所有非學習大廳學生 route 仍共用同一顆按鈕與既有站內返回／fallback 規則；章節與閱讀器頁面只保留這一顆。按鈕左緣與 HUD 角色頭像對齊，位於 HUD 下方並與章節標題列同列；HUD 恢復只包含角色／Level／XP／Token／導覽／MENU。
- 章節與閱讀器桌機背景移除 viewport-fixed attachment，背景定位區改從 HUD 下緣開始；章節容器使用主場景的實際剩餘高度，避免以 token 高度估算造成頂部場景被吃掉。393px 章節標頭採左右對稱三欄，左欄留給返回鍵、中欄維持標題 viewport 置中、右欄保留等寬空白，學習狀態下一列顯示，返回鍵不再蓋住標題。
- TDD／驗證：返回鍵內容層契約、背景 attachment 契約與 393px 不重疊契約均先 RED 後 GREEN。Vitest 4 files／47 tests、Chapter Chromium 7/7、Reader Chromium 8/8、HUD Chromium 4/4、全域 lint、typecheck、production build、Prettier 與 `git diff --check` 全綠。唯一一次 scoped self-review：Standards 0、Spec 0；Security 軸因未觸及 trust boundary 而略過。
- 協作邊界：未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live page、教師分析或教師 CSS；共享 `app-shell.tsx`／`globals.css` 僅收斂本輪學生返回與 HUD 版面。未合併教師 branch、未 push、未 deploy；本機預覽維持於 `http://127.0.0.1:4178/dev-harness/chapter-detail.html?scenario=in-progress`。

## 2026-08-12 18:38 [Owner／Codex] — 手機 HUD 暱稱單行與單頁書左右標頭

- 手機 HUD：移除暱稱 `10ch` 人為寬度上限，暱稱使用頭像與 Token 之間的完整上排空間並固定單行；Level／XP 維持下排。只有真正超出可用寬度時才以 ellipsis 收斂，不再先折成兩行增加 HUD 高度。
- 單頁書：手機／窄橫向閱讀器將統一返回鍵放在書面左上，章節與小節標題在右上，兩者頂緣同列且至少相隔 8px；返回鍵沿用底部閱讀控制的藍色像素按鍵視覺，並維持至少 44px 點擊高度。正文安全區與底部三鍵未移動。
- 裁切稽核：所有學生 `/app/**` route 共用 HUD 後、`#main-content` 前的 AppShell 正常版面流；CSS 搜尋未發現章節／閱讀器以外的學生頁 fixed background 或自訂 `100dvh` 繞過 HUD。學習地圖、章節、閱讀器與 HUD 有實際 viewport 證據；Quiz、商店、成就、排行榜等受共同 shell 契約保護，但本 task 未逐頁建立瀏覽器視覺證據。
- TDD／驗證：手機暱稱單行與單頁書標頭皆先 RED 後 GREEN。Vitest 4 files／47 tests、HUD Chromium 4/4、Reader Chromium 8/8、全域 lint、typecheck、production build、Prettier、`git diff --check` 全綠。唯一一次 scoped self-review：Standards 0、Spec 0；Security 軸不適用。未修改教師端檔案、未合併教師 branch、未 push、未 deploy。

## 2026-08-12 19:04 [Owner／Codex] — 小節／章節 Quiz 小精靈戰鬥畫面

- 小節挑戰與章節總挑戰共用的正式 `QuizSessionPage` 改為 v2 戰鬥構圖：桌機 A／B／C／D 兩欄四宮格、手機單欄，選項不加圖案；保留題號／總題數、Quiz Score、server deadline timer 與單一送出主操作。移除佔空間的精熟 MapStepper，返回鍵仍是 HUD 下方左上角的全站統一按鈕，Quiz 離開確認／server-authoritative abandon 行為不變。
- 以內建 imagegen 產生純環境像素夜森林 `src/assets/quiz/quiz-battle-forest-v1.png`（1672×941，無主角、精靈、文字或 UI），由 CSS 作 battle stage 背景。戰鬥對手改用既有三色 `SpiritAvatar`；stable code 只負責每題確定性換精靈。血條只在 server feedback 對應的 `hit`／correct phase 歸零並播放 700ms 擊敗動畫；incorrect／timeout 維持滿血，未把正誤或獎勵判定搬到前端。
- TDD／驗證：BattleStage 先以 3 個 RED 鎖定滿血精靈、correct 清血與下一題換精靈，再完成 GREEN；Quiz feature 11 files／63 tests、全域 lint、typecheck、production build、Prettier 與 `git diff --check` 全綠。唯一一次 scoped self-review：Standards 0、Spec 0；Security 軸因 diff 未觸及 trust boundary 而略過。內建瀏覽器本 session 無可用實例，故未把 1280／393 目視檢查宣稱為已通過；dev/test-only 本機入口為 `http://127.0.0.1:4181/dev-harness/quiz-session.html?scenario=idle`，另有 `scenario=correct` 可檢查血條歸零。
- 協作邊界：未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live page、教師分析或共享 HUD／AppShell／globals／tokens；未合併教師 branch、未 push、未 deploy。

## 2026-08-12 19:09 [Owner／Codex] — 修復 Quiz 本機預覽空白頁

- Owner 回報 `quiz-session` harness 只有底色。新增掛載回歸測試後穩定重現：共用 `StudentHudHarness` 使用 declarative `MemoryRouter`，但正式 Quiz 的 `QuizExitGuard` 需要 data router 才能呼叫 `useBlocker`，React 因 runtime invariant 中止整棵預覽樹；正式 App 原本已使用 data router，不受此 harness-only 問題影響。
- 修正：將 dev/test-only `StudentHudHarness` 改為 `createMemoryRouter`＋`RouterProvider`，維持既有 HUD／返回鍵／子頁結構。新增 `quiz-session.harness.test.tsx` 鎖定預覽必須掛載章節標題與 4 個正式 radio 選項。修復後 Quiz 12 files／64 tests、HUD／AppShell 2 files／33 tests、全域 lint、typecheck、production build、Prettier 與 `git diff --check` 全綠；本機 idle 預覽已重新開啟。
- 邊界：只修改 dev/test-only 學生 harness 與回歸測試，未改正式 Quiz 行為、教師端、共享產品 AppShell／HUD CSS、API、資料庫、push 或部署。

## 2026-08-12 19:12 [Owner／Codex] — 修復 Quiz 預覽 APP_CONFIG_INVALID

- Owner 截圖確認 Router 修復後改顯示 `APP_CONFIG_INVALID`；堆疊定位至 `useStudentChapterMap`。根因是 disabled query 仍在 hook render 階段立即執行 `parsePublicEnv(import.meta.env)`，使完全離線的 Quiz harness 仍要求 Supabase 設定。
- 以回歸測試先重現 disabled query 仍解析 env 的 RED，再把 client 建立移入 TanStack Query 的 `queryFn`；disabled 時不執行，enabled 時正式行為不變。Quiz repository fixture 與 chapter map 都不再讓 harness 觸碰真實 Supabase。受影響 15 files／99 tests、全域 lint、typecheck、production build、Prettier 與 `git diff --check` 全綠；idle 預覽已重新載入。
- 邊界：未修改權威作答／章節資料、API、DB、教師端、push 或部署。

## 2026-08-12 19:44 [Owner／Codex] — Quiz 無框戰場、章節脈絡與答錯解析

- 小節／章節 Quiz 改為整個 HUD 下方內容區共用生成夜森林背景，移除頁面與戰鬥舞台外框；只保留題目／選項、右上三排答題狀態，以及答錯／逾時解析方框。標頭中央顯示 `第 3 章・章名`，小節以 `3-1・小節標題` 顯示（不顯示「第 1 小節」），章節 template 顯示「章節總挑戰」；已移除「小精靈挑戰」。版面採正常文件流與 `minmax(0, 1fr)`／`overflow-wrap` containment，避免解析度或縮放時靠絕對定位互相覆蓋。
- 小精靈血條獨立放在角色上方，名稱無框放在角色下方；correct 的 server verdict 才會清空血條。答錯／逾時會顯示正確答案、解析與「我理解了，下一題」；另新增 `scenario=incorrect` 本機預覽。既有 Quiz 離開作廢、正誤／分數／XP／Token 後端權威與三拍時序均未改。
- 新增本機 migration `20260812000300_quiz_context_labels.sql`，由 template／chapter／section 權威資料把 challenge kind、章序、小節序與小節標題加入 session payload／安全 view；未從 question stable code 猜 UI。generated database types 已同步。完整 pgTAP 51 files／1151 tests、Quiz Vitest 12 files／67 tests、lint、typecheck、production build、`git diff --check` 全綠；一次 scoped self-review 無未解 finding。內建瀏覽器沒有可連線實例，未宣稱 1280／393 目視通過；本機已開啟 idle 與 incorrect 預覽供 owner 查看。
- 協作邊界：未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live page、教師分析或共享 HUD／AppShell／globals／tokens；未合併教師 branch、未 push、未 deploy。migration 只套用本機 Supabase，未寫 staging／production。

## 2026-08-12 20:05 [Owner／Codex] — 恢復 Quiz 生成背景

- 修復 production CSS cascade：共用 `.scene-night` 在打包後以相同 specificity、較晚順序把 Quiz 生成背景覆蓋成純深色；Quiz 專屬 root selector 改為 `.scene-night.quiz-runner--battle-v2`，使 `quiz-battle-forest-v1.png` 與本頁 feedback 無框／方框規則穩定高於共用夜景規則。新增 CSS 契約測試鎖定高權重 selector 與生成圖片引用。
- 驗證：受影響 Vitest 2 files／16 tests、lint、typecheck、production build、`git diff --check` 全綠；production bundle 已確認輸出高權重 selector 與 hashed forest asset。舊 4181 Vite 程序失去回應後已停止並重啟，本機 idle 預覽已重新開啟。
- 邊界：未修改教師端、共享 HUD／AppShell／globals／tokens、API 或資料庫；未 push、未 deploy。

## 2026-08-12 20:09 [Owner／Codex] — Quiz 題目作答區固定於內容底部

- 將補救提示、題目／選項、送出錯誤與答題解析收進 `quiz-runner__question-dock`；Quiz root 使用 `auto / minmax(180px, 1fr) / auto` 三列，讓中央戰鬥區吸收剩餘高度、作答方格保持在 HUD 下方內容視窗的正下方。刻意不使用 fixed／absolute；高度不足、縮放或解析展開時由容器自然增高並捲動，避免覆蓋小精靈與文字。
- TDD：先新增 DOM dock 與 CSS growing-row 契約 RED，再完成 GREEN。Quiz 13 files／69 tests、lint、typecheck、production build、`git diff --check` 全綠；`quiz-session.tsx` 498 行，仍低於 500 行上限。本機 idle 預覽已由 HMR 更新並重新開啟。
- 邊界：未修改教師端、共享 HUD／AppShell／globals／tokens、API 或資料庫；未 push、未 deploy。

## 2026-08-12 20:43 [Owner／Codex] — 學生 Live 加入傳送門畫面

- `/app/live/join` 改為 HUD 下方滿版傳送門場景：內建 imagegen 分別產生無人物／無文字／無 UI 的桌機與手機背景，桌機表單在左、portal 在右，手機 portal 在上、表單在下。移除 `ColorPlay Live`、「加入課堂挑戰」與符文，只保留 owner 指定標題、說明、六碼、「加入課堂」及實際錯誤。
- 六格外觀由單一 semantic input 驅動，保留貼上、Backspace、前導 0、numeric keyboard 與 screen-reader label；原有 Zod、`useJoinLive`、request ID、safe error mapping 與成功後等待室導航未改。只有實際驗證／repository 錯誤時才渲染 alert。
- 驗證：Live Vitest 16 files／100 tests、lint、typecheck、production build、Prettier，`git diff --check` 全綠；Chromium harness 1280／393／320 與 safe-error 為 4／4，無水平 overflow、背景起點對齊 HUD 下緣。唯一一輪 scoped review 為 Standards 0／Spec 0，Security 軸不適用。AC-UI-009／015 有 task-level 自動驗證；AC-UI-010 實體手機鍵盤證據仍依規格留待 phase gate 人工提供。
- 邊界：未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live、教師 CSS，也未修改共享 HUD／AppShell／globals／tokens、API 或資料庫；未合併教師 branch、未 push、未 deploy。本機預覽：`http://127.0.0.1:4181/dev-harness/live-join.html`。

## 2026-08-12 20:50 [Owner／Codex] — 修正 Live 手機背景門位置

- 根因為手機背景使用 `cover`，場景高度被表單撐長時圖片會重新縮放，造成傳送門往下漂移。改為依 viewport 寬度 `100% auto` 縮放並鎖定 `center top`，標題／表單的上邊距也改用 viewport 寬度推導，確保門穩定在畫面上方、內容從門下方開始。
- 驗證：CSS contract 2／2、Chromium 1280／393／320 與 safe-error 4／4、lint、typecheck、production build 全綠。未啟動第二輪 review，遵守每 task 最多一輪 review 規則。

## 2026-08-12 22:02 [Owner／Codex] — 學生 Live 等待室、四選一與等待揭曉

- `/app/live/:sessionId` 學生端串接既有權威 Live state：lobby 顯示「等待主持人開始…」；教師開始後，`screen_only` 顯示投影機 icon 與「請看投影幕作答」，不把題目、選項文字或正解帶入學生畫面。頂部狀態列顯示課堂挑戰 icon、題數、Realtime 連線文字狀態、server-time 倒數圈與在線人數。
- 四個選項桌機為 2×2、手機為單欄；點擊即沿用 `submit_live_answer` RPC 送出，以本地選取狀態和 mutation pending 立即鎖住全部選項。成功後原位置改顯示「答案已送出，等待揭曉…」，沒有第二個送出按鈕；正式答案、計分、排名與 phase transition 仍由後端決定。
- 使用內建 imagegen 產生無人物／無文字／無 UI 的像素夜間城堡庭院桌機與手機背景；手機依 viewport 寬度 `100% auto` 鎖定 top，城門維持上方。Live 專屬 CSS 從 HUD 下緣正常排版，不使用 fixed；統一返回鍵已預留空間，不蓋住課堂標題。
- 驗證：受影響 Vitest 4 files／27 tests、lint、typecheck、`git diff --check` 全綠；Chromium harness 互動與 393／320 無水平 overflow、等待室狀態共 4／4。1280／393 目視確認背景載入、手機城門置頂及四個選項可見。唯一一輪 read-only review：APPROVE，無 Critical／High／Medium finding。
- 邊界：未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live page、教師 CSS或共享 HUD／AppShell／globals／tokens；未合併教師 branch、未 push、未 deploy。本機預覽：`http://127.0.0.1:4182/dev-harness/live-session.html?scenario=question`（`scenario=lobby` 可看等待室）。

## 2026-08-12 22:34 [Owner／Codex] — 修正 Live 返回鍵與狀態列交疊

- 393px 瀏覽器幾何回歸先穩定重現：全站返回鍵以 absolute `top: 22px` 錨在 `#main-content`，實際矩形與 Live 狀態列相交；先前替標題加左邊距只能避開文字，沒有移除交疊。
- 依 owner 補充改為同排：全站同一顆返回鍵仍是 Live root 的 sibling，Live 狀態列新增專用左側 grid slot，課堂標題、題數、連線、在線人數與倒數各自占欄；返回鍵與狀態列共享垂直區域，但不覆蓋任何狀態內容。桌機一排，手機狀態內容兩排並保留左側返回欄。
- 驗證：受影響 Vitest 2 files／20 tests、Chromium 5／5（含 393px 返回鍵與 Live 狀態列同排且不覆蓋任何 child、393／320 無水平 overflow）、lint、typecheck、`git diff --check` 全綠；1280／393 目視確認同排版面。依 S 級 bug fix 規則未新增第二輪 review。
- 邊界：只修改 Live feature CSS、Live harness E2E 與 handoff；未修改共享返回元件、HUD／AppShell／globals／tokens、教師端、API 或資料庫。

## 2026-08-12 22:38 [Owner／Codex] — Live 手機背景取景與四宮格

- 手機 Live 不再使用直式專用背景，改用與桌面相同的 `live-student-arena-desktop-v1.png`；CSS 使用 `cover` 保持原始長寬比放大裁切，`center` 同時鎖定水平與垂直中央取景。
- 393px／320px 的 A／B／C／D 選項維持與桌面一致的 2×2 四宮格，不再降為單欄；保留至少 52px 高度、8px 間距與既有立即送出／鎖定行為。
- TDD／驗證：CSS 背景契約與 Chromium 四宮格實際矩形先 RED 後 GREEN；393／320 均無水平 overflow，計算樣式確認桌面背景、`cover`、中央定位。1280／393／320 目視確認中央城門取景與四選項完整可見；最終 lint、typecheck、受影響 Vitest／Chromium 結果記於同一 checkpoint。
- 邊界：只修改 Live feature CSS、CSS contract、Live harness E2E 與 handoff；未修改作答權威、Question Display payload、教師端或共享 HUD／AppShell／globals／tokens。

## 2026-08-12 22:44 [Owner／Codex] — 放大 Live 手機四宮格與上移背景

- 手機 2×2 選項區改為占用 Live 場景內容的下方約 60%，從整個 viewport 中段附近開始延伸至底部；每列等分可用高度，393px 與 320px 的單顆按鈕皆至少 100px 高。A／B／C／D 與四色符號的實際字級皆至少 30px，投影幕提示位於四宮格正上方。
- 桌面背景圖在手機仍保持原比例，改為圖片層高度 `120%` 並以 `center 72%` 取景，使場景實際向上偏移；漸層遮罩仍獨立 `cover`，不拉伸或扭曲圖片。
- E2E 幾何契約先 RED（舊版 393px 選項從 y=700、320px 從 y=416 才開始），修正後鎖定選項區起點不晚於 viewport 58%、底緣至少到 93%、單鍵高度至少 100px，並維持 2×2 與零水平 overflow。
- 驗證與邊界：393／320 Chromium 目視確認四鍵完整可見、字號放大與背景上移；最終 lint、typecheck、受影響 Vitest／Chromium 結果記於同一 checkpoint。只修改 Live feature CSS、CSS contract、harness E2E 與 handoff，未觸及教師端、權威作答或共享整合檔。

## 2026-08-12 23:18 [Owner／Codex] — 商店夜間市集背景、HUD 金幣與頭像外框連動

- 保留既有裝備商店頁首、角色／外框分頁、商品卡、購買確認與 server-authoritative snapshot 流程；以內建 imagegen 生成無人物／無文字／無 UI 的夜間 JRPG 市集 `src/assets/shop/shop-market-night-v1.png`，只替換 HUD 下方的場景背景。桌機與 393／320px 實測均無水平 overflow。
- 商店餘額、商品價格、購買與不足差額都改用 HUD 相同的 `hud-coin-pixel--32bit` 金幣；螢幕閱讀器名稱仍保留 Token 語意。唯一一次 review 發現不足 Toast 還有可見 Token 金額，已改為不帶金額的金幣不足訊息。
- 修復外框裝備後 HUD 不更新：根因是商店 mutation 已正確更新 `['inventory', 'frames']` 權威快取，但學生 AppShell 沒有訂閱；現在 HUD 直接讀同一 frame inventory snapshot，依 server 回傳的 equipped item 套用漸層外框，沒有把購買或餘額判定搬到前端。
- 驗證：受影響 Vitest 4 files／45 tests、Chromium harness 1280／393／320 共 3／3、lint、typecheck、production build、Prettier 與 `git diff --check` 全綠。未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live、教師 CSS、globals 或 tokens，未合併教師 branch、未 push、未 deploy。本機入口：`http://127.0.0.1:4183/dev-harness/shop.html`。

## 2026-08-12 23:25 [Owner／Codex] — 商店頁首與分類框微調

- 移除「你的角色收藏」，將「裝備商店」放大至桌機 3rem／手機 2rem；角色／外框改由單一像素直角長方形底座包住，不再使用白色橢圓底。
- 依 owner 釐清，只移除角色名稱與操作按鈕中間的獨立金幣價格列；購買按鈕內價格、頁首餘額、購買確認與外框價格維持不變。
- 驗證：Shop Vitest 2 files／13 tests、Chromium 1280／393／320 共 3／3、lint、typecheck、Prettier 與 `git diff --check` 全綠；本機 1280px 目視確認。S 級純 UI 微調不另啟 review；未觸及教師端、API、DB 或共享 globals／tokens。

## 2026-08-12 23:28 [Owner／Codex] — 商店分類框主題底色

- 角色／外框分類框由白底改為夜空深藍底、金色邊框與像素硬陰影；未選取項目使用透明深底與亮字，選取項目保留金色高亮，與夜間市集背景一致。
- 驗證：Shop Vitest 2 files／13 tests、Chromium 1280／393／320 共 3／3、lint、typecheck、Prettier 與 `git diff --check` 全綠；本機 1280px 目視確認。S 級 CSS 微調不另啟 review。

## 2026-08-12 23:35 [Owner／Codex] — 商店頁首與商品卡重新配色

- 依 owner 釐清，重新設計的是「裝備商店」頁首大框與每張角色／外框商品卡：移除奶黃色容器底，改用像素雙層框、硬陰影、主題化餘額框、深色展示槽與按鈕；購買主操作仍保留金色強調。
- 後續依回饋將框內高彩度深藍降低彩度並提高明度：頁首、分類列及商品卡改為較亮灰藍，展示槽與次要按鈕維持深一階灰藍，保留層次與白字對比。
- 驗證：Shop Vitest 2 files／14 tests、Chromium 1280／393／320 共 3／3、lint、typecheck、Prettier 與 `git diff --check` 全綠；本機 1280px 目視確認。S 級 CSS 配色調整不另啟 review；未觸及教師端、API、DB、globals 或 tokens。

## 2026-08-12 23:38 [Owner／Codex] — 商店深夜藍夜市招牌版

- 依 owner 最終選擇換回灰藍前的深夜藍配色，但更換容器設計：頁首由白色雙框改為單層金框、內側金線與頂部節奏飾帶；商品卡改為左側金色飾條、金框展示槽與硬陰影，維持夜間市集木牌感。
- 卡片內所有 primary purchase action 改為零圓角方框；角色／外框分類、餘額框、選用／不足／已裝備狀態亦維持既有像素直角語彙。
- 驗證：Shop Vitest 2 files／14 tests、Chromium 1280／393／320 共 3／3、lint、typecheck、Prettier 與 `git diff --check` 全綠；本機 1280px 目視確認。S 級 CSS 設計調整不另啟 review。

## 2026-08-12 23:57 [Owner／Codex] — 錯題檔案館、排行榜公會廳與成就聖殿背景

- 使用內建 imagegen 分別生成三張無人物／無文字／無 UI 的 32-bit JRPG 場景：魔法錯題檔案館 `src/assets/mistakes/mistakes-archive-night-v1.png`、排行榜公會排名廳 `src/assets/leaderboard/leaderboard-guild-hall-v1.png`、成就徽章聖殿 `src/assets/achievements/achievements-sanctuary-v1.png`。三頁都從固定 HUD 下緣開始顯示背景，手機維持原比例中央取景。
- 我的錯題改為深夜藍、金框、飾帶與左側金色識別條的像素檔案卡；排行榜改為同語彙的公會頁首與深色名次列，保留金／銀／銅與「這是你」的非純色狀態訊號。成就卡本身未重設，只替換背景與必要的頁首文字對比；移除成就頁舊的第二顆返回箭頭，只保留全站統一返回鍵。排行資料、XP 與補救流程邏輯均未修改。
- 驗證：受影響 Vitest 7 files／23 tests、lint、typecheck、production build、Prettier 與 `git diff --check` 全綠；Chromium 1280／393 目視確認三頁，排行榜另驗 320px，三頁 393px 與排行榜 320px 的 `scrollWidth` 均等於 viewport，無水平 overflow。唯一一輪 scoped self-review：Standards 0、Spec 0；Security 軸因未觸及 trust boundary 而略過。
- 邊界：新增 dev/test-only 三頁預覽 harness；未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live、教師 CSS、共享 HUD／AppShell／globals／tokens、API 或資料庫；未合併教師 branch、未 push、未 deploy。本機入口：`http://127.0.0.1:4183/dev-harness/student-collection.html?surface=mistakes`（另可切換 `leaderboard`／`achievements`）。

## 2026-08-13 00:01 [Owner／Codex] — 待補救錯題剪影改為紅色

- 我的錯題頁中，尚未解決題目的原黑色魔物／石頭剪影改為 `--coral-700` 紅色；已解決題目仍使用原本全彩圖示。使用 sprite mask 保留既有輪廓與尺寸，未修改補救狀態或資料邏輯。
- 驗證：Mistakes Vitest 2 files／8 tests、Prettier 與 `git diff --check` 全綠；393px Chromium 目視確認紅色待補救圖示與藍色已解決圖示同時正確顯示。S 級單頁 CSS 調整不另啟 review。

## 2026-08-13 00:03 [Owner／Codex] — 待補救圖示改為紅色小精靈並精簡說明

- 依 owner 釐清，待補救題目不是紅色石頭／剪影，而是使用既有 `SpiritAvatar` 的完整紅色小精靈 sprite；已解決題目仍保留原本藍色圖示。頁首說明精簡為「補救練習答對即可解決錯題並回復精熟。」
- 驗證：Mistakes Vitest 2 files／8 tests、typecheck、Prettier 與 `git diff --check` 全綠；393px Chromium 目視確認紅色小精靈、精簡文案與已解決藍色圖示均正確。S 級單頁文案／圖示調整不另啟 review。

## 2026-08-13 00:15 [Owner／Codex] — 成就外框等高、排行榜放大頭像與文案收斂

- 成就頁最外層由圓角淡彩卡改為直角金框、深夜藍底與頂部像素飾帶；成就格固定 16:9 並以等高 grid 排列。統一返回鍵旁的頁首加入安全內距，桌機與手機不再壓住標題。
- 排行榜移除「班級 XP」及「Top 10 與你的名次都由伺服器依正式 XP 紀錄計算。」；「排行榜」放大。表頭與內容統一為名次靠左、暱稱靠左、XP 靠右。角色圖片放大並裁切掉原素材透明留白，填滿 64px（手機 60px）彩色頭像格；暱稱欄頭像格貼齊列邊框，文字欄仍保留必要內距。錯題頁另移除頁首「補救學習」標籤。
- 驗證：受影響 Vitest 6 files／25 tests、lint、typecheck、Prettier 與 `git diff --check` 全綠；Chromium 1280／393／320 目視確認。成就卡實測桌機四張皆 205px、手機四張皆 190px；成就／排行榜／錯題在 393px，以及排行榜在 320px，均無水平 overflow。屬既有頁面 S 級視覺微調，不另啟第二輪 review。

## 2026-08-13 00:28 [Owner／Codex] — 排行榜雙向置中與成就三欄置中排列

- 排行榜名次／暱稱／XP 的表頭與內容全部改為水平及垂直置中；角色頭像與暱稱作為同組置中，既有放大、裁切透明留白及貼齊彩色頭像框規則維持不變。
- 成就徽章改為 flex wrap：桌機每排三張，末排不足三張時整排置中；手機 767px 以下一張一排；平板維持兩張一排。卡片仍為一致 16:9、整張可伸展，避免文字較長時互相遮擋。
- 驗證：受影響 Vitest 6 files／23 tests、lint、typecheck、Prettier 與 `git diff --check` 全綠。Chromium 實測桌機成就前三張 x=69／458／846、第四張置中 x=458，四張皆 365×205；393px 四張皆 x=29、338×190 且單欄。排行榜 393／320px 計算樣式皆為 `text-align:center`、`vertical-align:middle`；全部 viewport 無水平 overflow。S 級版面微調不另啟第二輪 review。

## 2026-08-13 00:38 [Owner／Codex] — 三頁標題對齊與手機返回鍵避讓

- 我的錯題、排行榜、個人成就與徽章三頁統一標題字級與垂直位置；393px／320px 的標題皆位於 y=158、高 35px，返回鍵底緣 y=139，保留 19px 間距，三頁均無水平 overflow。桌機標題亦維持同一高度與尺寸。
- 排行榜「這是你」改為疊在頭像右下角，不再占用暱稱欄寬；暱稱維持單行並在極窄畫面安全省略。成就卡末排改從每排第一格開始排列，桌機仍為三張一排、手機一張一排。
- 驗證：受影響 Vitest 7 files／31 tests、lint、typecheck、Prettier、`git diff --check` 全綠；Chromium 1280／393／320 幾何與目視確認完成。依既有頁面 S 級視覺修正，不另啟第二輪 review；未修改教師端、API、DB 或共享 HUD／AppShell／globals／tokens。

## 2026-08-13 00:45 [Owner／Codex] — 排行榜頭像與暱稱逐列對齊

- 排行榜暱稱欄改為固定頭像軌與文字軌，整組仍置於欄位中央；所有列的頭像位置一致，暱稱也從同一水平起點開始，「這是你」維持疊在頭像內而不影響文字位置。
- 驗證：Leaderboard Vitest 3 files／14 tests、lint、typecheck、Prettier、`git diff --check` 全綠；Chromium 1280／393／320 實測所有列的頭像與暱稱 X 座標各自完全一致，且無水平 overflow。S 級 CSS 版面修正不另啟第二輪 review。

## 2026-08-13 01:35 [Owner／Codex] — 學生端最大標題像素化與推送前整合檢查

- 登入後學生 AppShell 內每頁主要 `h1` 統一使用既有自託管繁中像素字 `Cubic 11`；selector 僅限 `data-shell-role='student'`，公共頁與教師端不受影響。整合檢查另發現 320px 成就標題會被 grid intrinsic size 裁切，已加入零寬 grid track 約束與窄螢幕安全內距，維持我的錯題／排行榜／成就徽章三頁相同的 28px 字級與 y=158 標題高度。
- 瀏覽器驗證：學習地圖、章節、Quiz、Live 加入、Live 作答、商店、錯題、排行榜、成就共 9 個頁面 × 1280／393／320，27／27 均載入 `Cubic 11`、零水平 overflow、無 page／console error；三個收藏頁在 320px 的標題均為 28px、top=158、bottom=193。
- 自動驗證：受影響 Vitest 3 files／39 tests、lint、typecheck、production build、Prettier、`git diff --check` 全綠。主要學生互動 Chromium E2E 25／26 通過；唯一失敗是既有 `chapter-detail-page.harness.spec.ts` 仍要求 393px 閱讀頁返回鍵與 HUD 頭像同 X 座標，但 owner 已核准返回鍵在書面與標題並排（實際 x=31.4、舊斷言 x=10），屬待更新測試契約，未回改產品設計。
- 部署基線：前一乾淨 checkpoint `7a57614536a1689bef5ae82b02b3c82caffda0f6` 已由 GitHub-source deployment `dpl_FtekvBrwwhH8U9PkVDcVUsXanshu` promote 為 Staging `dpl_EVE5qHit72zBTs5Sc5AFD82RYiqz`；bundle 只含 `onkxnkzeixpezetkmocf.supabase.co`，公開 `staging.colorplayapp.com` 的有效學生登入／bootstrap 至 `/app` 已通過。此標題增量將於乾淨 commit 後重新走相同 SHA／bundle／登入 gate。
- 邊界：未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live、教師 CSS，未合併教師 branch；visual artifacts 保留在工作樹但不納入 commit。

## 2026-08-13 01:49 [Owner／Codex] — Quiz 完成頁與收藏頁標題收尾

- 小節挑戰與章節總挑戰共用正式 `QuizResultPage`，依 server `challengeKind` 分別顯示「小節挑戰完成」／「章節總挑戰完成」，並顯示第 3 章與 3-1 小節範圍；成績、逐題答案、XP、Token 與再玩流程仍使用既有權威 session。用內建 imagegen 依 Quiz 夜森林風格生成無人物／無文字／無 UI 的黎明勝利場景 `src/assets/quiz/quiz-victory-shrine-v1.png`；完成頁背景改用該場景，摘要維持深色 JRPG 框，題目／答案／解析改為高對比亮羊皮紙框與 Noto 長文。
- 我的錯題、排行榜、個人成就與徽章三頁的主標題統一為桌機 32px／手機 28px、Cubic 11、固定 40px 高並垂直置中；1280／393／320 實測三頁的 font、font-size、top、bottom、height 完全相同。成就卡名稱補上 Cubic 11；分頁頁數改為亮色 `rgb(244, 241, 228)`，實測桌機 `第 1 / 2 頁`、手機 `第 1 / 3 頁` 均清楚可見且零水平 overflow。
- 瀏覽器驗證：小節／章節完成頁 × 1280／393／320 共 6／6 通過，生成背景載入、逐題框為亮底深字、標題為 Cubic 11、零水平 overflow、無 page／console error；320px 兩種完成標題皆為 28px 單行，top=297.5、height=35。收藏三頁共 9／9 標題幾何一致；成就分頁另 3／3 通過。
- 自動驗證：受影響 Vitest 10 files／80 tests、追加 Quiz label／session／result 4 files／33 tests、lint、typecheck、production build、Prettier、`git diff --check` 全綠。一次 scoped self-review：Standards 初見 Quiz 標題清理 regex 重複，已抽成 `quiz-labels.ts` 並補 5 cases；修正後 Standards 0、Spec 0；Security 軸略過（未觸及信任邊界）。
- 邊界：未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live、教師 CSS，未變更 API／DB／獎勵判定，未合併教師 branch。imagegen 最終 prompt 要點為 16:9 32-bit JRPG 黎明森林、中央遠景勝利石門、中央／下方低對比留白、無人物／文字／HUD／UI。

## 2026-08-13 02:40 [Owner／Codex] — 學生場景首載效能與手機版面收尾

- 18 張學生／公共流程大型場景與書頁背景改由 WebP 載入，原始尺寸不變；實際被引用的圖片總量由 34,133,334 bytes 降為 3,550,716 bytes（-89.6%），production build 單張場景輸出約 44–333 KiB。原 PNG 留作原始素材，但不再進 production bundle；移除返回鍵 `backdrop-filter` 並限制學生 scene overscroll，降低大面積捲動重繪。
- 手機學習大廳鎖定於 viewport；複習卡完成狀態改為高對比藍色像素按鈕樣式，翻頁動畫改為單頁寬。商店、錯題、排行榜返回鍵與標題框在 393／650／700px 都不重疊；錯題頁碼置於兩箭頭正中並與「再挑戰」保留 16px，補救 Quiz 的長模式說明移除。
- 主畫面「色彩王國的冒險旅程」與「開始冒險」改用既有繁中像素字。唯一 review 初抓到 650–700px 避讓缺口、缺少 browser asset proof 與翻頁上限，均已修正；`globals.css` 既有超過 500 行技術債未在本 task 擴張為教師行為，後續應獨立拆分。
- 驗證：lint、typecheck、production build、15 files／80 Vitest、14 個 Chromium 手機／平板／桌面回歸、既有 Chapter Reader 8／8 與 Shop 3／3 全綠；兩 viewport × 九個場景的瀏覽器資源實測均無超過 350 KiB 的 raster。未修改教師專屬頁、API／DB／權威 XP／Token，未合併教師 branch、未 push、未 deploy；既有 visual artifacts 保留在工作樹且不納入 commit。

## 2026-08-13 03:35 [Owner／Codex] — 複習卡附件壓縮、版本化發布與 staging 部署

- staging private `review-card-media` 的 P301～P305 以不裁切、原尺寸 WebP 重新壓縮並改用 `P301-v2.webp`～`P305-v2.webp`；單檔由 418,786～1,965,636 bytes 降為 47,286～173,408 bytes。原檔未覆蓋或刪除。這五張仍是教材掃描過渡版，不宣稱已完成 AI 統一風格再製。
- 依正式 mapping 將 P301→RC3101、P302→RC3103、P303／P304→RC3201、P305→RC3202，補上繁中 alt，透過 `publish_review_card` 將四張卡由 version 1 升至 version 2；`requires_recompletion` 保持原值。閱讀器既有 block 順序為標題／全部文字／media，hosted RC3101 在 393×852 與 1280×900 均驗證圖片位於文字後方並成功載入。
- 學生端 commit `776641554725453e9a3247d2b556b4e44e310c9d` 已推至 `origin/phase6/jrpg-generated-board-ui`；GitHub-source Preview `dpl_Fa2VuTWXFqFhZUWGg2t2ZmaL6uXC` 通過 bundle staging project-ref、真實學生登入／bootstrap、複習附件順序與載入 gate後，promote 為 Staging deployment `dpl_2mYHsqXARmLjxJmMT5t6CkNUBbxo`，alias `staging.colorplayapp.com`。公開 alias bundle 只含 `onkxnkzeixpezetkmocf`，近一小時無 Vercel runtime error。
- 自動驗證：lint、typecheck、production build、相關 Vitest 10 files／45 tests、`git diff --check` 全綠。未修改或合併 `ui/jrpg-teacher-ui`，既有 visual artifact dirty paths 仍保留且未納入部署 commit。Vercel CLI 58.9.4 可完成本次部署，但目前最新為 58.9.5，建議另開維護動作升級，不與產品 release 混做。

## 2026-08-14 09:30 [Owner／Codex] — 教師登入、HUD 外框、學生 MENU 與登出確認

- 教師端帳號登入移除班級序號文案、欄位、前端 payload 與 `auth-login` 的班級 ownership 檢查；後端仍以帳號、密碼及 server-owned profile role 驗證，錯誤維持泛用憑證回應。學生註冊使用的班級序號流程未變更。
- 「登入／登入中…」與 MENU 登出按鈕改用既有繁中像素字；所有手動登出入口先顯示「確認登出」dialog，預設焦點在取消，確認後才呼叫 local-scope sign-out。30 分鐘閒置自動登出維持既有規則。
- 學生 MENU 移除已停用的「課後任務實戰」入口；路由與舊頁面未擴張修改。商店已裝備外框改為 HUD 頭像外層的實體 4px 漸層環，內層 portrait 裁切角色圖，讓 server 回傳的 equipped frame 在 HUD 可見。
- 驗證：相關 Vitest 6 files／112 tests、lint、typecheck、production build、`git diff --check` 全綠；Chromium 1280／393 共 2／2 驗證教師登入欄位、像素字、MENU 入口與無水平 overflow。一次 scoped self-review 已撤回不相關的登入導頁測試改動，最終 Standards／Spec／Security 無未解 finding。
- 邊界：在乾淨 worktree `codex/login-hud-menu-logout-20260814` 基於 `3fddcdca7d437879e1be59b304c01f425b91a6af` 完成；未修改 `src/features/teacher-content/**`、教師專屬 classroom／Live、教師專屬 CSS，未合併教師 branch。待 commit 後部署指定 `auth-login` 至 staging Supabase `onkxnkzeixpezetkmocf`，並驗證 GitHub-source Vercel 候選後 promote staging。

## 2026-08-14 09:43 [Owner／Codex] — 教師登入／HUD／MENU／登出 staging 發布完成

- 產品 commit `fffc61c7d5ef00c9462032c1625863058320fc89` 已 fast-forward 推至 `origin/phase6/jrpg-generated-board-ui`。Supabase CLI 2.109.1 僅部署 `auth-login` 到 staging project `onkxnkzeixpezetkmocf`；live invoke 以 `teacher01`、密碼、teacher portal 且不含班級序號取得 session，輸出未暴露 token。
- GitHub-source Preview `dpl_FYPbDRgvi32a38d6fb3CCcGrHBMY` 的 branch／SHA／bundle gate 通過後 promote；staging Production deployment 為 `dpl_71iCbciS3WJK7Erp1nSjAAUpVTgA`，alias `staging.colorplayapp.com`，metadata 仍精確指向 `fffc61c`。公開 bundle 僅含 staging Supabase ref，未含 production ref `xdjumzdqyexpyndanwkp`，並包含登出 dialog 與 HUD frame CSS。
- Hosted Chromium 1280×720／393×852 共 2／2 通過：教師帳號無班級序號登入、登入／登出像素字、登出確認／取消、學生 MENU 無課後任務入口，水平 overflow 均為 0；部署後 15 分鐘內無 Vercel error-level request log。
- 已知非阻擋風險：Vercel build log 仍有既存 `pnpm-lock.yaml` parse warning，平台改用 npm 後 `tsc -b && vite build` 成功；本 task 未改 dependency，未把 release 擴張成 package-manager 維護。Vercel CLI 58.9.4 可完成發布，但最新為 59.0.0，應另開維護更新。

## 2026-08-13 03:24 [Owner／Codex] — 教師端教學分析 JRPG 工作區完成

- 視覺／編排：`/teacher/analytics` 已接上教師 `TeacherMenu` 與 `TeacherWorkSurface`，使用新生成且不含文字／假數值的像素風分析觀測室背景。班級／日期／章節／子題 filters、既有 hooks、repository calls 與各 projection 的 loading／empty／error 行為維持；新頁面依序呈現班級總覽、高錯誤題 Top 5、子題掌握概況、題目分析與 Live 團體賽結果。CSS 全部隔離於 teacher-content module，未修改 `globals.css`／tokens／router／AppShell。
- 資料誠實性：修正平均正確率 0–100 值被再乘 100 的既有錯誤；Top 5 只排序現有 server `correct_rate` 且每列顯示實際作答分母。子題區明示現有投影只有正確率，Live 區明示缺歷史班級分母與選項分布，不建立假參與率／假精熟度。Owner 選擇章節完成定義 A：複習全完成且 chapter mastery ≥80，與 `student_chapter_completion` 既有正式 progression 規則一致；教師批次章節完成率、各學生正確率、Live 參與率／選項分布仍需 integration owner 核准的 server projection，本 branch 未越權修改 Supabase／database types。
- 可及性／RWD：百分比長條附精確文字與桌面 table alternative；393px 題目表格改 native disclosure rows，鍵盤 Enter 可展開；所有 filter／summary controls ≥44×44、無水平 overflow、圖表不只靠顏色。受影響檔案皆低於 500 行；analytics CSS 已拆為 surface／data／mobile 三檔。
- 驗證／review：analytics＋dashboard Vitest 16/16（最終 analytics 8/8 於移除主觀 severity 後重跑）、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；analytics Chromium 1280×720／393×852 4/4，包含背景、overflow、target size、手機 disclosure、文字替代及 console/page error。唯一一次 scoped self-review 因本工作流禁止 sub-agent，修正 component→page 反向依賴、CSS 500 行超限與未有正式 threshold 的主觀 severity 標籤；無剩餘 finding。未 commit、未 push、未 deploy。

## 2026-08-13 16:09 [Owner／Codex] — 教師 HUD 固定與教學分析 drill-down

- 教師 HUD 改為桌機固定左欄、手機固定頂部身份列與底部導覽，內容保留對應安全區；完整 teacher route browser regression 未發現 Dashboard／Live 版面回歸。教學分析總覽移除獨立「題目分析」與子題顯示條；班級總覽標題連既有班級管理 route，高錯誤題、子題掌握、Live 團體賽標題開啟對應詳細表格。
- 全部錯題排除無作答／無正確率／100% 正確項目，依 server-backed 錯誤率高至低排列。子題表格以正式 stable code 對應 typed subtopic ID，點擊後才查該小節個題資料；找不到正式 ID 時 disabled，不猜字串關聯。Live 表格顯示參與人數、作答數、正確率、完成日期，並連既有 `/teacher/live/:sessionId/report`。
- 驗證：analytics Vitest 12/12、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；analytics＋teacher routes Chromium 31/31，涵蓋 1280×720、393×852、320／375／768／1024／1440、固定 HUD、手機 disclosure、正式 route 與 console/page error。唯一一次 scoped self-review 無未解 finding；未 commit、未 push、未 deploy。

## 2026-08-13 16:22 [Owner／Codex] — 教學分析文案精簡與 HUD 返回總覽

- 依 owner 指示移除教學分析頁列出的輔助／資料界線說明文字，保留正式數值、標題、篩選、loading／empty／error 與 drill-down 行為。HUD「教學分析」即使在相同 `/teacher/analytics` route 再次點擊，也會透過 router navigation key 重建分析內容並回到總覽，不保留錯題／子題／Live 詳細視圖。
- 驗證：analytics Vitest 13/13、Chromium 6/6、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；未 commit、未 push、未 deploy。

## 2026-08-13 16:28 [Owner／Codex] — 分析詳細頁再精簡與子題收合

- 移除錯題詳細頁排序說明、子題頁流程導引與投影說明，以及 completed Live 場次的「已完成」文字；取消／草稿等非完成狀態仍保留。子題掌握表格的查看按鈕改為可切換的「查看／收合」，同步 `aria-expanded`；切換其他小節時改顯示該小節個題資料。
- 驗證：analytics Vitest 13/13、Chromium 6/6、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；未 commit、未 push、未 deploy。

## 2026-08-13 17:26 [Owner／Codex] — 錯題欄位／Live 名稱與章節完成率 blocker

- 高錯誤題總覽與詳細表格只顯示現有 projection 真正提供的「作答數」與「錯誤率」，移除正確率；`attempts` 不是 unique respondents，因此未改標成作答人數。「Live 團體賽結果」已統一改為「Live 課程」。
- 章節完成率尚未實作：資料庫已有單一學生的 `student_chapter_completion(user_id, chapter_id)`，完成定義為複習全完成且 mastery ≥80，但沒有教師班級批次 typed projection 可提供章節 numerator／denominator、completion rate 與完成／未完成學生名單。不得以每位學生一支前端 RPC 的 N+1 查詢拼裝正式指標；需 owner 核准 integration owner 新增教師授權、server-calculated projection 與 generated DB types 後再接 UI。
- 已完成部分驗證：analytics Vitest 13/13、Chromium 6/6、`tsc -b`、scoped ESLint、Prettier、`git diff --check` 全綠；未 commit、未 push、未 deploy。

## 2026-08-13 18:45 [Owner／Codex] — 章節完成率與錯題內容正式投影

- 新增 owner-scoped `teacher_chapter_completion_summary`，批次回傳各 published chapter 的完成學生數、active student 分母、完成率與以 `member_ref` 表示的完成／未完成名單；完成判定直接沿用 `student_chapter_completion`（複習全完成且 mastery ≥80），前端不重算。教學分析總覽「子題掌握概況」改為直接顯示每章 `完成數/總數`、百分比及學生狀態；點標題後仍進既有子題／個題分析表格。
- 新增按需 `teacher_question_detail`；所有錯題表格加入「查看／收合」，展開正式題目與選項。投影不回傳 `is_correct`，且兩支 RPC 對 anonymous、非 owner 教師與學生皆 fail closed；沒有 N+1 學生 RPC，也沒有 auth user id 或答案旗標進入前端。
- 驗證：新增 pgTAP 12/12，既有章節完成規則＋新投影 39/39；repository／analytics／dashboard Vitest 36/36，`tsc -b`、scoped ESLint、generated DB types 比對、Prettier、`git diff --check` 全綠；analytics Chromium 1280×720／393×852 6/6，涵蓋固定 HUD、無水平 overflow、章節完成名單、錯題選項與 keyboard disclosure。唯一一輪 scoped review 補齊兩支 RPC 的非 owner／學生交叉越權測試，無剩餘 finding。migration 只套用本機，未 commit、未 push、未 deploy。

## 2026-08-14 00:06 [Owner／Codex] — 教學分析首頁與剩餘教師頁完成改版

- `/teacher` 改為教學分析首頁，移除原總覽頁與教師 HUD「總覽」項目；`/teacher/analytics` 保留 replace redirect，新增 `/teacher/questions` 小節題目分析。首頁整合班級／日期／章節篩選、班級總覽、四來源題目分析與最近五筆 Live 課程報表分頁；手機 Live 與題目資料改 disclosure rows。
- 班級列表、班級成員、學生學習進度與 Live 報表均套用固定 `TeacherMenu`／`TeacherWorkSurface`。學生頁顯示班級名次、XP、Quiz＋Live 正確率拆分、未完成補救題數／總數與章節狀態；待補救錯題清單依 owner 指示移除。
- 新增 `teacher_assessment_question_analysis`、`teacher_classroom_overview`、`teacher_live_session_report_v2`、`teacher_student_progress_v2`。Quiz 與 Live 只在分析指標合併；章節完成與「已完成」狀態仍只委派 `student_chapter_completion`（閱讀完成＋mastery ≥80），Live 不影響完成。唯一 scoped self-review 修正章節狀態曾只看 mastery 的缺口，並補 pgTAP。
- 驗證：乾淨 local DB reset 完整套用 migrations；教師分析 pgTAP 24/24、受影響 Vitest 58/58、scoped ESLint、TypeScript、generated DB types、Prettier、`git diff --check` 全綠；教師 route browser 其餘 28 tests 與最終 analytics 1280×720／393×852 4/4 通過。未 commit、未 push、未 deploy；共享 `app-shell.tsx`／`hud-command-bar.tsx` 未修改，integration owner 仍需隱藏 legacy teacher HUD 並把其教學分析連結改到 `/teacher`。

## 2026-08-14 01:35 [Owner／Codex] — 教師戰術觀測台 Phase A 設計交付

- 完成六個教師頁的現況審計、共用視覺契約、六張 desktop/mobile wireframe board 與十二張視覺方向圖；設計規格在 `docs/superpowers/specs/2026-08-14-teacher-tactical-observatory-ui-optimization.md`，artifact registry 在 `artifacts/design-audit/teacher-tactical-observatory/manifest.md`。
- 方向採頁首 JRPG 場景加安靜深藍工作面；一般手機表格改 disclosure rows，只有 Live 作答矩陣保留有界橫向捲動。生成圖文字、姓名、數值與額外細節均不具產品權威性。
- 本 checkpoint 未修改產品程式碼或測試，未 stage／commit，未進入 Phase B。六頁方案全部等待 owner 逐頁核准。

## 2026-08-14 02:07 [Owner／Codex] — 教師 Phase A owner decisions 與可信邊界

- Owner 核准教學分析、班級管理、題目分析與 Live 報表視覺方向；進入班級補上 `activeBlookId` 正式資產映射護欄，學生細節方向圖移除百分位／主觀評級，只保留班級名次、XP、平均正確率與未完成／全部待補救題數，兩頁更新後仍待核准。
- 題目分析 Phase B 新增專用 classroom-owner-only 正確答案 RPC／projection 範圍：server 驗證 owner、typed answer field、anonymous／學生／非 owner／跨班級 fail closed，且答案不得進入學生、Live 作答或其他非教師報表 payload；server slice 未完成前 UI 不顯示或推測答案。
- Live 摘要推導已鎖定 participants length、answered／correct 聚合、非 null correctRate 最難題與 report ranking；無資料省略而非假 0。此 checkpoint 只更新 Phase A spec、artifacts／manifest 與 handoff，未修改產品程式碼或測試，未 stage／commit，未進入 Phase B。

## 2026-08-14 02:24 [Owner／Codex] — 教師戰術觀測台 Phase A 全數核准

- Owner 已核准六頁全部視覺方向；`classroom-detail-393x852-v2.png` 與兩張 `student-progress-*-v2.png` 成為正式核准方向，舊圖繼續隔離在 manifest superseded 區。`membershipStatus` 僅表示 active／inactive 成員資格，不得推測學習中、離線、presence 或 online 狀態。
- Phase B 尚未開始。正確答案仍須先完成 classroom-owner-only、server-authoritative typed RPC／projection，對 anonymous、學生、非 owner 教師與跨班級存取 fail closed，且不得污染既有 answer-free `QuestionDetail`、學生 Quiz、進行中 Live 或其他非教師 payload。
- 目前 worktree 的大量教師端產品／DB／測試 dirty WIP 均為進入 closeout 前既有內容；本 checkpoint 只改 Phase A 規格、manifest、implementation plan 與 handoff，不 stage、不 commit、不清理或覆寫既有 WIP。

## 2026-08-14 02:43 [Owner／Codex] — 教師正確答案治理契約修訂

- Owner 選擇以 ADR 0007 與修訂 `AC-QUIZ-002` 保留 classroom-owner 教師按需查看正確答案：專用 projection 必須由 server 驗證 teacher role、classroom ownership 與題目分析範圍；既有 shared `QuestionDetail`、學生／公開提交前 payload、進行中 Live 與一般分析維持 answer-free。
- Phase B implementation plan 已改為引用 ADR 0007，並把 task-level RTL／pgTAP／harness 結果限定為相關契約與未來 phase-gate traceability，不宣稱 acceptance 通過；plan 尚待 owner 重新核准，implementation 尚未開始。
- 下一個 gate 是建立可追蹤的 Git baseline。本輪只修改治理與規劃文件，不 stage、不 commit，並保留既有 dirty WIP。

## 2026-08-14 03:35 [Owner／Codex] — 教師 WIP baseline stabilization

- 修正兩個既有 typecheck blocker：teacher routes harness 的缺省 scenario 改為現存 `analytics`；Live report 只在正式 title 存在時才傳入 optional subtitle，未放寬 `TeacherWorkSurface` interface。
- 五個超過 500 行的 WIP 已完成 mechanical extraction：teacher content repository 拆為 core／analytics contracts 與 error module，analytics tests 移至 focused file；teacher route harness 抽出 Live fixtures／adapter；Playwright Live round 抽為獨立 spec；Live pages tests 抽出 test-local fixtures、host console 與 advanced create cases。拆分後相關檔案皆低於 500 行，repository 15、Live pages 16、Playwright 14 組 test title 一一對應，無 skip／only。
- Phase A artifact registry 已排除三張 superseded PNG entries，核准 package 為 30 entries，SHA-256 30/30；三張舊 PNG 仍保留在本機且不納入 checkpoint package。
- Fresh checks：typecheck、scoped ESLint（零 warning）、Vitest 16 files／95 tests、Chromium Playwright 29 tests、production build、`git diff --check` 全綠；唯一一輪唯讀 review 無 finding。
- 尚未 stage／commit，也未 stash／reset／刪除既有 WIP；未執行 DB reset／DB tests／acceptance。Phase B 尚未開始；下一步由 owner 決定 checkpoint commit grouping。

## 2026-08-14 03:46 [Owner] — 授權治理與設計 checkpoint commit

- Owner 已授權治理文件與 30 個核准 artifacts 建立獨立本機 commit；本 commit 不包含產品程式碼、測試、migration 或 generated DB types。
- Phase B 尚未開始；Router、LivePresenter、DB projection 與教師產品 WIP 留待後續各自 owner gate。Commit SHA 待建立。

## 2026-08-14 04:18 [Owner／Codex] — 教師資料基線授權補強

- 教師 avatar migration 已避開既有編號衝突，改為 `20260812000400_teacher_avatar_storage.sql`；教師 pgTAP 依序改為 052／053／054。Avatar 測試以 authenticated JWT 實際驗證 owner teacher 的 insert／select／update 與 student、其他 teacher、跨路徑／跨物件拒絕，共 21/21 通過。
- `teacher_classroom_overview` 的 aggregate 原會在無 ownership 時產生一列空摘要；最終 aggregate 加入 `having exists (select 1 from owned_classroom)`，使 student、non-owner 與跨班級查詢零列，同時保留合法 owner 空班級的一列零摘要。四個公開 projection 的授權矩陣與 internal `teacher_assessment_facts` execute revoke 均通過。
- Fresh 驗證：focused 教師 pgTAP 63/63、完整 local DB 54 files／1212 tests、generated types contract、repository Vitest 4 files／33 tests、typecheck、scoped ESLint 與 `git diff --check` 全綠；generated `teacher_question_detail` 維持 answer-free，未夾帶另一分支 Quiz context 欄位或 ADR 0007 projection。
- 尚未 stage／commit；Phase B 尚未開始。下一步等待 owner 授權 Avatar 與 Analytics checkpoint commits。

## 2026-08-14 04:45 [Owner／Codex] — 教師 UI 與完整 Live checkpoint

- Commit A `48e8373ca7182b34fc7b919fd85419b4ab18defa`（`feat(teacher): checkpoint tactical workspace surfaces`）封裝教師工作區與六頁 UI；Commit B `5fafb79ecc9bd07cb89bdaa7ade95180f38df222`（`feat(live): checkpoint teacher host and projector experience`）封裝完整 Live Host／Projector 改版，不只是 Live report。
- Commit B 前只移除 `teacher-live-session-page.test.tsx` 的檔尾多餘空白行，未改測試語意。C 尚未提交；`INTEGRATION.md` 已補齊 Analytics DB 與 router／harness inventory，但仍保持 unstaged。
- Dashboard deletions、router、teacher route harness／Playwright 與本段 handoff 留待 C 原子 checkpoint。Phase B 尚未開始；下一步是 C commit owner gate。

## 2026-08-14 04:50 [Owner] — 授權 C 原子 checkpoint

- Owner 已授權將本段與 C router／harness／Dashboard retirement 一起提交；C commit 的完整 SHA 將定義為 Phase B product base，Phase B 仍未開始。
- 未來 integration session 必須帶入完整 A、B、C commit chain，尤其不得漏掉 B 的完整 Live Host／Projector 改版。

## 2026-08-14 05:15 [Owner／Codex] — Phase B Task 1 共用教師工作面完成

- Phase B base 為 `ff14759effbd7244b5588752735c3419425d1e59`。Design Read 是 accessibility-critical 教師資料工作區的 targeted evolution，沿用深藍 JRPG 戰術觀測台；dials 為 variance 4、motion 2、density 8。Taste skill 只用於層級、密度、間距、材質、狀態完整性與 anti-slop。
- `TeacherWorkSurface` props／state union 未變；新增直接 RTL 覆蓋 loading／empty／error／retry、單一 h1、DOM／focus 順序與 content state。教師 tokens 保持在 `.teacher-workspace-shell`，scene header 收斂為桌機 184px、手機 156px，固定 240px TeacherMenu、72px mobile identity／bottom navigation、44px 控制項、清楚 focus 與 reduced-motion 均由 browser／CSS 契約覆蓋。已移除零產品引用的舊 Dashboard selector。
- Fresh checks：Vitest 2 files／11 tests、scoped ESLint 零 warning、typecheck、Chromium 5 viewports、production build、`git diff --check` 全綠。唯一一輪 scoped self-review 修正 mobile toolbar assertion 原先沒有真正 toolbar 的假綠，改以 classroom-detail 實測後 5/5 通過，無剩餘 finding。
- Task 1 仍未 stage／commit，Task 2 尚未開始；下一步等待 owner review 與 Task 1 commit gate。

## 2026-08-14 05:30 [Owner／Codex] — Task 1 手機雙錯誤提示定位補正

- Owner gate 發現手機版 avatar error 與 sign-out error 原本都固定在 `top: 72px`，同時出現時會重疊。RTL 確認兩段訊息原已是兩個獨立 alert；CSS 將 avatar alert 保留於頂部 identity bar 下方，sign-out alert 改至 bottom navigation 上方並設 `top: auto`。
- Chromium bounding boxes 於 320／375／393×852 均不相交：avatar `top 72, bottom 108`，sign-out `top 736, bottom 772`；三個 viewport 的 `scrollWidth` 均等於 `clientWidth`。Correction checks 為 RTL 2 files／12 tests、雙 alert browser 3/3、原 workspace composition 5/5、scoped ESLint、typecheck 與 `git diff --check` 全綠。
- Task 1 仍未 stage／commit，Task 2 尚未開始；本次只修正 owner 指出的 finding，未開第二輪廣泛 review。

## 2026-08-14 05:45 [Codex] — Phase B Task 2 教學分析 pilot 完成

- Task 1 已封裝為 `4b4218df340fbff6bbed5d54a3232e52562342ce`。Task 2 保留既有 hooks、query inputs、server pagination 與正式指標，將 `/teacher` 重排為可折疊的篩選摘要、結論優先班級總覽、主要題目分析與次要 Live 場次復盤；各 query region 新增獨立 retry，null 仍以 em dash 呈現。
- TDD 真正 RED 為缺少「班級／章節」篩選摘要及班級總覽 retry；第一屏 DOM 順序是 baseline coverage。Fresh checks：Vitest 2 files／12 tests、Chromium 5/5、scoped ESLint、typecheck、build、`git diff --check` 全綠；320／393 無整頁橫向 overflow，手機篩選預設收合、桌機題目分析寬於 Live 支援欄。
- 唯一 scoped self-review 未發現 fake metric、query drift、shared CSS 洩漏或超過 500 行；Task 2 尚未 stage／commit，Task 3 尚未開始。

## 2026-08-14 05:50 [Codex] — Phase B Task 3 班級管理 pilot 完成

- Task 2 已封裝為 `bf7f42f5decb085ff33cbff1a344795527500c12`。Task 3 保留 `create_classroom` mutation、RHF/Zod、ambiguous-write copy、加入碼與既有 routes；建立列改成緊湊操作帶，class rows 在手機使用 disclosure，input 以 `aria-label="新班級名稱"` 提供穩定 accessible name。
- 真正 RED 覆蓋 input name、手機 disclosure 與 clipboard rejection；複製失敗時現在保留「複製」且加入碼仍可手動選取，不再假報成功。Fresh checks：Vitest 2 files／21 tests、Chromium 6/6 widths、scoped ESLint、typecheck、`git diff --check` 全綠；首次 Playwright 因 sandbox listen EPERM 未執行，已用相同限定命令在允許環境重跑通過。
- 唯一 scoped self-review 未發現 route／mutation drift、dead control 或 fake receipt；相關 source／test 皆低於 500 行（最大 497）。Task 3 尚未 stage／commit，Task 4 尚未開始。

## 2026-08-14 06:05 [Codex] — Phase B Task 4 班級與學生下鑽完成

- Task 3 已封裝為 `cd627db63c0b089b1cd2cd16ee484e2b508d801b`。Task 4 保留既有 classroom hooks、repository calls 與 routes；班級成員及章節進度在桌機維持 table，手機改為可展開 disclosure，active 成員不顯示推測狀態，inactive 只標示「已停用」，未知 `activeBlookId` 不產生假 avatar。
- 真正 RED 為舊版缺少 member／chapter disclosure；學生摘要仍只呈現 classRank、classXp、avgAccuracy 與 unfinishedMistakeCount／totalMistakeCount，null 維持 em dash。Fresh checks：Vitest 4 files／25 tests、Chromium 7/7 widths、scoped ESLint、typecheck 與 `git diff --check` 全綠；393px disclosure 與 1280px table 均實測，320px 無整頁橫向 overflow。
- 唯一 scoped self-review 將桌面欄名由「學習狀態」改為「成員資格」，避免把 membershipStatus 映射為 presence；所有 source／test 低於 500 行。Task 4 尚未 stage／commit，Task 5 尚未開始。

## 2026-08-14 06:18 [Codex] — Phase B Task 5 owner-only 正確答案投影完成

- Task 4 已封裝為 `a6ce1e8aeba54d5e18d51faddac821d1817aafa5`。新增 collision-free migration `20260814000100_teacher_question_answer_detail.sql` 與 pgTAP `055`；`teacher_question_answer_options(uuid, text)` 固定 search_path，只授權 authenticated 執行，並在 server 驗證 teacher role、active classroom ownership、active student 的 completed practice／assignment session 與 published section-bank stable question 範圍。
- ADR 0007 窄型別只回 option_key／option_text／is_correct，repository 映射到 teacher-only `options[].isCorrect`，hook 在 classroom ID 或 stable code 缺少時不查詢；denied／empty 回 null，不合成答案。既有 `QuestionDetail` 與 `teacher_question_detail` 維持 answer-free，學生 Quiz／active Live contracts 未擴張。
- 真正 RED 是 function 不存在。Fresh checks：focused pgTAP 11/11、完整 local DB 55 files／1223 tests、generated database types contract、repository／hook 3 files／20 tests、Quiz／Live forbidden-payload regression 2 files／26 tests、scoped ESLint、typecheck 與 `git diff --check` 全綠。唯一 security-focused review 無 IDOR、grant、schema 擴散或 generated-type finding；Task 5 尚未 stage／commit，Task 6 尚未開始。

## 2026-08-14 06:22 [Codex] — Phase B Task 6 權威正確答案呈現完成

- Task 5 已封裝為 `b7293023582695aadfca2b2b805c6a7acf3a6b6e`。題目分析頁維持既有 answer-free detail 與排序，只由 Task 5 `useTeacherQuestionAnswer` 的成功結果依 option key 標示 `✓ 正確答案`；pending、error、empty 或 denied 時不標示、不重排也不推測答案。
- 真正 RED 是既有 expanded detail 找不到明確正確答案標示。Fresh checks：Vitest 2 files／9 tests、Chromium desktop／mobile 2/2、scoped ESLint、typecheck 與 `git diff --check` 全綠；393px disclosure 可用鍵盤展開、focus 留在按鈕、控制高度至少 44px且無整頁 overflow，1280px 維持題目 table。
- 唯一 scoped self-review 無 answer inference、answer-free interface drift、mobile composition 或 accessibility finding；相關檔案皆低於 500 行。Task 6 尚未 stage／commit，Task 7 尚未開始。

## 2026-08-14 06:30 [Codex] — Phase B Task 7 Live 場次復盤完成

- Task 6 已封裝為 `fc17afd6d023bb3e8b69aea922d909b894c3ecc8`。新增 page-local pure summary：參與人數只取 participants.length、整體正確率只聚合 answered／correct、最難題只從非 null correctRate 依 report order 選最低、前三名只按 authoritative rank 1–3 排序；不可用摘要會整段省略，不顯示假 0。
- 第一屏先呈現場次重點與前三名；桌機保留逐題 table，手機使用 disclosure。作答矩陣及 CSV semantics 完整保留，且只有矩陣維持 bounded horizontal scroll；既有最終排名仍保留。
- 真正 RED 是 summary module 不存在。Fresh checks：Vitest 3 files／14 tests、Chromium 7/7 widths、scoped ESLint、typecheck 與 `git diff --check` 全綠；393px podium 共用底線且一／二／三名高度遞減，320px 無整頁 overflow。唯一 scoped self-review 修正零參與摘要原可能顯示 `0 人`，改為誠實省略；所有檔案低於 500 行。Task 7 尚未 stage／commit，Task 8 尚未開始。

## 2026-08-14 08:12 [Codex] — Phase B Task 8 scoped regression 完成

- Task 7 已封裝為 `6257eec6ef3255c1e656552a8663a75b2989029d`。Task 8 未修改產品行為；補齊六頁 1280×900／393×852 跨 route browser matrix、既有 workspace state spec 的 config 收錄，並把兩個 stale／timing-sensitive 測試對齊目前正式 harness 與非同步資料載入。
- Fresh checks：整合 Vitest 22 files／145 tests、Chromium 39/39、focused owner-answer pgTAP 11/11、完整 local DB 55 files／1223 tests、database-types contract、scoped ESLint、typecheck、production build 與 `git diff --check` 全綠。六頁另輸出 12 張 repo 外視覺檢查圖至 `/private/tmp/colorplay-teacher-phase-b-final/manifest.json`；fixture 只供版面檢查，不是 production truth 或 phase acceptance evidence。
- 唯一 integrated review 確認資料誠實性、owner-only answer isolation、mobile disclosure、Live matrix bounded scroll、44px／focus／reduced-motion、protected-path 與 500 行邊界；未發現需修改產品碼的 finding。完整 Live Host／Projector checkpoint `5fafb79ecc9bd07cb89bdaa7ade95180f38df222` 仍在提交鏈中。未 push／merge／deploy、未操作 hosted 服務、未執行 `pnpm acceptance`；結果只代表 scoped Phase B regression，等待 owner 檢視最終畫面。

## 2026-08-14 10:20 [Codex] — Teacher visual reimplementation pass 待 owner 視覺核准

- Owner 拒絕上一版視覺完成宣告後，以核准 Phase A directions 為 SSOT 重新實作六頁 composition；保留既有 route、正式資料、安全邊界、ADR 0007 與完整 Live Host／Projector。場景限制於 header，工作面改為安靜深藍，並分別重作 analytics 決策層級、班級操作列／roster rows、班級與學生下鑽、三層題目 disclosure、Live 首屏摘要與 podium。
- CSS cascade audit 在 teacher-local scope 中和 global `.secondary-action`、`.classroom-create-form`、`.classroom-card` 與資料表材質；Live shared surface 已抽至 `teacher-live-workspace.css`，create／report 直接 import。Production manifest 顯示 report lazy entry 同時載入 report CSS 與 shared live workspace CSS，不依賴先造訪 TeacherLivePage。
- Fresh checks：Vitest 17 files／92 tests、Chromium 39/39、scoped ESLint、typecheck、production build、`git diff --check` 全綠；六頁 after 12 圖與 before／approved 對照 manifest 在 `/private/tmp/colorplay-teacher-visual-after/manifest.json`，全部 scrollY=0、無 console／page error、無 document overflow。未執行 acceptance、hosted operation、push／merge／deploy。狀態：Awaiting owner visual approval。

## 2026-08-14 11:18 [Owner／Codex] — Owner visual approval correction 完成

- 限定修正三項 owner finding：1280px 班級加入碼改為不可斷行並重新分配 roster row；題目分析每章第一小節預設展開但仍可自由收合，且初始不選題、不請求或推測正解；393px 班級成員與學生章節 disclosure 新增隨 open／closed 轉向的明確 chevron，membershipStatus 語意不變。
- Browser 實測：加入碼 `ABCD-1234-EF56-7890` 為 `230.31×24.70px`、`white-space: nowrap`；題目頁 1280／393 初始各有 1 個 open details；兩種 mobile summary 均為 `341×66.66px`、chevron `24×24px`，`aria-expanded` false／true 與方向矩陣同步切換，且無 document overflow。
- Fresh checks：相關 Vitest 4 files／16 tests、owner visual Chromium 5/5、既有六頁 Chromium regression 39/39、scoped ESLint、typecheck、build、`git diff --check` 全綠。全新 12 張 after 截圖與 manifest 位於 `/private/tmp/colorplay-teacher-visual-correction-after/`，全部 scrollY=0、console／page error=0、document overflow=0。
- 本輪未執行 acceptance、DB 或 hosted operation；只做三項 finding 的限定 review，未展開第二輪 broad review。等待 owner 最終視覺核准。

## 2026-08-14 11:33 [Owner／Codex] — 班級操作按鈕最終微修正

- 僅補正班級 roster actions：`進入班級`／`教學分析` 設定 112px 最小寬度與 `white-space: nowrap`；未改文案、route、handler、資料或其他頁面，既有 mobile flex／full-width composition 由原六頁 regression 保持全綠。
- 1024／1280×900 實測兩按鈕各只有 1 個文字 line rect：`進入班級` 為 `112×48px`、`教學分析` 為 `112×44px`，兩者 computed white-space 均為 nowrap，兩個 viewport 均無 document overflow、console／page error。
- Fresh checks：相關 Vitest 1 file／7 tests、focused Chromium 2/2、既有六頁 Chromium regression 39/39、scoped ESLint、typecheck、build、`git diff --check` 全綠。只重拍 `/private/tmp/colorplay-teacher-class-actions-final/classes-1280x900.png`；未執行 acceptance、DB 或 hosted operation，等待 owner 依新截圖與量測決定交接整合。

## 2026-08-14 11:47 [Owner／Codex] — 班級 roster action typography 統一

- 僅在 teacher-local classroom CSS 中和舊 global selector：`複製`、`進入班級`、`教學分析` 統一為繼承字型、14px／800／16.8px、normal letter-spacing、nowrap 與 44px 高度；desktop 兩個 row actions 維持 112px，`建立班級` 保留 16px／800／52px。
- Chromium 393／1024／1280 實測三個 roster actions 均只有 1 個文字 line rect，無 document overflow、console 或 page error；mobile disclosure 展開後仍是原 full-width flex composition。
- Fresh checks：相關 Vitest 1 file／7 tests、focused Chromium 3/3、既有六頁 Chromium regression 39/39、scoped ESLint、typecheck、build、`git diff --check` 全綠。新 desktop／mobile 截圖與 evidence 位於 `/private/tmp/colorplay-teacher-class-actions-typography-final/`；未執行 acceptance、DB 或 hosted operation。

## 2026-08-14 14:37 [Integration owner／Codex] — 學生／教師整合 blocker 修正完成

- 在乾淨 integration worktree 合併教師 tip `8f0eeee853a929cfd360f70f31b8eaff8305ee51`；所有 `/teacher*` route 只保留教師 `TeacherMenu`／Live projector HUD，不再渲染學生／legacy `HudCommandBar` 或 `hud-top`。完整教師 Chromium harness 46/46 通過，涵蓋六頁、Live、320–1440px、鍵盤選單與 reduced motion。
- 新增 Quiz server-side `classroom_id` provenance、單一 active student classroom constraint 與不可竄改 guard；教師分析及 owner-only 正解 projection 只讀同班 completed session。跨班負向、重複班級與 provenance mutation 測試納入完整 DB gate：59 files／1240 pgTAP、runtime smoke 3、integration 12 files／25 tests 全綠。
- 教師敏感 query keys 納入 actor，登出、換帳號及失敗登出後身份切換會清除 Query cache。Email OTP 後 `/register` 保持 mounted，未完成註冊學生不能進 `/app*`；Edge registration 對同一完成請求 idempotent，跨班／重複完成 fail closed。相關 auth／router／profile 測試已納入完整 Vitest 167 files／1130 tests 全綠。
- Auth、學習大廳橫向、Quiz 與結果頁在受限高度改由主內容區垂直捲動；專項 Chromium 1280×480、393×500、852×393 landscape 3/3 通過。複習卡翻頁在 owner 關閉系統 reduced-motion 後恢復，保留原有無障礙降動效規則，未強制覆寫。
- Fresh static gates：lint、typecheck、production build、scoped Prettier、working tree／cached `git diff --check` 全綠。既有教師 CSS 使用 module-local raw colors 與全域 `spec/07`「色彩僅定義於 tokens.css」仍有 Medium 規範衝突；不影響本次功能／安全 blocker，但 staging 前應另立 ADR 或安排 token consolidation，避免在 integration merge 中重做已核准視覺。
- 本 checkpoint 未 push、未 deploy、未操作 hosted Supabase／Vercel，也未執行 `pnpm acceptance`；真實手機裝置仍依規格留待 owner 驗證。

## 2026-08-14 15:18 [Integration owner／Codex] — Google Sheet 內容 gate 失敗，staging 發布停止

- 最新 Sheet 結構已解析為 QB 139、CR 64、LT 60、RC 8；結構 gate 0 error／0 warning。LT 不得沿用 QB 題池，故本機以 TDD 新增 `live` bank、`LT` stable code、Live-only 選題／教師分析與 completed-only owner answer projection；local reset 與 focused pgTAP 目前通過，尚未建立 commit。
- 依 `docs/content/question-review-rubric.md` 對 263 題執行唯一一輪內容審查，結果 `VERDICT: FAIL`：37 個 BLOCKING、20 個 NON-BLOCKING、9 個 UNSURE。主要 blocker 是單選題有多個合理答案、正解與解析互相否定、專名／術語錯字、缺圖題無法判定；BLOCKING 涉及 QB3106、QB3112、QB3209、QB3223、QB3239、QB3247、QB3249、QB3251、QB3306、QB3307、QB3323、QB4108、QB4109、CR3003、CR3008、CR3009、CR3052、CR3063、LT3201、LT3202。
- RC 8 張的文字／順序與既有 seed 無內容差異；重新產生只改 timestamp。P301–P305 的 Sheet 代號仍不是可匯入 media，hosted staging 既有圖片版本與綁定不得用 reset／seed 覆蓋。
- 依 fail-closed gate，本輪未匯入 hosted Supabase、未 push、未 deploy Vercel。下一個安全動作是 owner／教師先在 Google Sheet SSOT 修正 BLOCKING 與裁決 UNSURE，再重新 fetch、內容審查與 Sheet↔staging audit；通過後才可套 migration、交易式發布內容與部署 `colorplay-staging-web`。

## 2026-08-14 15:55 [Owner／Integration owner] — 最新 Sheet 再審仍 FAIL，未上傳 staging

- Owner 裁決目前 Google Sheet 為內容 SSOT，接受已刪除題目與現有 stable codes；重新執行 `pnpm content:fetch`，取得 QB 136、CR 62、LT 60、RC 8，`content:verify --gate` 為結構錯誤 0／覆核提示 0。
- 同一位 content reviewer 依最新 258 題重新完整審查，結果仍為 `VERDICT: FAIL`：38 個 BLOCKING、20 個 NON-BLOCKING、6 個 UNSURE。QB4109 的 answer／解析開頭雖已統一為 C，但選項 D 仍把頭部創傷後色覺喪失歸因於錐狀細胞受創，解析卻歸因於大腦視覺皮層受損，因此仍形成兩個錯項與內部矛盾。
- 其他主要 blocker 仍包含 QB3106、QB3112、QB3208、QB3209、QB3221、QB3237、QB3245、QB3247、QB3249、QB3306、QB3307、QB3323、QB4108、CR3003、CR3008、CR3009、CR3051、CR3062、LT3201、LT3202。未對 generated content 做人工繞過，也未上傳 `onkxnkzeixpezetkmocf`、未 push、未 deploy 或停用 legacy keys。
- 下一個安全動作：在 Google Sheet 修正全部 BLOCKING、由教師裁決 6 個 UNSURE，再重新 fetch／review；內容 gate 通過後才執行本機 DB regression、staging 交易式匯入與 Sheet↔DB audit。

## 2026-08-14 16:02 [Owner] — QB4109 內容風險由教師裁決接受

- Owner 明確裁決 QB4109 本輪先通過，故從 staging 發布 blocker 移除；其 answer=C 與解析開頭已一致。
- 已知風險仍保留：選項 D 將頭部創傷後色覺喪失歸因於錐狀細胞受創，解析則歸因於大腦視覺皮層受損，兩者語意互斥。此裁決只解除該題發布 gate，不宣稱內容審查判定無誤。
- 其餘 20 個 blocking stable codes 仍須修正或由教師逐題明確裁決，尚未操作 hosted Supabase／Vercel。

## 2026-08-14 16:14 [Owner／Integration owner] — 本輪題庫 finding 全數由教師裁決接受，本機發布 gate 通過

- Owner 明確要求本輪內容先通過並完成部署；因此前一輪 38 個 BLOCKING、20 個 NON-BLOCKING、6 個 UNSURE 全部視為教師內容裁決接受。已知內容風險保留於 handoff，不宣稱 reviewer 改判為無誤，也未人工修改 Sheet 或 generated seed。
- 重新執行 `pnpm content:import`：Google Sheet SSOT 為 QB 136、CR 62、LT 60、RC 8；產生 258 題 published、1 題 draft（RLS fixture）、8 張 published review cards，結構 gate 0 error／0 warning。
- 第一次完整 DB gate 正確找出三個 stale fixture：舊總題數、舊 QB／CR bank counts，以及已刪除 `QB3219` 導致的 sequential-code 假設。測試已改為目前權威題數，學習進度 fixture 改從實際 published rows 取 46 題，不再假設 stable code 連號；未改產品或題庫內容。
- Fresh local gate：lint、typecheck、production build、Vitest 168 files／1153 tests、Supabase 60 files／1246 pgTAP、runtime 3、integration 12 files／25 tests、教師 Chromium 46／46、學生短高度／橫向／翻頁 Chromium 15／15、`git diff --check` 全綠。一次誤用 production preview 跑 dev-only harness 的 15 個失敗不代表產品結果，已以相同測試在正確 Vite dev harness 重跑 15／15。
- 尚未 push、未操作 hosted Supabase／Vercel、未停用 legacy keys。下一步是 secret scan、integration checkpoint、唯一一次 Standards／Spec／Security review；無新 Critical／High 才進 staging 發布。

## 2026-08-14 16:44 [Integration owner／Codex] — 唯一 release review blocker 修正完成

- 唯一一輪 Standards／Spec／Security review 發現並修正：Live 啟動時重新驗證教師角色、班級 owner 與 active activity；教師分析重新驗證 owner 的 teacher role；Live 場次凍結 chapter／section attribution；教師正解 RPC 以 assessment source 與 completed Live session ID 定位唯一 snapshot，避免同 stable code 的 Quiz／Live 選項混合。
- 新 API key resolver 僅在新 key set 未設定時才 fallback legacy，顯式空值 fail closed；staging bootstrap 不再輸出 publishable key 值；runbook 改用 `colorplay-staging-web`，題庫規格同步目前 QB 136／CR 62／LT 60／RC 8 與 disposable staging snapshot 例外。
- RED 證據涵蓋：被降權 Live host 原可啟動、凍結 taxonomy／source-session projection 尚不存在、顯式空 key set 原會 fallback。GREEN 後完整 gate：lint、typecheck、production build、Vitest 168 files／1154 tests、Supabase 60 files／1254 pgTAP、runtime 3、integration 12 files／25 tests、教師 Chromium 46／46、scoped Prettier 與 `git diff --check` 全綠。
- Git ancestor 檢查確認教師 tip `8f0eeee853a929cfd360f70f31b8eaff8305ee51` 完整包含於 integration；六頁、Live Host／Projector／report、教師專用 `TeacherMenu` 均已接入，所有 `/teacher*` route 不渲染學生或 legacy HUD。本輪仍未操作 hosted Supabase／Vercel；下一步建立 follow-up checkpoint，再核對 staging ref／project 後發布。

## 2026-08-14 16:54 [Integration owner／Codex] — Staging 單一班級資料 reconciliation

- `supabase db push` 已在正確 staging ref `onkxnkzeixpezetkmocf` 套用 20260812000400～20260814000100，並於 20260814000200 fail closed：同一名學生在 7/22 `Fixture Classroom One` 與 7/28 `配老師專班` 均為 active；後四支 migration 當下未套用。
- 只讀 dump 確認衝突僅一名學生。依 owner 的單一 active classroom 決策，migration 改為保留最近 activated membership，把較舊 membership 標為 inactive 並保留歷史，不刪學生、班級、成績、複習卡 media 或 storage object；其後仍以 unique index／trigger 阻止再次重複。
- Fresh local reset 與完整 DB gate：60 files／1254 pgTAP、runtime 3、integration 12 files／25 tests 全綠。下一步先提交並 push 此 deterministic reconciliation，再重跑 staging migration；尚未部署 Vercel 或匯入最新題庫。

## 2026-08-14 17:14 [Integration owner／Codex] — 非破壞式 Sheet 發布路徑補齊

- 遠端只讀盤點確認舊快照為 QB 139／CR 64／LT 0；直接執行 generated seed 只會 `on conflict do nothing`，不能套用修文或 archive 刪題。完整 staging reset 會刪除 Auth 使用者與複習卡 media mapping，故本輪排除。
- 新增 migration 20260814000600：既有 versioned teacher content command 現在接受 QB／CR／LT／legacy stable code，並由 server 依 namespace 強制推導 `section`／`chapter`／`live`／`legacy` bank，caller 不能竄改題池。後續發布使用既有 `publish_question`／`archive_question`，保留版本、事件與歷史 session。
- TDD 先暴露 content command 無法處理 LT namespace；修正後 focused 049 為 12／12，完整 DB gate 為 60 files／1255 pgTAP、runtime 3、integration 12 files／25 tests 全綠。下一步套用 migration 後，使用教師權限進行 current Sheet snapshot 的 publish／archive；不重置帳號、作答或 media。

## 2026-08-14 20:15 [Integration owner／Codex] — 學生／教師整合候選發布至 staging

- 已將 integration commit `351b7b711323826bf8f72e1aae8ce07f95a8d7f4` 發布至 Vercel `colorplay-staging-web`，Production-target deployment 為 `dpl_APxt99Gvb2N4BNtLiPmgu3ehaBpG`；`staging.colorplayapp.com` 已指向該 deployment。
- Hosted bundle 驗證使用 Supabase `onkxnkzeixpezetkmocf`、不含 production ref `xdjumzdqyexpyndanwkp`，公開 key 對 staging Auth settings 回應 200；bundle manifest 包含 `teacher-live-page`、`teacher-live-session-page` 與 `live-presenter` chunks。
- 真實 hosted smoke 通過：教師登入後到 `/teacher/live`，只有一份教師導覽、學生 legacy HUD 為 0，建立 Live 課堂頁可載入；學生登入後到 `/app` 學習大廳。部署前專項 Vitest 4 files／16 tests與 production build 亦通過。
- 已確認完整教師 Live 建立／Host／Projector checkpoint `5fafb79ecc9bd07cb89bdaa7ade95180f38df222` 是目前 integration HEAD 的祖先；本次整合不只包含教師六頁與 Live report。
- 待處理的產品差異：目前註冊仍為基本資料（自訂暱稱／班級序號）→ Email OTP → 帳號密碼 → `/app`；尚未實作 owner 新提出的「OTP 驗證後直接完成註冊並進學習地圖、暱稱預設為 Email `@` 前字串」。需先確認帳號、密碼、真實姓名與班級綁定的新資料契約，再以獨立 Auth task 修改與驗證。

## 2026-08-16 21:00 [Owner／Integration owner] — 三步學生註冊流程修復完成

- Owner 定案維持三步流程：基本資料 → E-mail OTP → 帳號與密碼；完成後清除 OTP 暫時 session 並回 `/login`，由學生使用新帳號密碼重新登入。暱稱以第一步輸入值寫入 `profiles.display_name`，不得改成 E-mail `@` 前綴。
- 真實阻塞原因為 `student-register` 直接讀取未授權的 `classroom_members.member_role/status`，本機 Edge 回 42501／`REGISTER_FAILED`。修正後改走既有 user-scoped `list_my_classrooms` RPC，不擴張 service-role table grant；新增本人限定、RLS deny-by-default 的短期 registration claim，序列化跨 Auth／profile 的註冊 saga，避免同一 OTP session 並行請求互相覆寫密碼。
- 已到達的 1／2／3 步可直接回點；往前切換與最終提交會自動導向最早錯誤步驟。已驗證 E-mail 可按「更改 E-mail」後重新驗證，第三步在重新驗證前保持鎖定。
- Fresh checks：auth Vitest 7 files／100 tests、lint、typecheck、production build、focused registration-claim pgTAP 15／15、Chromium 真實 Email OTP → Edge 200 → `/login` → 帳號密碼登入 → HUD 顯示輸入暱稱全綠；generated database types 與 local schema 僅差末尾空行。完整 pgTAP 1267 assertions 中，新 059 全綠；既有 018 Live 測試仍固定失敗 1 項（seed 已有 Live session 卻斷言絕對數量 0），隔離重跑相同，未修改該無關範圍。
- 唯一 review 的兩個 High（隱藏步驟錯誤、並行密碼覆寫）與一個 Medium（已驗證 E-mail 無法重編）皆已修正。本 checkpoint 尚未 push、未 deploy、未操作 hosted Supabase／Vercel；staging 發布前必須先套用 `20260814000700_student_registration_claim.sql`，再發布更新後的 `student-register` Edge Function 與前端。

## 2026-08-16 21:27 [Integration owner／Codex] — 三步學生註冊修復發布至 staging

- 註冊流程產品修正為 commit `6ab6877ffbf7885fc1b8ac6a5bdf34ac0f4f1b62`；後續 commit `282e399e44b30921e1c496ad9f40af60aedf17d2` 將 Edge 各失敗階段映射為安全且可操作的繁中原因，不再顯示舊的泛用「註冊失敗，請稍後重試」，亦不洩漏 SQL／內部錯誤細節。兩個 commit 均已推至 `origin/integration/jrpg-student-teacher-20260814`。
- Staging Supabase `onkxnkzeixpezetkmocf` 已套用 `20260814000700_student_registration_claim.sql`，local／remote migration 對齊；更新後的 `student-register` Edge Function 已部署。合法格式但無 session 的請求回 `401 AUTH_REQUIRED`。
- Vercel `colorplay-staging-web` deployment `dpl_AzFq59jCk7fENVbrg15gdRdJameD` 為 READY，`staging.colorplayapp.com` 已指向該 deployment。Hosted bundle 為 `/assets/index-Bvj-hrnW.js`，只綁定 staging project ref、不含 production ref；註冊 route bundle 含新的分段錯誤文案且不含舊泛用文案。
- Hosted smoke：既有 fixture `student01` 登入到 `/app`、`teacher01` 登入到 `/teacher`，API 均 200、無 page error／失敗 request。一次性已驗證 synthetic identity 走正式 `student-register` 回 200，再以新帳密登入回 200；手機 viewport 到 `/app`，暱稱完整保留、active membership 存在、browser error 0。一次性 Auth user 與測試班級均已刪除，`註冊 Smoke %` 班級殘留數為 0。
- Hosted synthetic smoke 以已確認 E-mail identity 驗證 OTP 後半段，不消耗 staging SMTP 配額；實際 OTP 寄送／輸入仍以本機真實 Mailpit E2E 證據為準，staging 真實信箱收信需 owner 手動驗證。操作發現 server key 直接查 `classrooms` 仍回 42501，故測試資料清理改走已連結專案的 Management API SQL；未擴張 table grant 或產品權限。

## 2026-08-16 22:33 [Integration owner／Codex] — 教師版面與 Live 滿版修正完成

- 教學分析與題目分析改用可讀章節／小節標示：顯示「第三章 色彩表示」與「3-1 色彩三要素與色名的表示」，不再曝露 `sheet-3-1-all` 等內部 stable key。
- 班級管理桌面卡片在 1024／1280／1366／1440px 逐一驗證班級碼、複製鍵、建立日期與兩個操作鍵均位於卡片內且彼此不交疊；1366px 的實際碰撞以延長兩列 composition 至 1536px 修正。班級明細與學生進度資料表使用明確教師端 surface／ink，實測文字對比度至少 4.5:1。
- Live 建立的小節選擇改為有間距的 responsive 卡片；教師投影 lobby／題目／暫停／統計／解析／即時排名／最終頒獎台均固定覆蓋精確 viewport，不再露出深藍外圍。學生答對／答錯／逾時結果頁亦以 route-local 高 specificity 修正 AppShell direct-child 規則造成的縮框。既有 Realtime 同版本 roster event 會 refetch 權威參與者名單與人數。
- 唯一 review 找到的 1366px 子元件交疊、E2E 檔超過 500 行、資料表對比度 assertion 過弱、投影只驗 lobby 四項均已修正；Security axis 跳過，因 diff 未修改 auth、RLS、RPC、分數或其他 trust boundary。
- Fresh checks：相關 Vitest 8 files／42 tests、Chromium 教師 layout／route／Live 38 tests與學生 Live 14 tests（合計 52／52）、lint、typecheck、production build、scoped Prettier 與 `git diff --check` 全綠。尚未 push／deploy；下一步建立 checkpoint，核對 Vercel linked project 為 `colorplay-staging-web` 後才發布至 `staging.colorplayapp.com`。

## 2026-08-16 22:42 [Integration owner／Codex] — 教師版面與 Live 修正發布至 staging

- 產品 checkpoint `2f9623569e5314a0f3aa749edf9b04f1f5b76ad8` 已推至 `origin/integration/jrpg-student-teacher-20260814`，並發布至 Vercel `colorplay-staging-web`；deployment `dpl_4zFyBzDtbTTyC3A6BQRGgX8Re4FS` 為 READY，`staging.colorplayapp.com` 已指向該 deployment。
- Hosted HTML、`/login`、`/teacher/live` 均回 200；主 bundle `/assets/index-DA8EyPp-.js` 只包含 staging Supabase `onkxnkzeixpezetkmocf`，未包含 production ref `xdjumzdqyexpyndanwkp`。教師 Live create／session／presenter chunks 均可直接取得 200。
- 真實 hosted smoke：教師 fixture 在 1366×900 與 393×852 登入，只有教師導覽、legacy HUD 為 0，`/teacher/live` 可載入且小節選擇有明確卡框；1366px 班級碼／日期／操作鍵幾何無碰撞。學生 fixture 可登入 `/app`。未建立正式 Live session，故教師 projector／學生答題回饋的 staging 實際回合仍待 owner 以雙帳號人工驗證；本機同範圍 Chromium 52／52 已通過。
- Vercel remote build 使用 CLI 58.1.0 並完成；本機 CLI 58.9.4 低於目前 59.1.3，這次未造成部署失敗，但後續維護可另行升級，不屬本次產品 diff。

## 2026-08-16 23:27 [Integration owner／Codex] — 教師 follow-up 修正完成，待 staging 發布

- Live 報表表格補上教師端深色 surface／亮色 ink 與交錯列底色，Chromium 實測首欄文字對比至少 4.5:1；班級管理長班名會讓名稱縮排但「有效」狀態固定單行且留在摘要列內。
- Live 建立頁第 2 步改用隱藏的 fieldset legend 保留語意、另以正常標題排版，標題與上方邊界、下方小節格線皆有明確間距。
- 已有教師頭像改為開啟原生 modal：可查看目前圖像或重新上傳，既有 repository 的 user-scoped path 與 `upsert: true` 會覆蓋舊圖；視窗提供可見關閉鍵、Escape、鍵盤焦點隔離及所有關閉路徑復焦。未上傳頭像時仍維持點擊頭像框直接選檔。
- 唯一 review 的 Medium finding 為原 dialog 未隔離背景焦點且選檔關閉未保證復焦；已改用 `showModal()` 並以 Chromium 覆蓋 Tab、Shift+Tab、Escape 與成功選檔關閉。
- Fresh checks：相關 Vitest 4 files／28 tests、Chromium layout／contrast／avatar 11／11、lint、typecheck、production build、scoped Prettier、`git diff --check` 全綠。尚未 push／deploy；下一步建立 checkpoint，確認 linked Vercel project 與 staging Supabase ref 後發布。

## 2026-08-16 23:33 [Integration owner／Codex] — 教師 follow-up 發布至 staging

- 產品 checkpoint `52d72b3` 已推至 `origin/integration/jrpg-student-teacher-20260814`，並發布至 Vercel `colorplay-staging-web`；deployment `dpl_9MNycfRub7nNbg7PdQi9BrE1K25M` 為 READY，`staging.colorplayapp.com` 已指向該版本。
- Hosted `/` 與 `/teacher/live` 回 200；公開 bundles 只包含 staging Supabase `onkxnkzeixpezetkmocf`，未包含 production ref `xdjumzdqyexpyndanwkp`。新頭像 modal 文案存在於 `teacher-workspace-mobile-BY1VEsu4.js`。
- 真實 hosted smoke：教師 fixture 在 1366×900 與 393×852 登入後，只有教師導覽、Live 建立頁可載入、小節卡有邊框、無水平 overflow／page error／失敗 request；桌面班級卡幾何亦無碰撞。fixture 尚無已上傳頭像，因此未為 smoke 改寫 hosted 資料；查看／覆蓋 modal 的完整鍵盤與選檔流程由本機 Chromium 11／11 覆蓋。
- 本輪未修改或部署 Supabase schema／Edge Function／資料內容。Vercel 本機 CLI 58.9.4 仍低於 59.1.3，未影響本次成功發布；升級留作獨立工具維護。

## 2026-08-18 00:48 [Integration owner／Codex] — Staging 連線可恢復性修復完成

- Vercel hashed `/assets/*` 新增一年 immutable cache；外部 Google Fonts 已移除，自架 Noto Sans TC 收斂為 400／700。production build 的主 CSS 由事故盤點約 863 KB／gzip 320 KB 降至 477.37 KB／gzip 161.86 KB。
- Supabase browser client 的所有 HTTP request 採 15 秒總 deadline，涵蓋 response headers 與 body consumption，並尊重 `Request`／`RequestInit` AbortSignal；可將原本無界等待收斂為 `AUTH_TIMEOUT`。這是對殭屍連線假說的必要防護，不代表已證實 8/17 事故根因。
- 全域 QueryClient 改為 30 秒 stale、取消 focus refetch、query／mutation 預設不重試；各 feature 已明確宣告的 read retry 仍可覆寫。登入只對非 timeout、非 429 的 transport failure 重試一次；timeout 不重試，避免最壞等待延長至 30 秒與新增 session。
- 登入錯誤安全區分為帳密錯誤、網路、逾時、429 限流、服務不可用與未知，不顯示 provider 內部內容或帳號存在狀態。A6 的 `sessionStorage` 關分頁登出決策未改。
- 唯一 review 找到「deadline 只包 headers」High 與「timeout 被重試」Medium，均於同一輪修正；新增 stalled body、Request signal、timeout no-retry、429 與 5xx regression tests。
- Fresh checks：lint、typecheck、production build、Vitest 168 files／1185 tests、`git diff --check` 全綠。C1–C4、D 與 E 的證據門檻／下次事故取證已寫入 `docs/superpowers/plans/2026-08-18-staging-concurrency-follow-up.md`；未查 Auth logs、未調 rate limit、未升級 Supabase tier、未 push 或 deploy。

## 2026-08-18 01:12 [Integration owner／Codex] — 登入／註冊密碼顯示切換完成，待 staging 發布

- 登入密碼、註冊密碼與密碼確認新增一致的開眼／閉眼切換；三個欄位預設皆隱藏，切換不清除已輸入內容，註冊兩欄可獨立控制，按鈕不會觸發表單提交。
- Icon-only button 具動態 `aria-label`／`aria-pressed`／`aria-controls`、鍵盤操作與 hover／focus tooltip；唯一 review 指出的 40px 觸控區與缺少可見說明已於同一輪修成 44×44px 與 tooltip。未新增密碼儲存、log、傳輸或 auth trust-boundary 變更。
- Fresh checks：登入／註冊 Vitest 2 files／36 tests、完整 Vitest 367 suites／1187 tests、lint、typecheck、production build、`git diff --check` 全綠。測試曾因 sandbox 禁止 `127.0.0.1` listen 而出現 `EPERM`；允許本機暫時連接埠後完整 gate 全綠。
- Hosted smoke 首次找出 Playwright 的模糊 `getByLabel('密碼')` 會同時匹配輸入框與新按鈕；正式 E2E／acceptance selectors 已機械式收斂為 `exact: true`，登入鍵盤路徑亦新增眼睛按鈕的 Tab／Enter 開關斷言。產品 accessible name 不降級。
- 既有未追蹤 `docs/research/` 仍保持原狀、未 stage／未納入本 task。產品 checkpoint 已建立；下一步只 stage selector hardening 與本段 handoff，建立 follow-up checkpoint、push，再讓 Vercel staging 精確對應最新 HEAD。

## 2026-08-18 01:24 [Integration owner／Codex] — 連線修復與密碼顯示控制發布至 staging

- 產品 commit `c61dae8742d2dea6dd8621d46534b18ca1e0ee30` 與 E2E selector checkpoint `c68677c` 已推至 `origin/integration/jrpg-student-teacher-20260814`；Vercel `colorplay-staging-web` deployment `dpl_8WmcxqWtsTYXsrLJ1qfrQ2NVvNuP` 為 READY，`staging.colorplayapp.com` 已指向該版本。
- Hosted HTML 實際引用 `/assets/index-mGj9qRj3.js` 與 `/assets/index-DrMD7Y3y.css`，兩者皆回 200、正確 MIME、`public, max-age=31536000, immutable`；bundle 只包含 staging Supabase `onkxnkzeixpezetkmocf`，未包含 production ref，且密碼 toggle／tooltip 特徵存在、Google Fonts 外部依賴不存在。
- 真實 hosted smoke 在 393×852 對教師與學生 fixture 各驗證一次：密碼預設隱藏、44×44 眼睛按鈕可顯示／再隱藏且不改值，分別成功進入 `/teacher` 與 `/app`，page error／failed request 為 0。
- 本輪未修改或部署 Supabase schema／Edge Function／資料。既有未追蹤 `docs/research/` 仍未納入 commit。Vercel 本機 CLI 58.9.4 低於目前 59.1.3，但本次部署成功；升級 CLI 留作獨立工具維護。

## 2026-08-18 11:45 [Integration owner／Codex] — 章節讀取與複習卡媒體韌性修復完成，待 staging 發布

- Staging 診斷確認 Vercel 靜態資源回應正常；實際長等待集中在 Supabase 學習進度 RPC 與 Storage signed URL。複習卡內容現在先回文字，進入閱讀器後才按 bucket 批次簽署私有圖片，不再以逐圖 `Promise.all` 阻塞整頁；公開圖片直接顯示，signed URL 快取 50 分鐘。
- 私有複習卡媒體依 owner 核准使用最多三次 retry，配 bounded exponential backoff + jitter；此例外已同步至 `spec/02`。等待超過 10 秒顯示可操作的「重新載入圖片／略過圖片」，文字、翻頁與完成複習始終可用。
- 新 migration `20260818000100_learning_read_path_performance.sql` 新增 frozen question-version lookup index，讓 `get_learning_progress` 委派共用 core，並把 chapter map 的每章 progress 重算改為單一 materialized snapshot。本機 EXPLAIN 為 learning progress 10.7ms、chapter map 18.8ms；這不是 hosted p95 證據。
- 唯一 review：Standards 3 個標準 finding＋2 個 smell、Spec 2 個 Medium、Security 0。10 秒操作、jitter、500 行拆分與媒體路徑重複已修；migration 規則重複屬刻意的 bulk snapshot 等價實作，現由既有 access tests 守住。Staging published-read p95 必須在 migration 部署後才量測，尚未宣稱 ≤500ms。
- Fresh checks：學習 Vitest 3 files／27 tests、相關 pgTAP 5 files／108 tests、lint、typecheck、production build、scoped Prettier、`git diff --check` 全綠。既有未追蹤 `docs/research/` 保持原狀且不得 stage；下一步精確 stage 本 task、checkpoint/push，套用 staging migration，部署 Vercel 後跑 hosted chapter/review timing 與基本學生 smoke。

## 2026-08-18 12:06 [Integration owner／Codex] — 章節讀取與複習卡媒體修復發布至 staging

- 產品 commit `b74a5006969b2c80caf5726f945ff4bb114ac169` 已推至 `origin/integration/jrpg-student-teacher-20260814`；Supabase staging `onkxnkzeixpezetkmocf` 已套用 migration `20260818000100_learning_read_path_performance.sql`，local／remote migration list 對齊。
- Vercel `colorplay-staging-web` production-target deployment `dpl_Escqmhbarxg1SnQDus9eTbA6gwHG` 為 READY，`staging.colorplayapp.com` 已指向該版本。舊 CLI 58.9.4 的 production deploy 回 `Not authorized`；改用一次性 CLI 59.1.4 後成功，未修改 package dependency。Hosted hashed JS 回 `public, max-age=31536000, immutable`，chapter chunk 含新版圖片等待／重試／略過流程。
- Hosted 393×852 真實登入後，單次章節完整顯示 939ms；20 次刻意繞過 query cache 的重載結果：章節 render p95 1164ms，`get_student_chapter_map` p95 151ms、`get_learning_progress` p95 183ms、`get_accessible_chapter_review` p95 178ms，三個 published-read RPC 均低於 500ms 且全回 200。
- 複習卡閱讀器在手機／桌面分別 43ms／44ms 即呈現文字與完成控制，不再等待 Storage。附件由 staging Storage 回正確 `image/webp` 200、自然寬 1654，無 request failure／fallback；桌面 headless 完整載入。手機 headless 在 lazy image／翻頁副本下 `complete` flag 未於 15 秒內穩定，但已取得自然尺寸，仍列為 owner 真機確認項，不影響文字、翻頁或完成複習。
- 既有未追蹤 `docs/research/` 保持原狀、未 stage；除本段 append-only handoff 外工作樹無新增產品變更。

## 2026-08-19 15:35 [Owner／Codex] — 圖片負載與同步尖峰開發 gate 完成，真實多人驗證延期

- 在獨立 worktree `.worktrees/image-performance-hardening-20260819`、branch `codex/image-performance-hardening-20260819` 完成圖片 hardening；base 為 `c98a06a275da38a45950435c29db5e432524b090`。教師／Live 大圖與章節複習書封改為 WebP，favicon 縮至 128px，20 個 Blook 改供應 128／256px responsive WebP；production build 圖片總量由先前盤點 13.96 MiB 降至 5.39 MiB，最大單張 336,794 bytes，沒有超過 512 KiB。
- 教師頭像仍先限制來源為 PNG／JPEG／WebP、2 MiB，再於瀏覽器解碼、等比例縮至最多 512px、轉 WebP 並限制輸出 256 KiB 才上傳；錯誤分類分開處理格式、輸出過大與處理器不可用。複習卡新發布契約改為 WebP、512 KiB、2400px，並提供 `assets:check:review-media`；CI production build 後會執行 `assets:check` 阻擋單檔與總量超標。
- `spec/09` 新增同步班級尖峰規則：關鍵路徑需交代 request fan-out、cache／timeout／retry，讀取採 bounded jitter、mutation 須 idempotent、Realtime 禁止 polling 替代；phase gate 需使用 30+ 個獨立 Staging 帳號。Owner 目前不在校園網路／實機環境，因此同 NAT、分散 IP、token refresh soak 與真手機複習卡驗證明確延期，不得宣稱多人容量已通過。
- Fresh checks：scoped lint、typecheck、Prettier、production build、圖片預算、相關 Vitest 6 files／60 tests、教師／Live Chromium 47／47、章節狀態 Chromium 5／5 全綠。章節完整旅程另有既有 harness 缺少 `QueryClientProvider`，2 個 case 在進入閱讀器前失敗；未修改舊測試掩蓋。唯一整合 review 找到頭像處理器未知錯誤被誤報成格式錯誤，已修正並以 repository／preparer 9 tests 重跑全綠。
- 本輪未操作 hosted Supabase／Vercel、未建立測試帳號、未 push／deploy。下一個可用測試時段依 `docs/superpowers/plans/2026-08-18-staging-concurrency-follow-up.md` 執行 30+ 同 NAT、分散 IP 對照、refresh soak 與真實手機驗證；hosted mutation 與測試時段需先取得 owner 當次授權。

## 2026-08-19 15:43 [Owner／Codex] — 圖片效能 checkpoint 發布至 Staging

- Product commit `7959266c5e770f8b6036dde2f2bad889307b1faa` 已推至 `origin/codex/image-performance-hardening-20260819`，並以 Vercel CLI 59.1.4 發布至既有 `colorplay-staging-web`；deployment `dpl_5wLe9SyyFsxJKE3oVQ8tFsKozxiV` 為 READY，`staging.colorplayapp.com` 已指向該版本。
- Hosted HTML 與 26 個遞迴 bundle assets 驗證只包含 Staging Supabase ref `onkxnkzeixpezetkmocf`，不含 Production ref `xdjumzdqyexpyndanwkp`；偵測到唯一 public-key fingerprint `f1c0eb72e196`。公開 Blook 128／256 WebP 分別為 3,286／8,260 bytes，favicon 為 29,589 bytes，皆回 200 與正確 MIME。
- 真實 hosted smoke 以既有 synthetic fixture 在 1280×720 與 393×852 各完成教師帳號登入至 `/teacher`、學生帳號登入至 `/app`；page error／failed request 均為 0，水平 overflow 為 0。舊 smoke 的教師 `MENU` selector 已只在 `/private/tmp` 配合目前固定側欄更新，未修改產品或測試檔。
- 本次只部署靜態前端，未修改 hosted Supabase schema、Storage、Edge Function 或資料。30+ 同 NAT／分散 IP／refresh soak／真機測試仍依前段 owner deferred gate 保持未驗證，不因本次發布改稱多人容量通過。

> 📌 以下接續 `phase1/admin-security-impl` 分支（8/18 起）與本次合併作業自身的紀錄；與上方
> `codex/image-performance-hardening-20260819` 分支的紀錄是兩條平行時間軸合併進同一份檔案，
> 日期不連續屬預期，各筆條目本身的日期為準。

## 2026-08-18 19:05 [Claude Code] — Phase 1 Task 13A：reveal token 形態落地、Edge envelope 接線；stuck 人工重試卡住待裁定

- 做了什麼：owner 裁定後新增 `20260809000400`（`admin_reveal_field` 的 opaque `row_token` 形態，canonical hash 綁逐字 token；**兩形態 hash 刻意不互通**，receipt 不得跨形態重用），post-gate 邏輯抽成 `admin_internal_reveal_field_with_key` 共用，jsonb 形態對外契約（hash／denial 碼與順序／audit 形狀）不變；新增 pgTAP `055`（14 assertions，並以竄改 hash 欄位名實測確認斷言會轉紅）。Edge 側 `admin-command` 改為 exactly one-of 定址、只轉送進過 canonical hash 的欄位（未 hash 的 args 到不了 RPC）、DB denial envelope 原樣轉送（code／message／request_id／retryable），畸形或半截 envelope 一律 fail closed；`SECURITY_AUDIT_UNAVAILABLE` 改為完整 envelope 並帶 correlation-only 的 request_id。政策與正規化抽到 `_shared/command-policies.ts`（`Deno.serve` 讓 index.ts 無法被單元測試 import）。
- 下一步：等 owner 對下方 blocker 裁定後補 `admin-reconcile` 的人工重試模式與真實雙 worker 併發驗證；之後才進 Stage 3（前端）與 Task 13A 唯一一次 review。Task 14 仍未開始。
- Blocker／待決策：**13A-2 的一次性人工重試目前是空轉的**。`svc_admin_claim_manual_retry` 拿得到 claim（實測回 `ok`, current_step 1），但 `svc_admin_complete_reset_step2/step3` 以 `state` 判斷（分別要求 `step1_complete`／`step2_complete`），而 `svc_admin_mark_operation_stuck` 已把 `state` 覆寫成 `stuck` → 兩者都回 `SECURITY_OPERATION_PENDING`，操作永遠停在 stuck，授權被消耗卻推不動任何東西。需 owner 決定續跑機制（見該次 checkpoint 回報的三個選項），不得靜默重寫已提交的 migration。另：`tests/contracts/phase1-admin-catalog.test.ts`（Task 4 遺留，owner 指示不得為全域綠燈修改）與 `supabase/tests/051` test 9 皆為**既有**失敗；051 test 9 的根因是 seed 從未建立任何 classroom，使該條「`join_code` 不得出現在 projection」的安全斷言一直空轉（已實測底層無洩漏），本次未修改 051。
- 相關檔案／commit：`ca4d5ab`；`supabase/migrations/20260809000400_admin_reveal_row_token.sql`、`supabase/tests/055_admin_reveal_row_token.test.sql`、`supabase/functions/_shared/{command-policies,denial-envelope,edge-denial}.ts`、`supabase/functions/admin-command/index.ts`、`tests/contracts/phase1-admin-{command-locator,edge-denial}.test.ts`。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-18 20:55 [Claude Code] — Phase 1 Task 13A Stage 2 完成:人工重試憑證化,Edge 兩支都接完

- 做了什麼：owner 裁定選項 c 後新增 `20260809000500`：`svc_admin_claim_manual_retry` 成功時由 DB 簽發一次性 claim token，`svc_admin_complete_reset_step2/step3` 增加接受憑證的形態（只有 `state='stuck'` 且憑證相符才接受 stuck，成功即作廢）；排程形態語意逐字不變；claim 另要求 `operation_type='reset_admin_mfa'`。`admin-reconcile` 新增「已授權 stuck」掃描：claim → 依 `current_step` 兌現 step2/step3，不經 touch（那是自動退避迴圈的記帳）。新增 pgTAP `056`（15 assertions）與 `tests/integration/admin-manual-retry-claim.integration.test.ts`（**兩個真實並行 client** 對 24 筆 operation 各發 48 個同時請求；竄改掉 one-shot 謂詞後測試確實轉紅）。新欄位登記為 `forbidden` 並重新產生 catalog——順帶修好先前因 spec 修訂而一直失敗的 `ADMIN_CATALOG_DRIFT`（generator 把整份 spec 的 sha256 寫進 `source_sha256`）。
- 下一步：Stage 3（前端）：list 每列的 `row_key` 要當作命令參數 `row_token` 送出（Edge 刻意不做這個改名，以免變成「Edge 改寫定址」）、7 張複合主鍵表接上 detail/reveal、消費 `next_cursor`、呈現 `request_id`/`retryable`。之後才是 Task 13A 唯一一次 review。Task 14 仍未開始。
- Blocker／待決策：無。既有失敗兩項（皆非本次造成）：`supabase/tests/051` test 9 根因是 seed 從未建立 classroom，使該條安全斷言一直空轉（已實測底層無洩漏），未修改 051；`eslint` 在 `scripts/admin/*.mjs` 與 `tests/contracts/phase1-admin-catalog.test.ts` 的 21 條錯誤，owner 指示不得為全域綠燈修改。另 `admin-mfa/index.ts` 仍在壓縮 denial envelope（6 處），不在 Stage 2 範圍。
- 相關檔案／commit：`ca4d5ab`（reveal row token + envelope 接線）、`81db200`（claim token）。驗證：pgTAP 56 檔 1426 assertions（僅既有 051 test 9 失敗）、`vitest run` 1163/1163、`tsc -b` 0、catalog check/inventory 皆綠、真實併發整合測試綠。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-18 23:50 [Claude Code] — Phase 1 Task 13A Stage 3（前端）完成；三項遺留依核准處理

- 做了什麼：前端改以 server 簽發的 opaque row token 定址——列表的明細連結與 reveal 都走 `row.row_key`，detail 頁**移除前端解碼**（原本自己 base64url + JSON.parse 再送 `p_row_key` jsonb），改為原樣送 `p_row_token`，只保留字元集檢查（不解碼）；`row_key` 明確排除在表格欄位之外（它是導覽 token 不是資料）。7 張複合主鍵表因此首次可進明細與 reveal。`AdminRevealDialog` 的 `rowId` prop 改成 discriminated union `locator`，呼叫端不可能同時給兩種定址。denial 顯示 `request_id`，並只在 `retryable === true` 時提供重試入口（第一頁與 detail 頁都比照先前的後續頁行為）。`next_cursor` 消費在 Task 13 就已預先寫好，本次只更新過時註解。三項遺留（owner 2026-08-18 核准）：051 test 9 補上真實 classroom fixture（原本盯著空表，永遠抓不到洩漏；已實測底層無洩漏）並加驗 `join_code_hash`，plan 28→30；`admin-mfa` 7 處改用共用 envelope；21 條 Task 4 遺留 lint 錯誤登記為 `docs/known-issues.md` 的 KI-001（含解除條件）。
- 下一步：Task 13A 的**唯一一次 review**（三層都完成了，可以跑）。之後 Task 14（E2E、三視口、a11y gate、local fixtures）→ Task 15（OOB runbook、smoke manifest、phase gate contract test）→ Phase 1 gate。
- Blocker／待決策：無。**未能驗證的一項**：Edge function 的端到端 HTTP 呼叫。本機 stack 的 `supabase_edge_runtime_colorplay` 容器從未被建立（Kong 已跑 7 天、`supabase start` 後仍列為 stopped），打 `/functions/v1/admin-command` 得到 Kong 的 `name resolution failed`。這是**既有**環境狀態、非本次改動造成；Edge 改動目前由 contract test（22 條）、pgTAP RPC 契約、PostgREST overload 解析實測與 Edge↔DB canonical hash parity 覆蓋，真正的端到端留給 Task 14 E2E 或重建 local stack。
- 相關檔案／commit：`c6cdadb`。驗證：pgTAP 56 檔 **1428 全綠**（051 紅燈已消除）、`vitest run` **1168/1168**、`tsc -b` 0、`vite build` 0 且 bundle 無 forbidden 詞（含新 `manual_retry_claim_token`）、catalog check/inventory 綠、真實併發整合測試綠、`eslint` 僅剩 KI-001 的 21 條。竄改驗證：移除 `row_key` 排除 → 對應測試轉紅後還原。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-19 15:00 [Claude Code] — Phase 1 Task 13A 唯一一次 review 完成並修復;所有已核准範圍收斂

- 做了什麼：以 `codex exec -s read-only` 對 `10bf6aa..HEAD`（32 檔、+3151/-339）做唯一一次 review。7 條回報逐條讀碼＋實測驗證（不照單全收）：1 條（自動迴圈恢復）以真實呼叫序列推翻為誤判（`attempt_count` 單調遞增,唯一能進 stuck 的路徑保證 ≥10,下一輪 touch 必再次觸發門檻,不修）；其餘 6 條確認為真並修復,其中 1 條在驗證另一條時自己發現、比原回報更嚴重：**Postgres `encode(bytea,'base64')` 每 76 字元插入換行,row token／cursor 簽發端從未移除,decode 端重算 padding 時被換行誤導,超過 76 base64 字元的 payload 一律解碼失敗**——binding 欄位本身就是 64 hex 字元,幾乎所有 cursor 與雙欄以上複合主鍵 row token 都會中招。這代表上一份 checkpoint 宣稱「7 張複合主鍵表首次可用」是錯的,我當時只驗證過短字串／單一 `id`,從未撞到門檻;`classroom_members` 真實 token 實測 `DETAIL_OUTCOME=denied`。集中修在共用的 `admin_internal_base64url_encode`。另一條升級為 Critical:一次性重試憑證只證明「授權」,不證明 step2（刪除舊 TOTP factor）真的跑過——`current_step=1` 時直接帶憑證打 step3 會成功把 operation 標 completed、identity 推進 `active_pending_mfa`,但舊 factor 從未被刪,等同讓已核准的 MFA 重設悄悄失效（已用真實呼叫序列證實可繞過）。修法:step3 追加 `current_step >= 2`。其餘 4 條 Medium:keyset 比較鍵改用排序欄原生型別＋NULLS LAST 感知（原本一律 `::text`,對 `sort_order` 等整數欄與可為 NULL 的排序欄都會壞）；list binding 改用 `to_json()` 逐欄包裝取代裸字串串接（消除跨 filter 碰撞）；`p_filters` 非 object 時先 typed deny（原本裸例外繞過 audit/counter）；Edge 的 `readDenialEnvelope` 加已知碼 allowlist（版本漂移防線）；denial envelope 的 `request_id` 改回傳 `admin_audit_events.request_id` 欄位而非稽核列主鍵 `id`（舊 054 斷言把這個錯誤行為當正確在測,已一併修正）。全部 8 項（含新發現）都補了永久 pgTAP／contract test 回歸測試,且對最高風險兩項（step3 current_step、換行修復）額外做竄改測試證明是真守門員（拿掉修復 → 對應測試轉紅 → 還原）。
- 下一步：Task 13A 全部完成、唯一一次 review 已跑完並修復。可以進 **Task 14**（E2E 旅程、三視口、a11y gate、local fixtures）→ Task 15（OOB runbook、smoke manifest、phase gate contract test）→ Phase 1 gate 驗收。
- Blocker／待決策：無。既有環境限制未變:local `supabase_edge_runtime_colorplay` 容器仍未建立,Edge 端到端 HTTP 呼叫留給 Task 14 E2E 或重建 local stack。
- 相關檔案／commit：`59f50ef`。驗證:pgTAP **57 檔 1445 全綠**、`vitest run` **1169/1169**、`tsc -b` 0、catalog check/inventory 綠、`eslint` 僅剩 KI-001 的 21 條。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-19 15:52 [Claude Code] — Task 14 完成:admin E2E 旅程 + 三視口 gate;過程中修好一個真實 CSS bug 與本機 edge runtime

- 做了什麼：`tests/e2e/helpers/admin.ts`(signInAdmin/enrollAdminTotp/challengeAdmin)、`tests/e2e/admin-security.spec.ts`(7 條旅程斷言:enroll→challenge→browser 遮罩→reveal→audit 無匯出→secondary 撤銷 primary 後 challenge/returnTo→非 admin 進 /admin 被擋)、`tests/e2e/admin-viewports.spec.ts`(1280×720/812×375/375×812 三視口:MENU drawer、無水平捲動、44px 觸控目標、role=status、focus restore)。過程中確認並偏離 plan 裡兩處已過時的細節,均為判斷後的必要調整(非規格衝突):①`seed.sql` 從不寫 `auth.users`,實際帳號建立在 `scripts/supabase/seed-auth.ts` 的 allowlist——改成那裡加 `adminPrimary`/`adminSecondary`,並用獨立的 `reconcileAdminBootstrapFixtures` 呼叫 `svc_admin_bootstrap_identity`(role 提升唯一入口不變,只是搬到正確位置);②app 用 `sessionStorage`(owner 要求關分頁即登出)讓 Playwright 的 storageState 機制完全幫不上忙,兩個 spec 檔之間無法共用登入態——TOTP secret 只在 enrollment 當下出現一次,靠 `test-results/`(已 gitignore)底下的暫存檔跨檔傳遞;因子只能綁一次,兩個新 spec 都比照 `login.spec.ts` 加進 `playwright.config.ts` 的 chromium-only allowlist,並同步更新 `tests/contracts/evidence-manifest.test.ts` 釘死的 testIgnore 陣列斷言。**跑真實旅程時抓到一個真實產品 bug,不是測試寫錯**:`.admin-shell__nav{display:flex}` 完全沒有 media query 或 `[hidden]` 對應規則,窄視口下 MENU drawer 的 `hidden` attribute 被 CSS 蓋掉,nav 視覺上從未真正收合過——已加 `.admin-shell__nav[hidden]{display:none}` 修好,是 875x812/812x375 視口測試親自抓到的。另外把本機 `supabase_edge_runtime_colorplay` 容器（Task 13A 結尾時仍未建立、只能靠 contract test 涵蓋）用 `supabase stop && supabase start` 重建起來了——這對這台機器的本機環境是持久性修復,但 auth.users 會在 stop/start 循環中被清空,需要重新跑 seed-auth.ts。
- 下一步：Task 14 完成,可以進 **Task 15**(OOB runbook、Production smoke manifest、phase gate contract test)。Task 14 尚未經過單一 review(比照 M 級任務,一位 reviewer 一次往返),等 owner 指示時機。
- Blocker／待決策：無。
- 相關檔案／commit：`1d9860e`。驗證:admin E2E 兩個 spec 5/5 全綠(chromium;竄改前這兩個 spec 曾真實失敗過兩次,原因分別是我的測試寫錯——filter 在 reload 後未持久、需重新套用——以及上述真實 CSS bug,兩者都已修復並重跑確認);全套 E2E(3 browser)跑過一次比對前後失敗清單,**0 差異**(60 passed/27 failed/4 skipped,失敗集合與修復前完全相同,均為既有、與本次無關的 phase-gate acceptance-mode 需求);`vitest run` **1169/1169**;`tsc -b` 0;`eslint` 僅剩 KI-001 的 21 條;`prettier --check` 綠。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-19 19:44 [Claude Code] — Task 14 唯一一次 review 完成並經兩輪修復收斂;owner 明確要求第二輪確認修復不含新問題

- 做了什麼：owner 核准跑 review 後,以 `codex exec -s read-only` 對 `38fedca..1d9860e` 做 round 1(5 條回報,1 Critical/1 High/2 Medium/1 Low)。逐條讀碼＋實測驗證,全部確認為真(無誤判)：**Critical**——`scripts/supabase/seed-auth.ts` 把 `adminPrimary`/`adminSecondary` 無條件排進一般 fixture 迴圈並無條件 bootstrap,而 `local-environment.ts` 的 `readLocalAdminEnvironment` 對 `SEED_REMOTE_CONFIRM` 開了遠端 URL 例外(供其餘 22 個 demo fixture 用)——等於 hosted rebuild 若帶這個 flag,會建立已知密碼、可自助 TOTP enrollment 的 admin 帳號,違反 spec §12 的 local-only 邊界。**High**——`reconcileProfileRole` 對這兩個 label 每次都寫 `role='teacher'`,而 `svc_admin_bootstrap_identity` 的冪等短路(已有 identity 就直接回 `{outcome:'ok',idempotent:true}`)不會重跑 `update profiles set role='admin'`(已讀 migration 20260808000600 逐行確認),第二次執行 seed-auth.ts 會把兩個 admin fixture 悄悄打回 teacher。**Medium×2**——admin-security/admin-viewports 兩個 spec 檔的執行順序只靠檔名字母序巧合,無真正機制保證;viewport 觸控目標 gate 只測過 MENU 和 reveal 按鈕,從沒測過任何 command control(如撤銷 session,plan 裡 `admin-command-dialog.tsx` 明確要求 44px)。**Low**——稽核斷言用 `.first()` 認 `admin_reveal_field`,沒綁定到這次揭露,舊資料存在時會假綠燈。全部修復並跑真實驗證(commit `e90ee63`):`local-environment.ts` 新增 `isStrictlyLocalAdminUrl`(嚴格 loopback、不吃 `SEED_REMOTE_CONFIRM`),`seed-auth.ts` 在非嚴格 local 時整段排除兩個 admin label;`reconcileProfileRole` 對這兩個 label 完全跳過 role 欄位,role 交還 `svc_admin_bootstrap_identity` 獨佔——**用真的 db reset + 連跑兩次 seed-auth.ts 實測**,兩次都停在 `role='admin'`;Playwright 新增 `chromium-admin-security`/`chromium-admin-viewports` 兩個 project 並用 `dependencies` 明確表達順序(同步更新 `evidence-manifest.test.ts` 釘死的 project 陣列斷言);viewport spec 補測撤銷按鈕 44px(用取消關閉,不真的送出);稽核斷言改用本次 reveal 的 purpose 文字鎖定那一列。owner 接著明確要求跑第二輪 review 確認修復本身沒引入新問題(非預設流程,owner 主動加碼)。round 2 對 `1d9860e..e90ee63` 又發現 2 條:**Critical**——排除只擋「這次」建立/提升,若 hosted project 曾被舊版腳本 seed 過,已知密碼的 admin 帳號早已存在,新版腳本卻只印 warning 就成功結束,給操作者假的安全感;**Low**——`REVEAL_PURPOSE` 仍是固定字串,`admin_query_audit` 預設查最近 7 天最新 50 筆,本機不 reset 重跑會撞到舊列讓斷言假綠燈。兩條都修(commit `6ab759d`):新增 `findPresentAdminFixtureEmails`(獨立可測的 pure function,配 3 條 unit test)在非 local URL 偵測到既有 admin fixture email 就 fail closed(`ADMIN_FIXTURE_PRESENT_ON_NON_LOCAL_URL`),不靜默繼續、也不自動刪除(清除已污染帳號需要 owner-approved 的 OOB runbook,不是一般 seed 腳本該做的事);`REVEAL_PURPOSE` 加 `randomUUID()` 尾碼。round 2 同時確認 round 1 的 Finding 2–4 修法正確、無新引入的 trust-boundary 違規。
- 下一步：Task 14 兩輪 review 都已跑完並收斂,無殘留發現。可以進 **Task 15**(OOB runbook、Production smoke manifest、phase gate contract test)→ Phase 1 gate 驗收。
- Blocker／待決策：無。
- 相關檔案／commit：`e90ee63`(round 1 修復)、`6ab759d`(round 2 修復)。驗證:兩輪修復後都各自重跑 admin E2E 兩個 spec(經 `chromium-admin-security`→`chromium-admin-viewports` 的 project dependency 排序)5/5 全綠;round 2 前後各做一次真的 `supabase db reset --local` + 兩次連續 `seed-auth.ts`(驗證 role 冪等不被打回 teacher);`vitest run` 最終 **160 檔/1180 條全綠**(新增 3 條,含新 pure function 的 unit test);`tsc -b` 0;`eslint`/`prettier --check` 在所有變更檔案皆綠(既有 KI-001 21 條不受影響)。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-19 21:40 [Claude Code] — Task 15 完成:OOB runbook、Production smoke manifest、phase gate contract test;KI-001 解除;phase gate 自己的 test:db 抓到一個真實 pgTAP bug 並修復

- 做了什麼：`docs/runbooks/phase1-admin-oob-recovery.md`——三個 owner-only 程序(首位 Admin bootstrap、last-Admin factor 事故/遺失、合法 principal tombstone),每個都含前置驗證/操作/事後驗證/audit 確認,每一條 SQL 都對照實際 migration 原始碼寫(不是照抄 plan 的敘述文字)：確認 `svc_admin_bootstrap_identity`／`svc_admin_isolate_factor_incident_oob`／`svc_admin_complete_oob_recovery`／`svc_admin_tombstone_principal` 四支函式的完整 body 後才動筆。`docs/deployment/phase1-production-smoke-manifest.md`——定義 Phase 1 Admin smoke 的「唯讀」邊界與六張控制面表各自允許的寫入範圍、命令探測範圍(僅 `revoke_admin_session` 打自己的 session)、明文禁止清單。`tests/contracts/phase1-admin-gate.test.ts`——釘住兩份文件的必要內容,並對 smoke manifest 的允許寫入區段做 mutation test(手動塞一個 domain table 名稱進去、確認測試真的轉紅、再還原)證明不是空殼斷言。`docs/roadmap-colorplay-next.md` Phase 1 狀態改成 in-progress 並補上這個 worktree 的保護條目。**owner 在這個 phase gate 時點裁定解除 KI-001**(選項 1:獨立 S 級任務修掉):兩支 `.mjs` 比照 repo 其餘腳本既有寫法補 `import process from 'node:process'`／`import console from 'node:console'`,contract test 把 `JSON.parse` 結果標型別、`=== false` 改 `!x`;`pnpm lint` 現在真的全綠。**Step 5 全量驗證跑出一個真實回歸**:`pnpm test:db` 在 `051_admin_safe_browser.test.sql` test 9 炸掉(have 3 want 1)——這條斷言原本假設「seed 從未建立任何 classroom」,但 `test:db` 本來就會在跑 pgTAP 之前執行 `seed-auth.ts`,其中 `reconcileClassroomFixtures` 早就建立了 2 筆 classroom fixture(獨立、已提交的 transaction,對這個測試的 transaction 可見),原本靠 `rows -> 0` 假設自己插入的那筆一定排第一位也不成立(排序欄是 `updated_at`,新插入的常常排最後)。試過用 `id` 過濾鎖定自己那一筆,但 catalog 裡 `classrooms.id` 是 `filterable:false`,過濾直接被拒(`COLUMN_NOT_ALLOWED`,`rows` 鍵不存在,`jsonb_array_length` 回 NULL)——改成用這筆班級唯一的 `name` 在回傳陣列裡精確定位,斷言只鎖定這一筆,不受環境裡還有幾個其他班級影響(同 057 的 pollution-agnostic 作法)。
- 下一步：Task 15 完成、Phase 1 全部 15 個 task 實作完畢。**尚未經過單一 review**(比照 M 級任務規則),等 owner 指示時機。Review 跑完並收斂後才是 Phase 1 gate 驗收(第 12 節定義的里程碑層級,含 RLS 負向測試與完整證據,尚未執行)。
- Blocker／待決策：無。**已知、非本次造成、與 admin 無關的既有 flake**:全套本機 E2E(`scripts/test-e2e-local.sh`)裡 `playable-slice.spec.ts`／`quiz-runner.spec.ts` 在 firefox／webkit 偶發一個網路請求次數斷言失敗(`Expected: Array [] / Received: 額外一次 quiz_templates fetch`),兩次乾淨全量重跑各自出現在不同瀏覽器/測試組合、且都不是 admin 相關檔案——確認是既有、與本次 diff 無關的既有不穩定,roadmap 本身也把 Firefox/WebKit 驗收劃在 Staging gate 而非每次本機/task 執行。
- 相關檔案／commit：`31d89a0`(KI-001 解除)、`fab4b9e`(Task 15 主體 + 051 修復)。驗證:`pnpm lint`/`pnpm typecheck`/`pnpm test`(161 檔/1183 條)全綠;`supabase db reset` + `pnpm test:db`(58 個 pgTAP 檔/1448 assertions,兩組 integration 測試)全綠;`admin:catalog:check`/`admin:catalog:inventory` 綠;本機 E2E 兩次乾淨全量重跑,admin 相關 spec(`chromium-admin-security`/`chromium-admin-viewports`)0 失敗,唯一失敗集合是上述已知、非 admin 的 webkit/firefox flake。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-19 22:03 [Claude Code] — Task 15 唯一一次 review 完成並修復收斂;Phase 1 全部 15 個 task 實作＋review 皆完成

- 做了什麼：以 `codex exec -s read-only` 對 `096f795..HEAD` 做唯一一次 review。7 條回報(2 High、4 Medium、1 Low,無 Critical),逐條讀碼驗證後**全部確認為真**,無誤判:**High×2**——smoke manifest 的允許寫入清單漏列 `admin_security_identities`(`svc_admin_record_totp_outcome` 在每次 TOTP challenge 都會寫這張表,是任何 smoke run 第一步就必然發生的寫入,原本會讓正常 smoke run 自己踩到自己定義的 gate failure);「Explicitly prohibited」段落的但書語言("for any purpose other than..."、"except the smoke run's own...")反而**授權**了 plan 明禁的行為(揭露真人個資、改動自己身分的 lifecycle state)。兩條都改成無例外的絕對禁止,並補齊 `admin_security_identities` 的允許寫入說明與 `revoke_admin_session` 真正的 `revoke_reason='revoked_by_admin'`。**Medium×4**——runbook 原本要求「每個程序都必須有 audit row」這條通用規則,對冪等重試是錯的(四支 OOB 函式的冪等分支都在寫 audit 前就 return);Procedure 2b 對「非 recovery_pending 時的行為」籠統寫成一律 deny,實際上 `active_pending_mfa` 時是回 idempotent ok,只有其他狀態才 deny——兩處都修正並補充冪等情境的說明。KI-001 的 `!r.export` 不是 behavior-preserving:任何 falsy 非 boolean 值(null/0/''/undefined)都會被誤判通過,改成把型別標 `unknown` 而非 `boolean`,讓 `r.export === false` 恢復原本嚴格語意又不觸發原本那條 eslint 規則。`phase1-admin-gate.test.ts` 補了兩條新斷言,分別鎖定上面兩個 High 發現對應的具體修復內容(不是關鍵字存在,是無例外用語存在),避免同類回歸再次滑過 gate test。roadmap 的 worktree 條目誤把 diff base SHA(`096f795`,Task 15 之前)當成「HEAD at verification」,與同一段「Tasks 0–15 已實作並 review」的宣稱矛盾,已修正為實際驗證後的 HEAD。**Low×1**——051 的兩條 forbidden-column 斷言原本用 `not exists(...)`,如果班級列本身在投影裡缺席也會 vacuously true(靠前一條 existence 斷言擋,不是自己抓到);改成 `exists(列存在 AND 沒有該欄)`,並用竄改測試證實:把查詢名稱改成不存在的字串、確認斷言真的轉紅,再還原。
- 下一步：Phase 1 全部 15 個 task 的實作與(適用的)review 都已完成收斂。**下一步是 Phase 1 gate 驗收**(AGENTS.md 第 12 節定義的里程碑層級:RLS 負向測試、完整證據 manifest、真實 browser/viewport 證據,尚未執行),等 owner 指示時機與範圍。
- Blocker／待決策：無。
- 相關檔案／commit：`693587b`(review 修復)、`b78522c`(roadmap SHA 修正)。驗證:`pnpm lint`/`pnpm typecheck`/`pnpm test`(161 檔/1185 條,新增 2 條)全綠;`supabase db reset` + `pnpm test:db`(58 個 pgTAP 檔/1448 assertions,兩組 integration 測試)全綠;`admin:catalog:check`/`admin:catalog:inventory` 綠;051 的竄改測試確認新斷言是真守門員(拿掉修復 → 轉紅 → 還原)。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-19 23:31 [Claude Code] — Phase 1 Local gate 通過並記錄;Staging/Production gate 明確標記為卡在 Phase 0、非本次範圍

- 做了什麼：owner 裁定「Phase 1 gate 驗收」的範圍是 Local gate(計畫書 Task 15 Step 4 自己定義的三層 gate 之一;Staging/Production 兩層依計畫書原文卡在「Phase 0 hosted readiness + owner 授權」,非 Phase 1 本身能推進)。查核 RLS 負向測試涵蓋率時發現 `admin_sensitivity_catalog` 只驗過 `authenticated` SELECT 一格(其餘 9 張 admin 表都有完整 anon/authenticated × SELECT/INSERT/UPDATE/DELETE 8 格 default-deny 矩陣,獨獨這張只有 1/8),補齊剩下 7 格,plan(6)→plan(13)。跑一次乾淨、單一時間點的完整驗證(取代散落在整個 session 各階段的個別驗證數字,作為 gate 記錄的單一證據來源):`pnpm lint`/`typecheck`/`test`(161 檔/1185 條)、`supabase db reset` + `pnpm test:db`(58 pgTAP 檔/**1455** assertions,含新補的 7 格、兩組 integration 測試)、`admin:catalog:check`/`inventory`、`scripts/test-e2e-local.sh` 三瀏覽器全套(61 passed/4 skipped/**2 unexpected**,僅剩已知、與 admin 完全無關的 webkit quiz 網路請求次數 flake,admin 相關 spec 0 失敗)全部綠燈。彙整整個 Phase 1 session 裡所有 review 輪次(13A、14 兩輪、15)的 Critical/High 發現,確認全部已修復並重新驗證過,無未解項目。`docs/roadmap-colorplay-next.md` 的 Phase 1 狀態列改成「**Local gate PASSED**」,worktree 條目補上完整證據清單與明確的 Staging/Production 卡關說明(不是「還沒做」,是「依計畫書自己的定義,現在做不了」)。
- 下一步：Phase 1 **Local gate 已通過**。Staging/Production gate 需要 Phase 0 先過 owner 對 PR #1 的核准、staging 分支合併,以及對 hosted 環境操作的明確授權才能推進——這不是 Phase 1 worktree 能單獨解決的,等 owner 對 Phase 0 的下一步裁定。
- Blocker／待決策：Staging/Production gate 卡在 Phase 0(PR #1 仍待 owner 核准)+ 任何 hosted 操作都需要明確授權,非本次工作範圍。
- 相關檔案／commit：`0e6c4e6`(RLS 矩陣補齊)、`f16312e`(roadmap gate 記錄)。驗證細節見上方。分支 `phase1/admin-security-impl` 仍為純本地（無 upstream）。

## 2026-08-26 20:25 [Claude Code] — 文件/規格現況稽核 + Phase 1 合併進 feature/v2-major-update

- 做了什麼：Owner 要求先整理散亂的文件/規格現況（超過一週的多分支平行開發，docs 與實際分支狀態脫節），稽核後發現：`docs/handoff.md` 停在 8/11 未更新（8/19 前的 Phase 1 完工紀錄只存在 `phase1-admin-security-impl` worktree 自己的副本）、`docs/roadmap-colorplay-next.md` 有兩份互相矛盾的分岔版本、ADR-0002 與實際手動 Staging 部署不符、Phase 5F-U1／Phase 6 的 roadmap 文字落後於實際分支狀態。Owner 裁定先合併已完工的 Phase 1（Local gate 已通過、15/15 task 完成，晾了一週未合併），再處理 PR #1（Phase 0）。
  在 `.claude/worktrees/integration-phase1-merge`（新建 worktree，base 為 `feature/v2-major-update` tip `8da1abb`）合併 `phase1/admin-security-impl`（tip `3f0f16d`，與 trunk 分岔點 `2295fd6`，trunk 一側已領先 93 個 commit）。Git 自動合併之外，手動解決 4 個需要理解語意才能正確合併的衝突：
  - `src/app/shell/app-shell.tsx`：Phase 1 加的 `isAdmin` 判斷（避免管理員落入學生 HUD 分支）與 trunk 後續的 `AuthenticatedStudentShell`／learning-map 改版互相不知道對方存在。除了 git 標記的衝突區塊，另外修正兩處 **git 沒標記成衝突、但邏輯上必須一起改**的外層路由條件（學生分支排除 admin、共用 `<main>` 區塊要讓 admin 也能用到），否則管理員登入仍會被誤導向學生介面。
  - `src/types/database.ts`（Supabase 產生的型別檔）：兩側各自新增的 RPC 型別因為字母排序緊鄰而衝突，合併時逐一比對 `git show <branch>:...` 確認雙方簽章後聯集保留。
  - `src/features/learning/api/mastery-repository.test.ts`：add/add 衝突，確認兩份測試檢查同一支已存在的 `MasteryError` 實作（非二選一），合併成兩個 `describe` 區塊並存。
  - `docs/staging-runbook.md`、`docs/roadmap-colorplay-next.md`、`docs/handoff.md`：三份文件各自分岔，逐段比對後合併（roadmap 的 Phase 0/1 狀態列改用較新且與內文一致的版本；handoff 純接續，因為 trunk 段落在 8/11 結束、phase1 段落從 8/18 開始，時間軸本來就不重疊）。
  合併提交 `5932ef4`。
- 驗證發現的真實問題（非猜測，皆已查證根因）：`pnpm test` 首次跑出 3 個失敗（`app-shell.test.tsx` 兩處 `role="status"` 查詢因為 Phase 1 新增的 `EnvironmentMarker` 在測試檔內被強制 mock 成常駐顯示而變得模糊；`tests/contracts/phase0-documentation.test.ts`——Phase 1 新增的文件治理測試——揪出 `docs/staging-runbook.md` 裡「Phase 9-AUTH」歷史段落本身違反同一份文件開頭就寫明的禁止事項：明文 `git push HEAD:main`、寫死的 `LocalOnly-*` 測試密碼、`sbp_` token 佔位字串、加寬版 Auth redirect 萬用字元）。`pnpm test:db` 跑出 5 個 pgTAP 檔失敗（`003`／`025`／`036`／`047`／`048`），逐一查證後全部是同一類根因：兩條分支各自成長了數週的真實內容（章節、題目、複習卡）疊在一起後，讓舊測試裡寫死的數量假設（如「45 題」「180 個選項」「章節 1 只有 1 題」）或命名空間假設（`stable_code = '1-1-01'` 撞到真實種子內容）失真或互撞——不是我這次合併邏輯寫錯，是兩條線各自往前跑太久、互不知道對方進度的必然結果（跟 owner 稍早裁定要收斂的「文件與現況脫節」是同一類問題）。`047`／`048` 兩檔另外牽涉到新的 sequential chapter access 功能對「章節內容量門檻」「章節整體 mastery 而非單題正確率」的真實業務規則，修法時改成動態查詢當下真實內容量（而非重新硬編一個新的固定數字），比照這次其他修正的原則，讓測試不會在下次內容量再變動時又假紅。修復後全部驗證：`pnpm lint`／`pnpm typecheck` 全綠；`pnpm test` 1335/1336（唯一剩餘失敗 `tests/contracts/phase0-restore.test.ts` 查證為本機 Docker 資源競爭——這台機器同時有多組 Supabase 容器在跑，與本次修改內容無關，非本次程式或測試邏輯問題）；`pnpm test:db` 全綠（60 檔／1506 pgTAP assertions + 2 組 integration 測試全過）。修復提交 `02cb875`。
- 下一步：push `worktree-integration-phase1-merge` 分支到 `origin/feature/v2-major-update`，讓遠端反映合併後狀態。接著依 owner 裁定順序進入下一階段：處理 PR #1（Phase 0 環境基礎，已卡 20 天待 owner 核准），以及後續環境重新基準化（ADR、environment registry）。
- Blocker／待決策：`tests/contracts/phase0-restore.test.ts` 因本機多組 Supabase Docker 容器並存而無法在此環境穩定驗證，需要在乾淨、單一 Supabase 實例的環境重跑確認；不屬於本次合併範圍，未動測試邏輯本身。
- 相關檔案／commit：`5932ef4`（Phase 1 合併）、`02cb875`（pgTAP／文件治理修復）。

## 2026-08-26 22:38 [Claude Code] — 目錄結構稽核 + .gitignore 修復 + live-repository.ts 拆檔

- 做了什麼：延續上一筆合併後，owner 要求重新檢視整個 repo 的目錄結構是否符合 AGENTS.md §6。稽核（主 checkout，非本 worktree，因為 worktree 不含未追蹤檔案）發現兩個高風險缺口：`.worktrees/`（11GB）與 `.claude/worktrees/`（1.5GB）——每個平行 phase 分支的完整 git worktree checkout——完全沒被 `.gitignore` 擋住，任何一次 `git add -A` 都可能把 12.5GB 塞進這個分支；`artifacts/design-audit/`（120MB，數十個未追蹤的 UI 比對截圖批次）同樣沒被擋住，違反 AGENTS.md 第 8 節「截圖只做路徑紀錄，不進版控」的規則（`artifacts/acceptance/`、`artifacts/content/` 已經有擋，這個資料夾單純被漏掉）。另外發現 `live-v2/`（owner 認定的舊設計參考、要求不上傳）裡有 11 個檔案其實已經被正式 `git add` 收進版控，`git rm --cached` 解除追蹤（檔案仍留在磁碟）；`ref_image/` 經比對確認是 `public/assets/blooks/` 正式縮圖的原始高畫質母檔（非孤兒檔案，仍有保留價值），改名為 `blook-art-originals/` 並加入 `.gitignore`；`docs/roadmap-live-classroom.md`（2026-07-21/25 的舊 Live 課堂升級快照，內容含「現有 45 題」等已過時數字）在檔案開頭加註「已被 `docs/roadmap-colorplay-next.md` 取代」，內容保留作歷史紀錄，未刪除。同時修復 `src/features/live/api/live-repository.ts`（654 行，超過 AGENTS.md §6 的 500 行上限），依既有職責邊界拆成 `live-repository.ts`（RPC 邏輯）／`live-repository-schemas.ts`（Zod 契約）／`live-repository-errors.ts`（錯誤碼對照＋parse helper）／`live-repository-mappers.ts`（欄位轉換），對外 API 不變，16 個既有單元測試全數不修改直接通過。
- 下一步：Owner 要把本次（含上一筆 Phase 1 合併）在本 worktree 累積的全部 commit 推上 GitHub。**推送本身技術上安全**——已逐一核對 `.github/workflows/*.yml`，六個 workflow 沒有任何一個會被 `push` 到 `feature/v2-major-update` 觸發（`ci.yml`／`staging-deploy.yml` 只認 `staging` 分支的 PR 或 push；其餘皆為 `workflow_dispatch`／排程），不會意外跑 CI 或部署。真正的風險是**協作同步**：origin 上的 `feature/v2-major-update` 落後本機 139+ 個 commit（含這次全部工作），若 Codex 目前正對著舊版遠端做事，這次 push 完後它下次接手前必須先 `git fetch` 再接續，否則會依據過時狀態重複勞動或衝突。此為人工協調事項，不是本 session 能自行查證或代為通知的範圍。建議順序：① owner 在主 checkout 執行 `git merge worktree-integration-phase1-merge`（已在前一筆記錄）；② 確認目前沒有 Codex session 正在本分支進行中的工作；③ push；④ 下次啟動 Codex 前，先請它 `git fetch` 對齊。push 完成後的下一階段工作：PR #1（Phase 0 環境基礎，已卡 20+ 天待 owner 核准）＋環境重新基準化（ADR-0007、environment registry，第一次討論見本 session 開頭）。
- Blocker／待決策：Codex 端目前是否有進行中、尚未提交的工作，只有 owner 能確認，本 session 無法查證。
- 相關檔案／commit：`1d2f04d`（清雜物＋gitignore 首輪）、`4b765f4`（live-repository 拆檔）、`8538f8e`（roadmap 標記＋blook-art-originals gitignore）、`6919e29`（worktree／design-audit gitignore＋live-v2 解除追蹤）。

## 2026-08-27 01:35 [Claude Code] — 合併 phase5f/u1-live-presenter-ui，完成本批 5 支分支整合，全量跑過一次 e2e 後發現大範圍舊測試過時

- 做了什麼：延續前一筆 image-perf 合併（`01bd4ee`），合併最後一支候選分支 `phase5f/u1-live-presenter-ui`（草稿／取消畫面文案、確認取消對話框）。此分支在 JRPG／image-perf 把 LivePresenter 拆成 LiveProjectorHud（lobby）／LiveProjectorRound（question／paused／reveal）之前就已分岔，所以它自己的 CountdownRing／StandingsBoard／整塊 inline JSX 已被新架構取代，予以捨棄；但草稿與取消兩個畫面的誠實文案（合併後一度退化成「Live 課堂已結束」通用字樣）是真的漏掉的功能，已補回，取消動作改用與 Hud／Round 一致的 alertdialog 二次確認（不是复原舊版單一 header 兩鍵切換）。`docs/handoff.md` 本身這支分支的三筆記錄（8/10 18:28／18:48／18:59）依實際時間點插入既有時間軸中間，而非整段接續。合併 commit `1d312bc`。
- 合併後跑 Chromium harness（`live-presenter.harness.spec.ts`，量測投影頁在各 viewport 下文字塞不塞得下）發現 27/39 測試失敗——舊測試量的是被淘汰的舊排版，重新對現行 Hud／Round 架構量測並重寫全部斷言（新的字數邊界：optionLength 42 可、43 爆版，非舊版的 37/36），順便抓出並修正一個真正的 production 迴歸：`.live-presenter__viewport-warning`（投影視窗過小警示）的 CSS 還在，但承載它的 JSX 元素在合併衝突解決時被誤刪，小視窗直接顯示空白畫面而非警示。修復＋重寫測試 commit `4001bda`，40/40 通過。
- 第一次對整批合併結果跑完整 `pnpm vitest run`（非 scoped），揪出兩個此前 scoped 測試沒抓到的舊 bug（都源自上一筆 image-perf 合併、非本次 phase5f-u1 新增）：`teacher-login-without-class-code.test.ts` 斷言舊版單行 if 語法字串，實際程式碼因保留 Phase 1 的 admin-via-teacher-portal 例外而改寫成多行條件，行為正確但字串比對過時；`supabase-api-key-migration.test.ts` 斷言 `bootstrap-staging-db.mjs`（image-perf 想復活的腳本）用新版 API key 命名，但該腳本依 2026-08-06 `e57808c` 的刻意退役決策應該維持退役狀態——兩者皆已修正測試本身。commit `083d940`。
- 第一次對整批合併結果跑乾淨的 `pnpm test:db`（真正 db reset，非沿用暖機狀態）也抓出真 bug：`047_chapter_sequence_access.test.sql` 的章節可用性斷言全滅，根因是我自己在 image-perf 合併時把「章節可用所需的 `question_count`」算成全部已發布題目，但 `chapter_content_is_available()` 只算 `bank_kind='chapter'` 的題目（`content_pool_routing.sql` 把 section／chapter／live 題庫分開路由）——章節 1／2 的真實內容全是 `bank_kind='section'`，所以人為灌高的門檻永遠過不了，連本該永遠開放的第一章都被判定鎖住。改成只算 `bank_kind='chapter'` 後修復，順便把另一個寫死的複習卡片數量（5）改成動態查詢真實資料（同一 session 反覆出現的模式：內容量隨分支各自成長，寫死數字必然過時）。commit `14b0f53`；`pnpm test:db` 全綠（73 檔／1659 assertions）。
- 挑一批與本次合併有關的 e2e 檔案（auth／chapter／live／learning-map／shell 共 26 個）用 `bash scripts/test-e2e-local.sh` 跑，過程中先後踩到兩個環境操作錯誤（用了不會載入 Supabase 環境變數的裸 `npx playwright test`；後來雖然用對包裝腳本，但腳本邏輯是「固定跑整個 `tests/e2e` 目錄＋額外參數」而非「只跑指定檔案」，誤跑了全部 634 個測試含未排除的 phase-gate 檔案）——這兩次都已釐清是操作失誤、非程式問題，最後改成自寫小腳本（沿用同一段環境載入邏輯，但直接傳指定檔案給 playwright，不經過會疊加整個目錄的包裝腳本）。過程中也發現並修正一個會讓**整個 `tests/e2e` 目錄測試發現階段直接崩潰**的架構性問題：`learning-experience.spec.ts` 在 module 頂層對內容可用性做 `throw`（chapter-4 目前沒有任何 `bank_kind='chapter'` 題目），但 Playwright 在套用任何 `--grep-invert` 之前就會 import 每個 spec 檔案，一個檔案的頂層 throw 會讓整個目錄的測試清單建立失敗，其餘 4 個同樣寫法的 phase-gate 檔案（achievements／game-economy／classroom-leaderboard／assignments-live）目前條件仍成立而未觸發，已記錄但未動。改成把檢查移進 test body 內，只讓這一個 gated 測試失敗，不再拖垮整個目錄；同時修正 `auth-account.spec.ts` 一個真的 `getByLabel('密碼確認')`（未加 exact）因新增的顯示密碼按鈕 aria-label 含子字串而誤中兩個元素的斷言。commit `47169d3`。
- 縮小範圍（13 個檔案 × 3 browser）實際跑完一次後，113 個測試失敗，錯誤內容分散在：登入後頁面標題文字（如「色彩任務選擇大廳」）已被 JRPG 改版換掉、章節地圖某些空狀態文案對不上、若干 selector 命中舊版 UI 結構等——這是**這次整合之前就存在、從未被驗證過的落差**：JRPG／image-perf 改版合併進來後，這是第一次有人真的完整跑過 e2e，而不是本次 session 造成的新迴歸。已修正其中最明確、風險最低的兩個（見上），其餘 100+ 個逐一定性需要另外排一個專門的 e2e 校正任務，不在本次「合併＋驗證」範圍內硬吃下去。
- 下一步：本批（image-perf ＋ phase5f-u1，含之前已推斷等同、免重複合併的 `phase6/jrpg-generated-board-ui`／`integration/jrpg-student-teacher-20260814`）5 支分支整合到此告一段落，等 owner 看完整合報告核准後才 push。Push 完成後：① Phase 0（PR #1）依原計畫獨立處理；② 上述 100+ 個 e2e 過時斷言排一個獨立任務逐一校正；③ 4 個共用 module-throw 寫法的 phase-gate 檔案建議之後也一併搬進 test body，避免下次踩到同一種目錄級崩潰。
- Blocker／待決策：無阻擋本次合併本身的 blocker；e2e 全量校正的排程與優先順序待 owner 裁定。
- 相關檔案／commit：`1d312bc`（phase5f-u1 合併）、`4001bda`（viewport-warning 修復＋harness spec 重寫）、`083d940`（兩個 image-perf 期契約測試修正）、`14b0f53`（047 pgTAP bank_kind／複習卡片數量修正）、`47169d3`（e2e 目錄崩潰修復＋密碼確認 selector 修正）。

## 2026-08-27 16:11 [Codex] — 複習卡 Markdown 匯入／學生顯示／本機即時預覽完成（未發布）

- 做了什麼：在 `codex/review-card-ui-update`、固定起點 `f0638b04d74a8a5071ceb36e7a2369527dc5d0b7` 上完成未提交的本機第一階段。採用開源 `react-markdown` + `remark-gfm`，新增共用 Markdown 編譯／驗證契約，讓 Google Sheet 複習內容可使用標題、粗體、清單、引用、表格及 `![替代文字](review-media:P301)` 形式的行內圖片；匯入器會把媒體代號轉為環境無關的 private Storage path，拒絕 raw HTML、外部圖片 URL、缺少 mapping／alt 不符、超過 5000 字或每卡超過 3 張圖片。學生閱讀頁使用同一套 renderer，圖片仍經既有 private Storage signed URL resolver，行內引用不再於文章末尾重複顯示，舊資料未寫行內引用時仍保留末尾媒體相容行為；另補上手機字級及長表格的容器內捲動。新增獨立本機即時預覽 harness，桌面為左右編輯／預覽、手機為分頁切換，可選本機圖片建立最多 3 筆暫時 mapping；不寫入資料庫，也未加入 Admin。
- 驗證：scoped Vitest（排除其他 worktree／store 重複發現）5 檔／47 tests 全綠；`pnpm lint`、`pnpm build` 全綠；以桌面與 390px 手機 viewport 實際檢查即時預覽、語意標題／表格／圖片 alt、mobile tabs 與 console（無 error/warning）。本輪未執行 `pnpm test:db`、Supabase reset 或任何 hosted 操作。
- 下一步：owner 先確認正式內容與版本發布範圍。既有已發布卡片不可直接被 import SQL 覆寫，正式上 Staging 前需決定 `requires_recompletion` 並走 `publish_review_card`；同時補齊 RC3103／RC3201／RC3202 的真實 Storage 資產與 mapping。`review_card_media` metadata／Storage policy 對鎖定章節的繞過風險仍存在，本次未修改。
- 狀態：HEAD 未變、分支無 upstream；本輪沒有 commit、push 或 deploy。Phase 0／1 保護路徑未修改。

## 2026-08-27 21:31 [Codex] — 複習卡 H1 與單一螢光標記補強完成（未發布）

- 做了什麼：修正共用學生／本機 renderer 的 element allowlist，讓標準 Markdown `# 標題` 產生真正的語意化 H1，並依學生端字型規格使用 `--font-pixel-tc`。加入 MIT 開源套件 `remark-flexible-markers@1.3.6`，將 `==重點文字==` 顯示為固定 ColorPlay 淡黃底／深色字的 `<mark>`；raw HTML 與任意 hex 仍不開放。匯入 compiler 新增負向契約，拒絕套件額外支援但產品未公開的 `=r=文字==` 顏色分類，維持單一、安全、可預期的螢光樣式。本機預覽範例與語法提示同步更新。
- 驗證：依 TDD 先重現 H1 被解包成純文字及 `==…==` 原樣顯示，再修至綠；最終 scoped Vitest 5 檔／50 tests 全綠，直接異動 TS／TSX scoped ESLint、來源檔 scoped Prettier check、`pnpm build` 通過。`docs/handoff.md` 的全檔 Prettier check 仍會指出兩處本輪之前已存在的舊格式差異（約第 286、1211 行），本輪不改寫歷史紀錄。瀏覽器於桌面與 390×844 手機確認 H1 為 `H1`（Cubic 11、約 26px）、螢光為 `MARK`（淡黃底深色字）、手機預覽可見且 console 無 warning/error。
- Review：依 M 級規則完成唯一一次雙軸 review；Spec 0 finding，Standards 2 findings（標題字型、套件隱藏分類語法）均於同輪修正，不再進行第二輪 review；Security axis 因未碰 trust boundary 而略過。
- 狀態：仍在 `codex/review-card-ui-update`，HEAD 保持 `f0638b04d74a8a5071ceb36e7a2369527dc5d0b7`；沒有 commit、push、deploy、`pnpm test:db`、Supabase reset 或 hosted 操作。Google Sheet 必須寫 `# 標題`（井號後有空格），`#標題` 不是標準 Markdown H1。

## 2026-08-28 00:23 [Codex] — P301～P310 本機 WebP 批次準備工具與成品完成（未上傳）

- 做了什麼：新增 `scripts/assets/prepare-review-media.mjs` 與 `pnpm review-media:prepare`，可批次讀取 `P301.jpg`／`P301-v2.png` 類型的教材圖，在既有 512 KiB／2400px contract 下以 Playwright Canvas 輸出 WebP。工具優先保留原尺寸並在品質上限 0.94 內找最高可用畫質，超標才等比縮小；canonicalize 附件代號／版本檔名、拒絕覆寫既有圖片或 manifest，並輸出含來源、尺寸、大小、品質的 `review-media-manifest.json`。匯入指南同步補上本機命令與正確 gate 語法。
- 真實成品：讀取 `/Users/guanyucheng/Downloads/Colorplay 文件/Pei-game RCP/JPG` 的 P301～P310，寫入新的 `/Users/guanyucheng/Downloads/Colorplay 文件/Pei-game RCP/WEBP/optimized`；既有 `WEBP/P301.webp`～`P305.webp` 未覆寫。10 張皆保留原尺寸、品質約 0.937，輸出 67～376 KiB；P304／P305／P307 人工視覺抽查文字與格線清楚，全部再次通過既有 review-media gate。
- 驗證：TDD 契約 3/3 通過（轉檔／manifest、2500px 等比縮至 2400px＋版本檔名正規化、防覆寫）；scoped ESLint、Prettier、`pnpm typecheck`、`git diff --check` 全綠。唯一一次雙軸 review 的 Standards 4 項／Spec 2 項均於同輪修正；Security axis 因未碰 trust boundary 略過。
- 下一步：圖片仍只在本機，尚未上傳 Supabase。P301～P305 已有既有卡片對照；P306～P310 必須由 owner 提供／確認 Sheet stable code、每張繁中 alt 與排序後，才可建立 Storage mapping。正式 Staging 發布仍須走 private Storage 與版本化 `publish_review_card`，不得直接覆寫已發布卡片。
- 狀態：仍在 `codex/review-card-ui-update`，HEAD 保持 `f0638b04d74a8a5071ceb36e7a2369527dc5d0b7`；沒有 commit、push、deploy、`pnpm test:db`、Supabase reset 或 hosted 操作。Phase 0／1 保護路徑未修改。

## 2026-08-28 00:39 [Codex] — P301～P310 納入 private-media 專案來源並記錄 Admin 後續範圍（待上傳授權）

- 做了什麼：將已驗證的 P301～P310 WebP 與 manifest 複製到 `scripts/assets/source/review-card-media/chapter-3/`，逐檔 sha256 與 Downloads 成品一致。刻意不放 `public/`／`src/assets`，避免 private 教材進 client bundle。新增目錄 README，註明 Storage object path、版本檔名、防覆寫與 P306～P310 mapping 未定邊界；另新增 `docs/content/review-card-admin-media-backlog.md`，記錄未來 Admin 的選檔、即時預覽、壓縮 gate、alt／排序、private upload、版本化 publish，以及後端必須重驗證的信任邊界。現有 Playwright CLI 只作本機流程，不宣稱可直接匯入瀏覽器。
- 驗證：10 張 project source 全部通過既有 review-media gate；scoped Prettier、`git diff --check`、全 checkout `pnpm typecheck`、排除其他 worktree/store 後的全 repo ESLint、production build 全綠。複習卡／圖片相關 8 檔 66 tests 全綠。完整目前-checkout Vitest 為 211/212 檔、1581/1582 tests；唯一失敗是受保護且既有的 `tests/contracts/phase0-restore.test.ts` 本機 restore code=1，與本輪無關，未修改 Phase 0。裸 `pnpm test` 另會錯誤發現 `.claude/worktrees/**`／`.pnpm-store/**` 的多份 checkout；以 exclude 隔離後取得上述真實結果。
- Admin 前置風險：正式開放 Admin 上傳／發布前，必須先修正 `review_card_media` metadata／Storage policy 只依 published 判斷、可能讓鎖定章節媒體繞過 canonical access 的問題。P306～P310 仍需 owner 確認 Sheet stable code、繁中 alt 與排序。
- 下一步：等待 owner 明確授權是否把本批圖片上傳至 Staging `onkxnkzeixpezetkmocf` private `review-card-media/chapter-3/`。建議首次操作採 no-upsert：先唯讀盤點，已存在同名物件即停止／跳過，不覆寫；本步只上傳 Storage，不發布卡片、不改 DB mapping。
- 狀態：HEAD／branch 未變；沒有 commit、push、deploy、`pnpm test:db`、Supabase reset 或 hosted 操作。Phase 0／1 保護路徑未修改。

## 2026-08-28 00:50 [Codex] — Staging P301～P305 同路徑優化替換完成，P306～P310 Storage 上傳完成

- 授權與範圍：owner 明確要求覆寫之前圖片。先以 linked project 與唯讀 SQL 確認目標為 Staging `onkxnkzeixpezetkmocf`，private bucket `review-card-media`，目前五筆 published mapping 實際指向 `chapter-3/P301-v2.webp`～`P305-v2.webp`；資料庫與發布版本不在本次 mutation 範圍。
- 操作：覆寫前把既有 P301～P305 的無尾碼／`-v2` 共 10 個 objects 備份到 `/private/tmp/colorplay-review-card-media-backup-20260828`。接著以官方 Storage recursive upload 的 `x-upsert` 行為，將 project source P301～P305 同時寫入兩組既有路徑，並新增 P306～P310 無尾碼路徑，共 15 個 WebP。明確指定 `Content-Type: image/webp` 與 `Cache-Control: max-age=3600`。
- 驗證：從 Staging 重新下載全部 15 個 objects 到獨立 `/private/tmp/colorplay-review-card-media-verify-20260828`；與待上傳目錄 `diff -rq` 為 0 差異，逐檔 SHA-256 相符，review-media WebP／512 KiB／2400px gate 通過。remote recursive list 精確列出 15 個目標。操作後唯讀 SQL 再確認 bucket `public=false`，五筆 current published media mapping 未改、仍指向 P301-v2～P305-v2。
- 注意：Supabase 官方不建議一般改版覆寫同路徑，因 CDN edge 可能短暫保留舊內容；本次是 owner 明確授權的一次性圖片 bytes 替換。未來內容改版仍預設新版本檔名＋`publish_review_card`。P306～P310 目前只有 private Storage objects，尚未 mapping／發布。
- 狀態：Staging Storage mutation 已完成；未修改 DB、未 deploy web、未 commit、未 push、未執行 `pnpm test:db` 或 Supabase reset。Phase 0／1 保護路徑未修改。

## 2026-08-28 01:01 [Codex] — 複習卡 Staging 發布 preflight 完成，等待重讀政策裁定

- 做了什麼：更新 Git 遠端 refs，確認 `codex/review-card-ui-update` 起點 `f0638b0` 與 `origin/feature/v2-major-update` 一致，並包含現行 `origin/staging` 歷史。唯讀確認 `staging.colorplayapp.com` 目前指向 Ready 的 `colorplay-staging-web` deployment。重抓 Google Sheet（8 張複習卡）後，初次 gate 發現 9 個阻擋；已依 Sheet Markdown 的圖片代號與 alt 補上 P301～P308 private Storage mapping，並把 Markdown compiler 字數上限由 5000 對齊資料庫既有 8000 字 contract（RC3203 為 5002 字）。
- 驗證：Sheet gate 已收旂為結構錯誤 0／覆核提示 1（原有 QB4301）；Markdown／import contract 共 12 檔 146 tests 全綠，Prettier check 通過。唯讀 Staging SQL 確認 RC3101～RC3302 全 8 張的新內容 hash 都與 current published 不同，因此正式發布必須逐張走 `publish_review_card` 產生新版本。
- Blocker／待決策：owner 需決定這批 8 張是否 `requires_recompletion`。本次主要是 Markdown 排版與圖片內嵌，建議 `false`，保留已完成進度。另 Sheet P302 alt 目前為「色明表示的三種類型」，疑似應為「色名」，未自行改寫 SSOT。
- 狀態：尚未 commit、push、deploy web 或發布 DB 版本；未執行 `pnpm test:db`、Supabase reset 或 Production 操作。

## 2026-08-28 01:18 [Codex] — 複習卡 Markdown 前端已發布 Staging，DB 內容發布卡在教師憑證邊界

- 做了什麼：owner 裁定 8 張新版複習卡均使用 `requires_recompletion=false`。重抓 Google Sheet 後同步 P302 alt 「色名表示的三種類型」，gate 為 0 error。建立 commit `b534cf6483511ed3f8a0ff848511c362eb524053` 並 push 至 `origin/codex/review-card-ui-update`。GitHub-source Preview `dpl_73h3CymcQ17VWQKQ5pZXwSCydmq1` 驗證後，以 Staging 專案 Production env 重建為 `dpl_9dSdq1hyQcLzkCmrvQaEtR1gstKW`，已 Ready 並接上 `staging.colorplayapp.com`。
- 驗證：Git metadata 精確指向 `b534cf6`；bundle 只含 Staging Supabase ref `onkxnkzeixpezetkmocf`，不含 Production ref，chapter chunk／CSS 包含 `review-card-markdown`。本機 Sheet gate、lint、typecheck、production build、54 個 scoped tests 及 10 張 WebP budget 通過。
- Blocker：DB 尚未發布。自動流程唯一現成教師憑證是 repo 中標記 `LocalOnly` 的 fixture 密碼；將已知 local-only 憑證用於網際網路 Staging 屬跨環境憑證重用，操作安全 gate 拒絕在未再授權下探測。已唯讀確認 RC3101～RC3302 版本仍為發布前的 2/1/2/2/2/1/1/1，沒有部分 DB mutation。
- 下一步：owner 若明確授權一次性使用該 fixture 教師憑證，才能以正常 `auth-login` session 逐張呼叫 canonical `publish_review_card`；或 owner 提供另一個專用 Staging teacher session 方案。完成後再做學生登入、Markdown／H1／表格／螢光／signed image 與手機 viewport hosted 驗證。

## 2026-08-28 01:42 [Codex] — Google Sheet 複習卡已發布 Staging，學生端 hosted 驗證通過

- 授權與發布：owner 明確授權一次性使用 Staging fixture 憑證。重新下載 Google Sheet（RC 8 張）並通過 gate（0 結構錯誤、1 個與本次無關的既有 QB4301 覆核提示）；以 `teacher01` 正常走 `auth-login` 取得 authenticated teacher session，dry-run 確認後逐張呼叫 canonical `publish_review_card`，未直接更新資料表。
- 結果：RC3101～RC3302 全部回傳 `changed=true`，版本成為 3／2／3／3／3／2／2／2；二次唯讀比對 8 張 title／group／內容 SHA-256／current-version media mapping 全部 `matches=true`，媒體數 1／0／1／2／1／3／0／0，且全部 `requires_recompletion=false`。
- Hosted 驗證：以 `student01` 登入 `staging.colorplayapp.com`，canonical `get_accessible_chapter_review`、signed URL 與圖片 GET 均為 HTTP 200。RC3101 的語意 H1、粗體、淡黃螢光與 P301 正常；RC3203 的 3×3、2×4 Markdown 表格成立，P306／P307／P308 皆回傳 `image/webp` 並實際載入。390×844 viewport 無頁面水平溢出（clientWidth=scrollWidth=390），console 0 error／0 warning。
- 清理與風險：一次性發布 script、Vercel env 暫存檔及瀏覽器截圖已刪除，憑證／token 未寫入 repo、commit 或回覆。既知 `review_card_media`／Storage policy 只檢查 published 的鎖定章節繞過風險仍未修，依本 Session 邊界保留後續處理；未執行 `pnpm test:db`、Supabase reset 或 Production 操作。

## 2026-08-28 02:03 [Codex] — Google Sheet 小幅更新重發，複習卡螢光改為高對比紅色系

- 內容重發：重新下載 Google Sheet（QB 136／CR 62／LT 60／RC 8），gate 維持 0 結構錯誤，僅有既存且與本輪無關的 QB4301 覆核提示。8 張卡片皆與前一版 hash 不同，經已授權的 Staging fixture teacher session 逐張呼叫 canonical `publish_review_card`，全部使用 `requires_recompletion=false`；版本成為 RC3101～RC3302：4／3／4／4／4／3／3／3。發布後再次 dry-run 回讀為 `changedCount=0`，確認 Sheet 內容、版本與 media mapping 完全一致。
- UI 決策與實作：排除純紅底（過度像警告、閱讀刺激高）及只改紅字（辨識仍過度依賴單一顏色）；將 `<mark>` 改為淡珊瑚紅底 `#f4a6b5`、深紅粗字 `#6f1732` 與玫瑰紅下緣 `#b4234d`。文字／底色對比約 5.95:1，並以底色、字重及下緣共同表達標記狀態。
- 驗證與發布：新增 token contract test；scoped Vitest 4 檔／93 tests、`pnpm typecheck`、production build、scoped ESLint、Prettier 及 `git diff --check` 通過。全 repo `pnpm lint` 會掃入其他 worktree／`.pnpm-store` 而長時間無法合理完成，本輪未宣稱全量 lint 綠。UI commit `03a17c3` 已 push，Vercel deployment `dpl_3cTPzufQoGitDhEb6j7B2Rco83dj` 已 Ready 並 alias 至 `staging.colorplayapp.com`；bundle 只含 Staging Supabase ref `onkxnkzeixpezetkmocf`，不含 Production ref。
- Hosted 實測：以既有學生 session 在 390×844 開啟 RC3101，computed style 符合三個新色 token 與 `font-weight: 800`；P301 signed image 實際載入為 1654×815，`get_accessible_chapter_review`、Storage sign 與圖片 GET 均為 HTTP 200，頁面 `clientWidth=scrollWidth=390`，console 0 error／0 warning。
- 邊界與風險：未碰 Phase 0／1 保護路徑，未執行 `pnpm test:db`、Supabase reset 或 Production 操作。既知 `review_card_media`／Storage policy 只檢查 published、可能繞過 canonical 章節鎖定的風險仍未修，需另案處理。

## 2026-08-28 09:47 [Codex] — 複習卡 Markdown 語意分頁與安全捲動 fallback 完成（未發布）

- 做了什麼：將複習卡由空白行切割改為 Markdown 語意區塊分頁，完整保留 H1～H6、清單／巢狀清單、引用、GFM 表格、程式碼區塊、圖片與行內格式；純文字段落仍可在安全字元邊界分頁。同頁的連續清單項目會合併回單一 `<ol>`／`<ul>`，不會因分頁器拆成多個獨立清單。任何無法放入空白頁的完整區塊改放到有繁中 accessible name、可鍵盤聚焦及觸控上下捲動的整頁 fallback；移除表格原有的內層垂直高度限制，避免繞過這個 fallback，表格仍保留必要的水平捲動能力。分頁完成前／後的可讀 DOM 來源也已正確切換 `aria-hidden`。
- 驗證：focused Vitest 6 檔／39 tests、scoped ESLint、scoped Prettier、`pnpm typecheck` 與 production build 全綠。Chromium harness 10/10 通過，逐頁檢查 320×568、375×812、393×852、768×1024、1024×768、1280×720、1440×900、812×375 與 852×393：無文字裁切、無頁面水平溢出、非 fallback 無垂直溢出、fallback 可實際捲到底；另用獨立原始內容片段確認標題、清單、表格、引用與結尾標記未遺失。
- Review：唯一一次雙軸 review 的 Standards 4 項與 Spec 4 項均在同輪修正；包含表格 accessible fallback、指定 viewport、測試檔責任拆分、E2E 重複、清單語意及非循環式內容保存證據。Security axis 因未碰 trust boundary 略過，不再進行第二輪 review。
- 狀態：仍在 `codex/review-card-ui-update`，HEAD／upstream 保持 `f212f9627289b52d20f0b1078564849194f0a973`；本輪變更未 commit、push 或 deploy，未操作 Supabase／hosted DB，未執行 `pnpm test:db` 或 reset，Phase 0／1 保護路徑未修改。

## 2026-08-28 10:42 [Codex] — 複習卡完整 Markdown 分頁已發布 Staging，真實學生資料跨桌機／手機驗證通過

- 發布：先提交並 push `2e5e7652cdae0f8b7f1cf72f6511cd1204427fbe`（完整 Markdown 分頁與安全捲動），公開 Staging 實測後發現純文字 `1.`／`-` 清單被誤判為可逐字切割段落，導致桌面 1280×720 某一頁有 57px 未標記的垂直溢出。依 TDD 補上純文字清單契約後，以 `115525ab5171296e69de777d29958f0fed9a60a9` 修正並 push；Production 環境候選 `dpl_C2e9gxx3iMUwpSphEkBt8uwPZfy2` 已 Ready 並 promotion 至 `staging.colorplayapp.com`。Vercel metadata 精確對應此 SHA／分支，正式 bundle 只含 Staging Supabase ref `onkxnkzeixpezetkmocf`，不含 Production ref。
- 驗證：以 `student01` 正常登入並完成 profile／economy／Chapter 3 bootstrap，console 0 error／0 warning。真實「色彩三要素」內容在桌面 1280×720 共 12 個書頁（6 個跨頁 view）、手機 390×844 共 8 頁；所有非 fallback 頁的水平／垂直溢出為 0、文字元素無裁切，過長完整區塊皆改為 `overflow-y:auto`、`tabIndex=0` 且具「本頁內容較長，可上下捲動」名稱。真實 RC3203 在手機共 25 頁，兩個 GFM 表格皆保留；3×3 表格在手機與桌面無水平裁切、由整頁 fallback 承擔垂直捲動。P306／P307 signed images 從 private `onkxnkzeixpezetkmocf.supabase.co` 實際載入，尺寸分別 2105×965、1102×1556。
- 本機 gate：純文字清單 RED 測試先確認收到 `[true,true,true,true]`，修正後相關 Vitest 5 檔／18 tests 全綠；閱讀器 Chromium harness 首輪 9/10，唯一失敗為 852×393 翻頁動畫中的既有時序波動，該 viewport 單獨重跑通過；scoped lint、`pnpm typecheck`、production build 通過。裸 `pnpm test -- <file>` 仍會錯誤掃入其他 worktree／`.pnpm-store` 並出現既有失敗，因此有效證據採 `pnpm exec vitest run <scoped files>`。
- 邊界：本輪只更新 web bundle，沒有重匯 Google Sheet、沒有修改 Staging DB／Storage、沒有執行 `pnpm test:db` 或 Supabase reset，也未碰 Phase 0／1 保護路徑。既知 `review_card_media`／Storage policy 的鎖定章節媒體繞過風險仍未修。

## 2026-08-28 13:01 [Codex] — 複習卡正文與 Markdown 粗體層級修正完成（本機，未發布）

- 問題與修正：閱讀器正文原為 `font-weight: 560`，與瀏覽器預設 `<strong>` 的 700 只差 140，繁中文字形下不易辨識。正文調整為 500，並為 `.review-card-markdown strong` 明確指定 800，讓 Markdown 粗體與正文有 300 的可測層級差；未改動排版、標記色彩或內容契約。
- 驗證：新增 Playwright computed-style 契約，RED 先重現 560／700，GREEN 確認 500／800。閱讀器 Chromium harness 11/11 通過，涵蓋桌面、平板、手機、橫向手機與 reduced-motion；相關 Vitest 5 檔／18 tests、scoped ESLint、Prettier、`pnpm typecheck` 與 production build 全綠。另檢視 1280 與 393 viewport，粗體辨識提升且未出現裁切或排版回歸。
- 狀態：變更將只提交在 `codex/review-card-ui-update` 本機，尚未 push 或 deploy；沒有重匯 Google Sheet、修改 Staging DB／Storage、執行 `pnpm test:db`／Supabase reset，也未碰 Phase 0／1 保護路徑。

## 2026-08-28 13:14 [Codex] — 複習卡右上資訊列與放大書頁完成（本機，未發布）

- 版面修正：桌面版將章節、3-1 小節名稱與「複習 n / n」從置中標題列改為右上兩列資訊區，並讓它只使用書本封面上緣的安全空間；書本不再為原本約 84px 的標題列保留獨立 grid row。1280×720 的 RED 基線書本為約 846×470px，新契約至少 930×515px，閱讀面積增加約 20%，且資訊列底部與實際文字 viewport 保留至少 4px 間距。手機版維持滿版單頁書本，右上資訊區補回原本隱藏的「複習 n / n」。
- 驗證：閱讀器 Chromium harness 最終 12/12 通過，涵蓋 1280、1024×768、1440×900、393、320×568、768×1024、375×812、852×393 與 812×375；無控制項重疊、文字裁切、頁面水平溢出或非 fallback 垂直溢出。相關 Vitest 5 檔／18 tests、scoped ESLint、Prettier、`pnpm typecheck` 與 production build 通過；1280 與 393 viewport 已人工檢視。
- 設計邊界：依 preserve redesign 處理，只改資訊層級與空間分配，沿用既有書本資產、色彩、字型、按鈕、動態及可及性行為，沒有新增視覺系統或內容契約。
- 狀態：變更將只提交在 `codex/review-card-ui-update` 本機，尚未 push 或 deploy；沒有修改 Google Sheet、Staging DB／Storage、執行 `pnpm test:db`／Supabase reset，也未碰 Phase 0／1 保護路徑。

## 2026-08-28 13:28 [Codex] — 複習卡粗體與放大閱讀頁已發布 Staging

- 發布：已 push `codex/review-card-ui-update`，並將 GitHub-source Preview 提升為 Production-target deployment `dpl_2TfzSwh63pA6u6tytrrqgbB1PsnZ`；`staging.colorplayapp.com` 已指向該部署且狀態為 READY。Vercel metadata 精確對應產品 SHA `ae01dd0becac6ea5d36d22c5a75d909ca47724d2`。
- 環境與樣式：公開 bundle 只含 Staging Supabase ref `onkxnkzeixpezetkmocf`，不含 Production ref；CSS 包含本次正文 500／Markdown 粗體 800，以及放大閱讀區的 grid 指紋。
- Hosted 驗證：以 `student01` 正常登入並進入 Chapter 3 複習卡。1280×720 書本為 937×521px、右上資訊列可見；390×844 顯示「複習 2 / 3」。兩個 viewport 均無文件水平溢出、文字裁切、overflow fallback、console error、page error 或 failed request，computed style 為正文 500／粗體 800。
- 邊界：本輪只更新 web bundle，沒有重匯 Google Sheet、修改 Staging DB／Storage、執行 `pnpm test:db` 或 Supabase reset，也未碰 Phase 0／1 保護路徑。既知 `review_card_media`／Storage policy 的鎖定章節媒體繞過風險仍未修。

## 2026-08-28 14:55 [Codex] — 複習卡桌機／手機共用書頁框架與防遮擋分頁完成（本機，未發布）

- 版面：返回、章節資訊與底部三按鈕收進書本內，桌機只與手機保留雙頁／單頁差異。書本改用三列 grid 分開頂部資訊、閱讀內容與動態底部狀態，並納入 `safe-area-inset-bottom`；320×568 同時顯示圖片等待或完成錯誤時不會遮住文字或按鈕。頁數改為視覺隱藏但輔助科技可讀的 live region。
- 分頁：移除 Markdown DOM 上造成虛假空白的 `white-space: pre-line`，同頁連續清單項保持單一 `<ol>`／`<ul>`；H1～H6 新增 keep-with-next 測量，避免標題單獨留在頁尾。無法安全拆分的長表格／圖片仍保留整頁安全捲動 fallback。
- 驗證：單元與 shell 相關 4 檔／15 tests、Chromium 16／16（含 1280×720、1024×600、1366×768、393×852、320×568 及兩個手機橫向）、scoped ESLint／Prettier、`pnpm typecheck`、production build 全綠。測試逐頁檢查無文字裁切、水平溢出或 chrome／內容／底部相交。
- Review：唯一一輪 Standards 3 項與 Spec 3 項均已同輪修正；Security 因未碰 trust boundary 略過。CSS 拆為 387／202／130 行的 layout、controls、responsive 檔案，避免單檔超過 500 行。
- 狀態：本機預覽為 `http://127.0.0.1:4186/dev-harness/chapter-detail.html?scenario=in-progress`；仍在 `codex/review-card-ui-update`，HEAD／upstream 保持 `b9c9db415e79b354ed3281b40c6d0bf85c375d19`。本輪未 commit、push、deploy，未操作 Google Sheet／Supabase／hosted 資料，未碰 Phase 0／1 保護路徑。

## 2026-08-28 15:26 [Codex] — Live 教師投影滿版置中與小視窗指引完成（本機，未發布）

- 根因與版面：委派後的 `.live-projector` 只是舊 `.live-presenter` 三列 grid 的單一 auto-placement child，沒有跨滿整個投影 viewport，造成 1280×720 的底部控制列距畫面下緣約 58.6px，內容也一起偏上。Projector 現在跨滿外層 grid，header／stage／footer 使用完整高度；lobby、題目、統計與排名採共用視覺置中 offset，解析滿高容器則不平移，避免上緣被裁切。
- 小視窗提示：`投影視窗過小` 改為置中的標題＋「請縮小瀏覽器畫面比例，或放大視窗後再試。」；原有取消狀態與離開投影路徑保留。幾何測試會驗證 footer 貼齊、內容中心、物件完整位於 stage、44px 控制尺寸與無頁面溢出。
- 驗證：Live Presenter Chromium 41／41、教師 lobby 1024×768／1280×720／1366×768／1920×1080 共 4／4、既有 Live unit 34／34、focused ESLint／Prettier、`pnpm typecheck` 與 production build 通過。Review 唯一一輪 Spec 無 finding；Standards 的解析裁切與測試檔責任兩項 P2 已同輪修正，共用幾何抽至 `tests/e2e/helpers/live-projector-layout.ts`。
- 狀態：本機預覽為 `http://127.0.0.1:4186/dev-harness/teacher-routes.html?scenario=live-lobby`；仍在 `codex/review-card-ui-update`，HEAD／upstream 保持 `b9c9db415e79b354ed3281b40c6d0bf85c375d19`。保留既有複習卡 WIP；本輪未 commit、push、deploy，未操作 Supabase／hosted 資料，也未碰 Phase 0／1 保護路徑。

## 2026-08-28 17:14 [Codex] — 複習卡／Live 投影整合與 Live 20 題已發布 Staging

- 產品與資料庫：整合複習卡共用書頁框架、防遮擋 Markdown 分頁、粗體／高對比標記，以及 Live Projector 滿版置中與小視窗指引。Live `start_live_session` 改為最多凍結 20 題；題池不足時回傳實際題數，普通 Quiz 的 10 題契約不變。Staging `onkxnkzeixpezetkmocf` 已以標準 `supabase db push` 僅套用 `20260828000100_live_twenty_question_sessions.sql`；Phase 1 歷史 migrations 未套用或修復。單檔 pgTAP `017_live_setup.test.sql` 37／37 通過，未執行 `pnpm test:db` 或 reset。
- 真實內容裁切修正：首次 hosted 逐頁檢查抓到手機真實「彩度」段落的 2px 邊緣溢位；移除 `<mark>` 會在換行行尾外凸的左右 padding，並取消分頁器原有 +1px fit 容差。曾嘗試的 2px 高度扣除會使固定 100% 高的量測頁全部降級 fallback，已由 hosted 驗證攔下並改為精確 `scrollHeight <= clientHeight`；新增測試保證 101px 不塞入 100px、99px 正常內容不 fallback，且完整長內容不得全頁 fallback。
- 驗證：相關 Vitest 最終 8 tests（分頁邊界）及 14 tests（Markdown／閱讀器組）通過；Chromium 複習卡 16／16（桌面、手機、橫向、短螢幕、footer 狀態、reduced motion、粗體）、Live Presenter 41／41、Student Live 14／14，另有 focused Live／教師路由測試通過。scoped ESLint／Prettier、`pnpm typecheck`、`git diff --check`、production build 全綠。較廣的 `--grep Live` 仍會命中既有未登入教師 route／report harness 並因 Supabase 401 失敗，未以本輪改動掩蓋。
- Staging：產品整合 commit `b8ebb0d18e38f8c47ae412b5979fd64b466a2a54`，裁切與分頁修正 commits `fd0d53733d9eb02b5308f2dd8e3388f49ec9c68f`、`0200dfd36a22274fd57c2937e86632d8ed6cf22a` 均已 push。最終 Preview `dpl_HhzuJjrPjH2ZXHy3QxfsiBmtfWGZ` 已 promotion 為 `dpl_DYsk3HKH8ZR8c7HebnRrZkHLXBXa`，`staging.colorplayapp.com` READY 且 metadata 精確指向 `0200dfd`；bundle 只含 Staging Supabase ref，不含 Production ref。
- Hosted smoke：`teacher01`／`student01` 真實 Live 場次確認教師顯示「共 20 題」、學生顯示「第 1 / 20 題」；1280×720 footer gap 0、內容中心偏差 4.35px、無頁面溢出，控制項皆至少 75px 高，場次正常取消。真實「色彩三要素」桌面為 3 個雙頁 view、393×852 手機為 5 個單頁 view，全文與 pagination source 完全一致、0 裁切、0 fallback；最近 30 分鐘測試殘留 Live 場次為 0。首次 Realtime 人數同步曾超過 5 秒，重跑在 15 秒窗口內成功。
- 邊界：未重匯 Google Sheet、未修改複習卡 DB／Storage、未碰 Production 或 Phase 0／1 保護路徑。既知 `review_card_media`／Storage policy 的鎖定章節媒體繞過風險仍未修。

## 2026-08-29 12:36 [Codex] — 新班級 8 位加入碼與舊 16 位相容完成（本機，未發布）

- 決策與實作：owner 確認新班級採 8 位英數碼、只影響新班級、既有 16 位碼繼續有效。新 migration 使用 40-bit Crockford Base32（排除 I／L／O／U）生成 `XXXX-XXXX`，保留舊碼 constraint 與 hash 驗證，不重寫任何現有班級。學生註冊 Edge 共用規則、註冊 UI 與加入班級表單均同時接受新舊格式；`spec/03` 已對齊固定明碼的 owner-only 讀取邊界。
- 驗證：TDD RED 先確認 8 位碼被註冊、加入表單與共用伺服器規則拒絕；GREEN 後 scoped Vitest 10 檔／69 tests、`pnpm typecheck`、scoped ESLint／Prettier、`git diff --check` 與 production build 全綠。新增 pgTAP 059 並更新 012／046 格式契約，但依 session 邊界未執行 `pnpm test:db`、Supabase reset 或任何 hosted DB 操作，因此 SQL 尚待獲授權的資料庫 gate。
- 帳號：現行 `scripts/admin/create-teacher.mjs` 建立每組教師帳號時仍需 account／name／email／password 四項。本輪未收到兩組具體資料，所以未建立 Staging 帳號。
- 風險：`spec/04` 要求 join classroom 依 IP＋identity 限流，目前直接 `join_classroom` RPC 沒有專屬限流。8 位 Crockford 仍有 40-bit 搜尋空間，但正式發布前建議另案補限流，不以代碼熵取代防濫用。
- 狀態：仍在 `codex/review-card-ui-update`，HEAD／upstream 保持 `94993feeb718f150d0316fa9c98318c2777e030e`；本輪變更未 commit、push 或 deploy。

## 2026-08-29 12:47 [Codex] — Staging 新增兩組教師流水帳號

- owner 定義未來 Admin 流程：Admin 以流水碼建立教師帳號、產生高強度初始密碼，教師提供姓名與聯絡 Email；Admin 於建立後可更新姓名／Email，不走收件者驗證。教師忘記密碼時，Admin 只能重設新密碼並連同原帳號寄送，系統不得保存或回傳原密碼。
- 本次 hosted mutation：在 Staging `onkxnkzeixpezetkmocf` 建立 `teacher02`（鶯歌高職）與 `teacher03`（士林商工），兩者 `full_name`／`display_name` 均對齊、role 為 `teacher`。因尚無真實聯絡 Email，Auth 先使用不收信的 `.invalid` 內部占位地址；概念上 contact Email 仍為未設定。
- 驗證：兩組均以實際 account＋password 呼叫 Staging `auth-login`，取得有效 teacher session；二次 service-role 唯讀回查確認 account／name／display name／role 正確。初始密碼只在當次交付回覆顯示，未寫入 repo／handoff／暫存檔。
- Admin 後續契約：目前 `auth.users.email` 同時承擔 Auth 內部 Email，尚無獨立 nullable `contact_email`。正式 Admin UI 實作時需決定「替換 Auth Email」或「新增獨立聯絡 Email」；建議採後者，避免聯絡資料與登入識別綁死，並在 Admin 寄出帳密前加入 Email 二次確認以降低誤寄風險。
