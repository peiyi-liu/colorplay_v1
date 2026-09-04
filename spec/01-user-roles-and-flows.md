# 使用者角色、頁面與流程規格

> **2026-09-02 progression／Admin rebaseline（normative）**：所有已發布且
> content-ready 的章節彼此獨立，不再使用跨章循序解鎖。章節內依
> `section -> review card -> section challenge -> chapter challenge` 前進；Admin
> 目前範圍採安全控制台與教師帳號營運。與本次規則衝突的舊 phase／route
> 說明只保留歷史參考。

## 1. 路由總覽

正式目標路由與交付階段：

| Route                                             | Audience/guard                                         | Owner                 | Owning phase                          |
| ------------------------------------------------- | ------------------------------------------------------ | --------------------- | ------------------------------------- |
| `/`                                               | Public                                                 | App shell             | Existing foundation                   |
| `/login`                                          | Public; authenticated users redirect by role           | `auth`                | Existing foundation                   |
| `/join/:joinCode?`                                | Public intent only; content remains hidden before Auth | `classrooms`          | Phase 3                               |
| `/unauthorized`                                   | Public-safe error                                      | App shell             | Existing foundation                   |
| `*`                                               | Public-safe not-found                                  | App shell             | Existing foundation                   |
| `/app`                                            | Authenticated Student/Teacher                          | Student dashboard     | Phase 5; currently chapter selector   |
| `/app/chapters`                                   | Authenticated Student/Teacher                          | `learning`            | Phase 5 migration of current selector |
| `/app/chapters/:chapterId`                        | Authenticated Student/Teacher                          | `learning`            | Phase 5                               |
| `/app/chapters/:chapterId/topics/:topicId/review` | Authenticated Student/Teacher                          | `learning`            | Phase 5                               |
| `/app/quiz/:sessionId`                            | Session owner                                          | `quiz`                | Existing playable slice               |
| `/app/quiz/:sessionId/result`                     | Session owner; finalized result                        | `quiz`                | Existing playable slice               |
| `/app/assignments`                                | Authenticated Student                                  | `assignments`         | Phase 4                               |
| `/app/assignments/:assignmentId`                  | Assigned active member                                 | `assignments`         | Phase 4                               |
| `/app/mistakes`                                   | Authenticated Student                                  | `remediation`         | Phase 5                               |
| `/app/progress`                                   | Authenticated Student                                  | `progress`            | Phase 5                               |
| `/app/achievements`                               | Authenticated Student                                  | `achievements`        | Phase 2/5                             |
| `/app/shop`                                       | Authenticated Student                                  | `inventory`           | Phase 1                               |
| `/app/leaderboard`                                | Authorized classroom member                            | `leaderboard`         | Phase 3                               |
| `/app/profile`                                    | Own profile                                            | `profile`             | Existing foundation/Phase 5           |
| `/app/live/join`                                  | Authenticated Student                                  | `live`                | Phase 4                               |
| `/app/live/:sessionId`                            | Active participant                                     | `live`                | Phase 4/7                             |
| `/teacher`                                        | Teacher role                                           | Teacher workspace     | Phase 6                               |
| `/teacher/classes`                                | Teacher role                                           | `classrooms`          | Phase 3                               |
| `/teacher/classes/:classroomId`                   | Owning teacher                                         | `classrooms`          | Phase 3                               |
| `/teacher/classes/:classroomId/assignments`       | Owning teacher                                         | `assignments`         | Phase 4                               |
| `/teacher/live`                                   | Teacher role                                           | `live`                | Phase 4                               |
| `/teacher/live/:sessionId`                        | Host/owning teacher                                    | `live`                | Phase 4/7                             |
| `/teacher/content`                                | Authorized teacher                                     | `teacher` content     | Phase 6                               |
| `/teacher/content/imports/new`                    | Authorized teacher                                     | `teacher` import      | Phase 6                               |
| `/teacher/content/imports/:importId`              | Import owner                                           | `teacher` import      | Phase 6                               |
| `/teacher/analytics/:classroomId`                 | Owning teacher                                         | `teacher` analytics   | Phase 6                               |
| `/teacher/exports`                                | Authorized teacher/research scope                      | `teacher` export      | Phase 8                               |
| `/teacher/integrations/kahoot`                    | Owning teacher                                         | `external_activities` | Phase 6                               |
| `/admin/mfa/enroll`                               | Admin identity pending MFA                             | Admin security        | Phase 1                               |
| `/admin/mfa/challenge`                            | Active Admin identity; pre-privileged                  | Admin security        | Phase 1                               |
| `/admin`                                          | Active privileged Admin                                | Admin security        | Phase 1/Admin B                       |
| `/admin/access/admins`                            | Active privileged Admin                                | Admin security        | Phase 1/Admin B                       |
| `/admin/access/invitations`                       | Active privileged Admin                                | Admin security        | Phase 1/Admin B                       |
| `/admin/access/sessions`                          | Active privileged Admin                                | Admin security        | Phase 1/Admin B                       |
| `/admin/data/:domain/:resource`                   | Active privileged Admin + catalog                      | Admin safe browser    | Phase 1/Admin B                       |
| `/admin/data/:domain/:resource/:rowKey`           | Active privileged Admin + catalog                      | Admin safe browser    | Phase 1/Admin B                       |
| `/admin/audit`                                    | Active privileged Admin                                | Admin security        | Phase 1/Admin B                       |
| `/admin/health`                                   | Active privileged Admin                                | Admin security        | Phase 1/Admin B                       |
| `/admin/invitations/accept`                       | Authenticated invitee; pre-privileged                  | Admin security        | Admin B                               |
| `/admin/teachers`                                 | Active privileged Admin                                | Teacher operations    | Admin B                               |
| `/admin/teachers/:teacherId`                      | Active privileged Admin                                | Teacher operations    | Admin B                               |

