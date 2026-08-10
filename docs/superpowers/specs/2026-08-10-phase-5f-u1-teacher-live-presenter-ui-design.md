# Phase 5F-U1：LivePresenter UI Surface Design

- 日期：2026-08-10
- 狀態：Owner approved：2026-08-10／Codex single spec review completed／Claude Code single plan review completed／Plan remediation completed／Authorized for implementation
- 母文件：`docs/superpowers/specs/2026-08-10-phase-5f-teacher-live-functional-design.md` 第 13 節「Delivery Slices」
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`
- Implementation：已授權；專用 worktree 實作進行中
- 完成本文件範圍不代表 5F 完成、Phase 5 完成，也不代表通過 5F Slice Gate

## 0. 明確聲明（Explicit Non-Claims）

本文件只涵蓋 LivePresenter（`src/features/live/components/live-presenter.tsx`）的**呈現層**。所有計分、排名、reconnect、finalize、cancel 的判斷邏輯，以及教師端的 Live／自主正確率統計，全部**不**在本文件範圍內，留給 `2026-08-10-phase-5f-teacher-live-functional-design.md` 第 13 節定義的 5F-F2。本文件也不是 LivePresenter 的重新設計——是在既有 production-wired 元件上做一次視覺／可用性補完。

## 1. Objective

在**既有 production-wired** 的 LivePresenter 上完成初步 UI surface：viewport 適配、focus／keyboard 可操作、accessibility 補強、投影可讀性，並保留現有全部 production behavior 原樣不動。不是重寫元件、不是重新設計互動流程，是在既有真實資料流上做呈現層施工。

具體交付物：

1. 針對母文件第 1.2 節定義的 4 個投影 viewport，驗證並在必要時調整既有 CSS，使版面在這些尺寸下不裁切、不出現 `document` 或根層捲動。
2. 為 `draft` 與 `cancelled` 兩個目前主體區塊缺失視覺的既有可達狀態，補上誠實的主體內容（見第 3 節）。
3. 補完 focus-visible 對比驗證、keyboard order 驗證、`prefers-reduced-motion` 支援（見第 8 節）。
4. 把 LivePresenter 的 accessibility 語意從 modal dialog 修正為 full-screen route region（見第 8.5 節）。
5. 規劃（不執行）對應的 dev-only Chromium harness 與測試矩陣，供未來核准的 implementation plan 使用。

## 2. Explicit Non-Goals

- 新增 API／RPC／schema／query／mutation。
- 新增或呈現任何統計資料（Live／自主正確率、參與紀錄——全部屬於 5F-F2）。
- 新增或變更 hosting semantics（開場／開題／收題／暫停／續行／推進／結算／取消的判斷邏輯與 Postgres guard）。
- 任何假資料進入 production runtime（`sample`／`mock`／`placeholder` 數值一律禁止出現在正式路由渲染路徑）。
- 2A／3A 涵蓋的內容匯入或學習歷程判定功能。
- 正式的 5F Slice Gate 驗收（見母文件第 6 節）。
- 重新設計主持流程本身（例如新增/移除某個 transition、改變按鈕出現的階段）——`hostConsoleView()` 定義的按鈕出現規則完全保留。
- 新增第三套 phase discriminated union，或修改 `projectorView()`／`hostConsoleView()` 既有邏輯——`draft`／`cancelled` 的補完只新增 JSX 呈現分支，不動這兩個既有純函式。
- 新增離開投影的 transition 或 server mutation——`onExit` 既有行為與出現時機（podium／cancelled）不變。
- LivePresenter 以外的任何路由或元件（教師其餘頁面已由 Phase 5V 處理；學生端 Live 畫面 `live-session-page.tsx` 不在本文件範圍）。

## 3. Existing-Contract Matrix

逐項列出目前 production 已經存在的資料／handler，U1 只能在這些既有輸入上做呈現，不得新增資料來源。資料來源：`teacher-live-session-page.tsx`（route component）、`live-presenter.tsx`（LivePresenter 本體）、`live-phase-view.ts`（typed 投影規則）、`use-live-session.ts`／`use-live-commands.ts`（hooks）。

| Current data / input                                                                                                                                            | Current handler                                                                           | U1 presentation                                                                                                           | F2 deferred behavior                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `LiveSessionState.state`（`draft`／`lobby`／`question_open`／`paused`／`question_feedback`／`completed`／`cancelled`），經 `useLiveSession` 輪詢＋realtime 取得 | 無（讀取用）                                                                              | 驅動既有 `projectorView()` 7 態 discriminated union（見第 4 節）；U1 逐態驗證於 4 個投影 viewport 下正確呈現              | 無——狀態機本身不動                                                                          |
| `state.question.deadlineAt`／`openedAt`＋`state.serverTime`                                                                                                     | 既有純函式 `tick()`（`live-clock.ts`）                                                    | `CountdownRing` 既有行為保留；U1 只調整環形計時器的尺寸／對比以適配 4 個 viewport                                         | Reconnect／deadline 的伺服器端強制邏輯不受影響（本就是伺服器端保證）                        |
| `state.participantCount`／`state.participants`                                                                                                                  | 無                                                                                        | Lobby 加入名單 chips；U1 提供有界子容器（見第 6 節）承載大量參與者                                                        | 無                                                                                          |
| `state.answeredCount`                                                                                                                                           | 無                                                                                        | 即時作答計數文字                                                                                                          | 無                                                                                          |
| `question.publicOptions`                                                                                                                                        | 無，純渲染                                                                                | 已有 shape＋color 雙重編碼選項列（`OPTION_ORDER`／`SHAPE_SYMBOLS`）；U1 驗證投影距離下的可讀性與對比（含第 5 節邊界字數） | 無                                                                                          |
| `state.optionCounts`／`state.correctOptionId`                                                                                                                   | 無                                                                                        | Reveal 長條圖，正解已有 ✓ 符號＋文字標示（非純顏色）；U1 驗證對比與 viewport 適配                                         | 無                                                                                          |
| `useLiveStandings` hook（Top 5，伺服器 `limit 5`）                                                                                                              | 既有 hook，經 `repository?` DI                                                            | `StandingsBoard` 排行榜；U1 提供有界子容器承載最多 5 筆                                                                   | 無                                                                                          |
| `state.podium`（伺服器 `limit 3`）                                                                                                                              | 無                                                                                        | 頒獎台，皇冠／獎牌圖示＋名次＋分數；U1 驗證最多 3 筆時的 viewport 呈現                                                    | 無                                                                                          |
| `hostConsoleView(state).hostActions` → footer buttons                                                                                                           | `runTransition(name)` → 既有 `useLiveTransition` hook → `transition.mutate(...)`          | 主持控制按鈕視覺／尺寸調整；handler 原樣沿用，pending 時既有 `disabled={transitionPending}` guard 原樣保留                | 無                                                                                          |
| 取消挑戰兩步確認流程                                                                                                                                            | `runCancel()` → 既有 `transition.mutate({transition:'cancel',...})`，成功後 navigate      | 保留兩步確認 UI／文案；只做視覺調整                                                                                       | 無                                                                                          |
| 離開投影按鈕（podium／cancelled 才顯示）                                                                                                                        | `onExit` → `navigate('/teacher/live')`（既有）                                            | 保留；U1 驗證觸控區與 focus                                                                                               | 無                                                                                          |
| 靜音切換                                                                                                                                                        | 本地 `setMuted` state ＋ `PresenterAudio` engine（既有）                                  | 保留；U1 驗證觸控區 ≥44×44px                                                                                              | 無                                                                                          |
| `draft` 態                                                                                                                                                      | `hostConsoleView` 已回傳 `hostActions: [primary('startSession'), secondary('cancel')]`    | **U1 新增主體視覺**：見第 3.1 節                                                                                          | 無——純 UI 補完                                                                              |
| `cancelled` 態                                                                                                                                                  | 無（`projectorView` 已回傳 `{kind:'cancelled'}`，`hostConsoleView` 回傳空 `hostActions`） | **U1 新增主體視覺**：見第 3.2 節                                                                                          | 無——純 UI 補完                                                                              |
| 教師端「Live 參與紀錄」統計區塊                                                                                                                                 | **不存在**——沒有對應 repository method 或資料                                             | **完全不在 U1 範圍**——見第 3.3 節                                                                                         | 整個功能（新 RPC、新聚合、新 UI states）——見母文件 1.3／1.4／1.6 節與第 3 節 typed contract |

### 3.1 `draft` 態最終契約（本輪 remediation 定案）

**先前版本的錯誤假設**：先前版本認為 `draft` 態透過現有 production 進場路徑（`teacher-live-page.tsx` 的 `launchFor` 一律 createSession＋startSession 一起送出）不可達，因此不特別設計視覺。**這個假設本身是錯的**——`draft`／`cancelled` 都是 production 狀態機的合法狀態，一般導覽路徑不會停在 `draft`，不代表 deep link（直接帶 sessionId 造訪 `/teacher/live/:sessionId`）、頁面重新整理時的競態（refresh 時 session 剛好還在 `draft`）、或 transition race（另一分頁尚未完成 `startSession`）下不可達。U1 必須為 `draft` 提供誠實主體，不得假設它不會被看到。

**契約**：

- 標題：「場次準備中」。
- 說明文字：明確告知目前尚未進入等待室（例如「尚未開放學生加入，請稍候或開啟等待室」），不得暗示已經可以加入。
- 主持控制：沿用既有 footer 的 `startSession`（primary）／`cancel`（secondary，經 header 既有取消流程）actions——`hostConsoleView` 對 `draft` 態本就回傳這兩個 action，U1 只需確保 footer 正確渲染它們，不新增資料或 handler。
- 不顯示任何參與人數、題目或計時器相關內容（這些在 `draft` 態的 `LiveSessionState` 上本就沒有意義／未初始化）。

### 3.2 `cancelled` 態最終契約（本輪 remediation 定案）

盤點確認：header 區塊已正確處理 `cancelled`（`phase === 'podium' || phase === 'cancelled'` 才顯示「離開投影」；`phase !== 'podium' && phase !== 'cancelled'` 才顯示「取消挑戰」），但主體內容區的四個既有分支（`lobby`、`question`/`paused`、`reveal`、`podium`）沒有一個匹配 `phase === 'cancelled'`，導致取消後主體是空白。

**契約**：

- 標題：「本場已取消」。
- 說明文字：明確告知本場不會產生正式名次或完整正確率（例如「這場挑戰已取消，不會產生正式名次或完整正確率」）——用詞需與母文件第 1.4 節「取消／資料不完整」的精神一致，但本節文案是投影頁專屬，不與該節教師歷史列文案混用。
- 離開路徑：使用既有 `onExit`（header 既有「離開投影」按鈕，不新增第二個離開入口）。
- **不得顯示** provisional rank（臨時／推算名次）或任何正確率百分比——`cancelled` 態的 `LiveSessionState` 型別上也沒有這些欄位可用，這與型別現況一致，不是新增限制。
- 不需要任何新的 API、RPC 或資料查詢——`state.state === 'cancelled'` 這個既有欄位已經足夠判斷。

### 3.3 教師端「Live 參與紀錄」統計區塊——完全不在 U1 範圍

該統計區塊目前在 production 完全沒有對應的 repository method 或資料查詢，不像 LivePresenter（含 `draft`／`cancelled`）是「有真實資料，只是呈現需要補強」；U1 的核心原則是「只在既有 production 輸入上施工」，統計區塊沒有這樣的既有輸入可用，任何呈現都會落入「用 fixture 假裝功能存在」的風險。因此整個統計區塊（資料＋UI）完整移到 5F-F2。

## 4. Typed UI States

**U1 不新增任何新的 discriminated state type，也不修改 `projectorView()`／`hostConsoleView()` 既有邏輯。** `src/features/live/lib/live-phase-view.ts` 已經是唯一投影規則來源（ADR 0004），已從 production `LiveSessionState` 推導出兩組現成的 typed union：

- `ProjectorPhaseView`（`LivePresenter` 使用）：`draft` / `lobby` / `question` / `paused` / `reveal` / `podium` / `cancelled`，共 7 態，每態帶 `ambientLoop` 屬性。
- `HostConsolePhaseView`（footer 主持控制按鈕使用）：`draft` / `lobby` / `question` / `paused` / `reveal` / `completed` / `cancelled`，各自帶對應的 `hostActions` 陣列（`transition` ＋ `precedence`）。

型別形狀參考（非完整原始碼，只列欄位供 review 對照；實作以 `live-phase-view.ts` 現有原始碼為準）：

```
ProjectorPhaseView:
  { kind: 'draft'; ambientLoop: null }               # U1 新增視覺分支的目標
  | { kind: 'lobby'; ambientLoop: 'lobby' }
  | { kind: 'question'; ambientLoop: null }
  | { kind: 'paused'; ambientLoop: null }
  | { kind: 'reveal'; ambientLoop: null }
  | { kind: 'podium'; ambientLoop: null }
  | { kind: 'cancelled'; ambientLoop: null }          # U1 新增視覺分支的目標

