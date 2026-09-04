# ColorPlay Program Rebaseline：Owner 決策紀錄

- 日期：2026-09-02（Asia/Taipei）
- 狀態：Owner 已核准 program scope、順序與 progression 產品／migration
  semantics；implementation execution 仍須另行授權
- 性質：rebaseline decision record；不是 implementation plan，也不構成任何
  Local／Staging／Production 執行授權
- 基準：`feature/v2-major-update`／`origin/feature/v2-major-update`
  `f0638b04d74a8a5071ceb36e7a2369527dc5d0b7`
- Canonical tracker：`docs/roadmap-colorplay-next.md`

## 0. 明確聲明

本文件只記錄 2026-09-02 已逐項確認的決策。每個 technical batch 仍須另有
bounded brief、實作授權與對應驗證；Hosted mutation、真實 restore E2E、push、
merge、Staging gate 與 Production promotion 均未由本文件授權。

本文件只 supersede 舊 tracker 中與 current status、執行順序及 progression 規則
衝突的敘述，不改寫歷史證據。任何 `READY`、HTTP 200、舊 CI 綠燈或 feature-branch
deployment 都不得單獨解讀為 phase gate 或 Production 完成。

### 0.1 Formalization package

為供後續平行開發直接使用，已將本決策落到以下層級：

- Canonical rules：`spec/01`, `spec/03`, `spec/04`, `spec/05`, `spec/07`, `spec/10`
- Phase acceptance：`AC-PROG-007`–`015`、`AC-ADM-001`–`007`
- Learning design／plan：`2026-09-02-section-progression-design.md`、
  `../plans/2026-09-02-section-progression.md`
- Admin B design／plan：`2026-09-02-admin-b-operations-design.md`、
  `../plans/2026-09-02-admin-b-operations.md`
- Phase 2／5／6 scope contracts：`2026-09-02-phase-2-5-6-scope-contracts.md`
- Admin C deferred record：`2026-09-02-admin-c-platform-option.md`
- Parallel delivery rules（保留舊檔名）：`2026-09-02-async-delivery-control.md`
- Teacher account ADR：`docs/adr/0009-admin-managed-teacher-accounts.md`

上述文件仍不構成 code、DB 或 Hosted 執行授權。

## 1. Rebaseline 固定點

截至本文件日期，Owner 採用以下事實作為後續工作的控制基準：

1. Phase 0 protected worktree 的候選狀態為 `HEAD f0638b0`、
   `MERGE_HEAD 3446a38` 與 74 個 staged paths；它尚不是不可變 commit。
2. PR #1 的 remote head `428dc78` 與上述候選不同，且當前 lint／Local database
   checks 失敗；不得直接沿用舊 `5cb1ed3` 綠燈核准或合併。
3. Phase 1 Local 實作已進入 `f0638b0`，但 Hosted gate 尚未執行。
4. Phase 2–6 已有大量 out-of-phase implementation／Staging evidence；後續工作是
   formalize、整合與補缺口，不得依舊 tracker 當作全部未開始而重做。
5. Staging alias 曾指向 `colorplay-staging-web` deployment
   `dpl_BpWy9FrLBuZZjGYfakyvqcZaRqJy`／Git SHA `9733923`；這是 Staging 專案中的
   Vercel production target，不是 ColorPlay Production release。
6. 沒有任何 Phase 0–6 的 Production-complete 證據。

以上皆為有日期的 rebaseline snapshot；開始任何 batch 前仍須重查 refs、dirty
state、worktree ownership、remote checks 與 hosted binding。

## 2. Owner 核准的 program 決策

### 2.1 文件與 Phase 0／1

1. **R0 tracker correction**：先做極小 current-status correction；採 explicit
   supersession，不重寫歷史。
2. **Phase 0 candidate**：保留既有 staged WIP；完成唯一一輪 review 後固定為
   候選 commit。Static／fake／Local gates 與真實 restore evidence 必須綁定精確
   SHA。隔離的真實 Storage restore E2E 需另次 Owner 明確授權。
