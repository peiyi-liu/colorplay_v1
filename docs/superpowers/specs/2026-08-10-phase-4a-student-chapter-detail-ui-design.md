# Phase 4A：學生端章節體驗 UI Surface Design（Draft）

> **Superseded in part on 2026-09-02:** 保留現行 JRPG 全貌與已工作的 UI；卡片、
> 小節／章節挑戰的 lock state 與唯一「繼續學習」操作改以
> `2026-09-02-section-progression-design.md` 為準。

- 日期：2026-08-10（2026-08-10 Codex review remediation 更新）
- 狀態：Owner approved：2026-08-10
- Codex design review completed
- Implementation planning：已授權（authorized，見 `docs/superpowers/plans/2026-08-10-phase-4a-student-chapter-detail-ui.md`）
- 完成本文件定義的 Slice Gate 不代表對應的完整 Phase 已完成
- 對應：`docs/roadmap-colorplay-next.md` Phase 4（學習大廳與章節體驗）的一個子集，**不是 Phase 4 的完整 spec**。
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`
- Dependency：真實資料依賴 Phase 2A（內容）與 Phase 3A（學習歷程判定）。開發期間可用明確標示的 test fixture，真實整合驗收需等 2A/3A 的 Slice Gate 皆通過。

## 0. 明確聲明（Explicit Non-Claims）

本文件只涵蓋 `chapter-detail-page`（`/app/chapters/:chapterId`）這一個路由的 UI surface。**不得將本文件的完成視為「Phase 4 完成」或「學生端全部改版完成」**。在 2A/3A 各自的 Slice Gate 通過前，**不得宣稱「章節體驗真實功能已完成」**。

## 1. Scope：路由清單

| 路由                                                    | 涵蓋               |
| ------------------------------------------------------- | ------------------ |
| `/app/chapters/:chapterId`（`chapter-detail-page.tsx`） | 是，本文件核心範圍 |

以下已知相關問題**不在本文件路由清單內**，另案處理：

- `/app`（學習大廳村莊地圖）手機版 375px 寬 Chapter 2/5 建築標籤文字裁切。
- `/app/missions`（小節任務選擇）手機版目前強制轉橫提示，與第 4 節手機策略不一致。

## 2. 視覺方向

本頁屬於「清單／進度類頁面」，採 Codédex 式深色扁平卡片：深色卡片＋細框線＋像素點陣標題字＋編號路徑＋鎖定內容用「???」樣式。精確顏色/間距/字重不在本文件定義，實作階段搭配前端 UI 相關 skills 產出。

## 3. Typed Discriminated View-Model Contract

```
type ChapterDetailViewModel =
  | { state: 'loading' }
  | {
      state: 'locked'
      unmetConditions: ServerUnmetCondition[]   # 伺服器回傳的具體未達成條件，不是前端推論
    }
  | { state: 'content-preparing' }
  | { state: 'content-readiness-error'; reason: string }
  | { state: 'error'; retryable: boolean; errorCode: string }
  | { state: 'in-progress'; chapterData: ChapterData }
  | { state: 'completed'; chapterData: ChapterData; masteryDisplay: MasteryDisplay }

type ServerUnmetCondition =
  | { type: 'previous_chapter_incomplete'; requiredChapterId: string }
  # 其餘條件類型於實作階段依 3A 的輸出契約補齊

type ChapterData = {
  reviewCards: { id: string; title: string; status: 'available' | 'completed' | 'locked' }[]
  sections: { id: string; title: string; status: 'available' | 'completed' | 'locked' }[]
  chapterFinal: { status: 'available' | 'completed' | 'locked' }
}

