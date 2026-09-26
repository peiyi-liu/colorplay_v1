# ColorPlay 內容工作平台設計

- 日期：2026-09-26（Asia/Taipei）
- 設計基準：protected `staging@9c42ba3d9e6552e4c135d3d52efad783dc526f57`
- 狀態：Owner 已核准對話版完整文字規格；書面規格待 Owner 審閱
- 第一個交付切片：通用平台能力＋第三章完整內容
- 後續順序：書面規格核准 → 獨立 HTML 互動原型 → 原型核准 → 實作計畫 → 產品實作

## 1. 目標

在 Admin 主控台新增 `/admin/content`「內容工作平台」，讓管理員不修改程式或直接操作資料庫，也能管理 ColorPlay 的全部教學內容：

- Course／Chapter／Section／Subtopic 結構；
- RC 複習卡；
- QB 小節題庫；
- CR 章節總題庫；
- LT Live 題庫；
- 上述內容的圖片、草稿、發布版本、封存、rollback、匯入、稽核與 readiness。

平台架構支援所有章節。Phase 2 只以第三章完成真實內容輸入、發布與驗收；後續章節應能主要透過內容輸入完成，不再重建相同功能。

## 2. 範圍邊界

### 2.1 包含

- Admin 內容總覽、內容樹、編輯器、外部匯入、發布預覽、版本歷史與 rollback UI。
- 課程結構與 RC／QB／CR／LT 的新增、修改、排序、預覽、發布及封存。
- XLSX 或 CSV 內容套件與圖片 ZIP 匯入。
- JPG／PNG／WebP 上傳、可信任端轉檔、WebP 衍生版本、hash、alt text、私有儲存與 signed delivery。
- Server-authoritative publication impact、current content set 與不可變歷史事實。
- 第三章完整 readiness 與 Local／Staging gate。

### 2.2 不包含

- XP、Token、Blook、商品、成就、班級、使用者或 UI 系統文案管理。
- 新的拖曳配對、調色器、色票建構器等題型 runner；Phase 2 只支援 `single_choice`。
- Production 部署或所有章節內容完成宣告。
- 以外部 CMS 作第二份內容資料庫。

## 3. Domain model

### 3.1 Canonical hierarchy

```text
Course
└─ Chapter
   ├─ CR Bank（chapter scope）
   │  └─ Question
   └─ Section
      ├─ QB Bank（section scope）
      │  └─ Question
      ├─ LT Bank（section scope）
      │  └─ Question
      └─ Subtopic
         └─ Review Card
```

### 3.2 Canonical terms

- **Curriculum Node**：Course／Chapter／Section／Subtopic 的結構節點。
- **Assessment Bank**：具有固定 scope 與 kind 的題庫；kind 只能是 `QB`、`CR` 或 `LT`。
- **Question**：三種 Assessment Bank 共用的底層題目模型。每道 Question 只能屬於一個 Bank。
- **Review Card**：屬於一個 Subtopic 的必要閱讀內容。
- **Content Draft**：尚未影響學生的可持久化修訂。
- **Content Version**：發布時凍結、不可變的 payload 與 media identity。
- **Current Content Set**：目前 published 且計入學生 current progress 的結構與內容版本集合。
- **Historical Learning Fact**：完成、作答、分數、獎勵與稽核事件；永久保留原 content version reference。
- **Publication Impact**：後端依 frozen before／after payload 判定的 `compatible`、`requires_recompletion` 或 `requires_requalification`。

## 4. Admin 資訊架構

`/admin/content` 位於既有 `AdminShell`，只接受完成 Admin identity 與有效 MFA privileged session 的使用者。

### 4.1 內容總覽

- 依 Course／Chapter 顯示 RC／QB／CR／LT 數量。
- 顯示 draft、published、archived、validation error、缺圖、未處理 warning 與 readiness。
- 第一個交付切片將第三章標示為可編輯／可驗收；其他章可建立內容，但不得被誤報為已 ready。

### 4.2 內容樹

- 左側呈現 Course → Chapter → Section → Subtopic。
- CR 顯示於 Chapter；QB／LT 顯示於 Section；RC 顯示於 Subtopic。
- 支援搜尋 stable code、標題與內容，並依類型、狀態、錯誤或缺圖篩選。

### 4.3 內容編輯器

- 中間清單顯示選定 scope 的內容與狀態。
- 右側表單編輯 Curriculum Node、RC 或共用 Question 欄位。
- 提供 student-view preview、即時 client validation、server validation 結果與 unsaved-changes protection。
- 編輯 published 項目時建立或更新 Content Draft；學生仍讀目前 published version。

### 4.4 外部匯入中心

