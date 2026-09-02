# Phase 3A：第三章 Progression 驗證 Design（Draft）

> **Superseded on 2026-09-02:** 本文件的跨章解鎖與舊章節完成三條件不再適用。
> 現行規則見 `2026-09-02-section-progression-design.md`；本文件只保留歷史稽核
> 與當時 Hosted gate 邊界，不得作為新實作 brief。

- 日期：2026-08-10（2026-08-10 Codex review remediation 更新）
- 狀態：Owner approved：2026-08-10
- Codex design review completed
- Implementation planning：尚未授權（not yet authorized）
- 完成本文件定義的 Slice Gate 不代表對應的完整 Phase 已完成
- 對應：`docs/roadmap-colorplay-next.md` Phase 3（學習歷程與評量權威）的一個子集，**不是 Phase 3 的完整 spec**。
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`
- Dependency：無上游依賴；是 Phase 4A 的上游輸入之一（見 4A 的 dependency 說明）。

## 0. 明確聲明（Explicit Non-Claims）

本文件只涵蓋「第三章的學習歷程判定機制是否正確、是否有 hosted 驗證證據」。**不得將本文件的完成視為「Phase 3 完成」**——教師存取例外、Admin 撤銷例外、完整評量/補救/經濟規則不在本文件內。本文件**不重新設計**任何 assessment（評量）規則本身，只依賴並驗證既有的 server-authoritative assessment output。

## 1. Scope

### 1.1 背景

核心邏輯（`chapter_sequence_access`／循序解鎖／精熟度計算）已存在於 migration 中，2026-08-10 之前從未在任何 hosted 環境完整驗證過（staging 落後 13 個 migration，且有 9 個歷史分岔，已於 2026-08-10 修復並確認同步）。

### 1.2 交付項目

1. **正式 spec 化**：把現有機制（章節完成三條件——複習卡全完成／小節精熟≥80%／章節總測精熟≥80%）文件化，逐條對齊 `docs/roadmap-colorplay-next.md`「Approved learning progression decisions」，確認程式碼實作與已核准規則沒有落差。
2. **RLS 負向測試**（見第 7 節完整矩陣）。
3. **第三章 hosted 驗收**：見第 8 節 Hosted Mutation Owner Gate。

### 1.3 Hosted 驗證邊界（Codex review remediation，新增）

- **Local-first gate**：必須先在 local 環境跑完 migration／RLS／contract gate 且全綠，**local 未綠不得進 staging**。
- **Staging mutation 授權**：任何會對 staging 資料庫造成寫入的驗收動作，必須另外取得 owner 明確授權（時間點、範圍），不得由代理自行決定執行時機。
- **Fixture 邊界**：驗收只能使用**已核准的 staging fixture** 身分（Admin／Teacher／Student 測試帳號），**不得使用真實學生資料**。
- **驗收前記錄**：執行驗收前，記錄以下資訊：
  - 使用的 Supabase project ref
  - 當下的 migration head（SHA/版本）
  - 使用的 fixture identity 清單
  - 本次驗收會建立/修改的資料範圍（清理範圍）
- **驗收後清理**：驗收完成後，清理本次建立的 session/activity fixture 資料（例如測試用的 quiz session、live session），但**保留非秘密的 evidence**（測試結果、截圖路徑、log 摘要）供稽核。
- **Assessment output 邊界**：本文件依賴並驗證既有的 server-authoritative assessment output（正確率/精熟度計算結果），**不重新設計**這些計算規則本身。若驗證過程中發現 assessment output 無法滿足 progression contract（例如精熟度計算結果與預期不符），**停止並回報，不得直接寫入 `progress`/`unlock` 相關欄位繞過驗證**——這類繞過會製造假的「驗收通過」證據，掩蓋真正的問題。

## 2. Explicit Exclusions

- **教師存取例外**（Teacher 可對單一學生授予永久章節存取例外）：規則已在 roadmap 核准，但本文件不涵蓋其實作與測試。
- **Admin 撤銷例外**：同上。
- **完整評量/補救/經濟規則**：包含正式測驗題目組成規則（blueprint）、補救複習完整流程、XP/金幣獎勵計算——本文件只驗證「章節完成判定」本身。
- **Assessment 規則本身的重新設計**：本文件是驗證消費者，不是規則制定者。

## 3. Typed Input/Output Contract

**輸入**（來自既有 server-authoritative assessment）：

```
ChapterProgressInput:
  studentId: string
  chapterId: string
  reviewCardsCompleted: { total: number; completed: number }
  sectionMastery: { sectionId: string; masteryPercent: number }[]
  chapterFinalMastery: number | null   # null = 尚未嘗試
```

**輸出**：

```
ChapterProgressOutput:
  status: 'not_started' | 'in_progress' | 'mastered'
  unlocksNextChapter: boolean
  unmetConditions: ('review_incomplete' | 'section_mastery_below_threshold' | 'final_mastery_below_threshold')[]
