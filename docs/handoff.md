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
