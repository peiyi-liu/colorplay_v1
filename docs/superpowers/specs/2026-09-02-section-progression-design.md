# Phase 3／4：章節內小節解鎖與學習導引設計規格

- 日期：2026-09-02（Asia/Taipei）
- 狀態：Owner 已核准全部 progression 產品與 migration semantics；尚未授權實作
- 規則版本：`2026-09-progression-1`
- 基準 snapshot：`f0638b04d74a8a5071ceb36e7a2369527dc5d0b7`
- 上位規格：`spec/01`, `spec/03`, `spec/05`, `spec/07`
- 驗收：`AC-PROG-007`–`AC-PROG-015`

本文件核准設計，不授權 product code、migration、Local database reset、Staging
mutation、push、merge 或 release。執行仍需新的 protected integration worktree、
精確 base SHA 與 bounded brief。

## 1. Supersession

本文件取代以下舊規則，但不刪除歷史文件：

- `2026-08-03-jrpg-six-chapter-learning-map-design.md` 的跨章 sequential access。
- `2026-08-10-phase-3a-chapter-three-progression-design.md` 的「完成本章才開下一章」
  與舊章節完成三條件。
- `2026-08-03-sequential-content-activation.md` 的 `open -> sequential` 啟用目標。

保留項目：JRPG 章節全貌、content-ready gate、server-authoritative assessment、
正式內容版本、題池分流、歷史 attempts 與完成紀錄。

## 2. 目標與非目標

### 2.1 目標

1. 所有 content-ready 章節彼此獨立可進入。
2. 單一章節內依 section、review card、小節挑戰、章節總挑戰循序前進。
3. UI 與 server 同時鎖定；猜 ID、直接 route/RPC/table/Storage 不得繞過。
4. 保留完整學習地圖，只提供一個 server 決定的 primary 下一步。
5. 分開「已完成」與「已精熟」。

### 2.2 非目標

- 不判定學生是否真正理解文字；系統只能記錄合法內容取得與明確 completion。
- 不修改 Quiz Score、XP、Token、achievement 或 remediation 規則。
- 不改 Teacher-hosted Live 的存取；Live 不解鎖 self-study progression。
- 舊資料採第 4.4 節相容性正規化，內容改版採第 4.5 節 progression-impact，
  新卡插入採第 4.6 節既有學生豁免；所有產品決策均已結案，執行前技術 gates
  見第 11 節。

## 3. 名詞與權威順序

- **小節**：資料模型 `section`，例如 `3-1`、`3-2`。
- **subtopic**：section 內部內容分類；不出現在 progression gate。
- **current-required card**：對目前 user 仍屬 progression required 的 current
  published card；合法 `grandfather_exempt` 卡排除在該 user 的 required set
  外。若新版本標記 `progression_impact='compatible'`，可由明確連結的相容
  舊 completion 滿足。
- **attempted**：對應 challenge 的 quiz session 已完整 `finalized`；abandoned、
  expired、in-progress 不算。
- **server-valid finalized challenge fact**：由 trusted create／finalize commands
  產生並 committed，且 actor、template 與 section binding 一致的 finalized
  session；client 手動狀態、abandoned／expired session 不算。用於 grandfather
  時不要求 80%，current mastery 或 current-version qualification。
- **qualifying percentage**：finalized challenge 的
  `correct_count / question_count * 100`。Server 以
  `correct_count * 100 >= question_count * 80` 比較 80% 門檻，不先四捨五入；速度
  加權 Quiz Score 與 aggregate mastery 不參與 progression gate。
- **content-ready chapter**：自身 published taxonomy、required cards 與 playable
  templates/question pools 均滿足內容 gate；與其他章節進度無關。

順序由 server 以 `(section.sort_order, subtopic.sort_order,
review_card.sort_order, stable identity)` 決定。Browser 排序只供呈現，不能作授權。

## 4. 狀態模型

### 4.1 Card access

```ts
type ReviewCardAccessState =
  'locked' | 'available' | 'grandfather_exempt' | 'completed';
```

- `completed`：current published version 已有合法 completion，可回顧；對
  required card 同時滿足 gate，對原 grandfather-exempt card 只記錄自願完成。
- `available`：同 section 中 predecessor 已完成、且所屬 section 已開放的唯一
  未完成 required 卡。
- `grandfather_exempt`：cutoff 前已有 server-valid、同 section finalized
  challenge fact 的使用者遇到後續 inserted card；可選讀但不阻擋
  progression、不算 completed，也不成為 primary next action。
- `locked`：其餘卡；只提供安全 metadata 與 blocker。

### 4.2 Section state

```ts
type SectionLearningState =
  'locked' | 'reviewing' | 'challenge_available' | 'attempted' | 'mastered';
```

