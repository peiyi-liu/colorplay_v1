# Chapter 3 垂直切片 Umbrella Brief

- 日期：2026-08-10（2026-08-10 Codex review remediation 更新）
- 狀態：Umbrella brief（協調文件，非任一 Phase 的完整 spec）
- Owner approved：2026-08-10（五份 draft spec 邊界與依賴關係皆經 owner 核准）
- Codex design review completed
- Implementation planning：僅 Phase 4A 已授權（見 `docs/superpowers/plans/2026-08-10-phase-4a-student-chapter-detail-ui.md`）；2A/3A/5V/5F 尚未授權
- 完成任一 Slice Gate 不代表對應的完整 Phase 已完成
- 前身：本檔案原名 `2026-08-10-phase-2-3-4-chapter-three-slice-design.md`，經 owner 2026-08-10 remediation 裁定降級重構為 umbrella + 5 份獨立 draft spec。

> **本文件不是 Phase 2、Phase 3、Phase 4 或 Phase 5 的完整 spec。** 它只協調五份獨立 draft spec 之間的邊界與依賴關係。各 Phase 的實際範圍、排除項、待決事項，以各自的 draft spec 為準：
>
> - Phase 2A：`docs/superpowers/specs/2026-08-10-phase-2a-chapter-three-content-import-design.md`
> - Phase 3A：`docs/superpowers/specs/2026-08-10-phase-3a-chapter-three-progression-design.md`
> - Phase 4A：`docs/superpowers/specs/2026-08-10-phase-4a-student-chapter-detail-ui-design.md`
> - Phase 5V：`docs/superpowers/specs/2026-08-10-phase-5v-teacher-ui-ux-restyle-design.md`（2026-08-10 remediation 重新命名，範圍由「純視覺」擴大為「UI/UX」）
> - Phase 5F：`docs/superpowers/specs/2026-08-10-phase-5f-teacher-live-functional-design.md`（owner 已裁定全部待決問題）

## 1. 為什麼用第三章作為共同垂直切片

第三章（色彩表示）是目前唯一有實質內容量、且已是 UI 上唯一「可進入」的章節。用它作為五份 draft spec 的共同驗收對象，可以在內容還沒全部到位前，先把「內容匯入 → 學習歷程判定 → 學生端畫面 → 教師端可見度」這條路徑跑通一次，讓後續 5 章內容到位時有現成的驗證模式可套用。

**五份 spec 各自獨立立案、獨立 Slice Gate，可以平行開始撰寫與討論；但「完成」與「真實整合」之間有明確的依賴關係（見第 4 節 DAG）——不是完全互不相關，只是不強制排隊等待才能「開始」。實際執行順序見第 2 節 UI-First 裁定。**

## 2. UI-First 執行順序（Owner 2026-08-10 program sequencing 裁定）

此順序只調整**執行先後**，不新增任何產品規則，各 spec 第 1-2 節定義的範圍與排除項不因排序而改變：

```
1. 4A-UI
2. 5V-UI
3. 5F-U1
4. 2A
5. 3A
6. 5F-F2
7. Integration
```

**定義**：

- **5F-U1**：`docs/superpowers/specs/2026-08-10-phase-5f-teacher-live-functional-design.md` 範圍的**視覺/UI 子集**——只做 LivePresenter 視覺、以及教師統計區塊（Live 參與紀錄）的 layout／loading／empty／error／history UI states。使用 test/dev-only fixtures 開發，**不新增 API/RPC/RLS**，不得在 production runtime 顯示 sample data。
- **5F-F2**：5F 範圍的**功能子集**——之後才實作統計 RPC/RLS、server-authoritative aggregation、正式資料串接與 integration（對應 5F spec 第 1.3/1.6 節的計分與 RLS 規則）。
- **5V-UI 開始前**，必須先盤點與當時 Phase 1 AppShell/HUD/shared CSS 的檔案重疊範圍，避免重複改動或互相覆蓋。
- **4A/5V/5F-U1 可以標記「UI surface complete」**，但**不得標記為 feature complete 或 Phase complete**——這三者交付的都是介面層，底層資料/邏輯尚未串接。
- **2A/3A/5F-F2** 才會補齊各自對應的功能與真實資料契約，是這條順序裡真正「讓功能可用」的部分。

## 3. Phase 2A/3A/4A/5V/5F 責任邊界

| Spec | 負責什麼                                                                     | 明確不負責什麼                                                                       |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 2A   | 第三章的內容匯入：Sheet 結構、identifier 契約、兩種題庫、複習卡              | 完整 content publication lifecycle（版本凍結/發布/回滾）、前測後測                   |
| 3A   | 第三章的學習歷程判定：完成條件、循序解鎖、RLS、hosted 驗證邊界               | 教師存取例外、Admin 撤銷例外、完整評量/補救/經濟規則                                 |
| 4A   | 學生端章節體驗畫面（chapter-detail-page）的 typed view-model 與各狀態        | 與 2A/3A 的真實資料串接（可用 fixture 開發，不得宣稱功能完成）                       |
| 5V   | 教師端既有頁面的 UI/UX 調整（含 client-only 互動）                           | 任何 API/RPC/server state/計分/finalize/主持流程變更、新統計資料、LivePresenter 改造 |
| 5F   | LivePresenter 視覺/呈現要求＋viewport 契約、教師可見的 Live/自主統計計分規則 | 具體的按鍵/流程/RPC 變更（owner 本輪未提出項目）、部分給分機制                       |

## 4. 跨 spec Dependency DAG

