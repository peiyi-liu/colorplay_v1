# UI、視覺系統與響應式規格

## 1. 視覺定位

ColorPlay 採用手機優先的扁平化介面。視覺系統的首要目標不是增加裝飾，而是讓學生快速辨識「目前在哪裡、正在做什麼、下一步要按哪裡」。遊戲化獎勵必須支持學習任務，不得搶走主要注意力。

設計原則：

- 先呈現學習任務，再呈現 XP、Token、頭像與排行。
- 每個學生核心任務畫面只有 1 個 primary action。
- 正誤、選取、等待與失敗狀態不能只靠顏色。
- 手機優先，平板與桌面擴展。
- 動畫只提供狀態回饋，不得持續吸引注意力。
- 所有核心操作必須可由鍵盤、觸控與螢幕閱讀器完成。

### 1.1 扁平化設計與認知負荷控制

**UI-FLAT-001**：核心學生介面使用簡潔 2D 色塊、邊框、留白、字級與字重建立層級。

**UI-FLAT-002**：禁止在核心操作介面使用下列元素作為主要視覺語言：

- 3D 模型或擬真 3D 場景。
- 浮雕、斜角、金屬質感、皮革質感、玻璃擬態。
- 多層陰影製造立體按鈕。
- 立體字、陰影字或大量描邊字。
- 無功能目的的持續循環動畫。

**UI-FLAT-003**：允許 Modal、Dropdown、Toast、浮動教學提示使用單層低強度陰影，以表達必要層級。單一元件不得疊加多層陰影；核心內容卡優先使用邊框與背景差異，不依賴陰影。

**UI-FLAT-004**：動畫只用於下列情境：

- 回答已送出。
- 正確、錯誤或獎勵結果。
- 元件進入或離開。
- Loading／pending 狀態。

任何非必要動畫不得持續超過 1.2 秒；`prefers-reduced-motion` 必須移除位移、縮放與閃爍。

### 1.2 視覺層級與主要行動限制

**UI-ACTION-001**：每個學生核心任務畫面只能有 1 個 primary action。例：登入頁的「進入學習大廳」、Quiz 回饋頁的「我理解了，下一題」。

**UI-ACTION-002**：同一個視覺操作群組內，最多出現 2 個同等權重的主要選項；超過 2 個時必須使用明確層級、選單、分段控制或次要按鈕。

**UI-ACTION-003**：不得以「整頁最多兩個 HTML 超連結」作機械限制。真正限制的是同一任務區塊內的視覺競爭：

- 學生核心任務區塊：1 個 primary action。
- 同層級高權重 action：最多 2 個。
- Student top-level navigation：最多 4 個目的地。
- Teacher 管理頁可有更多操作，但需分組、分層與漸進揭露。

**UI-ACTION-004**：單一學生核心畫面建議同時使用不超過 3 種功能性色彩；品牌色、中性色與正誤語意色不計入。不得讓多個高彩度色塊同時競爭注意力。

### 1.3 文字輸入最小化

**UI-INPUT-001**：能以選擇、點擊、掃描、班級邀請碼或既有 profile 資料完成的任務，不要求學生重新輸入文字。

**UI-INPUT-002**：學生核心流程不得重複要求輸入已存在於 Auth profile、class membership 或 quiz session 的資料。

**UI-INPUT-003**：圖示可用於高頻且熟悉的操作，但以下操作必須具有可見文字標籤：

- 送出答案。
- 離開 Quiz。
- 刪除或重置資料。
- 購買獎勵。
- 請求學習協助。

## 2. Design tokens