```

## 4. Existing AC Mapping

| AC                                                                                                                                                                                                                     | 適用性                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-PROG-001（Review completion 以 current published version 計算）                                                                                                                                                     | 直接適用                                                                                                                                                                                    |
| AC-PROG-002（Coverage 公式正確）                                                                                                                                                                                       | 直接適用                                                                                                                                                                                    |
| AC-PROG-003（Accuracy／Mastery／Status 正確）                                                                                                                                                                          | 直接適用                                                                                                                                                                                    |
| AC-PROG-004（Content version 變更不竄改歷史）                                                                                                                                                                          | 直接適用                                                                                                                                                                                    |
| AC-PROG-005（Remediation 不改原始成績）                                                                                                                                                                                | 直接適用                                                                                                                                                                                    |
| AC-PROG-006（Teacher progress analytics 班級授權）                                                                                                                                                                     | 部分適用——本文件的 RLS 測試涵蓋授權判定，完整教師報表邏輯屬 Phase 5F                                                                                                                        |
| AC-SEC-003（Cross-user IDOR）                                                                                                                                                                                          | 直接適用——第 7 節負向測試涵蓋                                                                                                                                                               |
| **AC-TBD-3A-001：Hosted 驗收前後記錄與 fixture 生命週期格式**（對應第 1.3 節「Hosted 驗證邊界」的驗收前記錄 protected ref／migration head／fixture identity／清理範圍，與驗收後清理但保留 non-secret evidence 的要求） | **AC-TBD**——`AC-ENV-003`（環境隔離）與 `AC-ENV-008`（Backup／Restore）管的是環境層級的隔離與備份，不是單次功能驗收的 fixture 生命週期記錄格式，範疇不同，現有 acceptance 文件無直接對應條目 |

## 5. Task-Level Definition of Done

1. 章節完成三條件的程式碼實作與 roadmap 已核准規則逐條核對，無落差或落差已記錄為獨立 issue。
2. RLS 負向測試（第 7 節）全數撰寫並通過。
3. Local gate（migration／RLS／contract）全綠。
4. 取得 owner 明確授權後，於 staging 執行第三章完整流程驗收，並依第 1.3 節記錄驗收前後資訊。
5. 驗收後 fixture 清理完成，non-secret evidence 保留。

## 6. Slice Gate（不等於 Phase Gate）

第三章的完成判定機制（三條件）與循序解鎖，在 local 與 staging 皆有可稽核的正向與負向測試證據，即為本 slice 通過。**通過本 Slice Gate 不代表 Phase 3 完成。**

## 7. 正向與負向測試矩陣

| 情境                                           | 類型           | 預期結果                                                 |
| ---------------------------------------------- | -------------- | -------------------------------------------------------- |
| 學生完成複習卡+小節精熟+總測精熟達標           | 正向           | 章節標記 mastered，下一章解鎖                            |
| 學生僅完成部分條件                             | 正向           | 章節標記 in_progress，unmetConditions 正確列出未達成項目 |
| 非本人存取他人的章節進度/解鎖狀態              | 負向           | RLS 拒絕                                                 |
| 非該班教師存取學生的章節進度                   | 負向           | RLS 拒絕                                                 |
| 越權直接呼叫 RPC 嘗試解鎖未達成條件的章節      | 負向           | RPC 拒絕，不繞過條件判定                                 |
| 直接 URL/RPC 存取被鎖定章節的內容              | 負向           | 回傳鎖定結果與未達成條件，不洩漏可作答內容               |
| Assessment output 與 progression contract 不符 | 負向（流程性） | 停止並回報，不寫入 progress/unlock 欄位繞過              |

## 8. Hosted Mutation Owner Gate

見第 1.3 節「Hosted 驗證邊界」——staging mutation 一律需要 owner 明確授權，且 local gate 必須先全綠。

## 9. Failure / Stop Conditions

- Local gate 未全綠時，不得執行任何 staging 驗收動作。
- 未取得 owner 明確授權時，不得對 staging 執行任何寫入操作。
- Assessment output 不符合 progression contract 時，停止並回報，不得繞過。
- 驗收後未完成 fixture 清理前，不得將該次驗收標記為完成。

## 10. Dependency

- 無上游依賴。
- 下游：Phase 4A 的真實資料整合依賴本文件的判定結果（4A 開發期間可用 fixture，真實驗收需等本文件的 Slice Gate 通過）。

## 11. 仍未涵蓋的完整 Phase 3 範圍

- 教師存取例外與 Admin 撤銷例外。
- 完整評量/補救/經濟規則（blueprint、XP/金幣計算）。
- 全部 6 章的學習歷程驗證（本文件只驗證第三章）。

## 12. 客觀不可行的選項

- 「用 Phase 3A 的驗收結果反推教師存取例外的規則」：教師存取例外的行為在 roadmap 已有獨立定義，排除。
- 「Assessment output 有問題時直接手動修正 progress 欄位讓驗收過關」：會製造假驗收證據，排除。