- Upload → Validate → Diff preview → Warning confirmation → Draft commit。
- 顯示每列新增、修改、不變、warning 或 error；error 存在時整批不得 commit。
- 匯入只建立／更新 draft，永不直接 publish、archive 或 delete。

### 4.5 發布與版本歷史

- 發布前顯示欄位差異、媒體差異、scope／bank 差異及 server-derived impact。
- 同一位 privileged Admin 可以建立及發布草稿；不新增第二人簽核角色。
- 發布必須二次確認。
- Archive 與 rollback 都建立新的 publication event；rollback 建立新的 current version，不刪除舊版本。

## 5. 可編輯內容

### 5.1 Curriculum Node

共同欄位：

- stable code；
- parent identity；
- title；
- description；
- sort order；
- status；
- draft revision／published version；
- actor 與 timestamps。

stable code 首次發布後不可修改。已發布或已被內容／學習歷史引用的節點不得 hard delete，只能 archive。移動 published node 或內容到不同 parent 是 scope change，必須建立新版本並採最嚴格適用 impact。

### 5.2 Review Card

- stable code；
- subtopic；
- group label；
- title；
- 受限 Markdown body；
- sort order；
- 0–3 個 media entries；
- 每個 media 的 alt text、semantic role、order 與 immutable identity；
- status／draft revision／published version。

所有 published Review Card 預設為 required。新增 required card 或修改觀念、正文含義或教學圖片會要求 recompletion。

### 5.3 Assessment Bank

- stable code；
- kind：QB／CR／LT；
- parent：QB／LT 必須是 Section，CR 必須是 Chapter；
- title／description；
- sort／selection settings；
- status／draft revision／published version。

後端禁止 QB、CR、LT 互相 fallback 或混抽。新 Live Session 只能從 LT bank 抽題；歷史 frozen session 保留原引用。

### 5.4 Question

- stable code；
- bank identity；
- `question_type='single_choice'`；
- prompt；
- 2–4 個非空且正規化後不重複的 options；
- 恰一個 correct option；
- explanation；
- duration（5–120 秒）；
- sort order；
- 選填 question media 與 alt text；
- status／draft revision／published version。

QB／CR／LT 共用一個 Question Interface、驗證器、編輯器與版本模型，但每個 Question instance 只能屬於一個 bank。

## 6. Module 與 Interface

### 6.1 ContentAuthoring Module

對 Admin UI 提供單一 Interface：

- list／read current content and draft；
- save draft with expected revision；
- validate draft；
- preview student projection；
- archive request；
- list version history。

它隱藏 RC／Question／Curriculum Node 的持久化差異，不把 Supabase table shape 暴露給 React。

### 6.2 ContentImport Module

Manual Editor、XLSX 與 CSV 是同一 normalized import seam 的 Adapters。Interface 接收 normalized curriculum／bank／card／question／media entries、source digest、actor 與 request ID，回傳 deterministic validation／diff／receipt。

Browser parsing 只供預覽；trusted server 在 commit 前重跑 parent、scope、stable code、欄位、media 與 unsafe-text validation。

### 6.3 MediaProcessing Module

- Client 先取得 run-scoped signed upload permission，將原圖放入 private quarantine path。
- Supabase Edge Function Adapter 驗 Admin／MFA context、magic bytes、size、dimensions 與 source hash，再以 WASM image processor 產生衍生檔。
- 成功後回傳 immutable media manifest；ContentAuthoring Module 只接受已驗證 manifest。
- Browser Canvas 輸出不得成為正式 color-critical source of truth。

### 6.4 ContentPublication Module

Interface 接收 content identity、draft revision、actor、request ID 與 expected current version，於同一 DB transaction：

- 重新驗證 payload／scope／media manifest；
- 比較 frozen current payload 與 draft payload；
- 推導 strongest applicable impact；
- 建立 immutable content version；
- append publication event／audit event；
- 更新 current published pointer；
- 回傳 receipt。

Client 不得提供、覆寫或降低 impact。

### 6.5 ContentReadiness Module

輸出 deterministic Chapter report，包含結構、RC／QB／CR／LT、stable codes、parent／bank routing、draft／published version、impact history、media integrity、source digest 與 access matrix。第三章報告是 Phase 2 slice gate 的權威輸入。

## 7. 草稿、發布與進度

### 7.1 Draft isolation

- Draft 是 server-persisted revision，不覆寫 current published row／payload。
- 讀取 draft 時回傳 revision token；save／publish 都必須帶 expected revision。
- Stale revision 以 conflict 失敗，要求重新載入及比較，不做 last-write-wins。

### 7.2 Impact matrix

