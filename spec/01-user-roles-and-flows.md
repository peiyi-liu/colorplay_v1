# 使用者角色、頁面與流程規格

## 1. 路由總覽

建議正式路由：

```text
/login
/join
/app
/app/chapters/:chapterId
/app/chapters/:chapterId/topics/:topicId/review
/app/quiz/:sessionId
/app/quiz/:sessionId/result
/app/profile
/app/shop
/app/leaderboard
/teacher
/teacher/classes/:classroomId
/teacher/content
/teacher/content/imports/:importId
/teacher/analytics/:classroomId
/teacher/exports
/unauthorized
```

所有 `/app/*` 需 authenticated student 或 teacher；`/teacher/*` 需 teacher membership／ownership 檢查。只隱藏導覽按鈕不算權限控制。

## 2. 身分與班級流程

### AUTH-Flow-01：登入

1. 使用者輸入核准登入方式所需資料。
2. Supabase Auth 建立 session。
3. 前端取得 `profiles` 與角色資訊。
4. 無 profile 時由安全流程建立；不得由前端任意指定 teacher role。
5. 依角色導向 `/app` 或 `/teacher`。

錯誤狀態：帳密錯誤、帳號未啟用、session 過期、網路錯誤都必須有可理解訊息，不得只顯示 Supabase 原始錯誤碼。

### AUTH-Flow-02：加入班級

- 學生輸入班級代碼或使用教師提供的 invite link。
- 後端驗證代碼有效、未過期、班級可加入。
- 建立唯一 `classroom_members` 記錄。
- 重複提交不得建立重複 membership。

## 3. 學生核心流程

### STU-Flow-01：學習大廳

大廳顯示：

- 使用者暱稱、Blook、Level、目前 XP、Token。
- 已加入班級與目前課程。
- 已發布章節、完成進度、鎖定／未發布狀態。
- 班級排行榜摘要。

不可顯示：未發布內容、其他班級資料、教師私密備註。

### STU-Flow-02：章節與子主題

- 章節頁顯示章節描述、小節、子主題與完成狀態。
- 子主題至少可進入複習卡。
- 綜合挑戰只能從該章節已發布且有效題目抽取。
- 題目不足 10 題時，按鈕必須顯示實際可出題數，不得宣稱固定 10 題。

### STU-Flow-03：複習卡

- 依教師設定順序顯示。
- 支援純文字、圖片、色票示例與必要的替代文字。
- 學生可開始該子主題練習或回章節。
- 內容載入失敗時需提供重試，不得呈現空白卡。

### STU-Flow-04：Quiz

1. 學生請求建立 session。
2. 後端固定該 session 的題目與順序。
3. 前端逐題取得公開題目 payload。
4. 每題 20 秒；時間基準與答案判定由可信後端資料協助驗證。
5. 提交答案後，後端回傳正誤、獎勵與可公開解析。
6. 答錯／逾時需顯示解析並由使用者確認後進下一題。
7. 所有題目完成後，由後端 finalize session。

禁止事項：

- 在前端預載 `correct_option_id`。
- 重新整理頁面後重新抽題或重複發獎。
- 同一題重送造成重複 answer／獎勵。

### STU-Flow-05：結果與錯題

結果頁顯示：

- 答對題數／總題數。
- 正確率。
- 本次 Quiz Score。
- 本次獲得 XP／Token。
- 每一錯題的本人答案、正解、解析。
- 返回章節、查看錯題或再次練習入口。

結果必須由已 finalize 的資料讀取；不得僅依前端記憶體重算。

### STU-Flow-06：商店與裝備

- 顯示所有已發布 Blook、價格、解鎖與裝備狀態。
- 購買必須是原子交易。
- 餘額不足不得扣款或建立 ownership。
- 重複購買同一 Blook 不得重複扣款。
- 裝備 Blook 只能選擇已擁有項目。

### STU-Flow-07：排行榜

- 預設顯示目前班級的排名。
- 使用穩定 tie-breaker：`score DESC, achieved_at ASC, user_id ASC`。
- 只顯示允許公開的暱稱、Blook、分數與排名。
- 不顯示 Email、學號或其他個資。

## 4. 教師核心流程

### TCH-Flow-01：教師 Dashboard

至少顯示：

- 班級數、學生數。
- 指定期間內 quiz attempts。
- 平均正確率。
- 錯誤率最高的子主題。
- 最近活動與資料匯出入口。

空班級、無作答資料、資料載入失敗須有明確狀態。

### TCH-Flow-02：內容管理

教師可管理：

- 章節、section、subtopic。
- 複習卡。
- 題目與選項。
- draft／published／archived 狀態。

發布前必須通過內容驗證。已被正式作答引用的題目不得原地改寫正解而破壞歷史；應建立版本或複製新版本。

### TCH-Flow-03：題庫匯入

1. 下載真實範本。
2. 上傳 XLSX。
3. 後端／安全解析流程驗證工作表與欄位。
4. 顯示逐列錯誤、警告與預覽。
5. 教師確認後提交。
6. 以 transaction 寫入；部分失敗不得留下半套資料。

### TCH-Flow-04：分析

篩選至少包含：班級、日期範圍、章節、子主題。

指標：

- attempts。
- unique students。
- accuracy。
- average response time。
- timeout rate。
- question error rate。

所有指標需有明確分母；無資料時顯示 `—`，不得顯示誤導性的 0%。

### TCH-Flow-05：研究資料匯出

- 教師只能匯出自己管理班級。
- 匯出包含 schema version、產生時間、時區與欄位說明。
- 預設使用 pseudonymous user ID，不包含 Email。
- 若需識別資料，必須有額外權限與明確 UI 警告。

## 5. 路由與恢復規則

- Browser refresh 後應恢復合法 route 與 session。
- 未登入存取受保護 route：導向 `/login`，登入後回原目標。
- Student 存取 teacher route：導向 `/unauthorized`，且後端請求必須被拒絕。
- 已 finalize quiz 不得回到可作答狀態。
- 進行中 quiz 重新整理後需恢復同一 session 與目前未答題狀態，不得重抽、重發獎。

## 6. 錯誤與離線體驗

- Query error 提供重試按鈕。
- Mutation pending 時防止重複點擊，但仍由 idempotency 保護。
- 網路中斷提交答案：保留畫面並允許安全重試；不得先在前端發正式獎勵。
- Session 過期：提示重新登入，保留可恢復的非敏感 route context。
- 全域 error boundary 顯示可恢復畫面與追蹤 ID，不顯示 stack trace。
