# HUD 導覽重組＋經濟列頭像 — 設計規格

- 日期：2026-08-02
- 狀態：設計已 owner 逐節核可（11:25 需求＋11:37 學生端分配修正）；spec 待 owner 最終過目
- 來源：owner 0802「把我的錯題、Live 課堂、班級排行榜、成就徽章的按鈕移到 Menu 中。等級經驗值的左手邊加入頭像邊框。token 也顯示在一起。live 課堂和成就勳章在手機畫面會跑版跑出手機畫面。學生端和教師端都要修改。」＋修正「學生端：列上留學習大廳/Live 課堂＋MENU；課後任務實戰、我的錯題、班級排行榜、成就徽章、裝備商店移入 MENU。」

## 1. 底部 HUD 重組（hud-command-bar.tsx）

### 學生端（列上 3 顆鈕）

- 列上保留：`學習大廳`（NavLink end /app）、`Live 課堂`（/app/live/join）、MENU 鈕。
- 移入 MENU 面板：`課後任務實戰`（/app/missions）、`我的錯題`（/app/mistakes）、`班級排行榜`（/app/leaderboard）、`成就徽章`（/app/achievements）、`裝備商店`（/app/shop）——共 5 項。
- 這同時解決 owner 回報的手機跑版（`Live 課堂`/`成就徽章` 跑出畫面）：列上只剩 3 顆鈕。

### 教師端（列上 3 顆鈕）

- 列上保留：`教師工作區`（NavLink end /teacher）、`Live 主持`（/teacher/live）、MENU 鈕。
- 移入 MENU 面板：`班級管理`（/teacher/classes）、`教學分析`（/teacher/analytics）。

### MENU 面板結構（兩端同構）

- 上半＝導覽區：NavLink 清單（沿用既有 active 態機制；面板內樣式可另立 `hud-menu__nav-link`），點擊導覽項後**自動關閉面板**。
- 分隔線。
- 下半＝既有內容原樣：displayName＋登出鈕。
- 機制沿批⑤b：面板恆掛 DOM 以 `hidden` 切換、`aria-controls` 不懸空、click-outside 關閉、開啟時焦點移入、Escape 關閉並焦點回 MENU 鈕。
- 載重字串一字不改（七個學生項＋四個教師項＋`MENU`/`登出` 全部原字，只搬位置）。

## 2. 頂部經濟列（app-shell.tsx hud-top）

### 學生端：頭像＋等級＋Token 同一群組

- `EconomySummaryView` 前（左手邊）加**頭像框**：像素金框（JRPG 語彙），內容＝裝備中 Blook；未裝備時 fallback 主角 hero 精靈。
- 資料源：inventory 的 `activeBlookId`（唯讀查詢；換裝備後頭像隨 query 更新）。頭像視覺沿商店 Blook 卡既有渲染語彙縮小版；確切渲染法（漸層/貼圖）由計畫盤點 task 對照商店實作定案。
- `N Token` 與 Level/XP 合併為同一群組卡（視覺上一體，不再是分離的兩塊）。
- 資料流零變更：economy summary 與 inventory 均為既有 query，只新增消費點。

### 教師端：移除經濟列，改歡迎識別

- 教師端 hud-top **不再渲染** `AuthenticatedEconomySummary`（教師不該有學習經濟數字）。
- 改顯示：`歡迎，{displayName}・教師端`（沿現有 `hud-top__identity` 賢者窗樣式；「歡迎，」為新增載重字串，逐字如此）。

## 3. 鐵律

1. 行為零變更：路由、API、RPC、計分不動；inventory/economy 查詢為既有 hook 的唯讀新消費點（不新增後端呼叫種類）。
2. 載重字串：11 個導覽標籤原字搬位；刪除教師端經濟數字顯示；新增字串僅「歡迎，」與頭像的 aria 文字（計畫定字）。
3. 44px 觸控（MENU 面板內導覽項也要）；對比 ≥4.5:1 rendered 實測；禁 transform:scale()；動畫只 transform/opacity＋雙通道；console 0。
4. **跑版驗證＝containment 斷言**（外殼批教訓）：375×667 直向與 812×375 橫向，底部 HUD 與頂部經濟群組的 right-edge 必須在 viewport 內（`document.documentElement.scrollWidth` ≤ viewport＋逐鈕 boundingBox 包含性），不得只量 44px。
5. LivePresenter 零接觸；投影/報表不在本批範圍。
6. 批次慣例沿用：盤點 task 先行（結構斷言授權清單）、commit 隔離（平行 session 檔清單同前批）、`git commit -F`、prettier gate、ledger 新節、SDD 報告檔前綴 `hudreorg-task-N-`。

## 4. 測試影響（預估，盤點 task 定案）

- 導覽項移入 hidden 面板後 `getByRole('link')` 在面板收合時查不到：
  - 單元：`hud-command-bar.test.tsx`（標籤迴圈、active 態測試）、`app-shell.test.tsx`（href 斷言）需改為「開 MENU 後斷言」或斷言面板內。
  - e2e：所有經由底部 HUD 點導覽的流程逐支盤點（`Live 課堂` 與 `學習大廳` 留在列上的流程零改動；`classroom-leaderboard` 直達、成就/商店/錯題入口、`signOutViaHud` helper 等受影響）。
- 既知紅（assignments-live/live-advanced/achievements/game-economy/learning-experience/session-lifecycle/shared-device/ui-restyle）不碰。

## 5. 可見行為變化

1. 學生列上導覽從 7 項變 2 項＋MENU；5 項改由 MENU 進入（多一層點擊——owner 已裁）。
2. 教師列上導覽從 4 項變 2 項＋MENU。
3. 學生頂部：頭像框＋Level/XP/Token 一體群組。
4. 教師頂部：經濟數字消失，改「歡迎，{名字}・教師端」。
5. 手機（375）導覽不再跑出畫面。

## 6. 批次順序（owner 待裁）

Live team 移除批（spec 已核准）與本批獨立無檔案衝突（team 批動 live feature 檔，本批動 shell/rewards）；建議先跑 team 移除批（小而獨立），本批隨後。
