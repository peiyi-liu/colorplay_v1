# 遊戲式學習機制規格

## 1. 設計目的

遊戲機制的目的是提高持續練習、即時回饋與錯誤修正意願，不得犧牲內容正確性、可近用性或以不透明機制誘導學生。

本文件中的數值是 MVP 基準。任何變更都必須：

1. 修改本文件與驗收案例。
2. 建立 migration／config version。
3. 保留歷史 session 使用的規則版本。
4. 不得只改前端顯示。

## 2. 名詞分離

- **Quiz Score**：單次挑戰表現分數，只用於該次結果與可能的挑戰排名。
- **XP**：長期累積經驗值，用於 Level。
- **Token**：可消費虛擬代幣，用於購買 Blook。
- **Accuracy**：答對題數 ÷ 有效題數。
- **Response time**：server 認定的題目開始至答案接收時間。

UI 不得將上述三種數值混稱為「積分」。

## 3. Quiz 基本規則

- 預設每題時間：20.0 秒。
- 章節綜合挑戰目標題數：10 題。
- 若有效題目少於 10 題，實際題數為全部有效題目，UI 顯示真實數量。
- 題目與選項順序由後端 session 建立時固定。
- 同一 session 重新整理不重新抽題。
- 每一 session question 只有一個 terminal state：correct、incorrect、timeout。

## 4. 計分公式

### 正確答案

- Base Quiz Score：100。
- 若 server response time ≤ 5,000 ms：Speed Bonus +50。
- 若 > 5,000 ms 且 ≤ deadline：無 Speed Bonus。

### XP

- 正確：+50 XP。
- 正確且 ≤ 5,000 ms：額外 +25 XP。
- 錯誤／逾時：0 XP。

### Token

- 正確：+15 Token。
- 正確且 ≤ 5,000 ms：額外 +10 Token。
- 錯誤／逾時：0 Token。

### 範例

| 結果 | Quiz Score | XP | Token |
|---|---:|---:|---:|
| 4.2 秒答對 | 150 | 75 | 25 |
| 8.7 秒答對 | 100 | 50 | 15 |
| 答錯 | 0 | 0 | 0 |
| 逾時 | 0 | 0 | 0 |

後端回傳 delta；前端只顯示，不自行重算正式結果。

## 5. Level

MVP 等級公式：

```text
level = floor(total_xp / 500) + 1
current_level_xp = total_xp mod 500
```

- Level 最小為 1。
- Level 無硬上限，但 UI 必須能處理至少 Level 999。
- XP ledger 不允許負數交易，除非未來有明確 admin reversal reason。

## 6. 錯誤回饋

答錯或逾時後：

- 顯示本人答案或「未作答（逾時）」。
- 顯示正解與解析。
- 提供「我理解了，下一題」明確操作。
- 在確認前禁用其他選項，不可繼續修改正式答案。
- 下一題開始時錯誤解析卡必須關閉且狀態清空。

解析須以教學為目的，不得只寫「答案是 B」。

## 7. 逾時

- deadline 由後端 session question 的 server timestamp 決定。
- UI timer 是提示，不是最終判定。
- deadline 後答案提交由後端記為 timeout 或拒絕並回傳 authoritative timeout。
- 逾時只能產生一筆 answer。
- 改本機時鐘、暫停 DevTools 或改 timer state 不得延長正式時間。

## 8. 重複練習與刷獎勵

MVP 採「練習可重複、獎勵有限」：

- 同一使用者、同一 quiz template、同一 `Asia/Taipei` 日曆日：前 3 次 completed session 獲得 100% XP 與 Token。
- 第 4 次起：Quiz Score 正常計算，XP 為 `floor(原 XP × 0.20)`，Token 為 0。
- 錯題專項練習不消耗前三次額度，但預設不發 Token，XP 為 `floor(原 XP × 0.20)`。
- 教師可對特定正式活動設定 `reward_mode = none/full/practice`，但 session 建立後固定。

此規則由後端查詢 session history 計算，前端傳入的 attempt number 不可信。

## 9. Quiz finalize

- Session 全部題目 terminal 後才能 completed。
- `correct_count`, totals 與 accuracy 由資料庫 answers 聚合。
- finalize 可安全重送，第二次回傳相同結果。
- abandoned／expired session 不進正式排行榜；其已產生的逐題獎勵策略需固定。MVP 建議只有 completed 時一次性發放 reward，避免半途退出套利。若採逐題發獎，必須另有 ADR。

**MVP 決策：獎勵於 finalize 後一次性發放。** Quiz answer 僅記錄 provisional delta；finalize 在 transaction 內寫入 XP／Token ledger。未完成 session 不發獎。

## 10. 排行榜

### MVP 主排行榜

- 範圍：classroom。
- 指標：`total_xp earned while member of classroom`。
- 顯示 Top 10 + 目前使用者自身名次。
- Tie-breaker：XP DESC、首次達到該 XP 的時間 ASC、user_id ASC。
- 更新延遲：正常情況 ≤ 5 秒。

### 隱私

只顯示：display name、active Blook、XP、rank。不得顯示 Email、學號、作答明細。

### 防作弊

排行榜不得接受 client score。數值由 ledger／server aggregation 產生。

## 11. Blook 商店

初始清單：

| 名稱 | 顯示 | Cost |
|---|---|---:|
| 小狐狸 | 🦊 | 0 |
| 招財貓 | 🐱 | 100 |
| 旅行蛙 | 🐸 | 250 |
| 智慧鴞 | 🦉 | 500 |
| 原色獅 | 🦁 | 1000 |
| 彩虹馬 | 🦄 | 2000 |

規則：

