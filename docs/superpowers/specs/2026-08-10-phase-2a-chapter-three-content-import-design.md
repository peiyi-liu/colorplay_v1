# Phase 2A：第三章內容匯入 Design（Draft）

- 日期：2026-08-10（2026-08-10 Codex review remediation 更新）
- 狀態：Owner approved：2026-08-10
- Codex design review completed
- Implementation planning：尚未授權（not yet authorized）
- 完成本文件定義的 Slice Gate 不代表對應的完整 Phase 已完成
- 對應：`docs/roadmap-colorplay-next.md` Phase 2（內容 SSOT 與版本發布）的一個子集，**不是 Phase 2 的完整 spec**。
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`
- Dependency：無上游依賴；是 Phase 4A 的上游輸入之一（見 4A 的 dependency 說明）。

## 0. 明確聲明（Explicit Non-Claims）

本文件只涵蓋「把第三章的內容從 Google Sheet 匯入資料庫」這一件事。**不得將本文件的完成視為「Phase 2 完成」**——完整的 content publication lifecycle（版本凍結、正式發布、發布後回滾、跨版本內容遷移）不在本文件範圍內。本文件通過不代表全部 6 章內容已就緒，也不代表教師端／Admin 端的內容管理 UI 已存在。

## 1. Scope

### 1.1 Sheet 結構

Google Sheet 已重構為 5 個分頁，本文件只處理其中 3 個：

| 分頁                               | 主要欄位                                                                       | 本文件範圍                 |
| ---------------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| 各單元複習大廳                     | 複習卡序號／章節／章節標題／小節／小節標題／子主題／子主題標題／卡片內容／附件 | 是                         |
| 各單元隨機測驗題庫（小節測驗題庫） | 題庫序號／章節／小節／題目／選項A-D／正確答案／解析                            | 是                         |
| 章節總複習（章節總測題庫）         | 題號／章節／題目／選項A-D／正確答案／解析                                      | 是                         |
| 前測題目                           | 題庫序號／題目／A-D／解答／難度／對應章節／對應內容                            | **否，Explicit Exclusion** |
| 後測題目                           | 同上                                                                           | **否，Explicit Exclusion** |

現有匯入腳本（`fetch-sheet.mjs`／`import-questions.mjs`／`import-review-cards.mjs`／`verify-sheet-db.mjs`）依照舊結構（單一「題庫」分頁＋`code`欄位）寫成，對新結構會直接匯入失敗（已實測：「題庫分頁缺少必要欄位：code」）。

### 1.2 兩種題庫的分流匯入

`各單元隨機測驗題庫`（小節測驗池）與 `章節總複習`（章節總測池）是兩個獨立來源，分別匯入成兩個不同用途的題目池，不合併成單一扁平題庫。

### 1.3 識別碼契約（Identifier Contract）——Codex review remediation，取代先前版本

**先前版本的錯誤假設已修正**：先前版本假設既有資料可以被新序號取代、且本輪不鎖 Sheet 編輯權限，兩者皆與資料完整性/存取控制原則衝突，已由本節取代。

- **保留原則**：**保留所有既有有效 identifier，禁止重新編號。** 只對缺失 identifier 的既有列做一次性 backfill（不是全面重新產生）。
- **命名空間**：Questions（各單元隨機測驗題庫＋章節總複習）與 review cards（各單元複習大廳）**共用同一命名空間與同一組遞增序列**。
- **新 identifier 格式**：固定前綴 `CP-` 加至少六位十進位數字（如 `CP-000001`）。允許超過六位數（不設上限），不得少於六位。
- **Legacy 相容**：既有有效的 legacy identifier（舊雜湊格式）**原樣保留，不更換**。匯入器同時接受已核准的 legacy 格式與新 `CP-` 格式，兩者共存於同一資料集。
- **不建立新舊 ID mapping**：因為既有 ID 不被替換，不需要 mapping 表。
- **跨分頁併發協調**：Apps Script 使用 Google Apps Script `LockService` 的 document lock，確保跨分頁（questions/review cards）產號時不會互相踩號。
- **唯一性與跳號**：唯一性必須保證；**允許跳號，不承諾 gapless**（序號不連續是可接受的正常狀態，不是錯誤）。
- **欄位保護**：`複習卡序號`／`題庫序號`／`題號` 三個 identifier 欄位**立即**設為 owner／Apps Script 可寫的 protected range（不再延後到未來 Admin 功能）。一般內容編輯者不得修改這三欄。
- **執行身分**：Apps Script 以 **owner 身分**批次／排程執行。
- **Fail-closed 情境**（以下任一情況，匯入必須中止，不得靜默略過或自動修復）：
  - identifier 缺失
  - 跨分頁重複（不同分頁出現相同 identifier）
  - 格式錯誤（不符合 legacy 格式也不符合 `CP-` 格式）
  - 既有有效 ID 被更換（偵測到某列的 identifier 與資料庫既有紀錄不一致）
  - identifier 與 entity 內容衝突（例如同一 identifier 對應到不同的題目內容）
- **既有重複 ID 的處置**：發現既有資料本身就有重複 ID 時，**交由 owner 裁決，不得自動替換**——匯入器只回報衝突，不自行決定保留哪一筆。
- **Owner setup guide 必須涵蓋**：script 安裝、trigger 設定、protected range 設定、`LockService` 鎖定行為說明、backfill dry-run 操作方式、衝突拒絕與復原方式。

### 1.4 複習卡多卡支援

改用複習卡的全域 identifier 作為卡片識別碼，原生支援同一子主題下多張獨立卡片。顯示規則：卡片標題顯示子主題標題；同子主題下多張卡標題相同，僅靠 identifier 對應的序號排序區分先後。

### 1.5 結構 gate 與內容 review（兩層，性質不同）

- **結構層**（`verify-sheet-db.mjs --gate`）：機器可判定的格式錯誤（缺欄位、identifier 衝突、選項數不足等），錯誤即擋匯入。
- **內容品質層**（`content-reviewer` agent，依 `docs/content/question-review-rubric.md` C1-C8）：**LLM 初篩，不是最終判定**。FAIL/UNSURE 項目必須交由教師/owner 人工裁決並留下處置紀錄，不能把 LLM 初篩結果當成審查完成的證據。

「內容完整」＝結構 gate 通過 **且** 內容品質層所有 FAIL/UNSURE 項目都有教師/owner 明確處置紀錄。

## 2. Explicit Exclusions

- 前測／後測題目的匯入邏輯。
- 完整 content publication lifecycle（版本凍結、正式發布、回滾、跨版本遷移）。
- 教師端／Admin 端的內容管理 UI。
- 既有重複 ID 的自動修復（僅回報，裁決權在 owner）。

## 3. Typed Input/Output Contract

**輸入**：

```
SheetRow (questions):
  identifier: string          # legacy 格式或 CP-\d{6,} 格式
  chapter: string
  section: string | null      # 章節總測無此欄位
  prompt: string
  options: { A: string; B: string; C: string; D: string }
  correctAnswer: 'A' | 'B' | 'C' | 'D'
  explanation: string | null

