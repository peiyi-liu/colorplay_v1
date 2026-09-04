# Phase 5V：教師端 UI/UX Restyle Design（Draft）

- 日期：2026-08-10（2026-08-10 Codex review remediation 更新：範圍從「純視覺」擴大為「UI/UX」，納入不需後端資料的互動行為）
- 狀態：Owner approved：2026-08-10
- Codex design review completed
- Implementation planning：尚未授權（not yet authorized）
- 完成本文件定義的 Slice Gate 不代表對應的完整 Phase 已完成
- 對應：`docs/roadmap-colorplay-next.md` Phase 5（Live 與教師報表）的 UI/UX 子集，**不是 Phase 5 的完整 spec**。功能性工作（含 LivePresenter、新統計資料）在 `2026-08-10-phase-5f-teacher-live-functional-design.md`。
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`
- 前身檔名：`2026-08-10-phase-5v-teacher-visual-restyle-design.md`（2026-08-10 remediation 重新命名，範圍由「純視覺」擴大為「UI/UX」）

## 0. 明確聲明（Explicit Non-Claims）

本文件允許的範圍比原本的「純視覺」更廣——**允許不需要新後端資料、不改變 server/domain state 的互動行為**（見第 1 節），但仍然**不允許**任何會改變 API、RPC、計分、finalize、主持流程的變更。任何超出第 1 節允許範圍的項目，一律移交 Phase 5F，不得在本文件擴權。

## 1. 允許範圍（UI/UX，非純視覺）

- **Client-only navigation**：不涉及伺服器路由邏輯變更的前端導覽調整。
- **GamePager／client-side pagination**：純前端分頁，資料來源不變。
- **Focus management**：焦點移動、focus trap、tab 順序調整。
- **Click-outside 行為**：面板/選單的點外部關閉。
- **Responsive behavior**：斷點調整、版面重排（不改資料內容）。
- **Accessibility 互動**：`aria-*` 屬性、鍵盤操作、螢幕閱讀器 announcement。
- **Local ephemeral UI state**：純前端暫存狀態（如展開/收合、目前選取的分頁），重新整理後可重置、不需要持久化到後端。

## 2. 仍然禁止

- 新增／修改 API、RPC。
- 改變 server/domain state（任何寫入資料庫的行為）。
- 計分、finalize、Live 主持流程的任何變更。
- 新增需要後端資料的統計欄位（例如新的查詢、新的聚合數字）。
- **前端自行聚合正式資料**——即使資料已經在前端可取得，也不得由前端做聚合/加總/平均等計算後當成正式數字呈現；正式數字一律由後端計算後提供。

若某項調整需要新資料或新的 server contract，**標記移交 5F**，不得在 5V 擴權處理。

## 3. 狀態核對說明

`docs/superpowers/specs/2026-08-02-teacher-workspace-design.md` 自身的狀態欄位持續寫「草案待 owner 核准」，未曾更新；對應 plan 檔案宣稱「owner 2026-08-02 核准」，但無 spec 檔案本身的狀態變更佐證。可追溯的實際完成證據來自 `.superpowers/sdd/progress.md`（Teacher Workspace Batch，11+ commit、測試結果、CONDITIONAL→可合併狀態）。本文件因此不引用「已核准」作為事實，改以 plan 檔案記錄的 CSS 語彙集作為既有可沿用來源，實際完成範圍以下方「程式碼實測狀態」欄為準（不採信該 plan 的 checkbox，已知全數未勾但程式碼證明部分工作已完成）。

## 4. 路由清單與允許修改範圍（逐路由列出，未列出者不屬於本文件）

| 路由                                                           | 程式碼實測狀態（2026-08-10）                                                           | 本文件允許修改的內容（含 UI/UX 互動）                                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/teacher`（Dashboard）                                        | 已套用 `pixel-command`／`teacher-dashboard-grid--forge`／`teacher-live-console--night` | 功能捷徑導覽項目補齊（新增 Live 連結，client-only navigation）；不含未來的內容管理連結（該功能屬 Admin 後台）                             |
| `/teacher/analytics`（教學分析）                               | 未套用任何賢者工坊 class                                                               | 標題列語彙、高頻錯誤概念嚴重度符號、表格容器外層框線；篩選器的 client-side 互動優化（不改查詢邏輯）；**表格本身內距/欄寬/字級不動**       |
| `/teacher/classes`（班級管理列表）                             | 未套用                                                                                 | 班級卡改木牌卡樣式、超過班級數量時的 GamePager **client-side** 分頁、加入碼票券化視覺                                                     |
| `/teacher/classes/:classroomId`（班級詳情）                    | 已套用 `sage-page-header`（僅標題列）                                                  | 頁首識別牌樣式細化、成員數/加入碼摘要列徽章化；表格本身不動                                                                               |
| `/teacher/classes/:classroomId/members/:memberRef`（學生進度） | 已套用 `sage-page-header`（僅標題列）                                                  | 標題列語彙統一、既有內容視覺細化。**不包含新增 Live 參與紀錄或課堂/課後統計欄位——那是新統計資料，屬於 Phase 5F**                          |
| `/teacher/live`（Live 建立頁）                                 | 未套用                                                                                 | 表單卡改召集令語彙；**欄位/流程/送出邏輯零變更**                                                                                          |
| `/teacher/live/:sessionId/report`（Live 報表）                 | 已套用 `sage-page-header`（僅標題列）                                                  | 名次前三名獎牌符號；表格本身不動                                                                                                          |
| HUD 教師導覽列（`src/app/shell/hud-command-bar.tsx`）          | 未處理                                                                                 | Link→NavLink（client-only）、active 態、MENU 面板恆掛 DOM（改用 hidden 切換）、click-outside 關閉、開啟時焦點移入面板（focus management） |