type MasteryDisplay = {
  primary: { masteryPercent: number; contentVersion: string }              # 跨版本最高有效精熟度
  secondary: { masteryPercent: number; contentVersion: string } | 'not-yet-attempted-this-version'
  merged: boolean   # true 表示 primary 與 secondary 版本/數值相同，合併顯示一行
}
```

**規則**：

- **「內容已發布但題目／卡片為空」是 `content-readiness-error`，不是正常的 empty state**——這代表內容管線本身有問題（例如發布流程漏了資料），需要明確的錯誤呈現與回報途徑，不能用「這裡還沒有內容」這種中性空狀態文案掩蓋。
- 每個 state 需定義：**標題、必要資訊、唯一 primary action、禁止的 action、retry 行為**（`error` 狀態的 `retryable` 欄位決定是否顯示重試按鈕；`content-readiness-error` 一律不可重試，因為問題在內容本身不在網路/暫時性故障）。
- 每個小節／複習卡有自己的 `available`／`completed`／`locked` 狀態，不是只有整頁層級的狀態。

## 4. Locked 與 Content-Preparing 的區分

- **視覺上明確區分**：不同圖示、不同文案、不同 accessible name（`aria-label`）。`locked` 是學生自己的進度未達成（前一章未完成），`content-preparing` 是內容還沒到位、與學生進度無關——不能共用同一種鎖定圖示，避免學生把「內容還沒寫好」誤解成「自己的問題」。

## 5. 手機版與捲動策略

- **原則**：直向為主，不強制轉橫。
- **禁止 document/root 層級水平 overflow。**
- **題目選項不得水平捲動**——選項文字過長時必須換行呈現，且 primary action（提交/確認按鈕）必須保持在可視範圍內，不能因為選項換行被推出畫面。
- **只有明確核准的子容器可以水平捲動**（例如地圖類型的軌道容器、明確標示可橫向瀏覽的卡片軌道），且需有視覺提示（捲動陰影/箭頭），不能是無提示的隱藏溢出。

## 6. Accessibility 與互動要求

- **Focus 管理**：狀態切換（如 locked → in-progress）時，焦點需移動到有意義的位置（不得停留在已消失的元素上）。
- **鍵盤操作**：所有互動元素（複習卡展開、小節/總測入口）需可鍵盤操作。
- **Loading announcement**：`loading` 狀態需有 `aria-live` 或等效機制告知螢幕閱讀器使用者。
- **Error announcement**：`error`／`content-readiness-error` 狀態同樣需要 `aria-live` 或 `role="alert"` 等效機制。
- **Reduced motion**：任何轉場動畫需遵守 `prefers-reduced-motion` 與專案既有的 `[data-reduced-motion='true']` 雙通道規則（沿用既有 JRPG 批次慣例）。

## 7. 精熟度顯示（Owner 裁定，2026-08-10 Codex review remediation 版本）

- **主要顯示**：跨版本最高有效精熟度，及其對應的版本識別碼。
- **次要顯示**：目前 active content version 的最新有效成績；若目前版本沒有有效嘗試，顯示「目前版本尚未測驗」。
- **合併規則**：主要與次要顯示的版本與數值相同時，合併成一行呈現，不重複顯示兩次相同資訊。
- **不得顯示為 0%**——沒有有效嘗試時用文案（「目前版本尚未測驗」）取代數字 0%，避免誤讀成「精熟度是零」。
- **這兩項屬於個人學習機制資訊，不屬於「累積/總體正確率」的隱藏範圍**——第 8 節的隱藏規則不適用於精熟度顯示。

## 8. 學生端 metric visibility inventory

| 顯示項目                                | 學生端可見 | 說明                                 |
| --------------------------------------- | ---------- | ------------------------------------ |
| 逐題即時對/錯回饋                       | 是         | 學習機制必要                         |
| 精熟度過關門檻                          | 是         | 學習機制必要，格式見第 7 節          |
| 複習卡完成進度                          | 是         | 學習機制必要                         |
| 錯題複習時的正確答案與解析              | 是         | 補救機制必要                         |
| 連續答對 N 題的連擊（combo）顯示        | 是         | 不算累積統計，是即時遊戲回饋         |
| 累積/總體正確率（跨多次測驗的彙總統計） | **否**     | Owner 裁定收起，避免學生刷題衝高數字 |

## 9. Existing AC Mapping

| AC                                                                         | 適用性                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AC-UI-003（320px 無水平 overflow）                                         | 直接適用——見第 5 節                                                                     |
| AC-UI-006（Loading／empty／error 不可空白）                                | 直接適用——本文件把「空題庫」重新分類為 content-readiness-error，比 AC-UI-006 原意更嚴格 |
| AC-UI-007（頁面無 console／network 異常）                                  | 直接適用                                                                                |
| AC-UI-008（扁平化設計與視覺降載）                                          | 適用於視覺方向（第 2 節）                                                               |
| AC-UI-014（當前位置、進度與狀態持續可見）                                  | 直接適用                                                                                |
| AC-UI-015（點選、Focus、Pending 與錯誤狀態可辨識）                         | 直接適用——見第 6 節                                                                     |
| Typed view-model 的 content-readiness-error 分類、雙版本精熟度合併顯示規則 | **AC-TBD**——現有 acceptance 文件無對應細節條目                                          |

## 10. Task-Level Definition of Done

1. Typed view-model（第 3 節）實作完成，7 種狀態皆有對應 UI。
2. `content-readiness-error` 與傳統 `empty` 狀態明確區分，不共用同一元件/文案。
3. Locked 與 content-preparing 視覺/文案/accessible name 皆可區分（見第 4 節）。
4. 手機版捲動策略（第 5 節）通過 320px/375px 寬度的無水平 overflow 驗證。
5. Accessibility 要求（第 6 節）逐項驗證。
6. 精熟度雙版本顯示（第 7 節）依規則實作，含合併與「尚未測驗」文案情境。

## 11. Slice Gate（不等於 Phase Gate）

`chapter-detail-page` 的 7 種 view-model 狀態、locked/content-preparing 區分、捲動策略、accessibility 要求、精熟度顯示規則全數實作並通過測試，即為本 slice 通過。真實資料整合仍需 2A/3A 的 Slice Gate 通過才算完整驗收（見 dependency）。**通過本 Slice Gate 不代表 Phase 4 完成。**

## 12. 正向與負向測試矩陣

| 情境                                      | 類型             | 預期結果                                                           |
| ----------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| 章節已解鎖、內容完整                      | 正向             | `in-progress` 或 `completed` 狀態正確顯示                          |
| 章節已解鎖、內容為空（發布流程異常）      | 正向（分類測試） | 顯示 `content-readiness-error`，不是 empty state                   |
| 章節因前一章未完成而鎖定                  | 正向             | `locked` 狀態，顯示伺服器回傳的 unmetConditions                    |
| 內容準備中（尚未發布）                    | 正向             | `content-preparing` 狀態，與 locked 視覺/文案/accessible name 不同 |
| 精熟度：目前版本有嘗試且與歷史最高相同    | 正向             | 合併顯示一行                                                       |
| 精熟度：目前版本無嘗試                    | 正向             | 顯示「目前版本尚未測驗」，不顯示 0%                                |
| 393px/375px/320px 寬度，選項文字過長      | 負向（防退）     | 選項換行，document 無水平 overflow，primary action 仍可見          |
| 嘗試在地圖軌道以外的容器製造水平捲動      | 負向（防退）     | 除核准子容器外，不得出現水平捲動                                   |
| Screen reader 使用者於 loading/error 狀態 | 正向（a11y）     | 有對應 announcement                                                |

## 13. Hosted Mutation Owner Gate

本文件本身不涉及 hosted 資料寫入（純前端 UI 契約）。真實資料串接驗收時的 hosted 邊界，依 Phase 2A／3A 各自文件的 Hosted Mutation Owner Gate 辦理。

## 14. Failure / Stop Conditions

- 若 2A/3A 的輸出契約與本文件第 3 節定義的 view-model 輸入不相容，停止並回報，不得在前端自行推斷/補完缺漏的 unmetConditions 或 mastery 資料。
- 若發現「內容為空」被錯誤分類為 empty 而非 content-readiness-error，視為未通過 Slice Gate。

## 15. Dependency

- 上游：Phase 2A（內容）、Phase 3A（學習歷程判定）。
- 開發期間可用明確標示為 test fixture 的資料先行開發 UI；**真實功能完成的宣稱**必須等 2A/3A 的 Slice Gate 皆通過。

## 16. 仍未涵蓋的完整 Phase 4 範圍

- 學習大廳（村莊地圖）、小節任務選擇等其他路由（見第 1 節路由清單外的已知問題）。
- 教師端相關工作（見 Phase 5V／5F）。
- Phase 6 全站 JRPG 視覺統一。

## 17. 客觀不可行的選項

- 「用 fixture 資料開發完後直接視為功能完成、跳過與 2A/3A 的真實整合驗證」：與本文件「不得宣稱真實功能完成」的聲明直接衝突，排除。
- 「空題庫沿用一般 empty state 文案」：會掩蓋內容管線的真實問題，排除。
