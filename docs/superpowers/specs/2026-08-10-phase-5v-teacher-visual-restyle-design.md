# Phase 5V：教師端純視覺 Design（Draft）

- 日期：2026-08-10
- 狀態：Draft，待 owner 確認第 5 節後可核准
- 對應：`docs/roadmap-colorplay-next.md` Phase 5（Live 與教師報表）的視覺子集，**不是 Phase 5 的完整 spec**。功能性工作（含 LivePresenter）在 `2026-08-10-phase-5f-teacher-live-functional-questions.md`。
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`

## 0. 明確聲明

本文件**只允許不改變 API、RPC、狀態機、計分、finalize、主持流程的純視覺工作**。任何會影響上述行為的變更、任何新增的教師統計資料、任何 LivePresenter 的功能性改造，一律不在本文件範圍，屬於 Phase 5F。

## 1. 狀態核對說明

`docs/superpowers/specs/2026-08-02-teacher-workspace-design.md` 自身的狀態欄位從建立至今持續寫「草案待 owner 核准」，未曾更新；對應的 `docs/superpowers/plans/2026-08-02-teacher-workspace.md` 宣稱「owner 2026-08-02 核准 spec」，但這只是 plan 文件內的單方陳述，沒有 spec 檔案本身的狀態變更佐證。可追溯的實際完成證據來自 `.superpowers/sdd/progress.md`（Teacher Workspace Batch，11+ commit、測試結果、CONDITIONAL→可合併狀態的記錄）。

本文件因此**不引用「已核准」作為事實**，改以「該 plan 檔案記錄的 CSS 語彙集（`.sage-page-header`／`.pixel-command`／`teacher-dashboard-grid--forge` 等）」作為既有可沿用的視覺詞彙來源，實際完成範圍以下方「程式碼實測狀態」欄為準，不採信 plan 檔案的 checkbox（已知全數未勾，但程式碼證明部分工作已完成，checkbox 不可信）。

## 2. 路由清單與允許修改範圍（逐路由列出，未列出者不屬於本文件）

| 路由 | 程式碼實測狀態（2026-08-10） | 本文件允許修改的內容 |
|---|---|---|
| `/teacher`（Dashboard） | 已套用 `pixel-command`／`teacher-dashboard-grid--forge`／`teacher-live-console--night` | 功能捷徑導覽項目補齊（新增 Live 連結；不含未來的內容管理連結，該功能已裁定放 Admin 後台，與教師端無關） |
| `/teacher/analytics`（教學分析） | 未套用任何賢者工坊 class | 標題列語彙、高頻錯誤概念嚴重度符號（`▲▲▲`/`▲▲`，aria 文字並存）、表格容器外層框線；**表格本身內距/欄寬/字級不動** |
| `/teacher/classes`（班級管理列表） | 未套用 | 班級卡改木牌卡樣式、超過班級數量時的 GamePager 分頁、加入碼票券化視覺 |
| `/teacher/classes/:classroomId`（班級詳情） | 已套用 `sage-page-header`（僅標題列） | 頁首識別牌樣式細化、成員數/加入碼摘要列徽章化；表格本身不動 |
| `/teacher/classes/:classroomId/members/:memberRef`（學生進度） | 已套用 `sage-page-header`（僅標題列） | 標題列語彙統一、既有內容（各章節學習進度表格、待補救錯題清單）視覺細化。**不包含新增 Live 參與紀錄或課堂/課後統計欄位——那是新統計資料，屬於 Phase 5F** |
| `/teacher/live`（Live 建立頁） | 未套用 | 表單卡改召集令語彙；**欄位/流程/送出邏輯零變更** |
| `/teacher/live/:sessionId/report`（Live 報表） | 已套用 `sage-page-header`（僅標題列） | 名次前三名獎牌符號（aria 文字並存）；表格本身不動 |
| HUD 教師導覽列（`src/app/shell/hud-command-bar.tsx`） | 未處理 | Link→NavLink、active 態、MENU 面板恆掛 DOM（改用 hidden 切換而非條件渲染）、click-outside 關閉、開啟時焦點移入面板 |

## 3. 明確排除

- **`/teacher/live/:sessionId`（LivePresenter 投影/主持台）**：完全不在本文件範圍，包含其視覺——owner 已裁定 LivePresenter 的視覺與功能一起重新設計（見 5F），不能拆成「這裡先做視覺、之後再做功能」兩階段,避免同一元件被兩份 spec 各自碰一次、互相踩線。
- 任何新增的教師可見統計資料（如學生的 Live 參與紀錄、課堂/課後正確率拆分）——這些是新資料查詢與展示邏輯，不是純視覺調整，屬於 Phase 5F。
- API/RPC/狀態機/計分/finalize/主持流程的任何變更。

## 4. 本文件不宣稱的事

本文件完成、實作、驗收，都**不等於 Phase 5 完成**——Phase 5 的功能性部分（5F）獨立於本文件，且尚未成案。

## 5. 待決事項

無阻塞性待決事項。表 2 的路由/範圍劃分已經是具體到可執行的程度；若實作時發現某路由的視覺調整會不可避免地牽動 API/RPC（例如某個表格欄位其實需要新查詢才能正確呈現），依 AGENTS.md 原則停止該項並回報，不在本文件自行擴權。

## 6. 客觀不可行的選項

- 「先做 LivePresenter 視覺、功能之後再補」：與 owner 已裁定的「視覺＋功能一起重新設計」矛盾，且會造成同一元件被兩次改動、風險更高，排除。
