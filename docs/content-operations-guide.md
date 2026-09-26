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

## 二、Google Sheet compatibility 格式

舊活頁簿可繼續提供 RC、QB、CR、LT 內容；adapter 會轉成 Content Studio 的 Course／Chapter／Section／Subtopic／RC／QB／CR／LT／Question／Media 統一 contract。題號與複習卡序號必須使用穩定代碼，正解需對應 2–4 個非空選項；公式、遠端圖片 URL、data URL、重複代碼與跨章 parent 一律擋下。

Google Sheet 只作 compatibility source，圖片仍放在 ZIP 的 `media/`，並由 Media sheet 提供 owner code、path、繁中 alt、semantic role 與 sort order。

## 三、建立與匯入第三章套件

```bash
pnpm content:fetch
pnpm content:chapter3
```

- `content:fetch` 唯讀下載最新 owner Sheet 到 ignored `artifacts/content/`。
- `content:chapter3` 更新 `content/packages/chapter-3/` 的版本化 workbook／manifest，並建立 ignored 的實際上傳 ZIP。
- Admin `/admin/content` 上傳 ZIP 後，先處理 8 張圖片，再顯示逐列 create／update／no-op／warning／error；確認只建立 persistent drafts。
- 發布時必須選擇「新增或語意變更」或「錯字／排版／無語意 accessibility 修正」，伺服器再依欄位 allowlist 判定 impact。新內容一律要求重做，沒有 grandfather 豁免。

Local phase gate：

```bash
pnpm phase:content-studio-ch3
```

此 gate 只可證明 Content Studio＋第三章 Local slice；不代表 Hosted、Production、其他章或 Phase 8 release proof。

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
