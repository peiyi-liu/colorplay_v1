# 規劃：Claude Design「教師端 Live 主持優化方案」落地（2026-07-25）

設計稿來源：`/colorplay/live/project/ColorPlay 現有畫面.dc.html`（claude.ai/design handoff，2026-07-25T13:09 依 repo 現況重建）。
本文件為實作前規劃，**尚未寫任何程式**。

## 一、差異總覽（設計稿 vs 現有程式）

設計稿共 36 個畫面，其中絕大多數是「依 repo 現況重建」——教師登入（含班級序號）、Live 開場／主持台／投影三態／頒獎台、學生 Live（六碼加入、形狀鍵、連擊、教師引導解析、全屏對錯）、場次報表（逐題分析、作答矩陣、CSV、一鍵複習任務）、教師工作區（班級選擇、Live hero、班級總覽、功能捷徑）、加入碼版本與輪替、大廳統計（XP／全體排名／PR）皆已在 Phase 9-AUTH＋10A–10E＋UI v2 批上線，**無需後端變更，僅需視覺收尾比對**。

真正的增量共 6 項：

| # | 項目 | 類型 | 前端 | 後端 |
|---|------|------|------|------|
| D1 | 班級成員表欄位擴充（名字／學號／暱稱／查看細節） | 修改 | teacher-classroom-detail-page | 擴充 `list_owned_classroom_members` |
| D2 | 學生學習進度頁（教師視角，全新畫面 tStudentProgress） | 新增 | 新頁＋新路由 | 新 RPC `teacher_student_progress` |
| D3 | Live 題間名次激勵文案（「再追一題就能進前二！」） | 新增 | live-session-page | 無（`live_my_standing` 已回傳 `ahead_rank`/`points_behind`） |
| D4 | 教師導覽精簡（移除「題庫管理」，順序改為 工作區→Live 主持→班級管理→教學分析） | 修改 | app-shell | 無 |
| D5 | 場次報表文案／門檻：「建議重教 <35%」→「請加油 <60%」 | ⚠️ 待 owner 確認 | teacher-live-report-page | `RETEACH_THRESHOLD` 常數（前端 lib） |
| D6 | 全站視覺收尾比對（琥珀主持台底色、報表提醒底色、正解長條放大等） | 微調 | 各頁 CSS | 無 |

另有內容項待確認：tLive 單元下拉出現「3-3 數位色彩與色票的表示（**暫定，待教師確認**）」——是否要新增 3-3 小節題庫屬內容決策，不在本批工程範圍。

## 二、逐畫面 × 功能鍵 → 後端對應表

標記：✅ 後端已存在｜🆕 需新增／擴充｜➖ 純前端。

### 學生端

| 畫面 | 功能鍵／行為 | 後端 | 狀態 |
|------|------------|------|------|
| 學生登入 | 登入 | Edge Fn `auth-login` | ✅ |
| 學生註冊 | 送出＋OTP 驗證（60s 重送倒數） | Edge Fn `student-register` | ✅ |
| Live 加入 | 加入課堂（六碼） | `join_live_session`（含 rate-limit） | ✅ |
| Live 作答 | 形狀鍵送出 | `submit_live_answer`＋`live_answer_streak_apply` | ✅ |
| Live 作答 | 倒數（伺服器時間為準）／題目載入 | `get_live_session_state`＋`live_question_student_payload` | ✅ |
| Live 題間 | 對錯＋得分＋分布＋教師引導解析 | `live_feedback_snapshot` | ✅ |
| Live 題間 | 目前名次／累積分 | `live_my_standing` | ✅ |
| Live 題間 | **激勵文案「再追一題就能進前 N！」** | 同上（`ahead_rank`、`points_behind` 與單題可得分比較） | ➖ D3 |
| Live 全屏結果 | 綠勾／紅叉＋加分＋名次 | `live_feedback_snapshot` | ✅ |
| 學習大廳 | XP／全體排名／PR、章節開放狀態 | 既有 economy/progress RPC | ✅ |