> **2026-07-19 GGAME 對齊（權威）：** 本節以下的具體色值屬歷史基線；自 UI Restyle phase 起，權威 token 為本框的「GGAME token 體系」，以三層結構落於 `src/styles/tokens.css`（唯一定義點）。衝突時以本框為準；本節其餘規則（flat 2D、對比、狀態可視性）不變。
>
> - **Primitive**：`--yellow-brand: #ffd600`（主色）、`--amber-avatar: #ffb300`（頭貼底）、`--surface-page: #f4f6fa`（頁面底）；slate／rose／emerald／indigo／sky／amber 沿用 Tailwind 色階；`--radius-card: 24px`、`--radius-control: 12px`；字體 Noto Sans TC 300–900（@fontsource 自架，禁 Google Fonts CDN）。
> - **Semantic**：`--color-primary`（黃）、`--color-teacher`（indigo）、`--color-xp`（rose）、`--color-token`（emerald）、`--color-alert`（amber）、`--surface-card`（白）、`--border-subtle`（slate-200）。
> - **元件語彙**：Card（24px 圓角白卡＋subtle 邊框）、Chip、StatTile、ProgressBar、OptionButton（rose/sky/amber/emerald 四色＋▲■●◆ 形狀符號，狀態不得只靠顏色）、HintCallout（tier1 rose／tier2 yellow 左邊框）、MapStepper、VictoryCard、DataTable。
> - **圖示／動效**：lucide-react＋emoji；禁 FontAwesome CDN；動效一律尊重 `data-reduced-motion`。
> - **紀律**：元件與畫面內禁止裸 hex；一律引用 `var(--…)` token。
> - **視覺參考**：`legacy/ggame-ui-reference-2026-07-18.html`（唯讀快照；僅視覺對照，不得複製其程式碼進產品源碼）。

### Color

```css
--color-brand-dark: #0f172a;
--color-brand-yellow: #ffeb04;
--color-primary: #7c3aed;
--color-primary-strong: #6d28d9;
--color-info: #2563eb;
--color-success: #047857;
--color-danger: #b91c1c;
--color-warning: #b45309;
--color-bg: #f8fafc;
--color-surface: #ffffff;
--color-border: #cbd5e1;
--color-text: #0f172a;
--color-muted: #475569;
--focus-ring-width: 3px;
```

規則：

- Brand yellow 主要搭配 dark text，禁止白字放黃色上。
- Success／danger 的文字色使用較深 token；亮色可作背景但須通過 WCAG AA。
- 正確：顏色 + ✓ +「答對」文案。
- 錯誤：顏色 + ✕ +「答錯」或正解文案。
- Warning 與 error 不得共用完全相同的顏色與圖示。

### Typography

- UI：`Noto Sans TC` 或可靠系統 sans-serif fallback。
- Brand mark：`Comfortaa` 可使用，但不得用於長文、表單或題幹。
- Body mobile 最小 16px。
- 輔助文字最低 12px，僅限非關鍵 metadata；關鍵說明不得低於 14px。
- 行高：body 1.5–1.75。
- 不得使用字體拉伸、斜切或 3D 特效建立層級；使用字級、字重與留白。

### Spacing

採 4px base：4、8、12、16、20、24、32、40、48、64。

- 同類元件使用相同 spacing token。
- 問句、輸入與提交按鈕之間不得插入無關內容。
- 表單群組內建議 vertical gap 為 12–24px。

### Radius

- control：8–12px。
- card：16px。
- hero／major panel：24px。
- pill 僅用於 badge、status 與短標籤。

### Shadow

- 一般內容卡：無陰影或單層輕陰影。
- Modal／Dropdown／Toast：最多一層陰影。
- 禁止以 inset shadow 模擬浮雕按鈕。
- 禁止用多層陰影取代清楚的邊框與 focus ring。

## 3. Breakpoints 與 viewport

必要支援：

- 最小寬度：320px。
- 驗收手機：375×812。
- 驗收平板：768×1024。
- 驗收桌面：1440×900。

規則：

- 320–767：單欄、底部或可折疊導航、主要按鈕視情況全寬。
- 768–1023：雙欄內容，可保持側邊資訊。
- ≥1024：最大內容寬度 1280px，避免無限制拉寬。
- 任一核心頁面在 320px 不得水平捲動。
- 行動裝置高度計算優先使用 `dvh`／Visual Viewport，而不是只使用固定 `100vh`。
- 固定底部 action bar 必須考慮 safe-area inset 與軟體鍵盤。

## 4. 導覽

### Student

- Mobile top-level destinations 最多 4 個。
- Desktop 可使用 header 或 sidebar，但全站需一致。
- 顯示目前頁面、目前角色與可返回的上層位置。
- Quiz 進行中不得讓一般導覽搶走主要操作；離開需確認。