3. **Phase 1 Hosted**：Phase 0 合併後，從精確 canonical SHA 建立新的 Staging
   deployment，再驗證 Admin identity、MFA、lifecycle、privileged session、RLS、
   audit、真實 Auth/profile bootstrap 與 fixture cleanup。

### 2.2 Phase 2–6

4. **Phase 2**：保留原始 2A（chapter 3 RC/QB/CR、import interface、generated IDs、
   Apps Script setup 與 content disposition）；另建 2B 接收既有 LT、其他章節、
   version publishing 與 media。額外實作不回退，但在 2B gate 前不得宣稱完成。
5. **Phase 3**：取消所有跨章 prerequisite；所有 published 且 content-ready 章節
   彼此獨立。章節內 progression 依第 3 節的新規則。
6. **Phase 4**：保留目前章節全貌與 JRPG 表現；鎖定項目可見但不可操作，並以
   唯一「繼續學習」primary action 引導下一步。
7. **Phase 5 F2**：依既有 F2 範圍盤點現況並補缺口，包含 Live／自主挑戰統計、
   參與／缺席、server-authoritative ranking／tie、取消紀錄、reconnect、deadline、
   finalize、版本與 RLS；研究匯出、自訂統計及長期趨勢不納入。
8. **Phase 6**：從現有 implementation 反推正式 spec，再補 route/state、RWD、
   accessibility、效能與 stale E2E 缺口；不以舊設計稿回退現況，也不重新全面
   redesign。

### 2.3 Admin 與整合

9. **目前 Admin 目標採 B：安全控制台＋教師帳號營運**，完整範圍見第 5 節。
10. **Canonical integration 採受保護整合 worktree**：從 `f0638b0` 出發，一次只
    吸收一個已核准來源，逐次檢查 ancestry、migration、語意衝突與 scoped gates。
    不直接在 dirty canonical checkout 拼裝，也不以 Staging SHA `9733923` 倒推
    canonical history。

## 3. 章節內 progression 正式產品規則

### 3.1 名詞與可信邊界

- 產品文案的「小節」對應資料模型 `section`（例如 3-1、3-2）。`subtopic` 保留為
  section 內部內容分類，不作為使用者可見 progression gate。
- `current-required card` 以 user 為單位計算：合法 `grandfather_exempt`
  卡不進該 user 的 required set／denominator／gate。
- 所有 access state、completion、attempt、mastery 與 challenge availability 均由
  server-authoritative module 決定；browser 只呈現 interface 回傳的狀態。
- 系統只能證明學生依序取得內容並主動提交完成，不能宣稱證明人類已理解文字。

### 3.2 章節與小節流程

```text
所有 content-ready 章節可自由進入，章節之間不相互鎖定

進入一章
→ 只開放第一小節的第一張複習卡
→ 到達卡片最後一頁並主動按「完成複習」
→ 依 sort_order 解鎖同小節下一張卡
→ 本小節全部 current-required cards 完成
→ 解鎖本小節挑戰
→ 本小節挑戰完整交卷（不論分數）
→ 解鎖下一小節的第一張卡
→ 每小節最佳答對率皆達 80%
→ 解鎖章節總挑戰
→ 章節總挑戰完整交卷：章節「已完成」
→ 章節總挑戰最佳答對率達 80%：章節「已精熟」
```

答對率採 `correct_count / question_count * 100`；server 以未四捨五入比例比較 80%，
速度加權 Quiz Score 與 aggregate mastery 不參與 progression gate。章節總挑戰的
結果不控制其他章節存取。未達 80% 可重試；所有 attempt 與最佳答對率須保留。
「已完成」與「已精熟」是不同狀態，教師報表與學生 UI 不得混稱。

既有進度採相容性正規化：歷史 completion／attempt rows 原樣保留，不刪除、不改
時間戳。Out-of-order completed cards 仍為 completed，但 server 永遠將最早未完成的
required card 設為下一步，後段紀錄不得跨越缺口解鎖新內容。早於完整 review 的舊
section challenge 在缺口補齊前不生效；全部 required cards 完成後，原 attempt 才
依其原始結果納入 attempted／best，學生不必重做，也不補發獎勵。

