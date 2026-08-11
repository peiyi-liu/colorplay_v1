# Phase 2A：第三章內容匯入 Design（Draft）

- 日期：2026-08-10（2026-08-11 Owner RC／QB／CR 序號裁定更新）
- 狀態：Owner approved：2026-08-10
- Codex design review completed
- Implementation：Owner authorized，RC／QB／CR 匯入與題池路由進行中
- 完成本文件定義的 Slice Gate 不代表對應的完整 Phase 已完成
- 對應：`docs/roadmap-colorplay-next.md` Phase 2（內容 SSOT 與版本發布）的一個子集，**不是 Phase 2 的完整 spec**。
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`
- Dependency：無上游依賴；是 Phase 4A 的上游輸入之一（見 4A 的 dependency 說明）。

## 0. 明確聲明（Explicit Non-Claims）

本文件只涵蓋「把第三章的內容從 Google Sheet 匯入資料庫」這一件事。**不得將本文件的完成視為「Phase 2 完成」**——完整的 content publication lifecycle（版本凍結、正式發布、發布後回滾、跨版本內容遷移）不在本文件範圍內。本文件通過不代表全部 6 章內容已就緒，也不代表教師端／Admin 端的內容管理 UI 已存在。

## 1. Scope

### 1.1 Sheet 結構

Google Sheet 已重構為 5 個分頁，本文件只處理其中 3 個：

| 分頁                     | 主要欄位                                                                       | 本文件範圍                 |
| ------------------------ | ------------------------------------------------------------------------------ | -------------------------- |
| `(RC)各單元複習大廳`     | 複習卡序號／章節／章節標題／小節／小節標題／子主題／子主題標題／卡片內容／附件 | 是                         |
| `(QB)各單元隨機測驗題庫` | 題庫序號／章節／小節／題目／選項A-D／正確答案／解析                            | 是                         |
| `(CR)章節總複習`         | 總章節題庫序號／章節／題目／選項A-D／正確答案／解析                            | 是                         |
| 前測題目                 | 題庫序號／題目／A-D／解答／難度／對應章節／對應內容                            | **否，Explicit Exclusion** |
| 後測題目                 | 同上                                                                           | **否，Explicit Exclusion** |

現有匯入腳本（`fetch-sheet.mjs`／`import-questions.mjs`／`import-review-cards.mjs`／`verify-sheet-db.mjs`）依照舊結構（單一「題庫」分頁＋`code`欄位）寫成，對新結構會直接匯入失敗（已實測：「題庫分頁缺少必要欄位：code」）。

### 1.2 兩種題庫的分流匯入

`各單元隨機測驗題庫`（小節測驗池）與 `章節總複習`（章節總測池）是兩個獨立來源，分別匯入成兩個不同用途的題目池，不合併成單一扁平題庫。

### 1.3 識別碼契約（Identifier Contract）——Codex review remediation，取代先前版本

**2026-08-11 Owner 裁定取代先前的 `CP-` 全域遞增格式。** 三個工作表使用用途可辨識、互不混淆的命名空間：

- **RC 複習卡**：`RC` + 章 + 小節 + 兩位卡號，例如 `RC3101`。
- **QB 小節題庫**：`QB` + 章 + 小節 + 兩位題號，例如 `QB3101`；供小節測驗與 Live 使用。
- **CR 章節總題庫**：`CR` + 章 + 三位題號，例如 `CR3001`；只供章節總測驗使用。
- **Sheet 是 identifier SSOT**：序號由 Owner 的 Google Apps Script 寫入；匯入器只讀取與驗證，禁止自行補號、改號或寫回 Sheet。
- **唯一性與跳號**：各命名空間內唯一；允許跳號，不承諾 gapless。RC／QB／CR 前綴本身即阻止跨用途碰撞。
- **Legacy 相容**：歷史 session／資料列保留原 stable code；新 Sheet 匯入一律採 RC／QB／CR，不以新序號覆寫歷史 frozen reference。
- **不建立新舊 ID mapping**：新資料以 Sheet 序號直接成為 stable code；歷史資料不改號，因此不需要 mapping 表。
- **欄位保護**：`複習卡序號`／`題庫序號`／`題號` 三個 identifier 欄位**立即**設為 owner／Apps Script 可寫的 protected range（不再延後到未來 Admin 功能）。一般內容編輯者不得修改這三欄。
- **執行身分**：Apps Script 以 **owner 身分**批次／排程執行。
- **Fail-closed 情境**（以下任一情況，匯入必須中止，不得靜默略過或自動修復）：
  - identifier 缺失
  - 同一命名空間重複
  - 格式或列內容歸屬錯誤（例如 `QB32xx` 被放在 3-1）
  - 既有有效 ID 被更換（偵測到某列的 identifier 與資料庫既有紀錄不一致）
  - identifier 與 entity 內容衝突（例如同一 identifier 對應到不同的題目內容）
- **既有重複 ID 的處置**：發現既有資料本身就有重複 ID 時，**交由 owner 裁決，不得自動替換**——匯入器只回報衝突，不自行決定保留哪一筆。
- **Owner setup guide 必須涵蓋**：script 安裝、trigger 設定、protected range、dry-run、衝突拒絕與復原方式；Apps Script 若會並行寫入，仍需以 document lock 序列化。

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
  identifier: string          # QB章小節兩位題號，或 CR章三位題號
  chapter: string
  section: string | null      # 章節總測無此欄位
  prompt: string
  options: { A: string; B: string; C: string; D: string }
  correctAnswer: 'A' | 'B' | 'C' | 'D'
  explanation: string | null

SheetRow (reviewCards):
  identifier: string          # RC章小節兩位卡號
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
  identifiersImported: { identifier: string; entityType: 'question' | 'review_card' }[]
```

