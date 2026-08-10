# Chapter 3 垂直切片 Umbrella Brief

- 日期：2026-08-10
- 狀態：Umbrella brief（協調文件，非任一 Phase 的完整 spec）
- 前身：本檔案原名 `2026-08-10-phase-2-3-4-chapter-three-slice-design.md`，經 owner 2026-08-10 remediation 裁定降級重構為 umbrella + 5 份獨立 draft spec。

> **本文件不是 Phase 2、Phase 3、Phase 4 或 Phase 5 的完整 spec。** 它只協調五份獨立 draft spec 之間的邊界與依賴關係。各 Phase 的實際範圍、排除項、待決事項，以各自的 draft spec 為準：
>
> - Phase 2A：`docs/superpowers/specs/2026-08-10-phase-2a-chapter-three-content-import-design.md`
> - Phase 3A：`docs/superpowers/specs/2026-08-10-phase-3a-chapter-three-progression-design.md`
> - Phase 4A：`docs/superpowers/specs/2026-08-10-phase-4a-student-chapter-detail-ui-design.md`
> - Phase 5V：`docs/superpowers/specs/2026-08-10-phase-5v-teacher-visual-restyle-design.md`
> - Phase 5F：`docs/superpowers/specs/2026-08-10-phase-5f-teacher-live-functional-design.md`（2026-08-10 owner 已裁定全部待決問題，現為 draft spec）

## 1. 為什麼用第三章作為共同垂直切片

第三章（色彩表示）是目前唯一有實質內容量、且已是 UI 上唯一「可進入」的章節。用它作為五份 draft spec 的共同驗收對象，可以在內容還沒全部到位前，先把「內容匯入 → 學習歷程判定 → 學生端畫面 → 教師端可見度」這條路徑跑通一次，讓後續 5 章內容到位時有現成的驗證模式可套用。

這不代表五份 spec 互相依賴排隊——各自獨立立案、獨立 gate，只是共用第三章當驗收素材。

## 2. Phase 2A/3A/4A/5V/5F 責任邊界

| Spec | 負責什麼 | 明確不負責什麼 |
|---|---|---|
| 2A | 第三章的內容匯入：Sheet 結構、識別碼、兩種題庫、複習卡 | 完整 content publication lifecycle（版本凍結/發布/回滾）、前測後測 |
| 3A | 第三章的學習歷程判定：完成條件、循序解鎖、RLS | 教師存取例外、Admin 撤銷例外、完整評量/補救/經濟規則 |
| 4A | 學生端章節體驗畫面（chapter-detail-page）的 view-model 與各狀態 | 與 2A/3A 的真實資料串接（可用 fixture 開發，不得宣稱功能完成） |
| 5V | 教師端既有頁面的純視覺調整 | 任何 API/RPC/狀態機/計分/finalize/主持流程變更、新統計資料、LivePresenter 功能改造 |
| 5F | LivePresenter 視覺/呈現要求、教師可見的 Live/自主統計計分規則 | 具體的按鍵/流程/RPC 變更（owner 本輪未提出項目）、部分給分機制 |

## 3. 跨 spec Dependency DAG

```
2A（內容匯入）──┐
                ├──> 4A（學生端 UI，可先用 fixture 開發，真實整合需等 2A/3A）
3A（學習歷程）──┘

5V（教師純視覺）── 獨立，不依賴 2A/3A/4A

5F（教師/Live功能，含 LivePresenter）── 獨立於 2A/3A/4A；
    與 5V 共用同一批路由，2026-08-10 owner 已裁定全部待決問題，現為 draft spec
```

- 2A 與 3A 互相獨立，皆可平行開始。
- 4A 的 UI 開發可以在 2A/3A 完成前用明確標示的 test fixture 資料先動工，但「真實功能完成」的驗收必須等 2A/3A 各自的 phase gate 通過。
- 5V 不依賴任何其他 spec，可獨立執行。
- 5F 尚未成案（見下）,不進入本輪 dependency 排程。

## 4. 各 spec 的輸入／輸出契約

| Spec | 輸入 | 輸出 |
|---|---|---|
| 2A | 重構後的 Google Sheet（5 分頁）、既有 `scripts/content/*` 腳本 | 更新後的匯入 pipeline、`產生題目識別碼` Apps Script、第三章的 questions/review-cards 資料庫紀錄 |
| 3A | 既有 migration（`chapter_sequence_access` 等）、staging 資料庫 | 正式 spec 文件、RLS 測試套件、第三章解鎖流程的 hosted 驗收證據 |
| 4A | 2A/3A 的輸出契約（或開發期間的 test fixture）、4.1 節視覺方向 | `chapter-detail-page` 的 typed view-model 定義、各狀態的 UI 實作 |
| 5V | 既有教師頁面程式碼、08-02 賢者工坊設計語彙 | 逐路由的視覺變更（不改行為） |
| 5F | owner 對其問題清單的逐項裁定（已完成） | LivePresenter 視覺/呈現要求文件化、教師端 Live/自主正確率計分規則文件化 |

## 5. 各自獨立的 Phase Gate

每份 draft spec 有自己的 Definition of Done 與驗收方式（詳見各檔案），本文件不重複列出。共同原則：

- 每個 gate 獨立通過、獨立 review，不因為「屬於同一次第三章切片」而共用或簡化驗收標準。
- 2A/3A/4A/5V 各自 review 時機：owner 與該份 spec 討論完成、核准後，才個別交給 Codex 做一次 review。**禁止把多份 spec 打包成單一 review。**

## 6. 第三章 Cross-Phase Integration Acceptance

在 2A、3A、4A、5V 各自的 phase gate 都通過後，另外執行一次跨 phase 整合驗收：以第三章實際資料，走過「內容存在→解鎖判定正確→畫面正確呈現→教師端看得到對應資訊」的完整路徑，確認四份 spec 的輸出契約彼此相容、串接無誤。

**明確聲明：此 integration acceptance 是額外的最後一道確認，不取代、不簡化、不能替代任一份 spec 自己的 phase gate。** 若 integration acceptance 發現問題，回歸該問題所屬的 spec 個別修正，不在 umbrella 層級直接修改行為。

5F 現已是 draft spec，但其驗收（LivePresenter 實際改版、教師新統計資料上線）仍是獨立工作項目，本輪 umbrella 的 integration acceptance 範圍維持只涵蓋 2A/3A/4A/5V；5F 完整實作後另外驗收，不追加進本次第三章 cross-phase acceptance。

## 7. 本輪執行限制

本輪（2026-08-10 remediation）僅做文件重構：拆分本檔案、建立 5 份 draft spec、修正 roadmap 引用文字。**未撰寫任何 implementation plan、未建立 worktree、未修改任何產品程式碼。** Owner 仍在 Phase 0/1 開發期間，本輪僅止於整理與討論 Phase 2A/3A/4A/5V/5F 的規格範圍。