內容版本更新採 progression-impact 分類：非實質的錯字、排版或不改變學習語意的
替代文字修正標為 `compatible`，沿用既有進度；觀念／正文含義或教學 media
實質改變時標為 `requires_recompletion`；正解、選項、題目含義、template 題池或
挑戰範圍實質改變時標為 `requires_requalification`。不明確或缺少分類時採該內容
類型最嚴格結果，不得默認 compatible。歷史紀錄與既得 ledger 不刪改；舊 attempt
可保留「曾作答／已完成」事實，但不再提供 current-version 的 80% 精熟資格。

在既有 section 中新增 current-required card 時採既有學生豁免：只有在該卡
publication event 的 immutable cutoff 前，已有同 section、不論分數的 finalized
challenge 者豁免。資格直接讀取 server 已提交的 finalize fact，不以 80%
mastery、顯示用 projection 或挑戰分數代替。Cutoff 後才 finalize 不能追溯取得
豁免。Cutoff 前無符合條件 finalize fact 者與新學生都必須依 sort order
完成新卡。豁免不刪改 progress／attempt／reward，也不能由 client 或人工
直接切換；豁免卡顯示為新增選讀，不偽裝成 completed。

Publication 與 finalize 均在同一 section lock 內由 server 分配單調
`section_event_order`；publication 的 order 就是 immutable cutoff order。只有
`finalize.section_event_order < publication.publication_cutoff_order` 才豁免，
timestamp 僅供 audit，不獨立決定先後。等號、缺 order 或無法證明的歷史
資料一律 fail closed。

### 3.3 完全鎖定 interface

1. Learning-path read interface 可回所有節點的 metadata、順序、`access_state`、
   completion 與 blocker；只有 `completed`、目前唯一 `available` 或該 user 的
   `grandfather_exempt` 卡可取得正文與 media，`locked` 卡不得把正文送進
   browser bundle／network response。
2. `complete_review_card` 必須在同一 transaction 內鎖定、驗證 current
   version 與 request binding；正常卡重查 predecessor，選讀卡重查 own
   `grandfather_exempt`，其餘跳卡回穩定錯誤碼。
3. Section challenge create interface 必須確認本小節全部 current-required cards
   完成；chapter challenge create interface 必須確認所有小節已有 ≥80% qualifying
   result。不得只靠隱藏或 disable 前端 link。
4. 完整交卷與 ≥80% 必須分別投影為 `challenge_attempted` 與 `mastered`；下一小節
   使用前者，章節總挑戰 gate 使用後者。
5. 收緊學生對 `review_cards`、`review_card_media` 及必要 question surfaces 的直接
   read grants／RLS；Teacher／Admin 以 role-aware projection 或 purpose-built
   interface 取得其被授權的資料。
6. Retire 跨章 sequential activation；保留歷史 unlock rows，不以刪資料完成規則
   遷移。

### 3.4 Phase 3 產品決策結案

- 既有 XP／Token／achievement 規則保持不變；任何獎勵調整另行決策。
- 80% 公式、歷史正規化、版本 requalification、新卡 grandfather 與豁免資格均已
  逐項核准，沒有剩餘 progression 產品／migration policy 決策。

本節結案不構成 implementation authorization。正式 migration 仍須通過 exact-base、
Phase 2B interface、migration-number、專屬 worktree 與 shared Local Supabase gates。

## 4. Phase 4 學生介面 contract

- 保留小節目錄、卡片節點與完整章節地圖。
- 鎖定項目可見，必須有非色彩的 lock indicator 與可理解 blocker；不可點擊。
- 已完成卡片可自由回顧，不改寫完成時間或重複發獎勵。
- 每畫面只有一個 primary「繼續學習」操作，依 server state 顯示為：
  - 閱讀下一張
  - 開始小節挑戰
  - 前往下一小節
  - 開始章節總挑戰
  - 再次挑戰以達精熟
- 單一「小節挑戰」入口跟隨目前選取的 section template；後端以
  `template.section_id` 與 `bank_kind='section'` 選題。
- 小節狀態至少區分：未開放、閱讀中、可挑戰、已作答、已精熟。
- 章節狀態至少區分：未開始、學習中、已完成、已精熟。

