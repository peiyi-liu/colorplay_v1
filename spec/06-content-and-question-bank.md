# 教學內容、題庫與匯入規格

## 1. 內容層級

```text
Course
└─ Chapter
   └─ Section
      └─ Subtopic
         ├─ Review Card
         └─ Question
```

第一個 course：色彩原理。

初始章節：

1. 色彩與光源
2. 色彩與生理
3. 色彩表示
4. 色彩混色
5. 色彩心理
6. 色彩配色

只有 `published` 且含有效內容的章節對學生顯示可學習。

## 2. Review Card

欄位：

- title：1–80 字元。
- body：1–5,000 字元。
- media：0–3 個。
- media alt text：圖片必填，1–200 字元。
- sort order。
- status／version。
- `requires_recompletion`：語意變更需學生重新完成時為 true。

可接受格式：純文字、受限 Markdown、圖片、色票資料。MVP 不允許任意 HTML iframe。

## 3. Question types

### MVP 必須：`single_choice`

- 2–4 個非空選項。
- 恰一個正確選項。
- prompt 1–1,000 字元。
- explanation 1–2,000 字元。
- stable code 唯一於 course，例如 `3-1-01`。
- duration 5–120 秒，MVP UI 預設 20。

### 後續：

- `drag_match`
- `color_sort`
- `color_mixer`
- `palette_builder`

未完成對應 runner、authoring UI、資料模型與驗收前，不得只把 question_type 加入下拉選單宣稱支援。

## 4. 內容狀態與版本

- Draft：只有教師可見。
- Published：學生可見，需通過 validation。
- Archived：新 session 不再抽取，歷史仍可讀。

Published question 若修改以下任一欄位，必須建立新 version：

- prompt
- options
- correct answer
- explanation
- duration
- media affecting meaning

只改 typo 是否新版本由內容治理規則決定；若可能影響答案解釋，必須新版本。

所有 published review card、question 與影響語意的 media 都建立 `content_versions` frozen payload/hash，並以 `content_publication_events` 記錄 publish/archive actor、時間、版本與 request ID。歷史 quiz、hint、remediation、assignment、Live session 保存引用版本；不得用 current row 改寫歷史。

## 5. 發布驗證

單選題發布必須全部通過：

- stable code 存在且格式合法。
- prompt 非空。
- 2–4 個非空選項。
- 正確選項恰一個。
- explanation 非空。
- subtopic、section、chapter 存在。
- media 可存取且 alt text 完整。
- 無重複選項（trim、大小寫正規化後）。
- 無明顯 `<script>` 或未允許 HTML。

失敗時顯示逐欄位錯誤；不得自動忽略不合法列並宣稱成功。

## 6. XLSX 範本

必須提供可真實下載的 `.xlsx`，至少三工作表：

### `章節`

- 章節編號
- 章節名稱
- 章節描述
- 顯示順序

### `複習卡`

- 章節編號
- 小節
- 子主題
- 卡片標題
- 卡片內容
- 圖片網址（選填）
- 替代文字（圖片時必填）

### `題庫`

- 章節編號
- 小節
- 子主題
- 題號
- 題型
- 題目
- 選項A
- 選項B
- 選項C
- 選項D
- 正解
- 解析
- 作答秒數
- 狀態

範本包含說明列與至少 2 筆合法示例，但匯入時可選擇忽略示例列。

## 7. 匯入流程

### Upload

- 檢查副檔名、MIME、magic bytes、大小。
- 建立 `content_imports` 記錄，狀態 `uploaded`。

### Validate

產生：

- total rows
- valid rows
- error rows
- warning rows
- 每列 sheet、row number、field、code、message
- 預覽將建立／更新的物件

### Confirm

教師明確確認後才 commit。若有 error rows，預設禁止 commit；warning 可確認後繼續。

### Commit

- 單一 transaction。
- 支援 dry-run。
- commit 後保存 import report 與 created IDs。
- 重送同一 commit request 不得重複建立。

## 8. 正解解析

接受：

- A/B/C/D
- 1/2/3/4

解析後必須確認該選項存在且非空。任何其他值為 error，不得預設成 A。

## 9. 題庫抽題

