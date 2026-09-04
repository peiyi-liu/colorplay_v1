# Phase 2／5／6 Rebaseline Scope Contracts

- 日期：2026-09-02（Asia/Taipei）
- 狀態：Owner 已核准 scope 與方法；尚未核准 implementation execution
- 基準 snapshot：`f0638b04d74a8a5071ceb36e7a2369527dc5d0b7`
- 目的：讓後續平行 inventory／planning 不需從舊 roadmap 猜測範圍

本文件定義 Phase 2A／2B、Phase 5 F2 與 Phase 6 的正式邊界。它不把既有
implementation 或 Staging smoke 升級成 phase completion，也不授權 code、DB、
Hosted、push 或 merge。

## 1. 共通 rebaseline 方法

每個 phase 先對 approved protected integration SHA 做 read-only inventory：

```text
規格要求
× canonical implementation
× migrations/RLS
× tests/evidence
= implemented | partial | missing | conflicting | unverifiable
```

- `implemented` 仍需 current scoped gate，不因存在檔案自動 PASS。
- `partial` 只補缺口，不重寫已工作能力。
- `conflicting` 先回 Owner；不得用舊 spec 強行回退現行 UI／schema。
- `unverifiable` 保持 NOT VERIFIED，不用 mock、歷史綠燈或 HTTP 200 補洞。
- 每 phase 一個 inventory、一份 gap plan、一位 reviewer、一輪 review。

## 2. Phase 2A：第三章 canonical content slice

### 2.1 保留範圍

以 `2026-08-10-phase-2a-chapter-three-content-import-design.md` 為基礎，2A 只交付：

- 第三章 RC（review cards）、QB（section questions）、CR（chapter questions）。
- Sheet/import interface 與結構/content validation 分層。
- Stable/generated ID 契約與 deterministic mapping。
- Apps Script setup、operator instructions 與 import dry-run/commit。
- 每筆 legacy/candidate content 的 disposition；未核准內容不發布。
- Chapter 3 的 Local 與另行授權 Hosted content integrity proof。

### 2.2 明確排除

- 其他章節完整內容。
- LT（Live 專用 bank）。
- 全平台 version publishing UI/workflow。
- Review media 的完整生命週期與所有章節 media。
- Phase 3 progression、Phase 4 UI 或 Teacher/Admin CMS。

### 2.3 Gate

- RC/QB/CR stable code 唯一、parent chain 正確、published validation 通過。
- QB 只對應 section templates／`bank_kind='section'`；CR 只對應 chapter template／
  `bank_kind='chapter'`。
- Import dry-run 無寫入；commit transaction 全有或全無；重送 idempotent。
- Student payload 無正解；content review 不由 structure validator 冒充。
- 完成只能稱「Phase 2A Chapter 3 slice PASS」，不能稱完整 Phase 2。

## 3. Phase 2B：既有擴充內容的正式收斂

### 3.1 接收範圍

- 已存在 lineage 中的 LT bank。
- Chapters 1、2、4、5、6 的 RC/QB/CR 與可驗證內容。
- Current-version publish/archive、history、rollback-safe publication events。
- `content_versions.progression_impact`、classification reason／changed-field digest，
  以及 `publish_question`／`publish_review_card` 的 server-validated impact contract。
- Inserted required-card publication 的 immutable effective cutoff、section／sort
  identity、`publication_cutoff_order` 與 `finalized_before_publish` grandfather policy
  metadata。
- Review-card media mapping、private Storage delivery、alt text、hash/integrity。
- All-chapter content readiness 與 import/disposition ledger。

### 3.2 接收原則

- 不回退已存在的合法擴充，也不因「已在 Staging 看得到」直接接受。
- 每個 source 先列 commit ancestry、migration range、content hashes、rights/source、
  stable-code collisions 與 tests，再一次吸收一個 source。
- LT、QB、CR 題池不互相 fallback；缺內容應 fail closed，不拿其他 bank 補題。
- Media object 存在不等於已發布；必須有 current card/version mapping。
- 非實質改版可標 `compatible`；實質 review 變更必須
  `requires_recompletion`，實質 question/template 變更必須
  `requires_requalification`。Client 只能提出 impact，server 必須依 allowlisted diff
  驗證；缺漏或不明確時採類型最嚴格值。
- 既有 `requires_recompletion`／unclassified history 不可直接全映射為 compatible；
  先比對 frozen payload，無法證明相容就 fail closed，且不改寫歷史 rows／rewards。
- Inserted card 的 cutoff 與 policy 必須和 publication event 原子提交；不得由 UI
  事後移動 cutoff 或逐生手動勾選豁免。Eligibility 為 cutoff 前已
  committed 的 server-valid、同 section finalized challenge，不論分數；不以 80%
  mastery 或可變 projection 代替。Publication／finalize 必須在同一 section
  lock 內由 server 分配單調 `section_event_order`，以
  `finalize.section_event_order < publication.publication_cutoff_order` 判定；
  timestamp 僅供 audit。等號、
  缺 order 或無法判定的歷史順序 fail closed。
- 2B 只能在 2A interface/identifier contract 固定後開始。

### 3.3 Gate

- 六章 content-readiness report 無缺 parent/template/bank/card/media mapping。
- 每一 stable code/version/hash 可追溯至 approved source/disposition。
- Publication／archive／retry／rollback history 不改寫既有 attempts。
- `AC-PROG-014` 通過：compatible 沿用、material review 重做、material challenge
  重新達標、禁止弱化分類，且所有歷史 facts／ledgers 保留。
