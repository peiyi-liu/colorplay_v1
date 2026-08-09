# 學生端全螢幕學習地圖設計

- **日期：** 2026-08-04
- **狀態：** Owner 核准
- **範圍：** 學生 `/app` 學習地圖的版面、HUD、地圖座標、章節標示與直向操作

## 1. 目標與裁定優先序

學生學習地圖改為填滿整個學生舞台的 JRPG 森林王國村。地圖本身就是頁面底層，不再放在奶黃色頁面或羊皮紙大卡中；角色經濟 HUD、學習地圖卷軸、主要導覽、六棟建築及章節提示都以 overlay 與地圖整合。

本文件是 2026-08-04 的 owner 新裁定，覆蓋下列舊要求中與畫面衝突的部分：

- `docs/superpowers/plans/2026-08-03-jrpg-learning-map-and-access.md` 中 `LobbyPage` 必須顯示 `StudentSummaryCard` 的要求；
- `docs/superpowers/specs/2026-08-03-jrpg-six-chapter-learning-map-design.md` 中桌面 3×2 格線只作排版而不要求貼合原圖空地的描述；
- 既有奶黃色頁面留白、白／羊皮紙外卡及規則一致的深藍章節矩形牌。

未被本文件明確覆蓋的序列解鎖、章節 RPC、內容權威、複習／精熟度、安全語意與 Live 豁免仍以原設計為準。

## 2. 範圍邊界

### 2.1 本批包含

- `/app` 成功載入後的全螢幕地圖版面；
- 移除地圖頁內重複的寬版學生資訊橫框；
- 地圖左上角的精簡角色／等級／XP／Token HUD；
- 地圖上緣中央的森林王國卷軸；
- 地圖右上角的學生主要導覽；
- 六棟建築的世界座標、吊掛木牌、獨立狀態徽章及選取金光；
- 底部 A 型 JRPG 章節對話框；
- 直向裝置的可關閉旋轉提示與地圖內部平移；
- 1280×720、812×375、375×812 的互動與可及性驗收。

### 2.2 本批不包含

- 路由、RPC、Supabase schema、序列進度、計分、XP／Token 寫入或角色裝備寫入；
- 章節標題／描述的硬編碼或 Google Sheets 內容流程變更；
- 教師端、LivePresenter、商店、排行榜或章節詳情頁改版；
- 第二張直向村莊背景圖；
- 刪除 `StudentSummaryCard` 通用元件、共用 token 或其他頁面可能使用的樣式。地圖頁只移除它的 import／render 與專屬包裝。

## 3. 資訊架構

橫向／桌面由上而下及由左至右依序為：

1. 地圖左上：角色頭像、Lv、XP 進度與 Token 的精簡整合框；
2. 地圖上緣中央：森林王國卷軸；
3. 地圖右上：`學習大廳`、`Live 課堂`、`MENU`；
4. 地圖世界：六棟章節建築、人物、雲層及狀態徽章；
5. 地圖底部：選取章節的 A 型 JRPG 對話框。

不得再顯示學生姓名、歡迎句、徽章數、全體排名或第二份 XP／Token 摘要。這些不是地圖主要任務，而且會重複 App Shell 已有資料。

## 4. 全螢幕舞台與 App Shell

### 4.1 地圖頁模式

`AppShell` 在學生精確路由 `/app` 啟用 `learning-map` 舞台模式。此模式只改版面，不改導覽或認證行為：

- `#main-content` 移除四周 padding、最大寬度與奶黃色內容底；
- 地圖根節點填滿 HUD 下方全部可用高度與寬度；
- `.hud-top` 使用原本唯一一份已驗證的角色／經濟資料，改為地圖左上 overlay；
- `.hud-command` 使用原本唯一一份 NavLink、MENU、焦點與 Escape 機制，改為地圖右上 overlay；
- 其他學生頁與教師頁維持目前 App Shell 流式／sticky 版面。

不得在 `LobbyPage` 再呼叫第二份 economy 或 inventory hooks 來複製 HUD。App Shell 仍是這些資料的唯一畫面消費點。

### 4.2 載入與錯誤

RPC 載入時沿用 `RouteLoading withinMain`。RPC 失敗時沿用 `章節狀態暫時無法確認` 與 `重新載入`，錯誤卡可置中，且不需要渲染空的全螢幕村莊。

## 5. 左上角色 HUD

精簡框只包含：

- 目前裝備角色圖；
- `Lv. N`；
- XP progress 與 `current / required XP`；
- `N Token`。

1280×720 參考稿中的整合框約 304×66 CSS px，實作使用 token 與 `clamp()`，不可依賴單一固定桌面值。

