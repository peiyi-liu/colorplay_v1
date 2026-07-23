# ColorPlay GGAME UI Restyle Design

- Status: Approved（2026-07-18 owner brainstorming session）
- Baseline: `6d66246`（Phase 7 Live Advanced closed）
- 參考稿：owner 提供的 `GGAME.html`（目前位於 repo 外 `example-html/GGAME.html`；**非最終版**，後續視覺修訂以 owner 新版為準）
- 相關規範：`spec/07-ui-visual-system.md`（本 phase 將更新以釘住新 token）、AGENTS.md 信任邊界、ADR 0001/0002

## 1. 目標

把整個 React app 的視覺換成 GGAME.html 的介面語言（亮黃主色、大圓角白卡、扁平 2D、Noto Sans TC），並依 GGAME 的呈現方式重組學生端核心畫面。所有功能仍走既有 server-authoritative 後端；本 phase 不改變信任邊界。

## 2. 已核准的範圍決策（owner Q&A，2026-07-18）

1. **覆蓋範圍**：GGAME 沒畫到的畫面（成就、作業、Live 主持台、題庫管理、複習卡、個人資料等）一律延伸同一視覺語言重刷，全 app 視覺一致。
2. **登入語意**：本 phase 登入頁只換外觀、保留 Email/密碼認證。「班級代碼＋學號」登入是獨立的後續 phase（需新 ADR，見 §10）。
3. **任務機制**：任務實戰頁採 GGAME 的精熟地圖流（不限時、答錯鎖選項、兩層提示、重試計次），接 Phase 5 hints/mistakes/remediation 後端；限時挑戰保留給 Live 與獨立入口。
4. **商店**：現有 6 Blook 以 GGAME 頭像卡片式呈現，**並新增「頭像邊框」商品類別**（需一個新 migration，交易沿用現有帳本 RPC 模式）。
5. **Phase 切分（方案 B）**：本 phase 做 UI restyle 全部（含邊框 migration）；學號登入 ADR 與實作是下一個獨立 phase。

## 3. 設計系統（三層 token，落在 Tailwind v4 CSS variables）

### Primitive

- `--yellow-brand: #ffd600`、`--amber-avatar: #ffb300`、`--surface-page: #f4f6fa`
- slate／rose／emerald／indigo／sky／amber 沿用 Tailwind 色階
- `--radius-card: 24px`（卡片）、`--radius-control: 12px`（按鈕/輸入）
- 字體：Noto Sans TC 300–900，**自架（@fontsource），不用 Google CDN**

### Semantic

- `--color-primary`（黃）、`--color-teacher`（indigo）、`--color-xp`（rose）、`--color-token`（emerald）、`--color-alert`（amber）
- `--surface-card`（白）、`--border-subtle`（slate-200）

### Component 層＋共用元件庫 `src/components/ui/`

`Card`、`Chip`、`StatTile`、`ProgressBar`、`OptionButton`（rose/sky/amber/emerald 四色變體＋▲■●◆ 形狀符號；狀態不得只靠顏色）、`HintCallout`（第一層 rose／第二層 yellow 左邊框）、`MapStepper`（精熟地圖節點＋黃色進度線）、`VictoryCard`、`DataTable`、`Toast`、`EmptyState`、`SectionHeader`。

### 圖示與動效

- 圖示：lucide-react（tree-shakeable、自帶打包），保留 GGAME 的 emoji 點綴；不引入 FontAwesome CDN。
- 動效：fade-in／pulse／bounce 全部尊重既有 `data-reduced-motion` 開關（Phase 7 交付）。
- 元件內禁止裸 hex；一律引用 token（gate 有掃描，見 §8）。

### 規範同步

更新 `spec/07-ui-visual-system.md` 釘住上述 token 與元件語彙（比照歷來 phase Task 1「pin rules」慣例）。GGAME.html 快照入 repo 作唯讀視覺參考（如 `legacy/ggame-ui-reference-2026-07-18.html`）；**只作視覺對照，不得複製其程式碼進產品源碼**。

## 4. App Shell 與導覽 IA

- **Header**：漸層調色盤 logo＋「暱稱/XP/代幣」狀態膠囊＋「▶ 進入大廳」黃色按鈕＋登出；教師另有「🔒 教師後台」。
- **學生導覽軌**：GGAME 番號步進式 3 頁籤「1. 課後學習大廳 → 2. 課後任務實戰 → 3. 代幣外觀商店」（chevron 分隔）。
- **大廳為樞紐**：作業、成就、排行榜、複習卡、錯題中心、Live 加入全部做成大廳入口卡片；個人資料從 header 暱稱進入。
- **教師導覽軌**（indigo）：「數據看板」「題庫管理」「Live 主持」「班級管理」＋授權徽章。
- React Router 路由結構不變，只重新歸位導覽入口。

## 5. 畫面設計

### 大廳（GGAME 版型）

- 頭貼卡：裝備中 Blook＋`--amber-avatar` 大圓角框（裝備邊框後套漸層）；「修改」→ 個人資料。
- 數據列：XP（錢包）、全體排名（班級排行榜）、PR（由名次換算百分位；未加入班級時隱藏）。
- 6 章節網格：接真實內容目錄；已發佈＝黃框「已開放」，未發佈＝灰鎖卡；徽章列接成就。
- 入口卡片列：錯題中心（真實待精熟數）、每日目標（Phase 5 進度）、作業、成就、排行榜、複習卡。
- 廣播 banner：教師啟動 Live 時經 Realtime 顯示（rose→amber 漸層＋bounce，尊重 reduced-motion）。

### 任務實戰（精熟地圖流）