- 第一 section 永遠不因其他 section 被鎖；後續 section 要求上一 section
  `attempted`。
- `challenge_available` 要求全部 current-required cards completed。
- `attempted` 要求至少一個 current-version finalized section challenge。
- `mastered` 要求 current-version best qualifying percentage ≥80%。

### 4.3 Chapter state

```ts
type ChapterLearningState =
  'not_started' | 'learning' | 'completed' | 'mastered';
```

- `completed`：至少一個 current-version chapter challenge finalized。
- `mastered`：current-version chapter challenge best qualifying percentage ≥80%；
  `mastered` 同時蘊含 `completed`。
- `content_unavailable` 是 access/readiness 狀態，不混入學習成果 enum。

### 4.4 Legacy compatibility normalization

- 歷史 `review_progress`／`quiz_sessions` 是 append-only facts；migration 不刪除、
  不改完成／作答時間，也不偽造新的 completion 或 attempt。
- Out-of-order completed card 仍顯示 `completed` 並可回顧，但 path 計算永遠先找
  authoritative sequence 中最早未完成的 current-required card。較後方的歷史
  completion 不得讓新的未完成節點跨過該缺口。
- 在 required cards 尚有缺口時，較早 finalized 的 section challenge 只保留為歷史，
  不投影 `attempted`／`mastered`，也不解鎖下一 section。
- 缺口全部補齊後，該舊 challenge 原地生效並依原始 `correct_count`／
  `question_count` 納入 attempted／best；不要求學生重做、不改 attempt timestamp、
  不重播 XP／Token／achievement。
- 哪些舊 content versions 可與 current version 相容，依第 4.5 節
  progression-impact；相容性正規化不把所有版本視為等價。

### 4.5 Content-version progression impact

每次 published current version 切換必須在同一 transaction 保存 actor、reason、
changed-field digest 與下列 impact；browser 不能決定或覆寫：

```ts
type ProgressionImpact =
  'compatible' | 'requires_recompletion' | 'requires_requalification';
```

- `compatible`：錯字、排版或不改變學習語意的 accessibility／alt-text 修正；舊
  completion、attempt 與 best percentage 繼續適用 current version。
- `requires_recompletion`：review-card 觀念、正文含義或教學 media 有實質變更；
  舊 completion 保留為歷史，但不滿足 current-required card，必須完成新版本。
- `requires_requalification`：question prompt 含義、options、correct answer、template
  pool／scope 或挑戰規則實質變更；舊 finalized attempt 保留 attempted／chapter
  completed 的歷史事實，但不計 current-version best percentage／mastered，必須以
  新版本 challenge 再達 80%。
- Server 以 allowlisted diff rules 驗證 impact；正解、選項或 scope 改變不得標
  `compatible`。分類缺漏、無法判定或規則未涵蓋時，review content 預設
  `requires_recompletion`，challenge content 預設 `requires_requalification`。
- 已解鎖／已完成的歷史節點不刪除，既得 reward ledger 不追回；但下一個尚未完成
  的 forward action 與章節總挑戰，必須先滿足 current-version requirements。

### 4.6 Inserted-card grandfather cohort

- 在既有 section 發布新的 current-required card 時，publication event 同一
  transaction 固定 `effective_at`、card/version、section、sort position、
  `publication_cutoff_order` 與
  `grandfather_policy='finalized_before_publish'`；cutoff 不可事後移動。
- Exemption predicate 固定為：同一 user／section 至少有一筆 server-valid section
  challenge finalize transaction 已在 publication cutoff 前 committed，不論答對率。
  直接讀取 immutable finalize fact，不以 80% mastery 或可變 projection 取代。
  Publication 與 finalize 必須在同一 section lock 內由 server 分配單調
  `section_event_order`；只有
  `finalize.section_event_order < publication.publication_cutoff_order` 符合資格。
  Timestamp 僅供 audit，不獨立決定先後；等號、缺 order 或無法證明的歷史
  資料 fail closed，不豁免。
- 符合 predicate 的使用者對該 inserted card 取得 server-derived
  `grandfather_exempt`，既有 section／chapter progression 不回鎖。
- Cutoff 時尚無符合條件 finalize fact 者及 cutoff 後建立／開始的使用者
  沒有豁免，inserted card 依 authoritative sort order 成為該 user 的
  current-required card；後段紀錄不能跨過它。
- Cutoff 後完成舊 review 或 challenge 不得追溯取得豁免；client、Teacher 或 Admin
  也不能直接切換單一學生的 exemption。
- Exemption 只適用該 publication identity，不刪改 completion／attempt／reward，
  也不把卡片標成「已閱讀」。UI 可標示「新增內容（非必修）」並允許自願閱讀。