## 5. Active Admin B：安全控制台＋教師帳號營運

### 5.0 Owner 核准的交付形態（2026-09-03）

- Admin B 採一條完整垂直 lane：在單一專屬 worktree 內，由同一 candidate
  收斂 Tasks 1–6 的 DB、Auth／Edge adapter、typed frontend interface、真實 UI、
  自動測試、唯一一輪 review 與 Local gate。
- 不拆成可各自整合的 frontend／backend sibling branches，也不得用 UI-only、mock
  或僅有 migration 的片段宣稱 Admin B 功能完成。
- Phase 0 保留為另一條 protected lane 與 Admin B 平行開發；兩者涉及共用 Local
  Supabase 的 reset、migration replay 或其他破壞性 gate 時，仍須取得 exclusive
  window 並依序執行。
- Admin B Hosted Task 7、release integration、push、merge 與部署仍是後續獨立
  Owner gate；本決策只固定 delivery shape，不自動授權上述動作。

### 5.1 安全控制台收斂

- 補齊 invitation acceptance 的 pre-session flow。
- 依 operation kind 正確呈現可人工重試與必須 OOB 處理的 stuck operations。
- 導覽涵蓋 sensitivity catalog 的七個 browser domains，不要求手打 canonical URL。
- Admin／invitation／session lists 提供可驗證的 pagination 或明確 truncation。
- 補 Admin／session detail、request ID、retryable/error context 與 MFA QR/retry。
- 保持 MFA、privileged-session、reveal、reason、receipt、idempotency 與 audit
  fail closed；不得把授權判斷搬到 browser。

### 5.2 教師帳號營運

先將已接受但仍在後續 lineage 的 ADR 0009 整合進 canonical history，再實作：

- 教師列表、搜尋與狀態；不顯示 Auth 內部占位 Email。
- Admin 輸入教師名稱與 optional contact email；後端 transaction 產生不可撞號的
  `teacherNN` login account。
- 建立後只回一次初始密碼 receipt；明文不進 log、audit、repo 或 analytics。
- 可更新教師名稱／contact email，不可透過 UI 改 role 或重新指派 login account。
- 重設密碼需二次確認、reason、request ID 與 audit；原密碼不可查看或復原。
- Auth user、profile、display name 與 contact email 的跨系統 saga 必須有明確補償，
  不得留下部分建立狀態。
- 新建教師能登入 Teacher portal、不能登入 Admin portal；非 Admin 不能列出聯絡
  Email 或執行任何教師帳號 mutation。

對 UI 而言只暴露少量 named-command interface；流水號、Auth/profile saga、秘密
產生、補償、receipt 與 audit 留在 deep server module 的 implementation 內。不得
直接搬用已退役且 teacher-authorized 的 content editor hooks。

### 5.3 Admin B 明確排除

- 內容建立／匯入／審核／發布／封存
- 全平台 classroom/student intervention
- Live 平台營運命令
- 平台 analytics、自訂統計與研究匯出
- 將 Teacher 教學、班級或 Live workflow 複製進 Admin

## 6. Deferred Admin C：完整平台型 Admin

### 6.1 狀態與啟動條件

**狀態：建議已記錄；尚未核准 design／plan／implementation。** 任何代理不得因
本節存在就建立頁面、RPC、migration 或 hosted resource。

只有在 Admin B 已通過 Local 與 Hosted gate，且實際營運仍需要跨教師內容／資料
操作時，Owner 才考慮將 C 升級為新的 L 級 phase。升級前必須先裁定 Admin／Teacher
權責、內容審核、個資存取、補償／rollback、匯出隱私與雙重確認規則。

### 6.2 建議 modules 與 implementation scope

1. **Content lifecycle module**
   - author、bulk import、validation、review、approve、publish、archive
   - current-version projection、歷史版本、rollback 與 media integrity
   - Maker／reviewer separation；不得讓單一前端操作直接改正式答案或發布狀態
2. **Platform support module**
   - 跨教師 classroom／membership／student support case
   - 合法的轉班、停權、修復與補償命令
   - 每次操作具 target preview、reason、receipt、audit 與可驗證結果