- 只抽 `published`、符合版本與 scope 的題目。
- 不抽 archived／draft。
- 隨機化在後端執行。
- Session 建立後 frozen。
- 若題數不足，回傳實際題數與明確 reason；UI 顯示真實數量。
- Practice／assignment／remediation 只抽 current published versions；Live session 建立時另凍結自己的 question/version/options/deadline projection。

## 10. 教師編輯器

- 有 unsaved changes 提示。
- 表單 validation 即時顯示，但 server validation 最終決定。
- 正解設定需清楚，不只靠顏色。
- 預覽 student view 不得暴露資料庫內部欄位。
- 發布需二次確認並顯示版本影響。

## 11. 媒體

- 圖片格式：PNG、JPEG、WebP；MVP 不接受 SVG 上傳。
- 單檔上限 2 MiB，最大 4096×4096。
- 上傳後產生安全檔名與 metadata。
- Storage policy：學生只讀被發布內容；教師只可寫自己授權範圍。

## 12. 內容品質

程式驗收只驗證結構與流程，不能替代教學內容審查。正式發布前教師需確認：

- 題目有唯一合理答案。
- 解析與教材一致。
- 用語符合課程與年級。
- 色彩圖片在可接受螢幕差異下仍具教學合理性。
- 不使用色覺作為唯一辨識線索。

## 13. Verified content baseline and legacy boundary

- Approved pipeline 有 45 題：第三章 37 題、第四章 8 題。
- 教師持續在同一份公開試算表擴充內容；重新匯入必須保留既有 45 題 baseline 的 stable codes（新內容只能新增或依 `import-fixes.json` 明示修正），不得覆蓋 verified baseline。
- 複習卡來源分頁為「各單元複習大廳」（gid 0），欄位：`章節編號`、`小節`、`子主題`、`卡片標題`、`卡片內容`（多行）。匯入器 `scripts/content/import-review-cards.mjs` 產出 `supabase/seeds/content-review-cards.sql`、`tests/fixtures/review-manifest.generated.ts` 與 `docs/content/review-import-report.md`；UUID 決定性（stable key 派生），初版 version 1、status published。
- Hint content 在試算表尚無欄位前，由 `scripts/content/import-fixes.json` 以 level 1–3 草稿補充（AI 草稿，匯入報告標示「待教師審閱」，與解析草稿同一政策）；hint 不得等價揭露正解。試算表未來新增提示欄位後以試算表為準。
- Legacy hosted 46 題沒有 unique valid content：44 prompts matching，2 remote-only rows invalid；不得覆蓋 verified baseline。
- `colorplay-new` 六章描述、review card、Blook、avatar、badge 只作 candidate reference；必須先確認作者／媒體權利、教學正確、accessibility，再由正常 validation/version/import 發布。
- 不複製 hard-coded leaderboard、progress、achievement、Kahoot PIN、mock state 或 legacy SQL/policy 當內容。
- Production 只收 approved content ledger rows，不收 Staging/legacy Auth users 或 learning history。

## 14. Hint content

- 每題可定義最多 three hints，依 level 1–3 由淺入深；缺少某 level 時 API 回明確 unavailable，不補造內容。
- Hint 是 versioned published content，需教師權限與發布驗證；不得包含 correct option ID/index 或直接等價答案。
- `request_question_hint` 只回目前允許 level，並記錄 user/session question/content version/server time。
- 第一版 hint 不扣正式 score/reward；內容作者不可在 hint payload 加 client-calculated penalty。

## 15. External activities

- `external_activities` 可保存 teacher-owned Kahoot URL、optional classroom/chapter、availability/status。
- URL 需 HTTPS、安全 parse/allow policy，不透過第三方 QR service 洩漏 activity URL。
- 不宣稱 official API integration，不匯入 external answers/reports，不把 fixed PIN 或外部成績當 ColorPlay 正式資料。

## 16. Progress version input

Progress 規則只讀 current published review/question versions；old-version、draft、archived 不進 current denominator。新 review version 的 `requires_recompletion` 決定是否重做；新 question version 只用新版本 latest qualifying answer。計算保存 content version set 與 `2026-07-progress-1`，可重現且不可由 browser 寫百分比。
