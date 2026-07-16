# 內容修改指南（給教師）

平台的題庫內容以 **Google 試算表為唯一來源**，程式碼不用動。任何內容變動都走同一條路：

```bash
pnpm content:import   # 從試算表抓最新內容並重新產生種子與測試資料
pnpm test:db          # 重建本機資料庫（會套用新內容）
```

開著 `pnpm dev` 的話，跑完上面兩步後重新整理瀏覽器即可看到新內容。

## 常見情境

### 加題目、改題目、改答案、填解析

直接在試算表編輯，然後跑上面兩個指令。規則：

- 題號格式 `章-節-兩位數`（如 `3-1-01`），全表不可重複。
- 選項至少 2 個（A–D），正確答案填 A/B/C/D。
- 「答錯觀念解析」建議填寫；留空時會使用 `scripts/content/import-fixes.json` 裡的 AI 草稿（若有）。**試算表填了就以試算表為準。**
- 資料有問題（缺答案、題號重複…）時匯入會**直接中止並列出原因**，不會把壞資料寫進平台。

### 新章節的題目

試算表加新列、填章節編號，並確認 `scripts/content/import-fixes.json` 的：

- `chapterMap`：試算表章節編號 → 平台章節（`chapter-1` ～ `chapter-6`）。
- `sectionTitles`：新的小節編號（如 `5-1`）要給標題。

### 改章節名稱／說明

在 `import-fixes.json` 的 `chapterTitles` 加一筆，例如：

```json
"chapter-5": { "title": "色彩心理與感覺", "description": "..." }
```

### 跳過有問題的列、修正重複題號

`skipCodes`（跳過並記錄原因）、`duplicateRenames`（第二次出現的題號自動改號）。

## 每次匯入自動產生的檔案

| 檔案                                           | 用途                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `supabase/seeds/content-questions.sql`         | 資料庫種子（勿手改）                                       |
| `tests/fixtures/question-answers.generated.ts` | E2E 測試的題目↔正解對照                                    |
| `tests/fixtures/content-manifest.generated.ts` | E2E 測試的章節清單——**測試會自動適應內容變動**，不用改測試 |
| `docs/content/import-review.md`                | 審閱報告：跳過的列、改號、待確認答案、AI 解析草稿          |

## 匯入後建議

1. 看一眼 `docs/content/import-review.md` 的「需要教師處理的項目」。
2. 內容變動後提交：`git add -A && git commit -m "content: 更新題庫"`。