| 變更                                                               | Impact                     | Current effect                                |
| ------------------------------------------------------------------ | -------------------------- | --------------------------------------------- |
| 錯字、排版、非語意 accessibility／alt 修正                         | `compatible`               | 保留 current completion／qualification        |
| 新增 required RC                                                   | `requires_recompletion`    | 新卡在 explicit completion 前未完成           |
| RC 觀念、正文含義或教學 media 變更                                 | `requires_recompletion`    | 新版本必須重讀                                |
| 新增、封存或語意修改 Question／Bank scope／selection semantics     | `requires_requalification` | 舊 attempt 保留歷史，但不符合 current version |
| correct option、options、duration、template 或 pool semantics 變更 | `requires_requalification` | 必須使用 current version 重測                 |
| 缺漏或不明確分類                                                   | 最嚴格適用值               | fail closed，不預設保留進度                   |

沒有 grandfather／cutoff／人工 exemption。Schema migration 把當時 current published 第三章內容接受為 baseline；migration 本身不降低進度，只有後續 publication event 會改變 qualification。

### 7.3 Historical integrity

Review completion、quiz／Live attempt、score、reward 與 audit 永遠引用實際使用的 content version。發布、archive 或 rollback 不 delete、rewrite 或重新獎勵既有 historical facts。

## 8. External Content Package

### 8.1 Package layout

```text
colorplay-content.zip
├─ content.xlsx
│  ├─ 課程
│  ├─ 章節
│  ├─ 小節
│  ├─ 子主題
│  ├─ RC
│  ├─ QB
│  ├─ CR
│  ├─ LT
│  └─ 媒體對照
└─ media/
   ├─ P301.jpg
   ├─ P302.png
   └─ ...
```

CSV mode 使用 `csv/course.csv`、`chapters.csv`、`sections.csv`、`subtopics.csv`、`review-cards.csv`、`qb.csv`、`cr.csv`、`lt.csv` 與 `media.csv` 取代 `content.xlsx`。同一套件只能選 XLSX 或 CSV，不能混用兩個內容 authority。

內容欄只保存 attachment code，例如 `P301`；不接受 Google Sheet image、任意遠端 image URL 或 data URL。

### 8.2 Validation and commit

- 驗 extension、MIME、magic bytes、uncompressed size、path traversal、duplicate normalized filename 與 row limit。
- 驗 stable-code uniqueness、parent existence、bank kind／scope、field constraints、answer uniqueness、media mapping 與 alt text。
- Diff preview 固定分類為 create／update／no-op／warning／error。
- 任一 error 阻止整批 commit；warning 必須 explicit confirm。
- Commit 是 DB all-or-nothing、actor＋request ID＋source digest idempotent，且只建立 draft。
- Import 從不 archive 或 delete 缺少的既有 stable code。

## 9. Media pipeline and performance

### 9.1 Intake contract

- 接受 JPG／PNG／WebP；不接受 SVG。
- 原檔上限 2 MiB、4096×4096。
- 檢查 magic bytes、dimensions、alpha／orientation、source SHA-256 與 alt text。
- 原始 master 保存在 private immutable path，不提供 student delivery。

### 9.2 Derivatives

- 320px WebP thumbnail，目標 20–40 KiB。
- 800px WebP reading variant，目標 60–120 KiB。
- color-critical／lossless variant 最長邊 1200px，目標不超過 250 KiB，只在 media semantic role 要求時產生。
- 所有尺寸都由 master 直接產生，不做 repeated lossy re-encoding。
- 若無法在品質門檻內達成 budget，拒絕該 media 或顯示 blocking warning；不得為過 gate 犧牲教學色階、漸層或色票辨識。

Manifest 保存 source hash、normalized pixel／semantic hash、output hash、width、height、bytes、MIME、quality mode 與 processor version。相同像素只改 transport encoding 可 compatible；像素或教學含義改變依內容類型要求 recompletion／requalification。

### 9.3 Delivery

- Immutable path 包含 content stable code、version／hash；永不 overwrite。
- Student 只取得 current published version 的 private signed URL。
- `srcset`／`sizes` 提供 320／800／optional 1200 variants；明確輸出 width／height。
- 當前第一張圖片可 eager／high priority；其餘 lazy＋async decode。
- 只簽目前與下一張卡片，並在有效 TTL 內重用 signed URL；不因 React render 重簽。
- Immutable objects 使用長 browser cache；CDN／dynamic transformations 是可選加速，不是正確性必要條件。

## 10. Security and authorization

- 所有 mutation 重新驗證 `auth.uid()`、active Admin role、MFA privileged session、expected revision 與 request ID。
- 前端永不持有 service secret；quarantine／processing／final object mutation 只由 trusted server command 執行。
- Anonymous／Student／Teacher 不可讀 Admin drafts、correct answer、`is_correct`、original master、quarantine path、internal Storage path 或 publication internals。
- Student projection 只包含作答所需的 public options；answer evaluation 留在 server。
- ZIP／XLSX／CSV parser 有檔案、列數、解壓大小、巢狀深度、path 與時間上限。
- 所有 mutation／publish／archive／rollback／import 產生 redacted audit receipt；不記錄 signed token 或完整 secret URL。