## 5. Explicit Exclusions

- **`/teacher/live/:sessionId`（LivePresenter 投影/主持台）**：完全不在本文件範圍，包含其視覺——owner 已裁定 LivePresenter 的視覺與功能一起重新設計，屬 Phase 5F，不能拆成兩階段處理。
- 任何新增的教師可見統計資料。
- API/RPC/server state/計分/finalize/主持流程的任何變更。
- 前端自行聚合正式資料。

## 6. Typed Input/Output Contract

本文件範圍內的變更**不改變任何 API/RPC 的輸入輸出契約**——這是本文件的核心約束，不是需要另外定義 typed contract 的範圍。若某項工作需要新的資料契約，即代表超出本文件範圍，應移交 5F。

## 7. Existing AC Mapping

| AC                                                 | 適用性                                |
| -------------------------------------------------- | ------------------------------------- |
| AC-UI-004（Touch target）                          | 適用——所有觸控元件 ≥44px              |
| AC-UI-008（扁平化設計與視覺降載）                  | 適用                                  |
| AC-UI-011（Dialog 明確關閉與提示一致）             | 適用——HUD 面板 click-outside/關閉行為 |
| AC-UI-013（圖示隱喻與教育情境一致）                | 適用——嚴重度符號、獎牌符號            |
| AC-UI-015（點選、Focus、Pending 與錯誤狀態可辨識） | 適用——focus management 相關項目       |

## 8. Task-Level Definition of Done

1. 第 4 節表格列出的每個路由完成對應的允許範圍調整。
2. HUD 教師導覽列的 Link→NavLink／active 態／面板恆掛 DOM／click-outside／focus management 全數實作並測試。
3. 每個路由的調整**允許**包含：client-only navigation、client-side pagination（GamePager）、focus management、click-outside 行為、responsive 版面調整、accessibility 互動（`aria-*`／鍵盤操作／螢幕閱讀器 announcement）——這些屬於第 1 節定義的合法範圍，不是「零變更」，會實際新增/調整前端互動邏輯。
4. 每個路由的調整**明確不得**包含：新增/修改 API、RPC；改變 server/domain state；計分、finalize、Live 主持流程的任何變更。逐路由以既有 network 監控/測試驗證這一項——驗證的對象是「API/RPC/server state/計分/finalize/主持流程」這五類特定行為零變更，不是要求整個路由的前端互動邏輯零變更。

## 9. Slice Gate（不等於 Phase Gate）

第 4 節列出的路由與 HUD 導覽列變更全數完成且驗證零 API/RPC/server-state 變更，即為本 slice 通過。**本 Slice Gate 獨立於 5F**——不需要等 5F 完成，也不代表 Phase 5 完成。

## 10. 正向與負向測試矩陣

| 情境                                             | 類型         | 預期結果                                          |
| ------------------------------------------------ | ------------ | ------------------------------------------------- |
| 班級數量超過分頁門檻                             | 正向         | GamePager client-side 分頁正確運作，無新 API 呼叫 |
| HUD 面板開啟後點擊外部                           | 正向         | 面板關閉（click-outside）                         |
| HUD 面板開啟時按 Tab                             | 正向         | 焦點在面板內循環，不跳出                          |
| 嘗試在本文件範圍內新增一個需要後端聚合的統計數字 | 負向（防退） | 應被識別為超出範圍，移交 5F，不得實作             |
| 驗證任一路由變更後的 network 請求                | 負向（防退） | 與變更前完全一致，無新增/修改的 API 呼叫          |

## 11. Hosted Mutation Owner Gate

不適用——本文件範圍內的變更皆為前端 client-only 行為，不涉及 hosted 資料寫入。

## 12. Failure / Stop Conditions

- 若任一計畫中的調整發現需要新資料或新 server contract 才能完成，立即停止該項並標記移交 5F，不得擴權。
- 若變更後偵測到 API/RPC 呼叫方式有任何差異，視為未通過 Slice Gate。

## 13. Dependency

- 無上游依賴，獨立可執行。
- 與 5F 共用部分路由（Live 相關），但兩者範圍互斥、不重疊，不互相依賴完成順序。

## 14. 仍未涵蓋的完整 Phase 5 範圍

- LivePresenter 的視覺與功能改造（5F）。
- 教師端新統計資料（5F）。
- 教師報表計算方法論、隱私保護匯出功能（`docs/roadmap-colorplay-next.md` Remaining decisions，尚未有任何 spec 涵蓋）。

## 15. 客觀不可行的選項

- 「先做 LivePresenter 視覺、功能之後再補」：與 owner 已裁定的「視覺＋功能一起重新設計」矛盾，排除。
- 「班級卡分頁改成後端分頁以優化效能」：這會改變 API 契約，超出本文件範圍，若有效能需求應移交 5F 另案評估。
