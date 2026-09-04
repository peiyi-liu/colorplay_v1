# 複習卡圖片匯入指南

## 結論

圖片檔放在 Supabase Storage，Postgres 的 `review_card_media` 只保存物件路徑、替代文字與排序。Google Sheet 的「附件」欄先放穩定代號即可；目前最新版代號為：

| 複習卡 | Sheet 附件代號 |
| ------ | -------------- |
| RC3101 | P301           |
| RC3103 | P302           |
| RC3201 | P303、P304     |
| RC3202 | P305           |

圖片尚未上傳或 mapping 尚未填妥時，匯入器會保留附件代號並在報告列出，但不建立假圖片資料。

## 1. 準備圖片

- 原始 JPG／PNG 放在同一個輸入資料夾，檔名使用 Sheet 的附件代號，例如 `P301.jpg`。
- 在 repository root 執行批次轉檔；輸出請指定新的子資料夾，避免蓋掉原圖或舊版 WebP：

```bash
pnpm review-media:prepare \
  --input "/absolute/path/JPG" \
  --output "/absolute/path/WEBP/optimized"
```

工具會保留長寬比例、優先維持圖片尺寸，並在品質上限 0.94 內尋找符合 512 KiB 的最高 WebP 畫質；只有仍超標時才縮小尺寸。完成後會產生 `review-media-manifest.json`，記錄來源檔、輸出檔、尺寸、大小與編碼品質。檔名會正規化為 `P301.webp` 或 `P301-v2.webp`。若輸出圖片或 manifest 已存在，工具會停止且不覆寫；改版請使用新資料夾或新的版本檔名。

核准上傳的版本控制來源放在 `scripts/assets/source/review-card-media/chapter-{n}/`；這個目錄不進 client bundle，也不取代 private Storage。未來 Admin 整合邊界記錄於 `docs/content/review-card-admin-media-backlog.md`。

- 新上傳檔案只用 WebP；不接受 PNG、JPEG 或 SVG 直接進入發布流程。
- 單檔不超過 512 KiB，長寬各不超過 2400px。
- 檔名使用附件代號或其版本尾碼，例如 `P301.webp`、`P301-v2.webp`。
- 每張圖準備一段能說明教學資訊的繁體中文替代文字；不可只寫「圖片」或檔名。
- 同一代號改版時建議用版本檔名（例如 `P301-v2.webp`），避免 CDN 舊快取。

上傳前先在 repository root 執行；未通過不得上傳：

```bash
pnpm assets:check:review-media /absolute/path/P301-v3.webp
```

## 2. 上傳至 staging Storage

1. 登入 Supabase Dashboard，確認專案 URL 是 `https://onkxnkzeixpezetkmocf.supabase.co`。
2. 開啟 **Storage** → `review-card-media` bucket。
3. 建立 `chapter-3` 資料夾。
4. 上傳圖片，例如 `chapter-3/P301.webp`。
5. 保持 bucket 為 private；不要切換成 public。

`review-card-media` bucket 由 migration 建立為 private。Storage 的 2 MiB／PNG／JPEG／WebP 設定是既有物件的相容上限，不是新發布品質門檻；新上傳必須先通過上述 512 KiB WebP gate。學生登入後，前端只會對「目前已發布卡片版本所綁定的物件」取得 1 小時 signed URL；未綁定、舊版本、草稿物件都不能直接讀。瀏覽器沒有上傳、覆寫或刪除 policy。

請勿把檔案直接 insert 到 `storage.objects`，也不要把圖片二進位或 base64 寫入 Postgres。

## 3. 將附件代號映射到 Storage 物件（首次匯入前）

編輯 `scripts/content/import-fixes.json` 的 `reviewCardMedia`。資料庫保存環境中立的 `bucket/object-path`，不要寫死 staging 完整 URL：