## 4. Existing AC Mapping

| AC                                          | 適用性                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| AC-LEARN-001（只顯示已發布內容）            | 適用——匯入的內容需標記發布狀態，未發布內容不可被學生端讀取                                               |
| AC-LEARN-003（複習卡完整呈現）              | 適用——複習卡的子主題標題/內容需完整匯入，不得截斷                                                        |
| AC-TCH-005（不合法正解不得預設 A）          | 適用——`correctAnswer` 缺失或不合法時必須 fail-closed，不得預設任何選項                                   |
| AC-TCH-006（匯入逐列錯誤）                  | 適用——結構層錯誤需逐列回報，不是整批籠統失敗訊息                                                         |
| AC-TCH-007（Import transaction rollback）   | 適用——匯入需交易性，部分失敗不得留下半套資料                                                             |
| AC-TCH-008（XSS 防護）                      | 適用——`content`/`prompt`/`explanation` 等自由文字欄位需做 XSS 防護                                       |
| RC／QB／CR 格式與 Apps Script document lock | **AC-TBD**——現有 acceptance 文件無對應條目，不自行新增，待正式 Phase 2 spec 或 acceptance 文件更新時補上 |

## 5. Task-Level Definition of Done

1. `content:fetch` 對新 5 分頁結構（3 個本文件範圍內的分頁）成功執行，不再因欄位不符而中止。
2. Identifier 契約（第 1.3 節）全部規則實作完成，含格式、章節／小節歸屬、缺號與重號的 fail-closed 測試。
3. Owner Apps Script 產出的三種序號經 fetch／verify contract 測試，匯入器不寫回 Sheet。
4. 兩層品質關卡（結構+內容審查）串接進匯入流程，內容審查的 owner disposition 有明確記錄機制（不一定要正式 UI，至少要有可追溯的紀錄格式）。
5. Owner setup guide 文件完成，涵蓋第 1.3 節列出的全部項目。

## 6. Slice Gate（不等於 Phase Gate）

第三章的 questions 與 review cards 透過本文件定義的 pipeline 成功匯入資料庫，結構 gate 與內容品質層皆有可稽核紀錄，即為本 slice 通過。**通過本 Slice Gate 不代表 Phase 2 完成**，也不代表其餘 5 章內容已匯入。

## 7. 正向與負向測試矩陣

| 情境                                                         | 類型 | 預期結果                            |
| ------------------------------------------------------------ | ---- | ----------------------------------- |
| `RC3101` 位於 3-1 複習卡工作表                               | 正向 | 匯入為 review card stable code      |
| `QB3101` 位於 3-1 小節題庫                                   | 正向 | 匯入 section bank，供小節測驗／Live |
| `CR3001` 位於第三章章節總題庫                                | 正向 | 匯入 chapter bank，只供章節總測驗   |
| identifier 缺失                                              | 負向 | Fail-closed，中止匯入               |
| 同一命名空間 identifier 重複                                 | 負向 | Fail-closed，中止匯入               |
| identifier 格式不符 RC／QB／CR                               | 負向 | Fail-closed，中止匯入               |
| `QB32xx` 列宣告小節 3-1                                      | 負向 | Fail-closed，回報歸屬不一致         |
| 既有 identifier 於本次匯入被更動                             | 負向 | Fail-closed，中止匯入，不自動還原   |
| 同一 identifier 對應到不同題目內容（identifier/entity 衝突） | 負向 | Fail-closed，回報衝突，不自動選邊   |
| 一般內容編輯者嘗試修改 identifier 欄位                       | 負向 | Sheet 層級 protected range 阻擋     |
| 正確答案缺失或不合法                                         | 負向 | Fail-closed，不得預設 A             |

## 8. Hosted Mutation Owner Gate

本文件的匯入流程會寫入 hosted（staging）資料庫。任何實際對 staging 執行匯入的操作，需要 owner 明確授權（時間點、範圍、執行者），不得由代理自行決定執行時機。Apps Script 的 Sheet 端保護設定變更（protected range、trigger 安裝）同樣需要 owner 明確授權才能實際操作 Google Sheet。

## 9. Failure / Stop Conditions

- 任一 fail-closed 情境觸發時，匯入流程停止，不得以任何形式部分提交。
- Apps Script 的 document lock 逾時或取得失敗時，產號批次停止並回報，不得無鎖寫入。
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