HostConsolePhaseView:
  { kind: 'draft' | 'lobby' | 'question' | 'reveal' | 'completed' | 'cancelled';
    hostActions: readonly { transition: LiveTransitionName; precedence: 'primary' | 'secondary' }[] }
  | { kind: 'paused'; frozenSeconds: number; hostActions: readonly HostAction[] }
```

U1 直接複用這兩組既有型別。實作缺口只在**呈現面**（`draft`／`cancelled` 兩個既有可達 kind 目前沒有對應 JSX 分支，見第 3.1／3.2 節），不是**型別面**。

## 5. Production Content Bounds 與 LivePresenter 顯示契約

下表的 schema/RPC 上限是 production 資料可接受的全站範圍，不等於 1024×768 的 LivePresenter 可讀顯示上限。`questions.prompt` 與 `question_options.option_text` 同時服務 Quiz／複習流程，U1 不得為 Live 單獨收緊這兩個共用 CHECK。

| 內容項目                            | 硬上限                                                                                          | 來源                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Question prompt length              | 1–1000 字元                                                                                     | `questions.prompt` CHECK（`20260714000200_content_taxonomy.sql:59`）                                                                                                                    |
| Option text length                  | 1–500 字元                                                                                      | `question_options.option_text` CHECK（`20260714000200_content_taxonomy.sql:72`）                                                                                                        |
| Option count                        | 2–4 個                                                                                          | `jsonb_array_length(frozen_options) between 2 and 4`（`20260714000300_quiz_engine.sql:38`）＋`question_options.sort_order between 1 and 4`（`20260714000200_content_taxonomy.sql:74`）  |
| Participant display name length     | 1–30 字元                                                                                       | `profiles.display_name` CHECK（`20260713000100_create_profiles.sql:6`）——LivePresenter 顯示的 `displayName` 全部源自此欄位（lobby wall／reveal／standings／podium 共用同一上限）        |
| Participant count（lobby 加入人數） | **查無硬上限**——`classroom_members`／`live_participants` 無對應 CHECK constraint 或 RPC `limit` | 已查證 `supabase/migrations/*.sql` 全部 61 個檔案，`classroom_members`（`20260717000100_classrooms.sql`）與 `live_participants`（`20260717000600_live_schema.sql`）建表語句均無人數上限 |
| Podium entry count                  | 3 筆                                                                                            | finalize/state RPC 的 `limit 3`（`20260724000200_live_presenter.sql:334`）                                                                                                              |
| Standings entry count               | 5 筆                                                                                            | `live_session_standings` RPC 的 `limit 5`（`20260724000200_live_presenter.sql:423`）                                                                                                    |

**Owner 裁定（2026-08-10）與 Chromium 實測定案**：LivePresenter 專用顯示上限為**題幹 36 字／每個選項 21 字／4 個選項**。真實最長 74／50 在 1024×768 的初始 baseline 量得 presenter `scrollHeight=1411px`（`clientHeight=768px`）；36／21 在四個正式 viewport 均保留題幹 `51.2px`（1024px 寬）／`52px`（其餘寬度）與選項 `32px`、四選項全文可見、無 root 捲動。最緊的 1280×720 中 header `50.5px`、footer `52px`、主體 `581px`，主體與上下控制各留約 `6.25px`；相鄰的 37／21 與 36／22 均越界。120／40 因無法滿足同一契約而否決。

以 `artifacts/content/questions.csv` 重算，此上限使既有 62 題中 11 題題幹、248 個選項中 22 個選項需改寫。

**強制邊界**：U1 只強制 Presenter fixture／Chromium presentation contract。現有 `LiveSectionOption` 不含題幹／選項，若在建立 Live 時做 client-side validation，必須新增 query/data contract，超出 U1；真正 content enforcement 優先移交 2A import gate，若需 server-authoritative guard 則移交 5F-F2。此 deferred enforcement 不阻塞 U1 獨立交付，但在落地前不得宣稱 production 已全面強制內容上限。

## 6. Presenter Viewport Contract（本輪收緊）

**驗收尺寸**（全部須通過，browser zoom 100%）：

- 1024×768
- 1280×720
- 1366×768
- 1920×1080

**根層與核心內容——不得捲動，`overflow:auto` 不構成通過條件**：

- `.live-presenter` 根層在四個尺寸下**不得產生水平或垂直捲動**——`.live-presenter` 目前的 `overflow: auto` **不能被視為通過條件**，那只是瀏覽器允許捲動的宣告，不代表版面真的不會超出 viewport；U1 必須讓根層在正常內容量下實際不觸發捲動。
- Header（狀態列＋靜音／取消／離開）、狀態文字、核心題目 prompt、public options、footer 主持控制，必須固定留在 viewport 內，**不得依靠捲動才能看到**。

**允許有界子容器 overflow 的範圍——僅限以下兩處**：

1. Participant chips wall（lobby 加入名單）。
2. Standings list（reveal 階段 Top 5 排行榜）。

這兩處以外的任何區域，不得以「內部可以 overflow」為由迴避根層不可捲動的要求。有界子容器必須符合：

- 鍵盤可達（可用 Tab 進入，並用方向鍵／捲動鍵操作）。
- 具備 accessible label（例如 `aria-label="已加入同學名單"`／`aria-label="目前排行榜"`）。
- 不得遮住 header 或 footer。

**Too-small predicate（本輪定案）**：

- Viewport width `< 1024px` 或 height `< 720px` 時，顯示「投影視窗過小」訊息。
- 四個 owner 核准的正式 viewport（1024×768／1280×720／1366×768／1920×1080）**絕對不能觸發** too-small 判定——1024×768 剛好等於門檻（`width === 1024` 且 `height === 768 > 720`），predicate 必須用嚴格小於（`<`），不得用小於等於，否則會誤判最小的正式尺寸。
- Too-small harness 以 `cancelled`（或 podium）這類 DOM 原本就有「離開投影」的 phase 驗證既有 `onExit`；進行中的 lobby／question／paused／reveal 不新增 exit control，維持第 8.5 節「進行中沒有離開路徑」的既有 hosting semantics。Too-small 提示不得遮住 phase 原本已有的離開控制。
- Too-small 時刻意保留 header 與 footer、隱藏 phase 主體；footer transition 在此狀態是否應停用仍待 owner 裁定，本輪不改變既有 handler 或可操作性。

## 7. Viewport Fixture Matrix（本輪新增）

以下 fixture 全部使用第 5 節查證到的 production 硬上限或 Chromium 定案的 LivePresenter boundary case，**不得以一般短文案 fixture 宣稱 viewport 契約通過**：

| Fixture               | 內容設計                                                                                             | 覆蓋 viewport                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `draft`               | 場次準備中主體（第 3.1 節）                                                                          | 四個正式 viewport                                                           |
| `lobby-boundary`      | 參與者數量刻意設為大量（例如 60 人，代表大班級量級）＋每筆 display name 皆用 30 字元上限             | 四個正式 viewport；lobby wall 的捲動行為至少在 1024×768、1280×720 額外驗證  |
| `question-boundary`   | prompt 36 字／4 個 option 各 21 字（Task 2 Chromium 定案）；不得使用 schema 1000／500 冒充可顯示上限 | 四個正式 viewport；核心內容不捲動的驗證至少在 1024×768、1280×720 額外驗證   |
| `paused-boundary`     | 同 `question-boundary` 的內容邊界，額外驗證 `CountdownRing` 凍結顯示                                 | 四個正式 viewport；同上額外於 1024×768、1280×720 驗證                       |
| `reveal-boundary`     | option count 用上限 4；每個選項的作答數（`optionCounts`）用足以撐開長條圖寬度的最大值                | 四個正式 viewport；同上額外於 1024×768、1280×720 驗證                       |
| `podium-boundary`     | 恰好 3 筆（伺服器硬上限），每筆 display name 用 30 字元上限                                          | 四個正式 viewport                                                           |
| `cancelled`           | 本場已取消主體（第 3.2 節）                                                                          | 四個正式 viewport                                                           |
| `too-small-cancelled` | cancelled phase，viewport 低於 1024×720（例如 900×600）                                              | 額外情境；驗證訊息與 cancelled 原有安全離開路徑，不替進行中 phase 新增 exit |
| `reduced-motion`      | `lobby`／`podium` 場景搭配 `page.emulateMedia({ reducedMotion: 'reduce' })`                          | 只需於 1 個代表性 viewport（建議 1280×720）驗證動畫停用，不需四個尺寸重複   |

四個正式 viewport 都需覆蓋全部 7 個核心 phase（`draft`／`lobby-boundary`／`question-boundary`／`paused-boundary`／`reveal-boundary`／`podium-boundary`／`cancelled`）；高風險的 boundary fixture（`lobby-boundary`／`question-boundary`／`paused-boundary`／`reveal-boundary`）至少要在 1024×768（最小正式尺寸）與 1280×720 執行，這兩個尺寸最容易先觸發溢出。

## 8. Interaction Contract

### 8.1 Handler 綁定

- 每個 enabled 的主持控制項，必須連到既有的 production handler（見第 3 節矩陣）——不得新增看起來可操作、實際上沒有 handler 支撐的按鈕。
- U1 中若某個控制項沒有既有 handler 支援，處理方式二選一：省略該控制項；或顯示為 `disabled` 並附上原因文字（例如「需等待下一版功能」），不得留下沒有任何反應的假可點擊元件。
- 禁止新增 dead controls：任何 U1 新增的按鈕／連結，必須在合入前對照第 3 節矩陣確認有對應既有 handler。

### 8.2 Pending 與狀態辨識

- Pending 時避免重複操作：footer 按鈕的 `disabled={transitionPending}` 既有 guard 保留；U1 驗證 pending 態的視覺回饋（loading label／disabled 樣式）在四個 viewport 下皆清楚可辨。
- 狀態不得只靠顏色：目前取消按鈕（文字標籤＋顏色）、正解標示（✓ 符號＋文字＋顏色）已經是雙重或三重編碼，U1 需維持這個原則、不得因為視覺重新設計而退化成純顏色判斷。

### 8.3 Focus 與鍵盤

- Focus-visible：全站已有 `:focus-visible { outline: var(--focus-ring-width) solid var(--color-info); outline-offset: 3px; }` 全域規則會套用到 `.live-presenter` 內的按鈕，但**從未針對 LivePresenter 的深色背景（`var(--pixel-night-deep)`）驗證過對比是否達 UI-STATE-001 的 3:1 門檻**——U1 需驗證並視需要為 `.live-presenter` 範圍內的 focus ring 提供對比調整（不是新增焦點機制，是驗證＋必要時調色）。
- Keyboard order：驗證 header（靜音／取消／離開）→ 主體內容（若有可聚焦元素，例如第 6 節的有界子容器）→ footer 控制項的 Tab 順序符合視覺順序。

### 8.4 動效與可讀性

- Reduced-motion：`globals.css:1285-1298` 已以全域 `*` 規則把所有動畫 duration 壓到 `0.01ms !important`、iteration 壓到 1；`globals.css:6802-6806` 另已把 podium fireworks 設為 `animation:none`。但 wall chip 的 `live-wall-pop` 與 podium step 的 `live-podium-reveal` 在 reduced-motion 下 computed `animation-name` 仍是具名 keyframes。U1 需以 scoped `animation:none` 補齊這兩者；Chromium RED 判準是現況 `animation-name` 仍具名，GREEN 統一驗證 `animation-name:none`。
- Projector readable typography：投影距離下的可讀性優化（字級／字重／對比），沿用既有 pixel 字體系統（`--font-pixel-tc`／`--font-pixel-latin`）與既有 JRPG 批次對比門檻，不引入新字體家族。

### 8.5 Full-Screen Region Accessibility（本輪修正，取代原 Dialog 語意）

**先前版本的錯誤假設**：先前版本把 LivePresenter 定義為 `role="dialog" aria-modal="true"` 的 modal overlay，並依此討論「Dialog 明確關閉」規則的適用性。**這個假設是錯的**——LivePresenter 是投影模式的**主要畫面**（一整個 route 的內容），不是疊加在其他內容上的彈出視窗；它沒有「背後還有其他可互動內容」的語意，也沒有真正的 modal 使用情境（例如不會有背景頁面同時存在）。

**契約**：

- LivePresenter 的根元素**移除** `role="dialog"` 與 `aria-modal="true"`。
- 改為具有 accessible name 的 full-screen region：`role="region"` ＋ `aria-label="Live 投影模式"`（或等價文案，實作時可微調用詞，但需維持「投影模式」語意）。
- 既有流程完全保留：`podium`／`cancelled` 才顯示的「離開投影」按鈕與既有 `onExit` handler 不變；進行中（`lobby`／`question`／`paused`／`reveal`）沒有離開路徑的現況也不變——這是既有主持流程設計本身的限制（投影進行中刻意不讓教師誤觸離開），不是本輪修正的對象。
- 不新增新的離開 transition 或 server mutation，不新增 dead control。

## 9. Visual Direction

延續 ColorPlay 既有扁平 2D／Codédex-inspired 像素視覺語彙，但需額外適合教室投影情境：

- 高對比：深色背景（沿用既有 `--pixel-night-deep`）搭配高對比文字與控制項，確保投影機／教室後排可讀。
- 大型題目與答案區：題目與選項文字尺寸需比一般 UI 元件明顯放大，優先保證投影可讀性而非資訊密度。
- 主持控制與學生投影內容需有清楚視覺層級：header（狀態列＋主持控制）與主體投影內容（題目／答案／排行榜／頒獎台）之間需有明確的視覺分隔，不得讓兩者混淆。
- Reveal 正解列保留既有 `scale(1.06)` 放大強調；U1 以 chart 右內距容納 transform 外擴，避免正式 viewport 溢出，reduced-motion 仍沿用既有 `transform: none`。
- 不使用玻璃擬態（glassmorphism）、多層陰影堆疊或裝飾性持續動畫——與既有 JRPG 像素扁平語彙一致，裝飾性動畫只能是既有的、一次性的轉場提示（cue），不得引入持續播放的裝飾動效。
- 不污染 `.teacher-*`、`.chapter-*`、`.admin-*` 既有 ownership 命名空間——LivePresenter 已有專屬的 `.live-presenter*` 命名空間（本輪實測 `.live-presenter` 字樣 90 處、45 個 unique name、71 個行首 selector），U1 新增規則必須延續此命名空間，不得跨界修改其他 namespace 的既有規則。
- Token 使用範圍限於既有 pixel／night 系列變數（`--pixel-night-deep`、`--pixel-window-frame`、`--pixel-gold-deep` 等）與既有 `--font-pixel-tc`／`--font-pixel-latin`，不新增新的色彩或字體 token，除非既有 token 確實無法滿足對比要求（若發生，需在 implementation plan 階段個別提出，本文件不預先核准新增 token）。

## 10. AC Mapping（本輪修正）

**正式 Existing AC Mapping（適用於 U1 範圍內可驗證的呈現層規則）**：

- AC-UI-008（扁平化設計與視覺降載）——適用，第 9 節視覺方向直接對應。
- AC-UI-013（圖示隱喻與教育情境一致）——適用，第 3 節已確認正解標示／頒獎台圖示既有雙重編碼，U1 驗證不劣化。
- AC-UI-015（點選、Focus、Pending 與錯誤狀態可辨識）——適用，第 8.2／8.3 節直接對應。

**移除 AC-UI-011（Dialog 明確關閉與提示一致）的正式適用宣稱**：第 8.5 節已把 LivePresenter 從 `role="dialog"` 修正為 `role="region"`，U1 完成後它不再是 Dialog，AC-UI-011 定義的 Dialog 關閉規則不再是判斷 LivePresenter 是否合格的正式依據。既有的離開路徑限制（進行中無法離開）作為 region 的既有設計現況記錄於第 8.5 節，不套用 Dialog 系列規則評估。

**Touch target**：若母文件既有 AC 對應有涵蓋觸控區大小的正式條目，沿用該既有映射；本文件不自行發明新的 AC 編號。

**母文件第 4 節既有 AC 對應——U1 階段的驗證邊界說明**：

母文件第 4 節列出的 `AC-LIVE-004`／`AC-LIVE-005`／`AC-LIVE-007`／`AC-LIVE-010` 等，全部是伺服器權威行為（payload 不含正解、deadline 防竄改、reconnect 恢復、ranking 真實性），**不是**呈現層規則。U1 不修改任何相關邏輯，因此：

- U1 **不驗證、不宣稱通過**這些 AC——驗證需要真實的伺服器互動測試（`tests/e2e/live-smoke.spec.ts`／`live-advanced.spec.ts` 這類全端 E2E 已涵蓋部分，非本文件新增範圍）。
- U1 的結構性保證是「零邏輯變更」——第 3 節矩陣逐項確認每個既有 handler／hook 呼叫方式不變，因此這些 AC 原本的保證狀態不會因為 U1 的 CSS／排版調整而劣化。這是「不劣化」的保證，不是「通過驗證」的宣稱，兩者不得混為一談。

**AC-TBD**：母文件第 1.2 節 LivePresenter viewport 契約、本文件的 `draft`／`cancelled` 態視覺補完，目前 acceptance 文件均無對應細節條目（沿用母文件第 4 節已標記的 AC-TBD 狀態，本文件不新增號碼）。

## 11. Test Boundary（規劃，本輪不執行；範圍已收斂）

本節只規劃測試範圍，不在本輪撰寫或執行任何測試。

**RTL（jsdom）——範圍收斂**：

- 只驗證：`draft`／`cancelled` 兩個新視覺分支的渲染內容、既有 handler 綁定（`startSession`／`cancel`／`onExit` 呼叫方式不變）、pending 狀態的既有 guard、`role="region"`／`aria-label` 的 accessible semantics。
- **不得宣稱 JSDOM 能驗證實際 media-query CSS**——`prefers-reduced-motion` 的實際渲染行為（動畫是否真的停用）JSDOM 無法可靠驗證，這部分完全交給 Chromium harness（見下）。
- 在 `live-presenter.test.tsx`（既有 249 行、8 個既有測試）與 `live-pages.test.tsx`（既有 `TeacherLiveSessionPage (host console)` 區塊）基礎上新增，不得破壞既有測試的既有斷言（例如 `openQuestion`／`finalize` 呼叫參數斷言）。

**Chromium（四個投影 viewport＋reduced-motion＋too-small）**：

- 比照 Phase 4A（`chapter-detail-page.harness.tsx`＋`playwright.chapter-detail-harness.config.ts`，port `4176`）與 Phase 5V（`teacher-routes.harness.tsx`＋`playwright.teacher-routes-harness.config.ts`，port `4177`）既有模式，建立 dev-only harness，經既有 `repository?` DI seam 注入第 7 節定義的 fixture。
- **Chromium 專用 port 定案為 `localhost:4178`**（不與既有 `4173`／`4176`／`4177` 衝突），設定 `--strictPort`、`reuseExistingServer: false`，比照既有兩個 harness config 的固定 port 慣例。
- Reduced-motion 驗證方式：`page.emulateMedia({ reducedMotion: 'reduce' })`，先確認 RED 現況 wall/podium 的 `animation-name` 仍為具名 keyframes，再以 scoped CSS 使 `live-wall-pop`／`live-podium-reveal`／`podium-fireworks` computed `animation-name` 全部為 `none`。全域 duration `0.01ms !important` 已存在，不能以 duration assertion 代替 `animation-name:none`。
- 同時驗證：**正常模式**（未 emulate reduced-motion）下，既有核准的一次性功能提示（例如 reveal／fanfare 音效觸發的視覺 cue）仍然保留，不因為新增 reduced-motion 支援而被誤刪。
- Overflow／console checks：`document.documentElement.scrollWidth`／`scrollHeight` 於四個正式 viewport 下不得超出 `clientWidth`／`clientHeight`；console／page error 數為 0。

**既有全端 E2E 不重複**：`tests/e2e/live-smoke.spec.ts`／`live-advanced.spec.ts` 已經是走真實登入／真實 Supabase 的完整流程驗收，U1 新增的 Chromium harness 是輕量、fixture-only 的呈現層驗證，兩者互補、不互相取代。

本輪不建立 implementation plan，也不撰寫或執行上述任何測試——以上是 spec 層級的規劃，供未來 Codex review 通過、owner 核准 implementation plan 後的實作依據。

## 12. Completion Boundary

完成本文件範圍的實作後，只能宣稱：

**「5F-U1 LivePresenter UI surface complete」**

完成的必要條件包含：`draft`／`cancelled` 兩個既有可達狀態的誠實主體視覺（第 3.1／3.2 節）、四個投影 viewport 下根層與核心內容零捲動（第 6 節）、full-screen region accessibility 語意修正（第 8.5 節）、`prefers-reduced-motion` 支援（第 8.4 節）——這些都是本文件範圍內的必要交付項，不是可選項。

不得宣稱：

- 5F complete
- Phase 5 complete
- Slice Gate passed（母文件第 6 節定義的 Slice Gate 涵蓋第 1-3 節全部功能語意，U1 只完成其中的視覺子集）
- production-ready

## 13. Dependency / Deferred Table

| 項目                                                                                         | 負責範圍                        | 依賴                                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| LivePresenter 視覺／viewport／focus／keyboard／accessibility（含 `draft`／`cancelled` 補完） | 5F-U1                           | 無（獨立於 2A／3A／4A／5V）                                                   |
| 教師端 Live／自主正確率統計（新 RPC＋UI）                                                    | 5F-F2                           | 2A（第三章內容）＋3A（學習歷程／作答紀錄）真實資料才能有意義驗證              |
| 取消場次歷史列（server-confirmed 格式）                                                      | 5F-F2                           | 新 RPC；獨立於 2A／3A，但與統計功能共用同一批資料表                           |
| 平手／缺席名次的伺服器端驗證                                                                 | 5F-F2                           | 既有 finalize RPC 的驗收測試（AC-LIVE-010）                                   |
| RLS 負向測試（第 1.6 節）                                                                    | 5F-F2                           | 新 RPC 完成後才能撰寫對應負向測試                                             |
| 5F 完整 Slice Gate（母文件第 6 節）                                                          | U1＋F2 皆完成                   | 兩個 slice 全部完成，且第 1-3 節全數驗證通過                                  |
| 第三章 Cross-Phase Integration（教師端能否看到第三章統計）                                   | 獨立於本文件，5F 完成後另外執行 | 見 umbrella brief 第 7 節，明確排除於 2A+3A+4A 的 integration acceptance 之外 |

## 14. Open Questions（本輪已收斂）

先前版本列出的三項 open question，本輪 remediation 已全部定案，不再保留：

1. ~~`cancelled` 態視覺的具體文案／版面~~——已於第 3.2 節定案；`draft` 態也一併定案於第 3.1 節。
2. ~~新 Chromium harness 的 port 選號~~——已定案為 `localhost:4178`（第 11 節）。
3. ~~`.live-presenter` 根層 `overflow: auto` 是否需要收斂為明確的子容器 overflow~~——已定案：根層不可捲動，只允許第 6 節列出的兩個有界子容器（participant wall、standings list）捲動。

第 5 節的 production content bounds 查證確認**不存在**需要 owner 裁定的核心內容策略問題（participant count 雖無硬上限，但屬於明確歸類的非核心可捲動區域，不構成 blocker）。本節目前無待決問題。

## 15. 明確排除（重申邊界）

- 不修改 `teacher-live-session-page.tsx` 的 transition 派發邏輯、版本衝突處理或 `hostConsoleView`／`projectorView` 的判斷規則本身。
- 不修改 `use-live-session.ts`／`use-live-commands.ts` 任何 hook 的 query key、mutation payload 或 repository 介面。
- 不修改 `presenter-audio.ts`／`live-clock.ts`／`live-audio-cue.ts` 的既有邏輯（U1 可能微調音量／視覺提示的呈現時機說明文字，但不改變其判斷條件）。
- 不修改學生端 Live 畫面（`live-session-page.tsx`）——該元件不在本文件範圍，未來若有 UI 需求需另立文件。
- 不建立、不修改任何 Supabase migration、RLS policy 或 RPC 定義。

## 16. 盤點來源（References）

本文件第 3 節與第 5 節的既有現況盤點與 content bounds 查證，皆為唯讀讀取以下檔案得出，不依 spec 想像程式碼已存在：

| 檔案                                                                                  | 行數        | 用途                                                                                                        |
| ------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `src/app/router/create-app-router.tsx`                                                | —           | 確認 `/teacher/live/:sessionId` route 掛載方式（`lazy`，無手動 props）                                      |
| `src/features/live/pages/teacher-live-session-page.tsx`                               | 128         | Route component；transition 派發、cancel／exit handler                                                      |
| `src/features/live/components/live-presenter.tsx`                                     | 500         | LivePresenter 本體；phase 渲染分支、header／footer 控制                                                     |
| `src/features/live/lib/live-phase-view.ts`                                            | 209         | `projectorView`／`hostConsoleView` typed 投影規則來源（ADR 0004）                                           |
| `src/features/live/lib/live-action-copy.ts`                                           | 41          | 既有按鈕文案表（`actionCopy`）與 transition 錯誤文案                                                        |
| `src/features/live/components/live-presenter.test.tsx`                                | 249         | 既有單元測試（8 個），涵蓋 lobby／question／reveal／podium／音效／靜音                                      |
| `src/features/live/pages/live-pages.test.tsx`（host console 區塊）                    | —           | `TeacherLiveSessionPage` 的 transition／version-conflict／結算導頁測試                                      |
| `tests/e2e/live-smoke.spec.ts`、`tests/e2e/live-advanced.spec.ts`                     | —           | 既有全端 E2E（真實登入／真實 Supabase），非本文件新增範圍                                                   |
| `src/styles/globals.css`（`.live-presenter*` 選擇器）                                 | 86 個選擇器 | 既有 CSS；確認無 `@media` 斷點、無 `prefers-reduced-motion` 覆寫、無 focus-visible 覆寫                     |
| `supabase/migrations/20260714000200_content_taxonomy.sql`                             | —           | `questions.prompt`（1–1000）、`question_options.option_text`（1–500）、`sort_order`（1–4）CHECK constraints |
| `supabase/migrations/20260714000300_quiz_engine.sql`                                  | —           | `frozen_options` 陣列長度 2–4 CHECK constraint                                                              |
| `supabase/migrations/20260713000100_create_profiles.sql`                              | —           | `profiles.display_name`（1–30）CHECK constraint                                                             |
| `supabase/migrations/20260724000200_live_presenter.sql`                               | —           | Podium `limit 3`、standings `limit 5`                                                                       |
| `supabase/migrations/20260717000100_classrooms.sql`、`20260717000600_live_schema.sql` | —           | 確認 `classroom_members`／`live_participants` 無人數上限 CHECK constraint                                   |

本文件不建立 worktree、不修改上述任何檔案、不啟動第二個 reviewer，全部是唯讀盤點。
