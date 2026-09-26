# ColorPlay 內容上傳與維運操作手冊

給內容管理員與系統維護者的操作說明。正式 authoring surface 是 Admin
`/admin/content`；Google Sheet 腳本只保留為舊資料轉入 compatibility adapter，
不再直接改寫 current published content。

---

## 一、內容更新流程總覽

```
Admin 開啟「內容工作台」
      │
      ▼
手動新增／修改，或下載 XLSX 範本後上傳 XLSX／CSV＋圖片 ZIP
      │
      ▼
可信驗證 → 逐列差異／錯誤 → 警告確認 → 建立持久草稿
      │
      ▼
伺服器計算發布影響 → 二次確認 → 建立不可變版本／事件
      │
      ▼
學生只讀 current published version；歷史事實不被改寫
```

圖片 ZIP 內的 JPG／PNG／WebP 會自動逐張進入 private quarantine，由可信
processor 產生 320／800／必要時 1200 WebP，再以 source SHA-256 核對 manifest。
不可在試算表貼圖片、base64、data URL 或遠端 URL。

下列 Google Sheet／CLI 流程只用於把既有第三章資料建成可審核 package；執行
`pnpm content:import` 不會直接發布、封存、刪除或改寫 Hosted DB。

## 二、舊 Google Sheet compatibility 格式

試算表（同一份活頁簿）有兩個分頁，**欄位名稱與順序不可更動**。

### 分頁 1：各單元隨機測驗題庫

| 欄位         | 必填      | 規則                                             |
| ------------ | --------- | ------------------------------------------------ |
| 題號         | ✔         | 格式 `章-節-兩位序號`，例如 `3-1-01`；不可重複   |
| 章節編號     | ✔         | 數字，需在系統章節對應表內（見下方 chapterMap）  |
| 小節         | ✔         | 例如 `3-1 色彩三要素與色名的表示`                |
| 題目         | ✔         | 1–1000 字                                        |
| 選項 A–D     | 至少 2 個 | 每個 ≤500 字                                     |
| 正確答案     | ✔         | `A`/`B`/`C`/`D`，需對應有文字的選項              |
| 答錯觀念解析 | 建議      | 留空時使用 AI 草稿（見報告），填入後以試算表為準 |

### 分頁 2：各單元複習大廳（複習卡）

| 欄位     | 必填        | 規則                                      |
| -------- | ----------- | ----------------------------------------- |
| 章節編號 | ✔（可承上） | 合併儲存格留空時自動沿用上一列            |
| 小節     | ✔（可承上） | 需有 `n-n` 編號前綴，例如 `3-2 色彩體系…` |
| 子主題   | 建議        | 顯示為卡片分組標籤                        |
| 卡片標題 | ✔           | 1–200 字；**留空該列會被跳過**            |
| 卡片內容 | ✔           | 支援多行；≤8000 字                        |

常見狀況：

- **列被跳過**：缺必填欄位（最常見是卡片標題）。報告會列出原因，補齊後重跑匯入即可。
- **匯入中止**：章節編號沒有對應（要先更新 chapterMap）、同一小節出現重複的「子主題+標題」。
- 新章節上線：先在 `scripts/content/import-fixes.json` 的 `chapterMap` 加上
  `"試算表章節編號": "chapter-N"` 的對應，再重跑匯入。

## 三、執行匯入

在專案根目錄（需要網路，試算表須維持「知道連結者可檢視」）：

```bash
pnpm content:import
```

產出（都要一起 commit）：

| 檔案                                        | 用途                                         |
| ------------------------------------------- | -------------------------------------------- |
| `supabase/seeds/content-questions.sql`      | 題庫種子                                     |
| `supabase/seeds/content-review-cards.sql`   | 複習卡種子                                   |
| `supabase/seeds/content-question-hints.sql` | 分層提示種子                                 |
| `tests/fixtures/*.generated.ts`             | 測試自動適應用的對照表                       |
| `docs/content/import-review.md`             | 題庫審閱報告（跳過列、改號、解析與提示草稿） |
| `docs/content/review-import-report.md`      | 複習卡審閱報告（跳過列、媒體附件）           |

**審閱報告一定要看**：AI 起草的「解析」與「分層提示」都標示待教師審閱，
確認過的文字建議填回試算表，下次匯入即以試算表為準。

本機驗證（選用但建議）：

```bash
pnpm exec supabase db reset --local   # 套用種子
pnpm test:db                          # 資料庫測試全綠才推送
```

## 四、Staging 發布邊界

### 前端（自動）

合併 GitHub `staging` 後，Vercel 會自動建置 `colorplay-staging-web`。前端部署
不會自動套用 Supabase migration、部署 Edge Function 或發布內容；三者必須依
mutation manifest 分開核對 exact SHA／project ref。

### Staging 資料庫內容（手動）

Staging 專案固定為 `onkxnkzeixpezetkmocf`。內容更新一律經 Content Studio
draft／publish commands；不得以整庫重置或 SQL Editor 直接更新取代正式流程。
Production 專案不在此手冊的內容操作範圍。

詳見 `docs/staging-runbook.md`。

## 五、測試帳號（Staging 與本機通用）

| 身分   | Email                        | 密碼                  |
| ------ | ---------------------------- | --------------------- |
| 學生一 | `student.one@colorplay.test` | `LocalOnly-Student1!` |
| 學生二 | `student.two@colorplay.test` | `LocalOnly-Student2!` |
| 老師   | `teacher@colorplay.test`     | `LocalOnly-Teacher1!` |

（另有測試專用帳號多組，完整清單見 `tests/fixtures/users.ts`。）

## 六、Token 輪替（維運）

三種 token 曾出現在對話／文件中，建議定期輪替；任何一個洩漏都照此處理：

1. **Supabase Access Token**（管理資料庫用）
   - supabase.com → 右上頭像 → Account Settings → Access Tokens
   - Generate new token → 保存到密碼管理器 → Revoke 舊 token
   - 影響範圍：`bootstrap-staging-db.mjs` 執行時的環境變數，換新值即可。
2. **Vercel Token**（部署用）
   - vercel.com → Settings → Tokens → Create → Revoke 舊 token
   - 已開啟 GitHub 自動部署後，日常部署不需要此 token；僅手動
     `vercel deploy` 或改環境變數時使用。
3. **Supabase anon key**（前端公開金鑰）
   - 屬公開金鑰、安全性靠 RLS，一般不需輪替。若需輪替：
     Supabase dashboard → Project Settings → API → JWT 區塊 rotate，
     之後要同步更新 Vercel 環境變數 `VITE_SUPABASE_ANON_KEY` 並重新部署，
     並重跑 staging 引導（service key 也會一起換）。
4. GitHub repo 位址不含秘密，不需處理；若要限縮存取改 repo 權限即可。

## 七、常見問題

- **推了試算表但站上沒變**：內容要經過「匯入 → commit/push → staging 引導」
  三步，缺一不可（前端只有 push 會自動部署；資料庫要跑引導）。
- **匯入報錯「章節編號沒有對應」**：先補 `import-fixes.json` 的 `chapterMap`。
- **登入不進 staging**：確認用上表帳號；資料庫剛重置時等約 1 分鐘再試。
- **Vercel 部署失敗**：看 Vercel dashboard 的 build log；本機先跑
  `pnpm build` 重現。