角色方框為正方形。3:2 Blook PNG 以高度貼齊方框並水平置中，允許只裁掉左右透明畫布，不得裁掉角色本體。以 `little_fox.png` 為基準，參考稿用 84×56 圖片置於 56×56 方框並水平回移 14px；正式實作應用等價的置中容器規則，並以至少兩個不同角色驗證視覺中心。

HUD 不顯示學生姓名、徽章、排名或歡迎詞。文字與進度條在地圖背景上仍需維持 4.5:1 對比。

## 6. 地圖卷軸

卷軸貼齊地圖上緣中央，包含木製軸心、羊皮紙紋理、內外陰影及森林王國徽記。文字逐字為：

```text
學生端 · 森林王國村
學習地圖
選擇一棟建築，查看章節的複習、精熟度與解鎖條件。
```

1280×720 參考稿中的卷軸約 390×63 CSS px。實作需以內容可讀性與避讓為優先，使用 responsive `clamp()`；卷軸不得遮擋建築、狀態徽章、左上 HUD 或右上導覽。橫向驗收時，卷軸外框與最近物件至少保留 8 CSS px 空隙。

卷軸是語意標題區：`學習地圖` 仍為頁面唯一 `h1`；上、下文字分別是 eyebrow 與說明，不得把整個卷軸做成圖片。

## 7. 地圖世界與建築座標

### 7.1 單一世界座標系

背景原圖為 1200×800。背景、六棟建築、雲層、冒險者與個人角色位置必須位於同一個 1200×800 邏輯世界層，再由世界層整體 cover／pan；不得分別以 viewport 百分比定位，否則裁切比例改變時建築會漂離空地。

建議世界層以 3:2 aspect ratio、container size 與 cover 尺寸運算實作。建築使用「底部中央地面接觸點」作為 anchor。

Owner 核准的原圖參考落地點為：

| Chapter | 建築         | 原圖 X | 原圖 Y | X 百分比 | Y 百分比 |
| ------- | ------------ | -----: | -----: | -------: | -------: |
| 1       | 村莊學校     |    290 |    298 |    24.2% |    37.3% |
| 2       | 工匠工坊     |    582 |    282 |    48.5% |    35.3% |
| 3       | 圖書塔       |    896 |    298 |    74.7% |    37.3% |
| 4       | 觀測所       |    300 |    575 |    25.0% |    71.9% |
| 5       | 森林學院     |    586 |    620 |    48.8% |    77.5% |
| 6       | 王家大師殿堂 |    888 |    575 |    74.0% |    71.9% |

實作可因 PNG 透明邊界做不超過 8 logical px 的逐棟視覺校正，但不得以整個元件盒中心代替落地 anchor。超過此範圍必須回到設計審查。

### 7.2 建築標題

採 owner 選定的 A 方案：每棟建築下方以兩條短鏈吊掛木牌。木牌只顯示：

- `Chapter N`；
- 權威章節標題。

木牌不再顯示狀態。文字是 semantic HTML，章節標題仍從 map RPC／published chapter 資料取得，不烘焙進圖片。

### 7.3 狀態徽章

狀態改為建築旁的獨立圓形徽章：

| access／completion 狀態 | 徽章與場景處理                                                           |
| ----------------------- | ------------------------------------------------------------------------ |
| completed               | 金色勾選徽章＋`已完成`                                                   |
| available               | 金色星芒／進入徽章＋`可進入`                                             |
| locked                  | 灰銀鎖徽章＋`未解鎖`，保留遮住屋頂／入口的雲層                           |
| content_unavailable     | 鐵灰施工徽章＋`內容準備中`，保留 construction overlay，不顯示進入 action |

圖示不能取代文字；狀態文字需保留在可及名稱與視覺畫面中。

### 7.4 選取與焦點

- selected：只在建築 PNG 輪廓周圍顯示明亮黃色呼吸光；不得出現方形選取框或半透明矩形底；
- hover：允許較弱的金色輪廓；
- `:focus-visible`：必須有清楚可見的 3px 焦點樣式，可落在木牌／狀態徽章組合上，不得為了避免方框而移除鍵盤焦點；
- `aria-pressed`、accessible name、兩步驟選取後再進入的行為維持原設計。

## 8. 底部章節對話框

採 A 型 JRPG 對話框，貼近地圖底部並橫向延伸，但需保留地圖外框間距。內容來自目前選取章節：

- `Chapter N` 與 access label；
- 章節標題；
- 複習進度；
- 精熟度與 80% 門檻；
- 可進入／已完成時的 `進入複習與進度` action。

locked 顯示既有 prerequisite blockers 且沒有 link；content unavailable 顯示 `內容準備中` 且沒有 link。對話框使用 `aria-live="polite"`，選取建築時不得搶走焦點。

## 9. Responsive 與直向 A＋B 行為

### 9.1 橫向

