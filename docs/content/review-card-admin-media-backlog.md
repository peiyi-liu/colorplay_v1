# Admin 複習卡圖片工具待辦

## 決策紀錄

本機 `pnpm review-media:prepare` 已能將教材 JPG／PNG 批次轉成符合 review-media contract 的 WebP，並產生 manifest。未來可把同一套使用流程加入 Admin，但目前的 Playwright CLI 是 Node.js 本機工具，**不能直接匯入瀏覽器 UI**；Admin 只能共用檔名、尺寸、容量與發布契約，圖片處理實作需另行設計。

## 建議 Admin 範圍

1. 選擇或拖入圖片，輸入附件代號、繁中替代文字與排序。
2. 在上傳前即時預覽轉檔結果、尺寸、檔案大小及壓縮後畫質。
3. 將圖片正規化為 `P301.webp`／`P301-v2.webp`，限制 WebP、512 KiB、2400px。
4. 只上傳到 private `review-card-media/chapter-{n}/`，不得產生 public URL。
5. 上傳後透過 canonical publish 流程建立新卡片版本，明確選擇 `requires_recompletion`；不得由前端直接寫 `review_card_media`。
6. 顯示上傳、驗證、版本發布各自的成功／失敗狀態，避免把「Storage 已有檔案」誤認成「學生內容已發布」。

## 信任邊界與前置阻擋

- Admin UI、瀏覽器 MIME 與 Canvas 結果皆不可信；後端仍須重新驗證角色、檔案 signature、WebP 格式、byte size、dimensions、object path 與版本衝突。
- 必須沿用 private Storage signed URL，不得把圖片放到 `public/` 或直接寫完整 hosted URL 到資料庫。
- 啟用 Admin 上傳／發布前，先修正目前 `review_card_media` metadata／Storage policy 僅依 published 判斷、可能繞過章節 canonical access 的風險。
- P306～P310 必須先確認 Sheet stable code、每張 alt 與 sort order；目前不得建立推測 mapping。

## 尚未拍板的實作選項

- 瀏覽器 Canvas／OffscreenCanvas 預處理，再由後端重驗證與寫入。
- 將原圖送到受保護的後端圖片處理服務，由後端統一轉檔與上傳。

選型時需比較行動裝置記憶體、轉檔一致性、上傳失敗重試、成本與後端執行限制；本紀錄不預先指定其中一種。