### Teacher

教師後台與學生頁面需有明顯視覺區隔，但共用 design system。教師 route 不可僅靠隱藏入口保護。

## 5. 核心元件

### 5.1 Button

狀態：default、hover、focus-visible、active、selected、disabled、loading、success、error。

- 最小可點擊區 44×44 CSS px。
- Loading 時保留原寬度與高度，避免 layout shift。
- Icon-only button 必須有 accessible name。
- Disabled 需同時降低視覺權重並提供不可操作原因；不得只降低 opacity。
- Primary、secondary、tertiary 層級需全站一致。

#### 問句與操作的自然配對

**UI-MAP-001**：問句、輸入控制與負責提交該輸入的主要按鈕，必須位於同一個具語意的視覺容器，例如同一個 form、card、dialog 或 fieldset。

**UI-MAP-002**：問句與主要按鈕之間不得插入無關的章節、廣告、排行、獎勵卡或其他獨立內容。

**UI-MAP-003**：提交按鈕不可只固定在與輸入內容缺乏視覺關聯的頁面最底部。若使用 sticky action bar，必須在表單區保留清楚關聯，並確保 action bar 不遮擋內容。

**UI-MAP-004**：每個 interaction group 必須可透過 DOM 標記追蹤，例如 `data-interaction-group`；驗收可據此檢查每組 primary action 數量。

### 5.2 Input

- Label 不可只用 placeholder。
- Error message 與 input 使用 `aria-describedby`。
- Focus ring 清楚，不能只靠瀏覽器不明顯預設。
- 不得在學生流程使用自動 focus 導致頁面載入即彈出鍵盤，除非經 UX 驗證。

#### 行動裝置虛擬鍵盤

**UI-KBD-001**：手機或平板軟體鍵盤顯示時，正在輸入的欄位與完成該任務的 primary action 都必須可被找到並操作。

**UI-KBD-002**：不得要求使用者先手動收起鍵盤，才能找到或點擊提交按鈕。

**UI-KBD-003**：可使用下列一種或多種方式處理：

- Visual Viewport API。
- `100dvh` 與安全區 inset。
- 可滾動的 form/dialog body。
- `scrollIntoView({ block: "nearest" })`。
- 鍵盤顯示時調整 sticky action bar。

**UI-KBD-004**：只在 desktop viewport 縮小高度不構成完整驗收。Release candidate 至少要有一台真實 iOS 或 Android 裝置，提供 OS 軟體鍵盤可見的 screenshot 或 video。

### 5.3 Card

- 標題、內容、action hierarchy 一致。
- 卡片整體可點擊時仍需鍵盤可操作與明確 focus。
- 卡片不得依靠 3D 翻轉才能取得必要資訊。
- 學習內容卡與獎勵卡必須有清楚視覺區隔。

### 5.4 Icon

**UI-ICON-001**：圖示必須符合教育情境中的一般語意，不得以緊急救援隱喻表達一般課業協助。

**UI-ICON-002**：一般學習求助不得使用 `SOS`、警報器、救護車或傷害／危難圖示。建議使用 `?`、`HELP`、「取得提示」或「請求協助」。

**UI-ICON-003**：首次出現、低頻或非標準圖示必須搭配文字。重要流程操作不可只顯示圖示。

**UI-ICON-004**：同一功能在所有頁面使用相同圖示與標籤；同一圖示不得在不同頁面代表不同功能。

**UI-ICON-005**：Icon-only button 必須提供 `aria-label`，並在 hover/focus 時提供 tooltip 或等價說明。

### 5.5 Toast

- Success／info 可自動消失；error 需足夠時間或可手動關閉。
- 不作為唯一錯誤訊息來源。
- 使用 aria-live 適當 politeness。
- Toast 不得遮擋 quiz primary action、timer 或 mobile keyboard 上方操作。

### 5.6 Dialog／Modal

- Focus trap、Esc、關閉後返回原焦點。
- Mobile 不可超出 visual viewport。
- 敏感確認需明確 action 文案，不使用模糊「確定」。

#### 明確離開指示

**UI-DIALOG-001**：所有非阻塞型 Dialog 至少提供一個可見的關閉方式。一般資訊型 Dialog建議同時提供：