所有 `/app/*` 需 authenticated student 或 teacher；`/teacher/*` 需 teacher
membership／ownership 檢查；除 invitation acceptance／MFA pre-privileged routes
外，`/admin/*` 需 active privileged Admin。只隱藏導覽按鈕不算權限控制。

每個 route 同時需要 React guard 與 RLS／RPC／Edge Function authorization。未交付 route 不得先放假資料頁面冒充完成。Teacher heavy routes 採 route-level lazy loading，不進 student initial bundle。

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

### AUTH-Flow-03：Admin 建立教師帳號

- 教師不開放自助註冊；只有 active privileged Admin 可建立、更新或重設。
- Admin 只輸入教師名稱與 optional contact Email；`teacherNN` 帳號與一次性初始
  密碼由後端產生。
- Contact Email 不是登入識別，也不能啟動學生的自助密碼復原流程。
- 建立／重設回應只顯示一次秘密；原密碼永遠不可查看或復原。
- Auth user、profile 與操作紀錄跨系統不具單一 ACID transaction，必須使用
  fail-closed saga、補償與 reconciliation，不能留下可登入但無合法 teacher
  profile 的半成品。

## 3. 學生核心流程

### STU-Flow-01：學習大廳

大廳顯示：

- 使用者暱稱、Blook、Level、目前 XP、Token。
- 已加入班級與目前課程。
- 已發布且 content-ready 的章節、完成與精熟狀態；章節彼此不相互鎖定。
- 班級排行榜摘要。

不可顯示：未發布內容、其他班級資料、教師私密備註。

### STU-Flow-02：章節與小節

- 產品文案的「小節」對應資料模型 `section`；`subtopic` 只作 section 內部內容
  分類，不構成使用者可見的解鎖層級。
- 章節頁保留完整小節與複習卡全貌。鎖定節點可見但不可操作，並顯示非色彩
  的鎖定指示與原因。
- 第一小節起依 `section.sort_order` 解鎖；每小節內的複習卡依正式順序逐張
  解鎖。本小節全部 current-required cards 完成後，才可建立本小節挑戰。
- 本小節挑戰完整交卷後，不論成績，下一小節可閱讀；各小節最佳 qualifying
  answer rate（`correct_count / question_count * 100`）皆達 80% 後，才可建立
  章節總挑戰；速度加權 Quiz Score 不參與此 gate。
- 章節總挑戰完整交卷即為「已完成」；最佳 qualifying percentage 達 80% 才為
  「已精熟」。結果不影響其他章節存取。
- 既有 section 新增 required card 時，只有 cutoff 前已 committed server-valid、
  同 section finalized challenge 的學生豁免，不論分數；卡片標示「新增內容
  （非必修）」且可選讀，不偽裝成完成。其他學生與新學生仍依正式順序
  必讀，cutoff 後 finalize 不能追溯取得豁免。
- 小節挑戰只從所選 `section` 的 published `bank_kind='section'` 題池抽題；章節
  總挑戰只從該章 published `bank_kind='chapter'` 題池抽題。題數不足 template
  目標時顯示並使用真實題數。

### STU-Flow-03：複習卡

- 依正式 section/card 順序顯示；已完成卡可回顧，尚未輪到的卡不可取得正文
  或 media。唯一例外是 server 判定的 `grandfather_exempt` inserted card，可選讀但
  不阻擋進度。
- 支援純文字、圖片、色票示例與必要的替代文字。
- 未完成卡必須到達閱讀器最後一頁，才顯示／啟用「完成複習」；只有主動按下
  並取得後端 committed 結果才算完成。翻到最後一頁本身不自動完成。
- 回顧已完成卡不更新原完成時間、不重複發獎，也不重新鎖定後續內容。
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

### STU-Flow-08：Assignments

1. 學生只看到自己 active membership 的有效 assignment。
2. 後端以 UTC 判定 availability/deadline/attempt limit，UI 以 `Asia/Taipei` 顯示。
3. 開始 assignment 建立或引用 authoritative quiz/Live session。
4. 完成狀態、分數與通過規則由後端 finalized session 推導，不由前端寫入。
5. Refresh 回到同一可恢復 session；過期或超過次數時顯示 terminal state。

