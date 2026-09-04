# Phase 5F：教師與 Live 功能 Design（Draft）

> **Rebaseline note (2026-09-02):** Owner 已選擇依既有 5F-F2 範圍盤點現況並補
> 缺口；研究匯出、自訂統計與長期趨勢仍排除。Current scope contract 見
> `2026-09-02-phase-2-5-6-scope-contracts.md`。此 scope 核准不等於 execution 或
> Hosted mutation 授權。

- 日期：2026-08-10（2026-08-10 Codex review remediation 更新）
- 狀態：Owner approved：2026-08-10
- Codex design review completed
- Implementation planning：5F-U1（LivePresenter UI Surface）已授權，見 `2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`；5F-F2（統計／伺服器語意）尚未授權（not yet authorized）
- 完成本文件定義的 Slice Gate 不代表對應的完整 Phase 已完成
- 對應：`docs/roadmap-colorplay-next.md` Phase 5（Live 與教師報表）的功能性子集，**不是 Phase 5 的完整 spec**。UI/UX 子集在 `2026-08-10-phase-5v-teacher-ui-ux-restyle-design.md`。
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`
- 前身：本檔案原為問題清單（`...functional-questions.md`），2026-08-10 owner 逐項裁定全部 7 項問題後升級為 draft spec；本次 Codex review 針對該版本提出更精確的統計契約與 LivePresenter viewport 契約，取代/refine 部分先前條文（見第 1.4 節例外）。

## 0. 明確聲明（Explicit Non-Claims）

本文件涵蓋會影響學生分數/排名/正式紀錄的邏輯。**不得將本文件的完成視為「Phase 5 完成」**——教師報表計算方法論、隱私保護匯出功能仍未被本文件或 5V 涵蓋。

## 1. Scope

### 1.1 LivePresenter 視覺與呈現要求

`src/features/live/components/live-presenter.tsx`（owner 2026-08-10 裁定，延續先前決策）：

- 不得有頁面層級的上下或左右滾動空間。
- 不得裁切畫面中的任何物件。
- 文字呈現需要更清楚明顯。
- 正確答案顯示需要更明顯、但不誇張的效果。
- Owner 未指出具體的按鍵位置/主持流程步驟/RPC 呼叫時機問題；本輪優化範圍限視覺/呈現層面，具體功能問題另案提出。

### 1.2 LivePresenter Viewport 契約（Codex review remediation，新增）

**驗收尺寸**（全部須通過，browser zoom 100%）：

- 1024×768
- 1280×720
- 1366×768
- 1920×1080

**所有尺寸下皆須成立**：

- 題目、答案、狀態與全部主持控制項完整可見。
- `document` 不得出現水平或垂直捲動。
- 不得裁切任何必要物件。
- 文字與控制項符合對比及可讀性要求（沿用既有 JRPG 批次的對比門檻）。
- 低於最小支援尺寸時，顯示「投影視窗過小」訊息。
- **不得以隱藏主持控制或裁切內容作為因應過小視窗的 fallback**——過小時明確告知，不是悄悄藏起功能。

### 1.3 教師端新統計資料：學生進度頁 Live／自主正確率

於 `/teacher/classes/:classroomId/members/:memberRef`（學生進度頁）新增「Live 參與紀錄」區塊，正確率拆分為「課堂 Live」與「課後自主」兩欄。

**摘要範圍（Codex review remediation，取代先前較粗略的版本規則）**：

- 摘要只計算**目前 active content version 啟用後**的全部有效活動。
- 畫面顯示 active version identifier 與啟用日期。
- **不使用隱藏的 7／30／90 天等 rolling window**——時間範圍由「目前 active version 啟用以來」自然定義，不是任意天數窗口。
- 新版本發布後，摘要自然重新開始計算（不是手動歸零，是範圍定義本身就只涵蓋當前版本）。
- 舊版本資料只留在具版本標示的歷史清單中，不併入當前摘要。
- **沒有有效資料時顯示「尚無資料」，不得顯示 0%**（與 Phase 4A 精熟度顯示的「不得顯示 0%」原則一致）。

**參與（participation）定義**：

- 必須有 **server join/participant record** 才算 Live 參與。
- Join 後中途離線，仍算參與。
- 從未 join 是缺席，**不建立 participation row**，不計入分子也不計入分母。

**Reconnect 規則（Codex review remediation，精確化先前規則）**：

- 只有伺服器在**原題的有效作答窗口內**收到的答案才被接受。
- 重新連線**不延長 deadline**。
- 截止後一律視為 timeout，**不允許補交**。
- Client 端的時鐘或離線狀態，不得用來決定作答有效性——一律以伺服器收到答案的時間為準。
- 這與先前版本「重新連線後補答算數」的裁定**不衝突，是同一規則的精確化**：只要學生在原始作答窗口關閉前，透過重新連線送出答案，該答案有效；窗口關閉後才送達的答案，無論是否重新連線，一律 timeout，不得補交。

**Live 摘要計算範圍**：

- 摘要（聚合正確率）只納入**正常完成、正式結算、目前版本、且學生確實 join** 的 Live 場次。
- **取消／非正式場次不計入摘要聚合正確率**（但仍出現在歷史列表中，見 1.4 節——摘要與歷史列表是兩個不同的呈現）。
- Timeout 題目：在正式納入摘要計算的場次中，計入分母、不計入分子。

**自主（課後）摘要計算範圍**：

- 只納入**目前版本正常完成**的 section challenge 與 chapter-final challenge。
- 排除：放棄／取消的 session、preview、測試資料、remediation 閱讀（補救複習不算正式測驗）。
- **計算方式：題目加權**——「總正確題數 ÷ 總有效題數」（跨所有納入計算的 session 加總後相除）。
- **禁止平均各場百分比**——不得先算出每場的正確率百分比再取平均，那樣會讓題數少的場次權重失真。

### 1.4 取消／非正式場次的歷史列表呈現

**決策歷程**：本節「名次」欄位的處理方式，owner 先前曾直接裁定「顯示伺服器實際計算出來的名次」（選項 A）；owner 於本次 remediation 明確做出較晚的裁定（選項 B），**正式覆蓋 A**：取消／非正式場次的名次固定顯示 `—`。此問題不再視為待決事項。

- 教師端「Live 參與紀錄」**歷史列表**（不是摘要）要顯示已取消／非正式結算的場次，標示「取消／資料不完整」。
- **名次**：固定顯示 `—`，**不得保存、不得顯示、不得由前端重算 provisional rank**。
- **正確率**：取消場次的歷史列不顯示正確率百分比。
- **顯示格式**：改用 server-confirmed 的「答對 X／已出題 Y」格式。`Y` 只包含**取消前實際送達該學生的題目**，不包含尚未出題的預定題數。所有數值由後端提供，前端不得自行推算。

### 1.5 平手與缺席的名次呈現（正常場次，非取消場次）

- **平手**：並列最高名次（同分者共享較高名次號碼，如兩人並列第 2 名，下一位是第 4 名）。
- **缺席**：學生中途離線/缺席，計入「參與」（見 1.3 節參與定義）。

### 1.6 隱私／RLS 邊界

本文件涵蓋的新統計資料，僅該班級的**擁有教師**（owner teacher）可見，不對其他有權限查看該學生的教師開放。

- 新統計必須由 **server-authoritative query/RPC** 計算，前端不得下載全部 answers 後自行聚合。
- 需定義 pagination、stable ordering、version binding、safe error envelope（見第 3 節 typed contract）。

## 2. Explicit Exclusions

- LivePresenter 的具體按鍵/主持流程/RPC 變更——owner 本輪未提出具體項目。
- 部分給分機制。
- 教師報表計算方法論、隱私保護匯出功能（roadmap Remaining decisions 尚未涵蓋）。

## 3. Typed Input/Output Contract

```
LiveParticipationSummary:
  activeContentVersion: { id: string; activatedAt: string }
  liveAccuracy: { correct: number; validQuestions: number } | 'no-data'
  autonomousAccuracy: { correct: number; validQuestions: number } | 'no-data'