1. 右上角關閉按鈕。
2. 下方具體主要行動，例如「開始任務」、「繼續作答」、「返回章節」。

**UI-DIALOG-002**：關閉按鈕可點擊區至少 44×44 CSS px，icon-only close button 必須具有 `aria-label="關閉"`。

**UI-DIALOG-003**：不得只依賴點擊 backdrop、Esc 或系統返回鍵關閉 Dialog。

**UI-DIALOG-004**：相同類型 Dialog 的主要按鈕文案、位置、圖示與操作結果必須一致。標準文案：

- 任務說明：「開始任務」。
- 一般提示：「繼續學習」。
- 錯題解析：「我理解了，下一題」。
- 離開 Quiz：「繼續作答」／「離開並保留進度」或規格定義的明確結果。

#### 返回鍵與流程保護

**UI-DIALOG-005**：開啟 Dialog 時，瀏覽器 Back／Android back 在 Web App 可控制範圍內，應優先關閉最上層 Dialog，不得直接跳離正在進行的 Quiz。

**UI-DIALOG-006**：Quiz 進行中嘗試離開必須顯示確認，說明未完成進度會保留、取消或作廢的結果。

**UI-DIALOG-007**：關閉 Dialog 後，quiz session ID、已作答資料與 timer authoritative state 不得意外重建或遺失。

**UI-DIALOG-008**：History handling 不得建立無限或重複 entries；每次開啟單一 modal 最多新增一個可回退狀態。

## 6. 狀態回饋與可視性

### 6.1 當前位置與進度

**UI-STATUS-001**：學生在核心學習流程中必須能辨識：

- 當前章節。
- 當前子主題或關卡。
- 當前題號與總題數。
- Quiz 是否未作答、提交中、已鎖定或已完成。
- 當前 Quiz Score。

**UI-STATUS-002**：XP、Token 與 Level 在 lobby/profile 必須清楚可見；Quiz 手機版若空間不足可收納於狀態面板，但不得與當前題目進度競爭主要注意力。

**UI-STATUS-003**：Breadcrumb、step indicator、progress bar 或標題至少採一種，讓使用者知道自己所在位置。不得只依賴 URL。

### 6.2 點選與系統狀態

所有互動控制依適用情境定義：default、hover、focus-visible、active、selected、pending/loading、disabled、success、error。

**UI-STATE-001**：Focus-visible 的外框或邊框與相鄰背景對比至少 3:1。

**UI-STATE-002**：Selected 狀態至少使用兩種可感知線索，例如：

- 2px 以上邊框。
- 背景變化。
- ✓ 圖示。
- 「已選取」文字或 aria state。

**UI-STATE-003**：送出後前端必須在 100ms 內進入 pending/locked 狀態，阻止重複點擊；最終權威防重仍由後端保證。

**UI-STATE-004**：操作等待超過 300ms 必須出現 loading feedback；超過 10 秒必須顯示等待說明與重試或取消選項。

**UI-STATE-005**：Loading 狀態不得讓按鈕寬度或主要 layout 發生可見跳動。

**UI-STATE-006**：API error 必須在原操作脈絡顯示，不得只用短暫 Toast。

## 7. Quiz 頁面

必須包含：

- 題目進度，例如 `3 / 10`。
- 章節／子主題或關卡名稱。
- 可感知 timer 數字與 bar。
- 2–4 個選項。
- 當前 Quiz Score。
- 答案 pending／locked／result 狀態。

規格：

- 選項 mobile 單欄；desktop 可兩欄，但閱讀順序 A→B→C→D 必須一致。
- 鍵盤可用 1–4 或 A–D 選擇，Enter 提交（若採兩步）。
- timer 剩 5 秒時可改變提示，但不得高速閃爍。
- 回饋動畫 ≤ 1.2 秒；`prefers-reduced-motion` 時取消位移與縮放。
- 答錯解析出現後，下一題不得仍顯示上一題解析。
- Question card、options 與 next action 必須位於同一主要學習脈絡，排行與商店資訊不得插入其中。

## 8. 結果頁