```
2A（內容匯入）──┐
                ├──> 4A（學生端 UI：可先用 fixture 開發；真實整合完成依賴 2A+3A 皆通過 Slice Gate）
3A（學習歷程）──┘

5V（教師 UI/UX）── 獨立，不依賴 2A/3A/4A，也不依賴 5F

5F（教師/Live 功能，含 LivePresenter）── 獨立於 2A/3A/4A；
    與 5V 共用同一批路由但範圍互斥；owner 已裁定全部待決問題，現為 draft spec
    （owner 已裁定全部待決問題，含第 1.4 節取消場次名次規則）
```

- 2A 與 3A 互相獨立，皆可平行開始撰寫/討論/實作。
- **4A 可以在 2A/3A 完成前就開始開發**（用明確標示的 test fixture），但 4A 的「真實功能完成」宣稱，明確依賴 2A 與 3A 都各自通過 Slice Gate——這是真實的完成依賴，不是可以跳過的形式。
- 5V 不依賴任何其他 spec，可獨立執行，且不因 5F 是否完成而受影響。
- 5F 現為 draft spec（owner 已裁定全部 7 項問題＋2 項後續澄清，含第 1.4 節取消場次名次規則）。

## 5. 各 spec 的輸入／輸出契約

| Spec | 輸入                                                                      | 輸出                                                                                                                         |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 2A   | 重構後的 Google Sheet（5 分頁）、既有 `scripts/content/*` 腳本            | 更新後的匯入 pipeline、`產生題目識別碼` Apps Script（`CP-` 格式＋`LockService`）、第三章的 questions/review-cards 資料庫紀錄 |
| 3A   | 既有 migration（`chapter_sequence_access` 等）、staging 資料庫            | 正式 spec 文件、RLS 測試套件、第三章解鎖流程的 hosted 驗收證據（含 owner 授權紀錄與 fixture 清理紀錄）                       |
| 4A   | 2A/3A 的輸出契約（或開發期間的 test fixture）、4A 文件自身第 2 節視覺方向 | `chapter-detail-page` 的 typed discriminated view-model 定義、各狀態的 UI 實作                                               |
| 5V   | 既有教師頁面程式碼、08-02 賢者工坊設計語彙                                | 逐路由的 UI/UX 變更（不改 API/RPC/server state）                                                                             |
| 5F   | owner 對統計契約與 viewport 契約的裁定                                    | LivePresenter 視覺/呈現要求＋viewport 契約文件化、教師端 Live/自主正確率計分規則文件化                                       |

## 6. 各自獨立的 Slice Gate（不是 Phase Gate）

每份 draft spec 有自己的 Definition of Done 與 **Slice Gate**（詳見各檔案），本文件不重複列出。**「Slice Gate」與「Phase Gate」不是同一件事**——通過某份 spec 的 Slice Gate，代表該 spec 定義的狹窄範圍完成，**不代表對應的完整 roadmap Phase（2/3/4/5）已經完成**。任何報告/文件都不得用「Slice Gate 通過」暗示「Phase 完成」。

### Review 流程順序

```
owner/Claude 第一輪討論（brainstorming）
  → Codex 單次 review
  → Claude remediation（本文件所屬的這一輪）
  → owner 最終核准
  → 才進入 implementation plan
```

- 2A/3A/4A/5V/5F 各自 review 時機：owner 與該份 spec 討論完成後，才個別交給 Codex 做**一次** review。**禁止把多份 spec 打包成單一 review。**
- 本輪（2026-08-10）就是五份 spec 這次 Codex review 的 remediation，**不再啟動 Codex plugin、hook reviewer 或 sub-agent review**——下一次 review 只會在 owner 對 remediation 結果核准、且需要驗證新一輪修改時才觸發。

## 7. 第三章 Cross-Phase Integration Acceptance

**範圍：只涵蓋 2A + 3A + 4A。** 在 2A、3A、4A 各自的 Slice Gate 都通過後，另外執行一次跨 spec 整合驗收：以第三章實際資料，走過「內容存在→解鎖判定正確→畫面正確呈現」的完整路徑，確認三份 spec 的輸出契約彼此相容、串接無誤。

**明確聲明：此 integration acceptance 是額外的最後一道確認，不取代、不簡化、不能替代任一份 spec 自己的 Slice Gate。** 若 integration acceptance 發現問題，回歸該問題所屬的 spec 個別修正，不在 umbrella 層級直接修改行為。

**5V 是獨立的 UI/UX Slice Gate，不納入本次 integration acceptance**——5V 不依賴第三章的真實資料（純 UI/UX 調整），自己的 Slice Gate 通過即完成，不需要跟 2A/3A/4A 一起做整合驗收。

**5F（教師統計／LivePresenter）的 integration 是獨立的、之後才做的工作**——5F 完成後，另外執行「教師端能否正確看到第三章對應的 Live/自主統計」這項驗收，**不追加進本次 2A+3A+4A 的 integration acceptance**。先前版本文字暗示「教師端看得到資訊」屬於這次 integration 範圍，與 5F 被排除在外互相矛盾，本節已修正此矛盾。

## 8. 本輪執行限制

本輪（2026-08-10 Codex review remediation）僅修改規格文件本身：五份 draft spec 內容與本 umbrella brief，以及 `docs/roadmap-colorplay-next.md` 中直接引用這些文件的名稱/狀態文字。**未撰寫任何 implementation plan、未建立 worktree、未修改任何產品程式碼、migration、測試或 hosted 資源、未執行 commit 或 push。** Owner 仍在 Phase 0/1 開發期間，本輪僅止於規格文件的 remediation，等待 owner 最終核准。