- `MapStepper` 節點數＝該小節實際題數（不寫死 5），未過關不可跳關（沿用後端進度閘門）。
- 題卡：情境劇本＋變因條件＋選項鎖定（答錯鎖該選項）＋兩層 `HintCallout`（接 question_hints）。
- 右欄「配色概念示意盒」依題目 metadata 呈現，標注「僅為概念示意」。
- `VictoryCard`：真實 XP/代幣入帳（沿用重複練習不重發獎規則）＋徽章解鎖。

### Live（原 Kahoot 皮）

- 學生端：四色 `OptionButton`、限時膠囊、答後統計條（接 Phase 7 分佈）＋「教師引導解析」區。
- 教師主持台：功能不變，套 GGAME 的 amber 廣播控制台樣式。

### 商店

- 「解鎖個人頭像」＝6 Blook 卡片（預設擁有／價格／已裝備狀態）。
- 「尊絕外顯邊框」＝新商品類別；裝備後反映在大廳頭貼框與排行榜。

### 教師看板（接 Phase 6 分析）

- 3 指標卡＋進度條（完成率／首次正確率／精熟達標率）。
- 高頻錯誤概念卡：由答錯率最高題目**規則式**產生（不引入 AI）。
- 學生精熟狀態表＋既有研究匯出；題庫管理／XLSX 匯入頁套 token 重刷。

### 其他畫面

成就、作業、排行榜、複習卡、個人資料、班級管理等全部以共用元件重組版面，資料流不變。

## 6. 資料接點與後端變更

| 項目         | 變更                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------- |
| 絕大多數畫面 | 純前端重刷，後端零變更                                                                    |
| 邊框商品     | **1 個新 migration**：frames 商品類別＋裝備欄位＋pgTAP 正/負向測試；交易沿用帳本 RPC 模式 |
| PR 百分位    | 由既有排行榜 RPC 回傳的名次與人數在前端換算；不新增 view、不引入新權限面                  |
| 教師補救建議 | 規則式（現有 analytics 聚合），無新表                                                     |

## 7. 基線現況（2026-07-18 實際驗證）

| 檢查                      | 結果                        |
| ------------------------- | --------------------------- |
| lint／typecheck           | ✅                          |
| Unit 89 檔 576 測試       | ✅                          |
| pgTAP 34 檔 861 測試      | ✅                          |
| Integration 13 檔 25 測試 | ✅                          |
| **E2E 完整電池**          | ❌ **5 failed / 42 passed** |

已診斷的問題：

1. **回歸 A**（三瀏覽器）：Phase 7 在 profile select 加入 `reduced_motion`，`tests/e2e/profile-e2e-boundary.ts` 的 `ownProfileSelect` 未同步 → `waitForResponse` 永久逾時。
2. **回歸 B**（chromium，隔離 3/3 重現）：shell 新增可聚焦元素後，login 鍵盤 tab 順序 spec 釘死的絕對順位失效。
3. **Flaky**（firefox）：playable-slice／quiz-runner 計時敏感測試不穩定（兩次執行失敗 spec 不同）。
4. **系統性缺口**：歷來 phase runner 只跑 unit＋db＋自身 gate spec，從不跑 `pnpm test:e2e` 完整回歸電池，跨 phase e2e 漂移逃得過驗收。

## 8. 測試與驗收協定

### Task 0：基線修復（進場條件）

- 回歸 A：匹配器與 repository select 改共用單一常數，contract test 釘住兩者一致。
- 回歸 B：tab 順序 spec 改結構性斷言（不釘絕對順位）。
- Firefox flaky：計時敏感 spec 加確定性等待點。
- 出場證據：`pnpm test:e2e` 完整電池 0 failed 的新鮮輸出。

### Task 級（維持 AGENTS.md 分級紀律，不加重儀式）

- 每 task：lint＋typecheck＋受影響測試；完成宣稱一律附新鮮執行證據。

### Phase gate（新 `scripts/acceptance/run-ui-restyle.sh`，並回補為 runner 慣例）

1. `pnpm test`＋`pnpm test:db`（現有慣例）。
2. **新增 `pnpm test:e2e` 完整回歸電池**（堵跨 phase 漂移；此後新 phase runner 一律包含）。
3. `pnpm test:coverage`：`src/components/ui/` 行覆蓋 ≥80%，缺口列表附 gate 報告。
4. 三 viewport 截圖＋axe 掃描＋console error = 0。
5. **GGAME 一致性驗收**：gate spec 逐畫面截圖，與 GGAME.html 同畫面參考截圖並列存入 evidence manifest，owner 人工核可視覺一致性；token 硬編碼掃描（元件內不得出現裸 hex）。
6. 一輪完整範圍 code review（上限一輪）＋delivery-gate 檢查單：AC 對照、風險、保留項逐條列出後才 close phase。

- Visual snapshot 基線全面重建一次（S 級，附原因）。
- 軟鍵盤／Android Back 真機證據照慣例標「待人工裝置驗證」（AC-UI-010/012）。

## 9. 風險

- 全 app 重刷範圍大：以共用元件庫先行（土台 task），畫面 task 逐一收斂，避免每頁自造樣式。
- GGAME 非最終版：token 集中管理，視覺修訂只動 token／元件層。
- e2e 電池入 gate 後執行時間變長（約 +3–4 分鐘）：可接受，換取跨 phase 回歸防護。
- 對比／無障礙：黃底深字（#ffd600 × slate-950）對比達標；四色選項鈕附形狀符號，不只靠顏色。

## 10. 不做的事（Out of Scope）

- 班級代碼＋學號登入（下一 phase：獨立 ADR＋Auth/RLS 變更＋登入頁欄位切換）。
- 排程場次自動開始、Storage 媒體上傳、內容真刪除（既有保留項不變）。
- 深色模式（GGAME 為亮色單主題）。
- 任何 `service_role`／答案下發前端的信任邊界變更。