- 三個主要數值：Accuracy、XP、Token。
- Quiz Score 作次要但明確數值。
- 錯題列表可展開，至少包含題號、本人答案、正解、解析。
- 全對狀態有正向訊息但不可阻塞返回。
- 再次練習需顯示獎勵衰減資訊。
- Primary action 只能有一個；其他選項需降為 secondary/tertiary。

## 9. 商店

- 每個 Blook 顯示：圖像、名稱、cost、owned/equipped 狀態。
- 不可只靠降低 opacity 表示鎖定。
- 購買後 UI 必須以後端結果更新餘額與 ownership。
- 餘額不足按鈕可 disabled，但需顯示原因。
- 購買確認 Dialog 使用明確物品名稱、價格與購買後餘額。

## 10. Teacher Dashboard

- Dashboard 優先顯示可行動資訊，不堆疊裝飾 KPI。
- 每個統計數字標明範圍與分母。
- Chart 必須有文字摘要／table alternative。
- 空資料與 loading 使用 skeleton／empty state，不顯示假的 0。
- 管理頁可有較多操作，但需以 toolbar、menu、tabs 或 progressive disclosure 分組。

## 11. 資料表與匯入

- Table 在 mobile 可轉 card 或水平容器，但頁面本身不得產生不可控 overflow。
- 匯入錯誤可依 sheet／row／field 篩選。
- Error 及 warning 視覺不同且不只靠顏色。
- Commit 前顯示 valid/error/warning 數量。
- 表單提交按鈕必須與匯入摘要位於同一操作群組；不能要求教師滾動至與摘要無關的頁底才送出。

## 12. Accessibility

- 目標 WCAG 2.2 AA。
- 所有功能鍵盤可操作。
- Focus order 符合視覺順序。
- 對比：一般文字 ≥ 4.5:1，大字 ≥ 3:1，UI component ≥ 3:1。
- Touch target ≥ 44×44。
- 圖片有 alt；純裝飾 alt 空字串。
- 色彩題目若教學本質需辨色，仍提供文字／符號輔助並記錄限制。
- `prefers-reduced-motion` 生效。
- Dialog 遵循 WAI-ARIA modal dialog 行為。

## 13. 真實畫面驗收

核心狀態至少為：

1. Login
2. Student lobby
3. Chapter/subtopic
4. Review card
5. Quiz unanswered
6. Quiz incorrect feedback
7. Quiz result
8. Profile/shop
9. Leaderboard
10. Teacher dashboard
11. Question import validation
12. Teacher analytics

每個狀態需在 375×812、768×1024、1440×900 產生真實運行截圖。

額外 mobile interaction evidence：

- 至少一個含文字輸入的學生流程，提供真實手機軟體鍵盤可見的 screenshot 或 video。
- 至少一個 Dialog 開啟後使用 Android back 或等價 browser back 關閉的 sequence。
- 至少一個 Quiz 選項依序呈現 default → selected → pending → result 的有序證據。
- 額外證據不能拿核心 36 張靜態截圖重複充數，除非同一檔案確實同時滿足兩項且 manifest 明確交叉引用。

詳見：

- `../acceptance/ACCEPTANCE_CRITERIA.md` 的 `AC-UI-008` 至 `AC-UI-015`。
- `08-testing-and-evidence.md` 的 mobile interaction evidence 規則。

## 14. 規格與驗收追蹤

| 規格 ID | 主題 | 對應驗收 |
|---|---|---|
| UI-FLAT-001～004 | Flat Design、陰影與動畫 | AC-UI-008 |
| UI-ACTION-001～004 | 主要行動與視覺負荷 | AC-UI-009 |
| UI-MAP-001～004 | 問句、輸入與按鈕自然配對 | AC-UI-009 |
| UI-KBD-001～004 | 虛擬鍵盤 | AC-UI-010 |
| UI-DIALOG-001～004 | Dialog 關閉與文案一致 | AC-UI-011 |
| UI-DIALOG-005～008 | Back／history 與流程保護 | AC-UI-012 |
| UI-ICON-001～005 | 圖示語意 | AC-UI-013 |
| UI-STATUS-001～003 | 位置與進度 | AC-UI-014 |
| UI-STATE-001～006 | Focus、selected、pending、error | AC-UI-015 |