- Inserted-card publication metadata 足以讓 Phase 3 驗證 `AC-PROG-015` cohort，且
  cutoff/order／policy 不可更新、client 不可偽造。
- Anonymous／Student／Teacher／Admin RLS 負向矩陣與 question-answer leakage scan 通過。
- 完成後才可宣稱完整 Phase 2；不能順便宣稱 Phase 3 progression 正確。

## 4. Phase 5 F2：Live 與自主學習統計補完

### 4.1 正式範圍

以 `2026-08-10-phase-5f-teacher-live-functional-design.md` 第 1.3–1.6 與 13.2
為基礎，從現有實作盤點並補：

- 學生進度頁的 Live／自主正確率，active content version 範圍清楚。
- Participation：有 server participant row 才算；從未 join 為缺席，不進分母。
- Reconnect 不延長 deadline；只接受原窗口內 server 收到的 answer。
- Cancelled/incomplete 場次保留歷史列，rank/accuracy 顯示 `—`，並使用
  server-confirmed「答對 X／已出題 Y」。
- Official ranking 與 tie：同分共享較高名次，下一名跳號；client 不重算。
- Deadline、answer acceptance、finalize、duplicate tabs、idempotency、cancellation
  與 reconnect 的 server-authoritative tests。
- Version binding、pagination、stable ordering、safe error envelope 與 classroom-owner
  RLS。

### 4.2 明確排除

- 研究 export、privacy dataset。
- 自訂報表／自由組合 metric。
- 7/30/90 天 rolling trends 或長期 cohort trend。
- 重做已完成的 LivePresenter 視覺；只修 inventory 證明的功能缺口或 regression。
- Team-mode 新功能或其他未核准 Live game mode。

### 4.3 Gate

- 統計由 server aggregation 產生，前端不下載 raw answers 聚合。
- 每個百分比有 numerator、denominator、version/window；無資料顯示「尚無資料」。
- Join/absence/cancel/reconnect/deadline/finalize/tie 的 deterministic DB/concurrency
  tests 通過。
- Owner teacher 正向、other teacher/student/anonymous 負向；denial 不洩漏存在性。
- U1＋F2 都 current-gate PASS 才能關閉 Phase 5F slice；仍不等於研究報表完成。

## 5. Phase 6：現有介面 formalization 與 gap closeout

### 5.1 方法

Phase 6 不從舊 mock／設計稿重建整站。先以 current canonical production-wired
routes/components/handlers/server states 建立 interface inventory，再把真正在使用的
行為寫回正式 spec，最後只補缺口。

### 5.2 Inventory 必含

- Public/Auth/Student/Teacher/Admin route matrix、guard、redirect、refresh/recovery。
- 每 route 的 loading、empty、permission、offline/reconnecting、pending、success、
  terminal error。
- Production data hook/repository/handler 與 server-authoritative boundary。
- 320/375/768/1024/1440 viewport、keyboard、focus、dialog/back、reduced motion。
- Bundle/lazy-load、image/media loading、API p95、stale cache與 duplicate tabs。
- Existing unit/harness/E2E 與 current DOM/copy 的差異；stale assertion 不等於
  product regression。

### 5.3 可修改範圍

- Missing/incorrect route or guard。
- 缺少的 state UI、真實 handler wiring、RWD/a11y/performance regression。
- 與現行合法 UI 不一致的 stale E2E/harness contract。
- 超過 500 行且本次必須修改的檔案，可依職責拆分並保持 interface。

### 5.4 排除

- 全站 redesign、切換框架／router／state stack。
- 為配舊 screenshot 回退已核准 JRPG UI。
- 以 mock data、static HTML 或 retired hooks 填 production route。
- 刪、skip 或放寬測試來讓舊斷言變綠。
- Admin C、研究 export 或新的 product feature。

### 5.5 Gate

- 每個 production route 有唯一 owner、真實資料來源與完整 state matrix。
- 三 viewport 與 keyboard/a11y scoped tests 通過；真實裝置項標待人類驗證。
- Production build、lint、typecheck、affected unit/integration/E2E 綠。
- Stale tests 逐一分類：更新契約或確認 real regression；沒有批次刪除/skip。
- 完成可稱 Phase 6 UI/route formalization PASS，不得宣稱 Phase 8 release ready。

## 6. Dependency lanes and planning rules

```text
Release lane: Phase 0 merge → Phase 1 Hosted
Admin lane:   committed Phase 1 Local lineage → Admin B Local candidate
                                                 └→ waits for Hosted gate
Content lane: Phase 2A → Phase 2B
Learning lane:          Phase 2B → Phase 3 → Phase 4
Teacher/UI lanes:       consume only their declared interfaces
```

- 不同 lane 可在獨立 worktree 平行開發；每條 lane 內的箭頭仍是硬依賴。Shared
  migrations、generated types、router／AppShell 與 Local Supabase reset 必須有唯一
  owner／exclusive window。
- Phase 2/5/6 可在等待期間做 read-only inventory spec；product plan 必須以各自
  owner-approved exact base 重查後才定稿，不必等待無關 lane 的 Hosted gate。
- 2B、F2、Phase 6 是三個獨立 plans，不合併成一個巨型平行工作包。
- 若 inventory 發現現行實作超出本範圍，記為 candidate disposition；不自動納入、
  不回退，交 Owner 以三選項裁定。