```json
{
  "reviewCardMedia": {
    "$comment": "只加入 owner 已核准、已上傳且有 alt 的圖片。",
    "RC3101": {
      "attachmentRef": "P301",
      "asset": "review-card-media/chapter-3/P301.webp",
      "alt": "請填寫 P301 圖片實際呈現的教學內容"
    },
    "RC3201": [
      {
        "attachmentRef": "P303",
        "asset": "review-card-media/chapter-3/P303.webp",
        "alt": "請填寫 P303 圖片實際呈現的教學內容"
      },
      {
        "attachmentRef": "P304",
        "asset": "review-card-media/chapter-3/P304.webp",
        "alt": "請填寫 P304 圖片實際呈現的教學內容"
      }
    ]
  }
}
```

同一卡片有多張圖時使用陣列；陣列順序就是畫面與資料庫的 `sort_order`。匯入器會阻擋附件代號不符、空白 alt、不安全 URL，以及不是 `review-card-media` bucket 的路徑。

這個 JSON mapping 只適合「該 stable code 尚未存在於目標資料庫」的首次匯入。已發布卡片若新增／換圖，匯入器會以 `CONTENT_VERSION_REQUIRED` 中止，避免悄悄改寫學生已完成的教材版本。

## 4. 已發布卡片後補圖片（本次 P301～P305 適用）

圖片是卡片語意內容的一部分，後補時必須透過既有可信指令 `publish_review_card` 建立下一個版本，不能直接 update `review_card_media`。操作資料需包含：

- 原卡片的 `stable_code`、`subtopic_id`、`group_label`、`title`、`content`。
- `requires_recompletion` 是否要求已讀學生重讀。
- `media` 陣列，每筆為 `asset_path` 與繁中 `alt_text`，順序即畫面順序。
- 新的 request UUID；執行者必須是已登入且通過後端 teacher role 的帳號。

目前教師內容 editor 尚未接到正式 route，因此不要在 Dashboard SQL Editor 直接改表。把圖片檔與下列表格交給 Codex，即可由同一條版本化 publish 流程處理：

| RC stable code | 附件代號 | 圖片檔 | 繁中替代文字 | 是否需重讀 |
| -------------- | -------- | ------ | ------------ | ---------- |
| RC3101         | P301     |        |              |            |
| RC3103         | P302     |        |              |            |
| RC3201         | P303     |        |              |            |
| RC3201         | P304     |        |              |            |
| RC3202         | P305     |        |              |            |

可直接使用的後續提示詞：

> 將以下複習卡 WebP 圖片上傳到 staging Supabase `onkxnkzeixpezetkmocf` 的 private `review-card-media` bucket，依表格附件代號與 alt 綁定，使用 `publish_review_card` 建立新版本並保留舊 media；先跑 `pnpm assets:check:review-media -- <files...>` 與 mapping gate，完成後驗證學生登入可取得 signed URL，未綁定物件不可讀。不得碰 production。

## 5. 重新抓 Sheet、檢查、產生首次匯入資料

```bash
pnpm content:fetch
pnpm content:verify --gate --xlsx artifacts/content/question-bank.xlsx
node scripts/content/import-questions.mjs artifacts/content/questions.csv
node scripts/content/import-review-cards.mjs artifacts/content/review-cards.csv
```

只有結構 gate 為 0 error／0 warning 才可繼續。接著檢查：

- `docs/content/review-import-report.md` 的「已核准媒體附件」是否與實際圖片一致。
- `supabase/seeds/content-review-cards.sql` 是否只有核准的 Storage 物件路徑與 alt。
- `git diff --check`、相關 importer tests、typecheck 與 DB tests 是否通過。

正式套用 staging 前仍需先做遠端唯讀盤點，再以 migration＋transactional seed 更新；不得 reset hosted staging。套用後逐一開啟學生複習閱讀頁，確認圖片、alt fallback、分頁與手機版排版。

## 6. 環境邊界

- staging：`colorplay-staging-web`／`staging.colorplayapp.com`／`onkxnkzeixpezetkmocf`。
- production：`colorplay-web`／`colorplayapp.com`／`xdjumzdqyexpyndanwkp`。
- `asset` 存 bucket/object path，前端會依目前連線的 Supabase project 即時取得短效 signed URL，因此同一份內容 mapping 不會把 staging hostname 帶入 production。
- 不得把 anon key、service role、access token、signed URL 或任何秘密寫進 Sheet、JSON mapping 或 git。