### STU-Flow-09：ColorPlay Live

1. 已登入學生從 `/join/:joinCode?` 保留加入意圖，登入後才驗證 hashed join code 與 classroom membership。
2. Lobby 顯示安全暱稱/Blook 與連線狀態，不顯示 Email 或答案。
3. Question open 後依 server deadline 作答；學生不可觸發 host transition。
4. 斷線時停止送出、重連 private channel、呼叫 authoritative state API，依 `state_version` 對齊。
5. Completed 後讀取 server-authoritative result/rank/reward；不得以 Realtime 訊息直接發獎。

Anonymous Live participation、固定 PIN、Kahoot branding 或官方 API 依賴不在範圍內。

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

篩選包含：班級、日期範圍、章節、section／subtopic、題目、activity mode。

指標：

- completed session attempts。
- distinct active students。
- first formal answer accuracy。
- current mastery。
- mean non-timeout server response time。
- timeout terminal answers／expected answers。
- answered-with-hint／answered questions。
- resolved／entered remediation items。
- completed assigned students／active assigned members。
- Live participants／active classroom members。
- option selections／submitted answers。
- incorrect plus timeout／terminal answers。

所有指標需有明確分母；無資料時顯示 `—`，不得顯示誤導性的 0%。

### TCH-Flow-05：研究資料匯出

- 教師只能匯出自己管理班級。
- 匯出包含 schema version、產生時間、時區與欄位說明。
- 預設使用 pseudonymous user ID，不包含 Email。
- 若需識別資料，必須有額外權限與明確 UI 警告。

### TCH-Flow-06：Assignments 與 Live host

- Teacher 只能建立、發布、暫停或封存自己 classroom 的 assignment。
- Live host 只能操作自己建立且仍授權的 session；狀態版本衝突時必須重新讀取，不可覆寫。
- Live host refresh/斷線後從 authoritative state 恢復；另一分頁不可對同一 `state_version` 推進兩次。
- Optional Kahoot compatibility 只保存教師擁有的外部 URL、關聯 scope、availability/status；不保存假 PIN、不匯入外部成績。

## 4A. Admin B 核心流程

### ADM-Flow-01：安全控制台

1. 受邀 Admin 以已登入且 Email 綁定正確的 identity，在 pre-privileged route
   接受一次性 invitation。
2. 完成 MFA enrollment／challenge 後才建立 privileged session。
3. Admin 由導覽進入總覽、身分與存取、七個 safe-browser domains、稽核、健康。
4. 列表使用 server cursor；denial／partial failure 顯示 safe message、request ID
   與 retryability。
5. Health 只對允許 manual retry 的 operation 提供按鈕；OOB-only 顯示 runbook
   guidance，不提供繞過。

### ADM-Flow-02：教師帳號營運

1. Admin 在教師列表選「建立教師帳號」，輸入名稱、optional contact Email、reason。
2. 二次確認後，後端配發 `teacherNN`、產生密碼並完成 Auth/profile/audit saga。
3. 成功時顯示一次性 account/password receipt；離開後無法回看密碼。
4. Detail 可更新名稱/contact Email；role 與 login account 唯讀。
5. 重設密碼需 fresh MFA、reason 與二次確認；成功後舊密碼失效，回新的一次性
   receipt。
6. Pending／部分失敗以 operation ID 進入 reconciliation，不重複建立帳號或顯示
   未 committed 的秘密。

## 5. 路由與恢復規則

- Browser refresh 後應恢復合法 route 與 session。
- 未登入存取受保護 route：導向 `/login`，登入後回原目標。
- Student 存取 teacher route：導向 `/unauthorized`，且後端請求必須被拒絕。
- 已 finalize quiz 不得回到可作答狀態。
- 進行中 quiz 重新整理後需恢復同一 session 與目前未答題狀態，不得重抽、重發獎。
- Join intent 登入後才解析；驗證失敗不得洩漏 classroom 名稱或成員。
- Live reconnect 必須依 `state_version` 取得同一 session 的最新 server state。

## 6. 錯誤與離線體驗

- Query error 提供重試按鈕。
- Mutation pending 時防止重複點擊，但仍由 idempotency 保護。
- 網路中斷提交答案：保留畫面並允許安全重試；不得先在前端發正式獎勵。
- Session 過期：提示重新登入，保留可恢復的非敏感 route context。
- 全域 error boundary 顯示可恢復畫面與追蹤 ID，不顯示 stack trace。
- 每個 route 明確呈現 loading、empty、recoverable error、permission、offline/reconnecting、pending、success；不得空白。
- 可安全讀取的 Query 最多自動重試兩次；Auth、permission、validation、not-found 不重試。
- Mutation timeout 只有在保留原 idempotency key 並先查 command status 後才能重試。
- UI 只呈現後端 committed 結果，不預測 Quiz／Live 正誤、正式分數、XP、Token 或 rank。