- 免費預設 Blook 在 profile 建立時自動擁有。
- 購買為原子交易。
- 已擁有項目顯示「選用」，不得再次購買。
- 餘額不足顯示所差 Token 數。
- 裝備變更不收費。

## 12. 動機與倫理限制

- 不使用 loot box、隨機付費、連續登入懲罰或負向羞辱。
- 排行榜提供教師關閉或匿名顯示選項。
- 學生可選擇 reduced motion。
- 答錯回饋不得使用羞辱文案或強烈閃爍。
- 不以 Token 兌換真實金錢或實體利益，除非另行倫理與法規審查。

## 13. 規則版本

每個 quiz session 保存 `game_rules_version`，例如 `2026-07-mvp-1`。結果頁與 export 可追溯該版本，避免日後調整規則後無法重現舊資料。

Assignment、remediation、Live 同樣保存適用 rules/content version；歷史結果不得用目前規則重算。

## 14. Learning progress

Progress 是多個獨立量測，不得把不相干數字拼成假百分比。第一版規則為 `2026-07-progress-1`。

### Review completion

```text
review_completion = completed current published review-card versions
                    / current published review-card versions * 100
```

- Completion 需學生明確操作並由 secure command 記錄。
- 新 card version 只有在 `requires_recompletion = true` 時要求重做。
- 無 published card 時顯示 `—`，不是 0%。

### Coverage、accuracy、mastery

每個 current published question version 只取學生 latest qualifying answer。Qualifying 來源是 completed practice、assignment、remediation；abandoned、expired、unfinished、old-version、Live 不計。

```text
coverage = answered current versions / current published versions * 100
accuracy = latest correct versions / answered current versions * 100
mastery = coverage * accuracy / 100
```

- `not_started`：沒有 qualifying answer。
- `learning`：mastery 1–59。
- `developing`：mastery 60–79。
- `mastered`：mastery 80–100。
- Chapter 聚合以全部 current published question versions 計算，不平均 subtopic percentages。
- Chapter completion 需要 review completion 100%、mastery ≥ 80、且沒有 blocking required assignment。
- Live answer 不改 mastery，避免即時競賽速度／題組污染正式學習進度。

## 15. Hints、mistakes 與 remediation

- Formal quiz/assignment 每題仍只有一筆正式 answer。
- 作答前最多 request three hints；server 依序記錄 `hint_events`，hint 不得洩漏正解。
- 第一版 hint 不扣 Quiz Score、XP 或 Token；規則變更需新 rules version。
- Multiple attempts 只存在 remediation，不回寫原始 answer、Quiz Score 或結果頁。
- Remediation 不發 Token；XP 使用現有 practice 20% 規則，不消耗每日前三次 full reward 額度。
- Qualifying finalized remediation 可更新 mastery，並將 mistake item `open -> resolved`；後續 current-version 錯誤可 `resolved -> reopened`。

## 16. Achievements

初始 catalog 只授 badge，不授 XP／Token；unlock append-only 且不撤銷。

| Stable code | Display name | Server condition |
| --- | --- | --- |
| `first_task_complete` | 初出茅廬 | first completed quiz or assignment |
| `first_perfect_quiz` | 百發百中 | first completed quiz at 100% accuracy |
| `mistakes_resolved_10` | 不屈不撓 | ten distinct resolved mistake items |
| `chapter_mastered_1` | 章節精熟 | first mastered chapter |
| `all_chapters_mastered` | 色彩大師 | all six chapters mastered |
| `level_10` | 登峰造極 | authoritative level at least 10 |
| `correct_streak_20` | 連擊之王 | twenty consecutive qualifying correct answers |
| `live_complete_5` | 課堂挑戰者 | five completed Live sessions |
| `blooks_owned_6` | 收藏家 | six initial Blooks owned |

- Rule 使用 validated enum type + versioned parameters，不執行 arbitrary SQL/JavaScript。
- Progress/unlock 只由 trusted quiz、economy、assignment、Live、progress event 評估；browser 不可要求 unlock。
- 同 user/definition/source 重送回原結果，不產生第二個 unlock。
- 未解鎖 hidden rule 不向 student payload 洩漏內部 threshold/condition；可公開項目由 definition visibility 決定。
- Correct streak 包含 formal quiz、assignment、Live correct；incorrect/timeout reset；remediation 不計。
- `case_expert` 不支援，因為沒有核准的 case-mission subsystem。

## 17. Assignments and ColorPlay Live

### Assignments

- Owning teacher 設定 availability、UTC deadline、attempt limit、passing/reward rule；session 建立後凍結適用版本。
- Student 必須是 active target/member；跨班級 request 被拒絕。
- Attempt 引用 finalized quiz 或 Live session，不複製 client score。
- Completion、pass、reward 由 trusted finalize transaction 推導；重送不得重複完成／發獎。

### ColorPlay Live

- State machine 是 `draft -> lobby -> question_open -> question_feedback -> ... -> completed`，各 active state 可由 server policy轉 `cancelled`。
- 只有 owning host 可 start/open/close/advance/finalize/cancel，並以 `state_version` 防雙分頁重複推進。
- Authenticated active member 才能 join/answer；server deadline、hidden answer、response time、score/rank/reward 全由後端決定。
- 同 participant/question 只有一筆 authoritative answer；idempotency key 重送回原結果。
- `finalize_live_session` 原子計 score/rank/reward/achievement/assignment/progress/audit；rollback 不留部分結果。
- Rank 只顯示 privacy-safe display name、Blook、score/rank；不顯示 Email、學號或 raw answers。
- Live Core 使用同一 XP/Token ledger source contract；Live 不計入 mastery。Phase 7 另以核准規格擴充 team mode、pause/resume 與 capacity。
- Optional Kahoot URL 是 external compatibility，不使用 official API，不把 external result 當 ColorPlay Score／XP／Token。
