# Chapter 3 review-card media

本目錄保存準備上傳至 private Supabase Storage 的版本控制來源，不是學生端公開資產。正式物件路徑為：

```text
review-card-media/chapter-3/<filename>
```

## 現有檔案

- `P301.webp`～`P310.webp`
- `review-media-manifest.json`：轉檔時的尺寸、大小與品質紀錄

這批檔案由 `pnpm review-media:prepare` 從原始 JPG 產生，全部符合 WebP、單檔不超過 512 KiB、長寬不超過 2400px 的 review-media contract。

## 邊界

- 不要搬到 `public/` 或 client bundle；正式讀取必須走 private Storage signed URL。
- 一般內容或圖片改版不得覆寫已發布路徑；使用 `P301-v2.webp` 類型的新物件名稱，避免 CDN 舊快取與版本內容漂移。
- 例外紀錄：2026-08-28 owner 明確授權把 P301～P305 的既有無尾碼與 `-v2` Storage objects 一次性替換為本目錄的優化 bytes；這不是未來 Admin 的預設行為。
- P306～P310 尚未確認複習卡 stable code、繁中 alt 與排序，不得猜測 mapping。
- 上傳 Storage 不等於發布內容；已發布卡片的媒體變更仍須走版本化 `publish_review_card`。