### 教師端

| 畫面 | 功能鍵／行為 | 後端 | 狀態 |
|------|------------|------|------|
| 教師登入 | 帳號＋密碼＋班級序號 | Edge Fn `auth-login`（Phase 9-AUTH） | ✅ |
| 教師工作區 | 選擇班級下拉 | `list_owned_classrooms` | ✅ |
| 教師工作區 | 班級總覽（次數／人數／平均正確率）＋最需加強子題 | `teacher_classroom_summary`＋`teacher_subtopic_mastery` | ✅ |
| 教師工作區 | 前往主持 ▶／功能捷徑 | 導頁 | ➖ |
| Live 開場 | 選擇單元下拉 | `list_live_section_options` | ✅ |
| Live 開場 | 建立活動並開場 | `create_live_activity`→`create_live_session`→`start_live_session` | ✅ |
| 主持台 | 已作答 n/N＋即時分布（僅主持人） | `teacher_live_session_detail`＋`live_question_distribution` | ✅ |
| 主持台／投影 | 收題並公布答案 | `live_close_open_question` | ✅ |
| 主持台／投影 | 下一題 | `live_open_next_question` | ✅ |
| 主持台／投影 | 暫停／繼續 | `pause_live_session`／`resume_live_session` | ✅ |
| 主持台／投影 | 取消挑戰 | close/cancel transition（`close_live_question` 家族） | ✅ |
| 投影 | 音效開關 | 前端 `live-audio-cue` | ➖ |
| 投影・分布 | 長條圖＋正解強調＋Top5（↑↓—） | `live_question_distribution`＋`live_session_standings` | ✅ |
| 投影・頒獎 | 頒獎台動畫→結算成績 | `live_session_standings`＋結算（含 `live_session_mistakes_on_complete` 錯題寫入） | ✅ |
| 場次報表 | 逐題分析／作答矩陣／最終排名 | `teacher_live_session_report` | ✅ |
| 場次報表 | 匯出 CSV | 前端 `report-export` | ➖ |
| 場次報表 | 一鍵生成課後複習任務 | 既有 assignment 草稿 RPC（10E） | ✅ |
| 場次報表 | 「請加油（<60%）」 | 前端 `RETEACH_THRESHOLD` | ⚠️ D5 |
| 班級管理 | 建立班級／清單 | `create_classroom`／`list_owned_classrooms` | ✅ |
| 班級成員 | 一次性加入碼＋版本＋複製＋輪替 | `rotate_classroom_join_code`（版本已存在） | ✅ |
| 班級成員 | 成員表：**名字／學號／暱稱**／Blook／狀態／加入日期 | `list_owned_classroom_members` **v2** | 🆕 D1 |
| 班級成員 | **查看細節 ›**（每列） | 導向 D2 新頁，key 用 membership id | 🆕 D1 |
| **學生學習進度（新頁）** | 統計卡＋章節進度表＋待補救錯題 | **新 RPC `teacher_student_progress`** | 🆕 D2 |
| 導覽列 | 移除「題庫管理」（路由保留，開發者可直達 URL） | 無 | ➖ D4 |

## 三、後端變更規格（僅 D1、D2 需要 migration）

### D1：`list_owned_classroom_members` v2

新 migration（如 `20260726000100_classroom_member_projection_v2.sql`）：

- 回傳表增加三欄：`member_id uuid`（classroom_members 列 id，作為 opaque 識別碼）、`full_name text`、`login_account text`（學號）。
- 維持設計稿隱私承諾：「不包含 Email 或使用者識別碼」→ **不得**回傳 `user_id`／email；`member_id` 為 membership 列 id，僅在該班脈絡有意義。
- 權限不變：owner teacher only、`security definer`、`set search_path = pg_catalog, public`、revoke public/anon。
- 相容性：回傳型別變更需 `drop function` + 重建，前端 repository 同步更新型別。

### D2：`teacher_student_progress(p_classroom_id uuid, p_member_id uuid) returns jsonb`