## 11. Failure, concurrency, and cleanup

- Validation、media processing、DB transaction 或 audit 任一步失敗，current published content 不變。
- 同 request ID 重送回傳原 receipt，不重複建立 draft／version／event／object。
- Import preview 保存 source digest 與 expected revisions；commit 前任一目標變更即整批 conflict。
- Media upload 使用 run-scoped quarantine prefix。DB commit 前失敗要清理該 run 暫存物件；cleanup 失敗產生可追蹤 failure，不掃描或刪除其他 run。
- Final objects 以 immutable path 上傳且 `upsert=false`。同 hash collision 必須比對 manifest；內容不同時 fail closed。

## 12. Testing and acceptance

### 12.1 Task-level verification

- ContentAuthoring／Import／Publication／Readiness Interface unit／contract tests。
- XLSX／CSV／ZIP malformed、path traversal、duplicate、size、idempotency 與 concurrency tests。
- Publication impact classifier matrix 與 downgrade-forgery negative tests。
- Media source／output hash、dimensions、bytes、alt、variant selection 與 cache behavior tests。
- Supabase pgTAP：Admin positive、Anonymous／Student／Teacher negative、RLS、answer leakage、immutability、rollback、retry。
- Admin route／form／preview／unsaved changes／keyboard／mobile tests。

### 12.2 HTML prototype gate

正式產品實作前，先以隔離 static／dev-harness HTML 呈現總覽、內容樹、RC editor、Question editor、import wizard、publish-impact dialog 與版本歷史。Prototype 使用假資料，只驗證資訊架構與操作，不冒充後端功能。

Owner 核准 prototype 後才寫 implementation plan；未核准前不接正式 route、DB、Storage 或 Hosted state。

#### Owner-approved UI direction

- 預設進入 A「三欄工作區」：左欄為 Course／Chapter／Section／bank 結構，中欄為目前 scope 的內容清單，右欄為 editor／preview／publish actions。
- 同一 `/admin/content` 功能頁提供 C「全部內容」清單模式，供 stable code 搜尋、跨類型篩選、狀態檢查與批次管理；它不是第二套工作平台或獨立 route。
- A／C 切換必須保留可合理保留的 chapter／section、filter 與 selected-content context。預設與新增／編輯回到 A；大量盤點與批次操作使用 C。
- B「引導式流程」不進正式實作；其長頁面在內容量增加後會降低掃描與切換效率，只保留於 throwaway prototype history。
- 正式產品需依本規格重寫、補齊型別、授權、錯誤、loading／empty／conflict states 與測試；不得直接升格拋棄式 HTML 原型。

### 12.3 Phase 2 Local gate

第三章 readiness 必須無：

- missing／invalid parent；
- QB／CR／LT scope 或 fallback 錯誤；
- duplicate stable code；
- unresolved import error／warning；
- missing／stale media mapping 或 hash；
- draft 冒充 published；
- answer／Storage-path leakage；
- publication／history／rollback／idempotency failure。

依實作計畫執行 focused tests、relevant pgTAP、lint、typecheck、build、browser checks 及唯一一輪 code review。Local 只能宣稱 `Phase 2 Content Studio + Chapter 3 Local slice PASS`。

### 12.4 Staging gate

Local gate 後，Owner 另行核准 exact reviewed SHA、Staging Supabase migration range、import digest、media objects 與 cleanup。合併 GitHub `staging` 會觸發 Vercel 自動部署；Frontend deploy 不替代 Supabase／Storage／content validation。

Staging proof 通過後只能宣稱 `Phase 2 通用內容工作平台＋第三章內容 slice PASS`，不能宣稱其他章內容完成、Production ready 或 Phase 8 release proof。

## 13. Delivery sequence

1. Owner 審閱並核准本書面規格。
2. 建立隔離 HTML 互動原型；Owner 操作並核准。
3. 以 writing-plans 產生 bounded implementation plan 與 PR sequence。
4. 從重新確認的 protected `staging` exact SHA 建立 implementation worktree。
5. 逐 bounded PR 實作 deep Modules、DB contracts、Admin UI、import、media 與 readiness。
6. 完成一次 Phase 2 Local gate 與唯一 review round。
7. Owner 核准 exact staging candidate；正常 merge 觸發 Vercel，另依授權執行 Staging Supabase／Storage／content gate。

未經獨立授權不得 push、merge、deploy、執行 Hosted migration／import／Storage upload 或操作 Production。
