# 第三章 canonical 內容套件

`content.xlsx` 是 2026-09-26 從 owner Google Sheet 最新快照建立的第三章版本化內容權威；`package-manifest.json` 固定來源 digest、內容數量與 8 張已映射圖片的 hash／alt／semantic role。兩者都不含秘密、signed URL 或執行環境資料。

```bash
pnpm content:fetch
pnpm content:chapter3
```

第一個指令唯讀更新 ignored 的 Google Sheet 快照；第二個指令重建本目錄的版本化檔案，並在 `artifacts/content/chapter-3-content-import.zip` 產生實際可由 Admin Content Studio 上傳的 ZIP。不要單獨上傳本目錄的 `content.xlsx`，因為 Media sheet 必須和 ZIP 內 `media/` bytes 一起由可信任流程驗證。

圖片 bytes 不在本目錄複製一份；權威來源維持於 `scripts/assets/source/review-card-media/chapter-3/`，避免同一張大圖在 Git 重複保存。P309／P310 尚無核准的 RC mapping，因此不在本套件；系統不會猜測其歸屬。