1280×720 與 812×375 盡量一次顯示完整六章世界。短橫向允許 `.game-stage__scene` 垂直捲動，但任何建築、木牌、徽章及 action 都必須可由滑鼠滾輪捲到並 pointer 點擊；不得用 `overflow:hidden` 造成程式可捲、使用者不可捲的假通過。

### 9.2 直向

Owner 核准 A＋B 並行：

1. 375×812 進入地圖時先顯示現有風格的可關閉旋轉提示，說明橫向可看到完整村莊；
2. 提示不得鎖死頁面或阻擋地圖操作；
3. 學生旋轉為橫向時切換到完整六章視野；
4. 學生關閉提示或維持直向時，地圖改為內部水平平移，頁面本身不得水平溢出；
5. 初始鏡頭對準目前選取／第一個可進入的章節；
6. 提供 `拖曳探索村莊` 的短提示與六章位置指示，不要求新增第二張直向地圖；
7. 觸控、滑鼠拖曳與鍵盤都能移動地圖，選取建築仍維持 44×44 最小目標。

直向時主要導覽可維持 App Shell 現有的頂端流式／sticky 版面，不強迫與卷軸、左上 HUD 同列；地圖內只需確保卷軸與精簡 HUD 不互相遮擋。

## 10. 資料與行為

- `useStudentChapterMap` 與 server-authoritative RPC 回傳仍是章節狀態唯一來源；
- 角色、Lv、XP、Token 繼續使用 App Shell 現有 inventory／economy 讀取，不新增資料寫入；
- 建築選取只更新本地 selected state 與鏡頭位置，不 invalidates queries、不寫 Supabase；
- chapter query parameter、locked blockers、content unavailable、all-complete default selection 維持既有語意；
- `MENU` hidden／aria-controls／aria-expanded、click-outside、開啟焦點、Escape 回 toggle 與登出完全不變。

## 11. 可及性與效能

- 所有建築維持真實 button，章節 action 維持真實 link；
- 所有可操作目標至少 44×44 CSS px；
- 卷軸、木牌、徽章、對話框與 HUD 文字的 rendered contrast 至少 4.5:1；
- decorative background、cloud、glow、chains、wood rollers 與 crest 為 `aria-hidden`；
- `prefers-reduced-motion: reduce` 停止雲層漂移、建築呼吸光與人物 idle；selected 仍以靜態金色輪廓辨識；
- 圖片沿用現有已壓縮素材，不新增第二套地圖；
- 地圖平移只移動世界層，不觸發資料重抓或 React 全樹重繪。

## 12. 驗收策略

### 12.1 TDD／元件測試

- `LobbyPage` 不再 render `StudentSummaryCard`，仍顯示完整地圖、loading、error、retry 與 query selection；
- 木牌只顯示 chapter number／title；四種狀態的獨立徽章文字、overlay 與 action 規則正確；
- selected 使用 glow state，button／`aria-pressed`／keyboard selection 行為不變；
- App Shell 只在學生 `/app` 啟用 map overlay mode，其他路由 DOM 與導覽機制不變；
- 直向提示可關閉，關閉不會停用地圖。

### 12.2 Playwright 實測

於 1280×720、812×375、375×812 驗證：

- 地圖填滿可用舞台且沒有奶黃色頁面外層；
- document `scrollWidth <= viewportWidth`；
- 六棟建築落地點對準原圖空地；
- 卷軸與最近物件至少保留 8px，不遮住 HUD、導覽、建築或徽章；
- 角色在方框內水平／垂直置中，至少驗證裝備與 fallback／第二角色；
- selected 建築有黃色輪廓光且沒有矩形選取底；
- 所有建築、木牌、狀態徽章、MENU 與章節 action 可見、可捲到、可 pointer 點擊、focus ring 可見；
- 375×812 旋轉提示可關閉，關閉後地圖可 touch／mouse／keyboard 平移，初始鏡頭對準可進入章節；
- 812×375 使用者滾輪可到達所有內容，不得以 `scrollIntoViewIfNeeded`、force click 或 synthetic dispatch 代替；
- rendered contrast 全部 ≥4.5:1，console error／pageerror 為 0。

### 12.3 迴歸 gate

至少執行相關 learning map unit tests、App Shell tests、新增的 viewport E2E、TypeScript、ESLint、Prettier 與 production build。若改動 App Shell overlay，另跑既有 HUD MENU、Escape、click-outside、登入／登出與主要導覽 E2E。

## 13. 核准的視覺參考

核准方向來自本次 visual companion 第十二版：

- 全螢幕森林王國村；
- 390×63 參考卷軸並保留安全空隙；
- 左上精簡 HUD；
- A 型底部對話框；
- 吊掛木牌＋獨立狀態徽章；
- 建築黃色輪廓選取光；
- 直向 A＋B：先提示旋轉，同時允許地圖平移。

參考稿只定義視覺層級、比例、座標與互動，不是可直接複製到產品的 HTML／CSS。
