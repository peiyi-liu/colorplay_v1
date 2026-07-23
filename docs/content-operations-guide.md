# ColorPlay 內容上傳與維運操作手冊

給內容維護者（老師）與系統維護者的完整操作說明。
目前內容以 Google 試算表為主來源；Phase 6 之後會提供教師後台直接管理。

---

## 一、內容更新流程總覽

```
老師編輯 Google 試算表
      │
      ▼
維護者執行  pnpm content:import      ← 下載、驗證、產生種子與審閱報告
      │
      ▼
檢查審閱報告（docs/content/*.md）    ← 跳過列、待確認、AI 草稿
      │
      ▼
git commit + push                     ← 前端自動部署到 Vercel
      │
      ▼
執行 Staging 資料庫引導               ← 內容進入 staging 資料庫
```

## 二、試算表格式

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

## 四、部署

### 前端（自動）

`git push` 到 GitHub `main` 後 Vercel 自動建置部署，約 1–2 分鐘生效：
<https://colorplay-staging.vercel.app>

### Staging 資料庫內容（手動）

> ⚠️ 目前的做法是**整庫重置**：staging 上的學習紀錄、班級、作業都會清空
> （測試帳號會重建）。適合目前的驗證階段；Phase 6 之後教師可在後台
> 直接新增內容，不再需要重置。

```bash
export SUPABASE_ACCESS_TOKEN=sbp_（你的 token）
export STAGING_PROJECT_REF=onkxnkzeixpezetkmocf
node scripts/staging/bootstrap-staging-db.mjs --confirm-wipe
```

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