SheetRow (reviewCards):
  identifier: string
  chapter: string
  chapterTitle: string
  section: string
  sectionTitle: string
  subtopic: string
  subtopicTitle: string
  content: string
  attachment: string | null
```

**輸出**：

```
ImportResult:
  status: 'committed' | 'blocked'
  errors: StructuralError[]          # fail-closed 情境，status=blocked 時非空
  contentReviewDisposition: {
    stableCode: string
    verdict: 'PASS' | 'FAIL' | 'UNSURE'
    ownerDisposition: 'accepted' | 'rejected' | 'revised' | null   # null = 尚未處置，視為未完成
  }[]
  identifiersAssigned: { identifier: string; entityType: 'question' | 'review_card' }[]
```

## 4. Existing AC Mapping

| AC                                                     | 適用性                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| AC-LEARN-001（只顯示已發布內容）                       | 適用——匯入的內容需標記發布狀態，未發布內容不可被學生端讀取                                               |
| AC-LEARN-003（複習卡完整呈現）                         | 適用——複習卡的子主題標題/內容需完整匯入，不得截斷                                                        |
| AC-TCH-005（不合法正解不得預設 A）                     | 適用——`correctAnswer` 缺失或不合法時必須 fail-closed，不得預設任何選項                                   |
| AC-TCH-006（匯入逐列錯誤）                             | 適用——結構層錯誤需逐列回報，不是整批籠統失敗訊息                                                         |
| AC-TCH-007（Import transaction rollback）              | 適用——匯入需交易性，部分失敗不得留下半套資料                                                             |
| AC-TCH-008（XSS 防護）                                 | 適用——`content`/`prompt`/`explanation` 等自由文字欄位需做 XSS 防護                                       |
| Identifier LockService 併發協調、legacy/CP- 雙格式共存 | **AC-TBD**——現有 acceptance 文件無對應條目，不自行新增，待正式 Phase 2 spec 或 acceptance 文件更新時補上 |

## 5. Task-Level Definition of Done

1. `content:fetch` 對新 5 分頁結構（3 個本文件範圍內的分頁）成功執行，不再因欄位不符而中止。
2. Identifier 契約（第 1.3 節）全部規則實作完成，含 fail-closed 情境的單元測試。
3. `LockService` 跨分頁協調機制經併發情境測試驗證（模擬同時對 questions 與 review cards 觸發批次執行）。
4. 兩層品質關卡（結構+內容審查）串接進匯入流程，內容審查的 owner disposition 有明確記錄機制（不一定要正式 UI，至少要有可追溯的紀錄格式）。
5. Owner setup guide 文件完成，涵蓋第 1.3 節列出的全部項目。

## 6. Slice Gate（不等於 Phase Gate）

第三章的 questions 與 review cards 透過本文件定義的 pipeline 成功匯入資料庫，結構 gate 與內容品質層皆有可稽核紀錄，即為本 slice 通過。**通過本 Slice Gate 不代表 Phase 2 完成**，也不代表其餘 5 章內容已匯入。

## 7. 正向與負向測試矩陣

| 情境                                                         | 類型 | 預期結果                               |
| ------------------------------------------------------------ | ---- | -------------------------------------- |
| 全新列，缺 identifier                                        | 正向 | Backfill 一次性產生新 `CP-` identifier |
| 既有列，identifier 已存在且有效                              | 正向 | 保留原樣，不重新編號                   |
| Legacy 格式 identifier 與 `CP-` 格式並存於同一資料集         | 正向 | 兩者皆被匯入器接受                     |
| 兩個分頁同時批次執行（模擬併發）                             | 正向 | `LockService` 序列化執行，無重複發號   |
| identifier 缺失                                              | 負向 | Fail-closed，中止匯入                  |
| 跨分頁 identifier 重複                                       | 負向 | Fail-closed，中止匯入                  |
| identifier 格式不符 legacy 也不符 `CP-`                      | 負向 | Fail-closed，中止匯入                  |
| 既有 identifier 於本次匯入被更動                             | 負向 | Fail-closed，中止匯入，不自動還原      |
| 同一 identifier 對應到不同題目內容（identifier/entity 衝突） | 負向 | Fail-closed，回報衝突，不自動選邊      |
| 一般內容編輯者嘗試修改 identifier 欄位                       | 負向 | Sheet 層級 protected range 阻擋        |
| 正確答案缺失或不合法                                         | 負向 | Fail-closed，不得預設 A                |

## 8. Hosted Mutation Owner Gate

本文件的匯入流程會寫入 hosted（staging）資料庫。任何實際對 staging 執行匯入的操作，需要 owner 明確授權（時間點、範圍、執行者），不得由代理自行決定執行時機。Apps Script 的 Sheet 端保護設定變更（protected range、trigger 安裝）同樣需要 owner 明確授權才能實際操作 Google Sheet。

## 9. Failure / Stop Conditions

- 任一 fail-closed 情境觸發時，匯入流程停止，不得以任何形式部分提交。
- `LockService` 鎖定逾時或取得失敗時，批次執行本身停止並回報，不得略過鎖定機制直接寫入。
- 內容品質層產出的 FAIL/UNSURE 項目沒有 owner disposition 前，對應內容不得標記為「內容完整」。

## 10. Dependency

- 無上游依賴。
- 下游：Phase 4A 的真實資料整合依賴本文件的匯入結果（4A 開發期間可用 fixture，真實驗收需等本文件的 Slice Gate 通過）。

## 11. 仍未涵蓋的完整 Phase 2 範圍

- 完整 content publication lifecycle（版本凍結、正式發布、審核流程、發布後回滾）。
- 全部 6 章的內容匯入（本文件只驗證第三章的 pipeline）。
- 前測／後測題目類型的匯入邏輯。
- 教師端／Admin 端的內容管理 UI。

## 12. 客觀不可行的選項

- 「序號欄位由前端或匯入器計算後寫回 Sheet」：與已核准規則（僅讀取並驗證，不寫回）衝突，排除。
- 「跳過內容品質層，只靠結構 gate」：無法偵測術語錯誤/邏輯矛盾，排除。
- 「既有重複 ID 由系統自動選一筆保留」：資料完整性風險，必須交由 owner 裁決，排除自動化。
