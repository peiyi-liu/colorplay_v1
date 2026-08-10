# 可見 UI 與第三章內容修正 Design

- 日期：2026-08-10
- 狀態：Owner 已於本 session 擴大修改範圍，授權實作
- 基線：`phase5f/u1-live-presenter-ui` tip `1a6a392`
- 性質：既有 UI-first slices 的產品結果修正；不代表 Phase 2／5／release gate 完成

## 1. 問題定義

先前 Phase 4A／5V／5F-U1 的 task-level checks 雖通過，但 owner 實際檢視得到四個落差：

1. 首頁、登入、學生學習地圖未納入前一輪可見風格調整，登入在 1440×900 與 mobile 會產生頁面級垂直 overflow。
2. 教師端先前只有少量像素 chrome／表框調整，與參考設計的可見差異不足。
3. LivePresenter 只驗證 body 位於 header/footer 之間，沒有驗證整頁視覺中心；無 footer action 的 podium／cancelled 會落在 viewport 中心下方。
4. Google Sheet 已換成新 5-tab 結構，但匯入器仍尋找舊欄名、忽略 review card identifier／附件欄；既有 generated seed 缺少 3-3 且掛了錯誤的 `color-wheel.svg` placeholder。

## 2. 可見成果

### 2.1 首頁、登入、學生學習地圖

- 沿用已核准 JRPG pixel baseline 與現有 learning-map assets，不複製 reference screenshot。
- `/` 與 `/login` 使用村莊／夜景背景語彙；內容保持單一 primary action。
- 320×568、375×812、393×852、1440×900 不得有水平 overflow、文字裁切或不同文字 box 重疊。
- 登入表單可垂直捲動，但 1440×900 desktop 不得因裝飾性間距把卡片推出 viewport；mobile 需保留完整欄位與 action。
- `/app` 保留六章村莊地圖與 production data interface，調整 HUD／卷軸／對話區的 responsive spacing，禁止文字被固定高度裁切。

### 2.2 教師端

- 以 `live-v2/project/ColorPlay 教師端.dc.html` 為 layout reference，依 normative JRPG spec 將像素濃度限制在約三成。
- production repository、query、mutation、route 與文案語意不變。
- dashboard、analytics、classes、class detail、student progress、Live create、Live report 需有一致的賢者工坊 page header、section surface、table frame 與 action hierarchy。
- 320／375／768／1024／1440px 不得有頁面級水平 overflow；table 可在命名容器內水平捲動。

### 2.3 LivePresenter

- 7 個既有 phase 與 hosting semantics 不變。
- 可見內容 cluster 需在 viewport 中心的容許帶內；一般 phase 容許 header/footer 差異造成最多 8px，podium／cancelled 不得再下偏約 25px。
- 既有 1024×768／1280×720／1366×768／1920×1080 零 root scroll、44px target、內容上限與 reduced-motion 契約維持。

### 2.4 第三章內容

- `content:fetch --xlsx` 接受新欄名 `題庫序號`、`複習卡序號`、`附件`，並保留 identifier 與 attachment 至中介資料。
- 第三章 3-1／3-2／3-3 的 review cards 全數出現在 generated seed／manifest。
- 刪除未由 Sheet 指定且掛錯卡片的 `color-wheel.svg` mapping。
- Sheet 僅提供附件標籤但沒有對應 standalone 圖檔時，匯入報告列為 missing source asset，seed 不得掛錯圖或假圖。
- 本輪只產生與驗證本機 artifacts／SQL；任何 staging DB 寫入仍需 owner 另行授權。

## 3. 測試 seam

- Public route DOM／Chromium geometry：`/`、`/login`、fixture-backed `/app`。
- Teacher production pages through existing dev-only teacher harness。
- `LivePresenter` production module through existing live presenter harness。
- `fetch-sheet.mjs`／`import-review-cards.mjs` 的 exported build functions 與 CLI generated outputs。

## 4. Scope boundary

- 不新增 API／RPC／schema／query／mutation。
- 不修改 Live phase／transition／host command。
- 不以 mock 冒充 hosted content；fixture 只可存在 dev/test harness。
- 不 merge、push、deploy 或寫 hosted DB，除非 owner 另行授權。
- 正確附件原始檔不存在時停止該附件的發布，不自行從網路抓相似圖片替代。

## 5. 完成聲明

本修正完成後只可聲明「visible UI and Chapter 3 local content correction complete」。不代表 Phase 2、Phase 5、Slice Gate 或 production-ready。
