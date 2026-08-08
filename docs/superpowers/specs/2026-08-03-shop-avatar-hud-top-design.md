# 商店／HUD 角色放大與主導覽頂移設計

日期：2026-08-03

## 目標

1. 商店角色卡的 ref-image PNG 可見尺寸放大 1.8 倍，角色更容易辨識。
2. 學生經驗等級旁的已裝備角色頭像同樣放大 1.8 倍。
3. 登入後的主要 HUD 導覽列（學生：`學習大廳`／`Live 課堂`／`MENU`；教師：`教師工作區`／`Live 主持`／`MENU`）由畫面底部移至畫面上端。

本批不改導覽標籤、路由、MENU 內容、登入／登出、經濟資料、inventory 資料流或排行榜／學生摘要的精簡頭像。

## 現況與根因

ref-image PNG 是 3:2（512×341），但 `BlookArt` 目前用正方形 `width`／`height` 屬性呈現，並由 `object-fit: contain` 保持原比例。商店傳入 `size={72}`，所以實際可見圖約為 72×48；學生 HUD 傳入 `size={26}`，實際可見圖約為 26×17。角色不是素材解析度不足，而是呈現盒過小。

`HudCommandBar` 目前在 `AppShell` 的 `<main>` 後方，CSS 用 `position: sticky; bottom: 0`，MENU 面板用 `bottom: calc(100% + ...)` 向上開。若只靠 CSS `order` 或 fixed overlay 把它移到上方，DOM／鍵盤順序會與視覺不一致，或重新引入 HUD 覆蓋內容的風險。

## 核准設計

### 1. 商店角色圖 1.8×

- `ShopPage` 的角色 `BlookArt` 從 `size={72}` 改為 `size={130}`（72×1.8 = 129.6，取整數 130）。
- 在商店卡限定 selector 下將 `.blook-art` 設為 `height: auto`、`max-width: 100%`，使 3:2 圖以約 130×87 顯示，不被正方形 height attribute 壓縮，也不超出窄卡片。
- `.blook-card__art` 既有 96px 高圖片區與整體卡片高度不變；130×87 可完整置中於該區。
- 外框商店的 ring、中文角色名稱、Token、按鈕與分頁完全不變。

### 2. 學生 HUD 頭像 1.8×

- `StudentHudAvatar` 的 `BlookArt` 從 `size={26}` 改為 `size={47}`（26×1.8 = 46.8，取整數 47）。
- `.hud-avatar .blook-art` 使用 `height: auto`，實際約 47×31。
- `.hud-avatar` 由 34×34 調整為 52×40；扣除 2px 邊框後仍能完整容納 47×31 圖片。
- 未裝備 fallback hero 背景由 24×24 放大至 32×32，避免同一頭像框在資料暫不可用時顯得突兀。
- HUD 頭像仍為 `aria-hidden`，不新增重複可及名稱；教師分支與排行榜／其他摘要 BlookArt 尺寸不變。

### 3. 主 HUD 導覽頂移

- 在 `AppShell` 中把學生／教師 `HudCommandBar` 真正移到 `<main>` 與 `.hud-top` 前方；一般畫面中它是登入後舞台的第一個操作列。
- `RotateBanner` 是直向安全提示，仍保留在導覽前方；未顯示提示的正常畫面中，主 HUD 導覽貼齊舞台最上端。
- `.hud-command` 改為 `position: sticky; top: 0`，使用底框分隔內容；上方 padding 納入 `env(safe-area-inset-top)`，左右 safe-area 規則保留。
- 768px 以上橫向固定舞台仍使用 `position: static`。因 DOM 已在上方，導覽自然佔第一列，只有 `.game-stage__scene` 捲動，不需要 overlay 或額外內容 padding。
- `.hud-menu__panel` 改用 `top: calc(100% + var(--space-2)); bottom: auto` 向下展開。短橫向既有 max-height／overflow-y 規則保留，避免超出 viewport。

## 保留行為

以下全部原樣保留：

- 學生與教師導覽的 `aria-label`、11 個既有導覽標籤與路由。
- MENU 的 `hidden`／`aria-controls`／`aria-expanded`。
- 開啟後焦點移入面板、Escape 關閉並回到 MENU、click-outside 關閉、點導覽連結關閉。
- MENU displayName、登出按鈕與錯誤狀態。
- LivePresenter、API、RPC、計分與 Supabase。

## 測試策略

採 TDD，先建立會在現況失敗的斷言：

1. `shop-page.test.tsx`：商店角色 `<img>` 的 `width`／`height` attribute 為 130，證明呼叫端尺寸已放大。
2. `app-shell.test.tsx`：學生 HUD 角色 `<img>` 尺寸為 47，且 `.hud-command` 在 DOM 中位於 `.hud-top` 與 `#main-content` 之前；教師分支同樣驗證導覽在 main 前。
3. 樣式 contract：商店／HUD 圖片使用 `height:auto`，HUD 頭像框為 52×40，command bar 使用 top sticky／底框，MENU panel 使用 top anchor／`bottom:auto`。

GREEN 後驗證：

- focused Vitest、完整 Vitest、TypeScript、ESLint、Prettier、production build。
- Playwright 於 375×812、812×375、1280×720 驗證：
  - 商店第一張角色圖 computed box 約 130×87（允許瀏覽器次像素誤差）。
  - 學生 HUD 已裝備角色 computed box 約 47×31。
  - command bar 位於 hud-top／main 上方，沒有覆蓋內容或水平溢出。
  - MENU 面板在 toggle 下方、可見範圍內，所有項目可 pointer 點擊且焦點可見。
  - console error／pageerror 皆為 0。

## 不採用方案

- **CSS `order` 視覺調位**：DOM 與鍵盤／螢幕閱讀器順序仍在內容後方，有可及性缺陷。
- **fixed overlay**：需要人工補償內容 padding，短橫向與長結果頁容易再次被 HUD 遮蔽。

兩者均不實作。
