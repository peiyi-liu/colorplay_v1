# ADR 0008: 學生單一 active 班級與 Quiz 班級來源

- Status: **Accepted（owner 2026-08-14 裁定）**
- Decision date: 2026-08-14
- Related: ADR 0003、ADR 0007、spec/03、spec/04

## Context

既有資料模型允許學生同時屬於多個 active classrooms，Quiz session 又沒有保存
作答當下的班級來源。教師分析若只以目前 active membership 連接歷史作答，可能把
入班前或其他班級的作答歸入目前班級，也可能錯誤解鎖教師正確答案 projection。

產品規則已裁定為：一個學生帳號同一時間只能綁定一組 active 班級加入碼。

## Decision

1. `classroom_members` 對 student 建立 partial unique invariant：每個 `user_id`
   最多一筆 `status = 'active'` 的 student membership；teacher 不受此限制。
2. 相同班級的 join/rejoin 保持 idempotent；已在另一 active 班級時 fail closed，
   回傳 `ALREADY_IN_ACTIVE_CLASSROOM`，不得自動轉班。
3. Migration 遇到既有重複 active student memberships 時停止並回報
   `ACTIVE_STUDENT_CLASSROOM_CONFLICT`，不得猜測應保留哪一班。
4. `quiz_sessions.classroom_id` 保存建立 session 當下由後端判定的班級來源。
   Assignment session 另以 assignment attempt 與 assignment classroom 驗證一致性。
5. 沒有可信 classroom provenance 的歷史 practice session 不進入班級教師分析，
   也不能解鎖 ADR 0007 正確答案 projection。
6. 未來轉班必須另建具權限、稽核與明確歷史語意的 workflow；本 ADR 不以 update
   或自動停用 membership 代替轉班流程。

## Consequences

- 一般學生不能同時加入兩個 active 班級。
- 教師分析只顯示能證明屬於該班級的 Quiz／Assignment／Live 資料。
- 舊 practice 作答若缺少班級來源，會從班級分析排除，但學生本人正式作答紀錄不刪除。
- 上 hosted migration 前必須先做 duplicate preflight；若有衝突需 owner 決定資料處理。