同批或獨立 migration（如 `20260726000200_teacher_student_progress.sql`）：

- 守門：`auth.uid()` 非空 → 老師擁有該班 → `p_member_id` 屬於該班。違反一律 `42501`。
- 回傳結構（全部由伺服器依權威作答紀錄計算，對齊設計稿文案）：
  - `identity`: `{ full_name, login_account, display_name }`
  - `stats`: `{ total_xp, class_rank, avg_accuracy, open_mistake_count }`（`class_rank` 沿用 `get_classroom_leaderboard` 排序規則）
  - `chapters[]`: `{ chapter_title, review_done, review_total, coverage_pct, accuracy_pct, mastery_pct, status }`，status ∈ 已精熟／學習中／尚未開始（門檻沿用學生端 `get_learning_progress` 既有規則，兩端數字必須一致）
  - `mistakes[]`: `{ question_stem, subtopic_label, wrong_count }`（僅未結案 mistake_items）
- 資料來源：`learning_progress`／mastery sessions、`mistake_items`、`review_progress`、economy XP——重用 `get_learning_progress` 與 `teacher_subtopic_mastery` 的內部邏輯，避免第二套精熟度演算法。

### D2 路由與頁面

- 路由：`/teacher/classes/:classroomId/members/:memberId`（既有 teacher guard 之下）。
- 新頁 `src/features/classrooms/pages/teacher-student-progress-page.tsx`：
  - Header：徽章「教師班級管理・{班名}」＋「{名字} 的學習進度」＋學號／暱稱副標＋「← 回班級成員」。
  - 四張統計卡（待補救錯題卡用紅色左框 `#d64533`）。
  - 章節進度表（精熟度含黃色進度條）＋狀態 pill（綠已精熟／黃學習中／灰尚未開始）。
  - 待補救錯題卡列（黃左框、`#fffdf2` 底）。
- repository：classrooms feature 增加 `fetchStudentProgress`，React Query key 掛在 classroom scope 下。

## 四、純前端變更（無 migration）

- **D3** `live-session-page.tsx`：題間回饋在 `rank > 1 && points_behind ≤ 單題最高可得分` 時顯示「再追一題就能進前 {ahead_rank}！」（綠 `#128a5e`），資料已在 standing 回傳中。
- **D4** `app-shell.tsx`：教師列改為 教師工作區→Live 主持→班級管理→教學分析（移除題庫管理；`/teacher/content`、`/teacher/import` 路由保留）。
- **D5**（待確認後執行）`report-export.ts`：`RETEACH_THRESHOLD` 35→60；報表標題「建議重教」→「請加油」。CSV 匯出與 10E 驗收文件同步更新。
- **D6** 視覺收尾：對照設計稿逐頁 screenshot 比對，重點：主持台卡底 `#fdf8ee`＋琥珀邊框、報表提醒區 `#fef3c7`、投影分布正解列 `scale(1.06)`＋`outline #128a5e`、頒獎台三段延遲動畫（0s／1.2s／2.4s）、教師紫 `#7b48ce` 徽章與導覽一致性。

## 五、實作順序與驗證

1. **批一（D1＋D2，含 DB）**：migration → pgTAP（owner-only 42501、member_id 不洩漏 user_id、數字與學生端一致）→ repository → 兩頁前端 → 單元測試 → visual check。
2. **批二（D3＋D4＋D6，純前端）**：逐項改＋既有測試更新（app-shell 導覽測試需調整）。
3. **批三（D5）**：待 owner 拍板 35%→60% 後一併改文案與門檻。
4. GATE：`pnpm test`（worktree 範圍）＋typecheck＋lint＋Playwright 快照；staging 先套 migration 再部前端（沿用既有慣例）。

## 六、待 owner 確認（兩題）

1. 報表門檻是否從 35% 改為 60%、標題改「請加油」？（D5，影響 10E 規格）
2. 「3-3 數位色彩與色票的表示」是否確定新增？設計稿標示「暫定，待教師確認」。