- Grandfather-exempt card 不進該 user 的 required denominator、challenge gate 或
  `next_action`；若使用者自願按「完成複習」，才建立正常 completion。

## 5. Canonical learning-path interface

建立一個深層 server module，由單一 read interface 同時服務 UI 與測試：

```ts
type LearningNextAction =
  | { kind: 'review_card'; reviewCardId: string }
  | { kind: 'section_challenge'; sectionId: string; templateId: string }
  | { kind: 'next_section'; sectionId: string; reviewCardId: string }
  | { kind: 'retry_section_challenge'; sectionId: string; templateId: string }
  | { kind: 'chapter_challenge'; chapterId: string; templateId: string }
  | { kind: 'retry_chapter_challenge'; chapterId: string; templateId: string }
  | { kind: 'none' };

type LearningPathSnapshot = Readonly<{
  rulesVersion: '2026-09-progression-1';
  chapterId: string;
  chapterState: ChapterLearningState;
  contentReady: boolean;
  sections: readonly SectionLearningNode[];
  nextAction: LearningNextAction;
}>;
```

`get_student_learning_path(p_chapter_id uuid)` 回傳所有節點的 ID、stable code、title、
sort order、狀態、完成／最佳 qualifying percentage、template metadata、blocker 與恰好一個
`next_action`。它不回 locked card 的 body、media asset path、signed URL 或 hidden
question data。

`next_action` 決定規則：

1. 目前 available card；
2. cards 全完成但尚未 attempted 的最早 section challenge；
3. 已 attempted section 後的下一 section 第一張卡；
4. 所有 sections attempted 後，最早未達 80% 的 section retry；
5. 全 sections mastered 後的 chapter challenge；
6. chapter completed 未 mastered 時的 chapter retry；
7. chapter mastered 時 `none`。

## 6. Content-delivery interface

`get_review_card_content(p_review_card_id uuid)` 只為以下三類回 current body/media：

- current snapshot 中 `available` 的卡；
- current snapshot 中 `completed` 的卡；
- current snapshot 中該 user 的 `grandfather_exempt` 選讀卡。

每次呼叫重新驗 `auth.uid()`、published/current version、chapter readiness 與 card
access；response 只含該卡內容。Private Storage signed URL 只能在相同授權之後產生，
且不得先為整章批次簽發。

Student 對 `review_cards.content`、`review_card_media.asset_path` 與相應 Storage
objects 的直接 SELECT 必須撤銷／RLS deny。Teacher/Admin 另走 role-aware
projection，不能因學生收緊而破壞合法內容管理。

## 7. Mutation interface

### 7.1 Complete review card

保留既有命令名稱與 request identity：

```sql
complete_review_card(
  p_review_card_id uuid,
  p_request_id uuid
) returns jsonb
```

同一 transaction 內：驗 actor → lock／重算 card current version → 取得
authoritative sequence → 驗證「目前 available 且 predecessor 已完成」或「該 user
目前合法 `grandfather_exempt`」 → insert-once completion → 回傳更新後 snapshot
identity。豁免卡只在使用者自願明確提交後變為 `completed`；不改變
其原有 progression gate 或 primary `next_action`。後續 locked 卡、另一 section、
draft／archived 或 stale version 皆拒絕。

同 request 重送回原 outcome；已完成卡用新 request 重送也不得更新 completed_at、
不得重複發獎。

### 7.2 Create challenge session

保留 `create_quiz_session` 作唯一入口，依 template scope 加 gate：

- section template：`section_id` 必填、`bank_kind='section'`，該 section 全部
  current-required cards completed。
- chapter template：`section_id is null`、`bank_kind='chapter'`，每個 required
  section current-version best qualifying percentage ≥80%。
- request 中的 chapter/section 或 client result 不作權威；從 template 與 DB
  relation推導。

### 7.3 Finalize projection

`finalize_quiz_session` 成功交易才更新 attempted／best projection。低分 section
attempt 仍開下一 section；低分 chapter attempt只建立 completed，不建立 mastered。
重送 finalize 不新增第二筆 attempt 或重複 progression event。

## 8. Stable denials

Server 至少提供下列安全碼；同類不存在／無權存取不得洩漏 target existence：