3. **Live operations module**
   - 平台層場次查詢、事故診斷、取消／終止與受限修復
   - 不取代 Teacher 主持流程，不允許任意改寫成績或排名
4. **Platform analytics/export module**
   - 平台健康、內容品質、使用與營運指標
   - purpose-bound、去識別、最小欄位 export；下載須可稽核並具到期控制
   - 研究資料集、保存期限及再識別風險需另有 privacy design
5. **Admin governance module**
   - sensitivity catalog、least privilege、named operations、idempotency、receipt
   - 高風險命令的 re-auth／雙重確認／必要時 two-person approval
   - append-only audit、失敗補償、incident isolation 與 hosted negative proof
6. **Admin information architecture**
   - 安全、帳號、內容、學習、班級、Live、分析、稽核、健康等可發現導覽
   - read-only browser 與 mutation workbench 明確分離
   - 不建立一頁一 RPC 的淺層 pass-through；共用深層 modules 的穩定 interfaces

### 6.3 Admin C 未來驗收最低要求

- 每個 mutation 都有正向、越權、重送、衝突、部分失敗與補償測試。
- 前端 bundle 不含 forbidden schema、秘密、正確答案或 service-role credentials。
- RLS／RPC／Edge 的角色矩陣以 Admin、Teacher、Student、anonymous 驗證。
- 內容發布、個資揭露、匯出與高風險支援操作皆有 exact-SHA Hosted proof。
- 所有 fixture 與一次性秘密清理完成後才可關閉 gate。

## 7. Canonical integration 與平行執行

Owner 核准的是下列 dependency lanes，不是所有 phase 共用一條線排隊。每個
package 仍需獨立 brief 與授權：

1. R0：本 rebaseline record 與 roadmap supersession。
2. 先將 R0 文件固定為 committed exact base；所有平行 lane 從這個可重現 base
   建立各自 protected worktree。
3. Release lane／Phase 0：在原 protected worktree review／固定候選 commit／驗證；
   通過後才吸收到 program-integration branch，更新或取代舊 PR #1，並通過 current
   CI／protected merge gate。Phase 1 Hosted 不得先行。
4. Admin lane：`f0638b0` 已驗證包含 Phase 1 Local-gate tip `3f0f16d`；因此 R0
   committed base 固定後，Admin B Tasks 1–6 可在單一獨立 worktree 以完整垂直
   candidate 優先做 Local implementation／review／gate，不必等 Phase 0 完成。
5. Content／Learning lanes：Phase 2A → 2B；Phase 3 progression → Phase 4 UI。
   Phase 5 F2 與 Phase 6 依自身 interface dependency 接續，不與無重疊 lane 共用
   同一 checkout。
6. 一次只整合一個核准來源；Phase 2 前收斂 review-card／limiter lineage，Phase 3/4
   前收斂 quiz-result lineage，Phase 5 前收斂 Live／short-code／lobby-guard lineage。
7. Phase 0 protected merge 後，從 exact canonical SHA 建立新的 Staging deployment，
   執行 Phase 1 Hosted gate。
8. Admin B Hosted Task 7 與 release integration 必須等 Phase 0 merge／Phase 1
   Hosted；Local candidate 完成不會自動跨過這個 gate。
9. 各 phase 通過自身 gate 後，才可另提 release authorization；Admin C 不在任何
   active lane。

不得只取「最新」feature tip 代替 lineage inventory；已知分岔可能讓 Live tip 遺漏
review-card limiter／migration fix。每次整合必須保護 user WIP、逐 path stage，禁止
`git add -A`。

## 8. 下一個 Owner gate

R0 文件完成後，下一個 Owner gate 是固定 docs-only exact base，再由 Owner 決定
先啟動 Admin B Local lane、Phase 0 lane，或同時啟動兩個獨立 lane。Phase 0 lane
仍是：在既有 protected worktree 進行 read-only staged review，並將通過 review
的 staged tree 固定為候選 commit。這不包含真實 restore E2E、push、PR 更新、
merge 或 Hosted mutation；上述動作仍須依其風險逐次取得授權。
