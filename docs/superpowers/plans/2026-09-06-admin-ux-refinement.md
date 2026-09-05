# Admin UI／UX 優化：核准後實作

2026-09-06 Owner 看過 ui-ux-pro-max 互動提案後，明確要求「開始實作，完成後部署 staging」。基準為已發布 Staging `570c0f18a7329cc5f07cbf707b016ff787105bf1`，分支 `codex/admin-ux-refinement`。本次是既有 Admin 的 M 級 UI 優化，不重開產品規格或完整 phase。

提案：本任務 `admin-ux-refinement/index.html` 與 `design-notes.md`（本機 visualization 目錄）。將四頁的資訊層級與固定邊界套用到真實元件，不能把預覽中的合成資料帶入產品。

1. 共用導覽採一致圖示、靛藍重點、淺灰白底、固定內容寬度；保留九個既有入口及五個群組。窄螢幕用原生 Dialog 限制焦點、Escape 關閉與返回焦點。
2. 資料查核：五分類與清單並排、跨分類搜尋、中文用途／技術名稱分層、快捷搜尋與清除回焦點。資料入口只能來自原 safe catalog。
3. 平台監控：預設需查核，另可選資料不足／全部；缺失與 stale 指標不列正常；同一指標跨群組去重為 19 項。原始結果、觀測時間、範圍、版本證據與下一步均保留於可展開內容。
4. 教師帳號：搜尋與狀態位置統一、清單已載入數、欄位順序與依作業狀態命名明細連結；沿用建立／確認／秘密收據／非同步作業阻擋與重試流程。安全總覽以真實事故計數與常用入口整理，範圍仍限安全控制面。

驗證沿用已核准 seam：RTL 的資料搜尋／監控篩選與未知狀態、既有 Admin 全部單元測試；15 路由多 viewport 的 Chromium harness（含固定邊界、焦點、非同步處理）；lint／typecheck／build。一次 reviewer、一次往返。AC 對應：AC-UI-008～015 中適用的狀態、鍵盤、Dialog、RWD 與固定操作位置；不替代人工裝置或完整 phase gate。

發布：protected PR 的必要 CI 與 owner-approval 綁定 exact head 後正常合併 Staging。沿用既有 exact artifact／環境指紋／真實學生教師登入與 profile bootstrap proof，再確認 alias 版本。本次無新 migration、無權限或 API 變更，無 Production 操作。
