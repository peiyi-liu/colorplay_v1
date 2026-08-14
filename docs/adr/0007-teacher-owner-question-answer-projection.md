# ADR 0007: 教師班級 owner 專用正確答案投影

- 狀態：**Accepted**（owner 2026-08-14 選擇保留教師正確答案功能）
- 相關：`spec/02-system-architecture.md`、`spec/06-content-and-question-bank.md`、`acceptance/ACCEPTANCE_CRITERIA.md` 的 `AC-QUIZ-002`

## 背景

`spec/02-system-architecture.md` 對 correct option ID／index 的限制，是在定義 public／student question payload 與提交前的可信邊界：學生可以取得題目與公開選項，但不能在正式作答前取得正解。`spec/06-content-and-question-bank.md` 同時要求教師能設定、審閱並清楚辨識正解，且正解狀態不能只靠顏色表達。

原 `AC-QUIZ-002` 使用「題目 payload」與「建立／讀取題目」等未限定角色和階段的用詞。若照字面全域掃描，會把安全的 classroom-owner-only 教師投影與學生提交前 payload 一併禁止，造成規格彼此衝突，也可能誘使實作者擴大 shared 題目型別來繞過驗收。

## 決策

建立一個獨立、按需載入、classroom-owner-only 的正確答案投影。此投影是一個窄的專用 seam，不是共用題目讀取介面的擴充。

- 現有 answer-free `QuestionDetail` 與 `teacher_question_detail` 維持不變。
- 專用 interface 只接收 classroom identity 與 stable question identity。
- Server 回傳窄型別 `options[]`，每個 option 只包含：
  - `option_key`
  - `option_text`
  - `is_correct`
- Repository 僅在教師專用型別中映射成 `options[].isCorrect`。
- 不建立、匯出或重用共用 answer-bearing 題目型別。
- UI 只有在專用投影成功回傳時，才能標示正確答案與正確選項狀態。

## 授權

投影由 server 依序驗證：

1. `auth.uid()` 存在且可識別呼叫者。
2. 呼叫者角色為 teacher。
3. 呼叫者是指定 classroom 的 owner。
4. stable question identity 位於該班級允許的正式分析範圍。

正式分析範圍包含該班已完成的 Quiz，以及該班已完成 Live session 當下凍結的題目。Live 投影必須使用 session 已凍結的公開選項與正解 ID，不得使用日後改版的現行選項；進行中、暫停中、已取消或只存在題庫但未出現在該班已完成 Live 的題目一律不得解鎖正解。

Anonymous、學生、非 owner 教師、跨班級教師，以及超出該班級分析範圍的題目全部 fail closed。Denied response 使用一致的無資料或一般權限拒絕，不洩漏題目、班級或關聯是否存在。

若 function 使用 `security definer`，必須固定安全的 `search_path`，並在 function 內明確執行 teacher role 與 classroom ownership 驗證；不能把 grant、前端 route guard 或隱藏控制項當成授權。

## 非擴散保證

正解不得進入：

- 學生 Quiz 建立或讀題 payload；
- 學生提交答案前的 network response 或 React Query cache；
- 進行中 Live 的 participant／projector／一般 session payload；
- 一般分析、Live 報表或其他非專用教師 payload；
- shared `QuestionDetail` 或 `teacher_question_detail`；
- JS bundle、static JSON 或 fixture。

專用投影不得被包裝成供其他頁面重用的共用答案 endpoint。若 UI 的專用查詢處於 pending、empty、error 或 denied，只能顯示既有 answer-free detail；不得根據顏色、選項順序、靜態資料或 client computation 推測答案。

## 後果與驗證

- 正向測試：同班 classroom owner 可以取得窄型別答案投影。
- Live 正向測試：同班已完成 Live 的 frozen options 可以取得正解投影，且歷史 QB Live 與新 LT Live 都維持相容。
- 負向測試：anonymous、學生、非 owner 教師、跨班級教師與越界題目全部無法取得答案，且不洩漏存在性。
- Live 負向測試：進行中或未出現在該班已完成 Live 的題目不得取得正解。
- Schema contract 驗證 shared `QuestionDetail`、學生 Quiz、進行中 Live、一般分析與 static artifacts 仍不含答案欄位。
- Network／schema scanner 必須依 endpoint、authenticated role、classroom ownership 與作答階段分類。
- ADR 0007 的教師例外只允許專用 endpoint；不得把 `is_correct` 加入全域 allowlist 或讓 scanner 全域忽略。
- Phase B task-level pgTAP、repository 與 harness checks 只驗證本 slice；正式 acceptance 狀態仍留待未來 phase gate 的完整角色、network 與證據流程判定。