| Code                           | 意義                                                         | Client action                  |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------ |
| `LEARNING_CONTENT_UNAVAILABLE` | chapter 自身內容未 ready                                     | 顯示內容準備中                 |
| `REVIEW_CARD_LOCKED`           | card 非 completed／current available／own grandfather-exempt | refetch snapshot               |
| `REVIEW_SEQUENCE_REQUIRED`     | predecessor 未完成                                           | 顯示 blocker                   |
| `SECTION_REVIEW_INCOMPLETE`    | section challenge 尚未開放                                   | refetch snapshot               |
| `SECTION_CHALLENGE_REQUIRED`   | 下一 section 尚未開放                                        | 顯示需完成上一節挑戰           |
| `CHAPTER_CHALLENGE_LOCKED`     | 至少一 section 未達 80%                                      | 顯示逐節差距                   |
| `LEARNING_VERSION_CHANGED`     | client snapshot 已 stale                                     | refetch，不自動重送新 mutation |

未知錯誤一律 generic、可追蹤且不洩漏 SQL／stack。

## 9. UI contract

- Lobby 保留 JRPG 全章地圖；所有 content-ready 章節可選。
- Chapter page 保留 section menu、cards 與兩種 challenge 節點的全貌。
- Locked node 不可 click、不可成為 route link、不可用 force navigation 打開。
- 已完成卡可回顧；目前 available 卡顯示進行中；locked 顯示原因。
- 「小節挑戰」永遠跟隨目前選取的 section；單一按鈕不是共用整章挑戰。
- Reader 在最後一頁前不提供有效 completion；最後一頁顯示「完成複習」，且
  到達不自動提交。
- 章節核心區只有一個 primary action，完全依 `next_action`；手動選節點與回顧
  是 secondary。
- `completed` 與 `mastered` 必須用獨立文字／圖示，不能只靠顏色。

## 10. Test matrix

1. DB/pgTAP：每個 state transition、80% 邊界、排序、idempotency、兩分頁並行。
2. RLS negative：anonymous、另一學生、Teacher 非授權 scope、direct table/Storage、
   locked card/section/chapter IDs。
3. Contract：locked payload 不含 content/media；template scope/bank kind 正確；
   next action 恰好一個。
4. Unit/RTL：view-model exhaustive states、最後一頁 completion、locked non-action、
   selected section challenge、completed/mastered labels。
5. Playwright：三 viewport 走完整兩-section flow，含低分 section、retry、低分
   chapter、mastery、refresh/stale tab 與 network forbidden-field scan。

Task gate 跑 lint、typecheck、affected unit/integration/pgTAP；完整 Local／Staging
evidence 只在核准的 Phase 3/4 gate 執行。真實行動裝置仍由人類提供。

## 11. Pre-execution technical gates

Progression 產品與 migration semantics 已全部核准，沒有剩餘 Owner 產品決策。這不
等於實作授權；任何 worker 開始 migration 前仍須：

1. 以當時 exact canonical SHA 重查 migration IDs、functions、types 與 tests。
2. 證明 Phase 2B 已提供 progression-impact 與 inserted-card publication metadata。
3. 使用獨立 protected worktree／bounded brief，且不碰 Phase 0／1 protected WIP。
4. 取得 shared Local Supabase exclusive window 後才跑 destructive DB gate。
5. 發現 schema／contract 衝突時停止並修 design/plan，不自行降級 semantics。

## 12. 已確認、推論與待重查

- **已確認（2026-09-02 code snapshot）**：目前 UI 會點亮 current card，但所有
  card button 仍可進入；`get_accessible_chapter_review` 回整章 body/media；
  `complete_review_card` 與 `create_quiz_session` 只檢查章節 access。
- **已確認**：單一小節挑戰按鈕跟隨目前選取項目的 `quizTemplateId`；template
  server 端可解析 section 並使用 `bank_kind='section'`。
- **Owner 已確認（2026-09-02）**：80% 採 challenge 答對率
  `correct_count / question_count * 100`，不採速度加權 Quiz Score 或 aggregate
  mastery。
- **Owner 已確認（2026-09-02）**：既有跳號 completion／早期 challenge 採相容性
  正規化；保留 facts、最早缺口優先、補齊後舊 challenge 生效且不強迫重做。
- **Owner 已確認（2026-09-03）**：內容版本依實質影響分類；非實質修改 compatible，
  實質 review 變更重新完成，實質 challenge 變更重新達標，不明確時 fail closed。
- **Owner 已確認（2026-09-03）**：新 required card 對 cutoff 前已完成該
  section challenge 的既有學生豁免；無符合條件 finalize fact 者與新學生
  必讀，cutoff 後不可追溯取得豁免。
- **Owner 已確認（2026-09-03）**：資格精確等同 cutoff 前已 committed 的
  server-valid、同 section finalized challenge，不論分數；review-only、80% mastery
  或 cutoff 後 finalize 均不得代替。
- **執行前需重查**：精確 migrations／types／tests 可能在 program integration
  收斂後改名；plan 中的檔案 map 必須以當時 canonical SHA 驗證。
