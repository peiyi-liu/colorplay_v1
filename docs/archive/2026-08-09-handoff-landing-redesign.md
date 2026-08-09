> 封存說明：本檔案是 `docs/handoff.md` 在改版為跨工具（Codex／Claude Code）rolling log 之前的舊內容，主題是首頁（landing page）改版起手交接，跟目前 admin-security phase 進度無關。原檔案先前是未追蹤（untracked）狀態，2026-08-09 封存進版本控制以保留歷史，之後 `docs/handoff.md` 改作用途，不再更新本檔案。

# ColorPlay 開發起手交接摘要（Landing / 首頁導入）

## 一、目標

在 `colorplay` 專案中，建立一套可重複執行的首頁改版起手流程，對應你提出的
「Figma / Canva 先切圖 → React 元件落地 → 每區塊視覺驗證 → 最終 build」。

最終目標為：

- 將首頁視覺依「Hero / 任務 / 挑戰 / 成就 / CTA」順序落地。
- 所有樣式優先使用既有 token（`src/styles/tokens.css`）避免硬編碼色值。
- 每個主區塊完成後可獨立驗證並可回滾。

## 二、已做事（本輪）

- 已確認專案路徑與現況：
  - 專案根目錄：`/Users/guanyucheng/Desktop/pei-game/colorplay`
  - 首頁目前路由 `"/"` 指向 `TitlePage`（`src/app/router/title-page.tsx`）。
  - 全域樣式已存在：`src/styles/tokens.css`、`src/styles/globals.css`，含現有 design token 與可用 CSS 變數。
  - 視覺測試腳本為 `pnpm test:visual`，其 Playwright 設定預設 base URL 為 `http://127.0.0.1:4173`（未手動指定時會先 build + preview）。
- 已提供一版「可直接執行」的實作流程與驗證節奏（本回合訊息內容）：
  - 啟動確認（`pnpm dev -- --host 127.0.0.1 --port 5173`）
  - 參考圖置入（建議 `artifacts/ref/landing/...`）
  - 在 Figma/Canva 做斷點與設計 token 對齊
  - 元件化落地（建議新增 `src/features/landing/...`）
  - 每完成一區塊後跑 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 pnpm test:visual`
- 已提供可直接複製的「ColorPlay 開發起手 prompt 模板」，可貼給下一位接手者或下一輪執行任務。

> 重要：目前我尚未對程式碼進行實際檔案修改，僅完成需求分析與可執行方案交付。

## 三、結果（已形成可交接輸出）

- 已建立可直接沿用的專案實作順序與檔案建議。
- 已明確定位關鍵實作檔案：
  - 路由：`src/app/router/create-app-router.tsx`
  - 首頁預設頁面（現況）：`src/app/router/title-page.tsx`
  - 主入口樣式載入：`src/main.tsx`
  - 視覺基線測試：`tests/e2e/app-shell.visual.spec.ts`
- 已明確定義驗證順序：區塊級驗證 → 全頁 build（`pnpm build`）→ 視覺回歸。
- 已建立 handoff 文件節點（本文件），可作為下一位工程師的接手摘要。

## 四、剩餘風險

1. **視覺測試目標不完整**
   - 風險：`pnpm test:visual` 目前主要鎖定 `"/login"`，尚未直接針對首頁新 landing page 做基線。
   - 建議：新增 `tests/e2e/landing.visual.spec.ts`，明確鎖定 `/`、多 viewport 與 `data-acceptance-*` 檢核。

2. **設計轉譯一致性風險**
   - 風險：Figma/Canva 與實際 CSS token 對應可能不一致，導致間距/字級/色階偏移。
   - 建議：每個區塊產出 token 對應表（`font-size / spacing / radius / colors`）再開發。

3. **效能與回歸風險**
   - 風險：新增一頁區塊過多、圖片較多，可能影響初始載入與首屏可視時間。
   - 建議：用 `srcset`、懶載入、精簡 SVG/PNG 尺寸與首屏只載入關鍵資產。

4. **規範執行風險**
   - 風險：未強制規定 CTA 的 data 屬性和 touch target 44px，將影響後續可測性。
   - 建議：在每個區塊完成前就加入驗收屬性與最小可點擊尺寸，不要最後補。

## 五、下一步

1. 提供兩張參考截圖（mobile + desktop）到 `artifacts/ref/landing/`，並回傳路徑。
2. 後續依 prompt 模板執行第一段落：先做 Hero 區塊（元件 + 樣式），完成後回報對照結果。
3. 在本文件更新「完成進度」：
   - 目前狀態（未開始 / 進行中 / 完成）
   - 各區塊驗證結果
   - 未解決項目
4. 全流程完成後執行：
   - `pnpm test:visual`（或加上自定 landing 視覺 spec）
   - `pnpm build`
   - `pnpm preview --host 127.0.0.1 --port 4173`

## 六、聯繫節點（handoff 內容參考）

- 主入口：`/Users/guanyucheng/Desktop/pei-game/colorplay/src/main.tsx`
- 首頁路由：`/Users/guanyucheng/Desktop/pei-game/colorplay/src/app/router/create-app-router.tsx`
- 現有首頁元件：`/Users/guanyucheng/Desktop/pei-game/colorplay/src/app/router/title-page.tsx`
- 全域樣式：`/Users/guanyucheng/Desktop/pei-game/colorplay/src/styles/globals.css`
- design tokens：`/Users/guanyucheng/Desktop/pei-game/colorplay/src/styles/tokens.css`