LiveParticipationHistoryRow:
  sessionId: string
  activityTitle: string
  status: 'official' | 'cancelled-incomplete'
  # official 場次：
  accuracyPercent: number | null       # cancelled 時固定為 null，不顯示百分比
  rank: number | null                  # 正常場次為 server-computed rank（tie 依 1.5 節）；cancelled/非正式場次固定為 null，前端顯示為 `—`
  correctCount: number
  deliveredQuestionCount: number       # cancelled 場次時，僅計入取消前實際送達的題數
  completedAt: string | null

RLSErrorEnvelope:
  code: 'FORBIDDEN' | 'NOT_FOUND' | 'UNAUTHENTICATED'
  message: string   # 不洩漏其他教師/學生的存在性資訊
```

## 4. Existing AC Mapping

| AC                                                           | 適用性                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| AC-LIVE-004（Question payload 不含正解）                     | 適用於 LivePresenter 顯示邏輯                                                |
| AC-LIVE-005（Server deadline 防竄改）                        | 直接適用——見 1.3 節 Reconnect 規則                                           |
| AC-LIVE-007（Refresh／Reconnect 恢復）                       | 直接適用                                                                     |
| AC-LIVE-010（Live ranking 真實與隱私）                       | 直接適用——見 1.5/1.6 節                                                      |
| AC-TCH-001（Teacher Dashboard 正確統計）                     | 部分適用（本文件的統計資料屬學生進度頁，非 Dashboard，但計算正確性原則相同） |
| AC-TCH-009（Analytics filters）                              | 部分適用                                                                     |
| AC-SEC-003（Cross-user IDOR）                                | 直接適用——見 1.6 節 RLS 負向測試                                             |
| LivePresenter viewport 契約（第 1.2 節）、取消場次歷史列格式 | **AC-TBD**——現有 acceptance 文件無對應細節條目                               |

## 5. Task-Level Definition of Done

1. LivePresenter 視覺/呈現要求（1.1 節）與 viewport 契約（1.2 節）全數實作並於 4 個驗收尺寸驗證。
2. Live／自主正確率計算規則（1.3 節）實作，含 active-version 範圍、參與定義、reconnect 規則、題目加權計算。
3. 取消場次歷史列（1.4 節）全數實作，含名次欄位固定顯示 `—`。
4. RLS 負向測試（第 6 節）全數撰寫並通過。

## 6. Slice Gate（不等於 Phase Gate）

第 1-3 節全數實作並通過測試，即為本 slice 通過。

## 7. 正向與負向測試矩陣

| 情境                                                       | 類型             | 預期結果                                          |
| ---------------------------------------------------------- | ---------------- | ------------------------------------------------- |
| 學生 join 但中途離線                                       | 正向             | 計入參與，該場計入分母                            |
| 學生從未 join                                              | 正向             | 不建立 participation row，不進分子分母            |
| 學生在原窗口內因斷線重連後補答                             | 正向             | 答案有效，計分                                    |
| 學生在原窗口關閉後才重連補答                               | 負向（防退）     | 視為 timeout，不接受補交                          |
| 內容版本切換後查詢摘要                                     | 正向             | 只顯示新版本啟用後的資料，舊版本資料只在歷史列表  |
| 該班級沒有任何 Live 資料                                   | 正向             | 顯示「尚無資料」，不顯示 0%                       |
| 非本人教師查詢此統計資料                                   | 負向             | RLS 拒絕，回傳 `FORBIDDEN`，不洩漏存在性          |
| 其他班教師（非該班擁有教師）查詢                           | 負向             | RLS 拒絕                                          |
| 學生本人／匿名者查詢教師專屬統計                           | 負向             | RLS 拒絕                                          |
| 前端嘗試下載全部 answers 自行聚合                          | 負向（架構防退） | 不存在此路徑，統計一律經 server-authoritative RPC |
| 平手情境（兩人同分）                                       | 正向             | 並列最高名次，下一位跳號                          |
| 1024×768／1280×720／1366×768／1920×1080 四個尺寸，投影畫面 | 正向             | 皆無捲動、無裁切、控制項齊全                      |
| 視窗小於最小支援尺寸                                       | 負向（防退）     | 顯示「投影視窗過小」，不隱藏控制項                |

## 8. Hosted Mutation Owner Gate

本文件的統計資料查詢邏輯部署到 staging 驗證時，需 owner 明確授權，比照 Phase 3A 的 hosted 驗證邊界辦理。

## 9. Failure / Stop Conditions

- 若統計計算需要前端自行聚合才能實現，停止並回報，不得繞過 server-authoritative 原則。

## 10. Dependency

- 獨立於 2A/3A/4A。
- 與 5V 共用部分路由（學生進度頁的標題列視覺 vs 本文件的統計資料內容），範圍互斥不重疊。

## 11. 仍未涵蓋的完整 Phase 5 範圍

- 教師報表計算方法論、隱私保護匯出功能。
- LivePresenter 具體按鍵/流程/RPC 變更（若未來有明確需求）。
- 部分給分機制。

## 12. 客觀不可行的選項

- 「取消場次一律不顯示於歷史列表」：owner 已裁定要顯示，排除。
- 「逾時未答不計入分母」：owner 已裁定分母不排除逾時題目，排除。
- 「摘要用固定 rolling window（如近 30 天）」：Codex review 明確排除，改用 active-version 範圍，排除 rolling window 選項。
- 「各場正確率先算百分比再平均」：會讓題數不同的場次權重失真，Codex review 明確要求題目加權，排除平均法。

## 13. Delivery Slices（Owner UI-First 裁定新增，2026-08-10）

### 決策歷程

本文件第 1.1-1.6 節定義的是 5F 的**完整功能契約**（LivePresenter 視覺呈現要求＋viewport 契約＋教師端 Live／自主正確率統計＋取消場次歷史列＋RLS 邊界）。這些條文全部保留、不刪除——第 13 節不是修改第 1-12 節的產品規則，只是新增「這些規則什麼時候、分幾次交付」的排序決定。

先前的框架把 LivePresenter 的視覺呈現要求（第 1.1 節）與其餘功能語意（第 1.2-1.6 節）視為同一個不可拆分的整體，隱含「要嘛全部一起做，要嘛都不做」。owner 較晚在 UI-first program sequencing 裁定（見 `2026-08-10-chapter-three-umbrella-brief.md` 第 2 節）中正式取代這個框架：LivePresenter 的視覺／呈現／viewport／focus／keyboard／accessibility 工作可以獨立於統計與伺服器語意工作先行交付，稱為 **5F-U1**；統計資料、伺服器權威計分、reconnect／finalize 等功能語意留到 2A/3A 之後、稱為 **5F-F2**。

**這個較晚裁定不是授權用假資料或假按鈕做出「看起來完成」的靜態介面。** 5F-U1 必須在**既有 production-wired 的 LivePresenter**（`src/features/live/components/live-presenter.tsx`，經 `/teacher/live/:sessionId` route 掛載、走真實 hooks／repository／server state）上直接施工，只調整呈現層，不繞過、不取代任何既有資料流。

### 5F-U1：LivePresenter UI Surface

- 範圍：本文件第 1.1 節（視覺／呈現要求）與第 1.2 節（viewport 契約），加上既有 production 元件現有可達狀態的 focus／keyboard／accessibility 補強。
- 使用既有 production route（`/teacher/live/:sessionId`）、既有 hooks（`useLiveSession`／`useLiveTransition`／`useLiveStandings`）、既有 handlers（`runTransition`／`runCancel`／`onExit`）與既有 server state（`LiveSessionState`）——全部原樣保留，U1 不重新設計資料流。
- 只新增 client-side presentation：CSS／排版／對比／viewport 適配／focus-visible／keyboard order／`prefers-reduced-motion`／文字可讀性。
- 不新增任何 API／RPC／schema／query／mutation。
- 不修改計分、排名、題目時間、答案接受窗口、reconnect、finalize、cancel 的 lifecycle 或其判斷邏輯——這些全部由既有 Postgres 狀態機與既有 hook 決定，U1 只讀取、不改寫。
- Test-only harness fixtures 可以用來建置/驗證 Chromium viewport 快照，但**不得被 production route 或任何 production import path 引用**（比照 Phase 4A／5V 既有 `dev-harness/*` 隔離慣例）。
- 完成只能宣稱「5F-U1 LivePresenter UI surface complete」，**不宣稱**通過本文件第 6 節的 5F Slice Gate（Slice Gate 涵蓋第 1-3 節全部功能語意，U1 只完成其中第 1-2 節的視覺子集）。
- 詳細契約見 `docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`——該文件已完成 Codex 唯一一次 spec review 與 remediation，owner 已核准，implementation planning 已授權（implementation 本身尚未開始）。

### 5F-F2：功能語意補完

- 範圍：本文件第 1.3 節（教師端 Live／自主正確率統計）、第 1.4 節（取消場次歷史列）、第 1.5 節（平手／缺席名次）、第 1.6 節（RLS 邊界）——這些全部需要**新的 server-authoritative 資料契約**（新 RPC／新 query／新 aggregation），目前 production 完全不存在對應資料，U1 因此不得涉足，全部留到 F2。
- 新增或完成第 3 節 Typed Input/Output Contract 定義的 RPC／查詢層（`LiveParticipationSummary`／`LiveParticipationHistoryRow`／`RLSErrorEnvelope`）。
- 新統計與 version-scoped aggregation（第 1.3 節 active-version 範圍規則）。
- Join／reconnect／答案接受窗口的伺服器端規則驗證（第三方 AC-LIVE-005/007 對應的正式測試，U1 階段不執行、不宣稱驗證）。
- 取消／不完整場次的歷史紀錄呈現（第 1.4 節，含 server-confirmed 的「答對 X／已出題 Y」格式）。
- Finalize／排名的正式驗收（第 1.5 節平手規則的伺服器端驗證）。
- 需要 2A／3A 完成後才能以第三章真實內容驗證（教師統計資料依附第三章的真實作答紀錄）。
- Production network 與真實資料驗證：staging hosted 驗證（見第 8 節 Hosted Mutation Owner Gate），比照既有 Phase 3A hosted 邊界辦理。

### 與既有第 1-12 節的關係

第 13 節只決定「先交付什麼、後交付什麼」，不改變、不放寬、不加嚴第 1-12 節任何一條產品規則。第 6 節「Slice Gate」的定義（第 1-3 節全數實作並通過測試）維持不變——U1 完成不代表 Slice Gate 通過，只有 U1＋F2 都完成、且第 1-3 節全數驗證過，才算通過本文件定義的 Slice Gate。
