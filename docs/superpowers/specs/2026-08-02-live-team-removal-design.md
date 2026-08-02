# Live 團隊/排程殘骸移除 — 設計規格

- 日期：2026-08-02
- 狀態：owner 已核准（11:15 口頭 OK；範圍經三輪裁定收斂）
- 來源：owner 0802「請移除 live 課堂 team 模式/排程功能」＋「也移除公會團體戰」→ 澄清後裁定「改語彙不拆畫面」；經盤點確認團隊作戰語彙僅存在於 team 模式殘骸本身，兩案合一。

## 1. 背景與裁定紀錄

- team 模式（分隊計分）與排程（預約開場）的 UI 入口已於 0726 一鍵式建立改版時消失；能力殘留在前端 API 層與顯示分支、以及 DB（7 支 migrations＋pgTAP 033）。
- owner 三輪裁定：
  1. 移除深度＝**前端全清、DB 零接觸**（曾考慮連 DB 拆除，因動計分/finalize 鐵律區改回）。
  2. 歷史團隊場次顯示分支＝**一併刪**（正式站若有舊團隊場次，報表以個人樣式顯示、隊伍資訊不再呈現——owner 已知悉接受）。
  3. 「公會團體戰」＝批⑤a 投影視覺的內部企劃代號，**畫面不拆**；已驗證（grep 全 src 非測試檔）該詞與「軍勢」等團隊作戰語彙**零出現**於使用者可見字串——移除 team 殘骸即語彙歸零。

## 2. 移除清單（已逐檔盤點）

### 元件與頁面

| 檔案                                                                                   | 動作                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/live/components/live-team-scoreboard.tsx`                                | 整檔刪除（`隊伍計分板` 唯一出處）                                                                                                                                                                                   |
| `src/features/live/pages/live-session-page.tsx`（:17 import、:378/:413/:423 三處使用） | 刪 import 與三處 `<LiveTeamScoreboard>` 及其條件分支                                                                                                                                                                |
| `src/features/live/pages/teacher-live-report-page.tsx`（:52）                          | 刪整個 mode 標示（含 `'團隊模式' : '個人模式'` 三元式與其後的 `・` 分隔符——全場次皆個人，標示已無意義），該行保留「逐題數字由伺服器從權威作答紀錄計算。」；刪排名 li 的 `・第 {teamNumber} 隊` 段。批⑤b 獎牌 ★ 保留 |
| `src/styles/globals.css`                                                               | 刪 `.live-team-scoreboard*` 規則                                                                                                                                                                                    |

### API 層（型別/schema/repository/hooks）

| 檔案                                                                                                                         | 動作                                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/features/live/types.ts`（:19 scheduledFor、:38/:74/:153/:210 mode、:61/:90/:97 teamNumber、:239 scheduleActivity 簽名） | 移除上述欄位與方法簽名                                              |
| `src/features/live/api/live-repository.ts`                                                                                   | 移除 mode/teamCount/scheduledFor 解析與 `scheduleActivity`          |
| `src/features/live/hooks/use-live-commands.ts`（:85/:106 附近）                                                              | 移除 scheduleActivity hook 與 createActivity 的 mode/teamCount 傳遞 |

### 測試同步（盤點 task 出授權清單後才可動）

team 字樣出現於 8 支測試檔：`live-presenter.test.tsx`、`use-live-session.test.tsx`、`live-phase-view.test.ts`、`live-phase-view.guard-matrix.test.ts`、`report-export.test.ts`、`live-repository.test.ts`、`live-pages.test.tsx`、`teacher-live-report-page.test.tsx`。沿批次慣例：**盤點 task 先行**，逐條列 `檔:行｜斷言｜處置`，僅授權清單內的斷言可改。

## 3. 鐵律

1. **DB 零接觸**：migrations、RPC、pgTAP（含 `033_live_teams.test.sql`）、`rules_version`、計分/finalize 全部不動。後端能力保留但前端無人呼叫。
2. **伺服器 payload 相容**：伺服器仍會回傳 `mode`/`team_number`/`scheduled_for` 欄位。前端 zod schema 移除欄位後解析不得失敗——盤點 task 第一件事驗證 schema 是 strip 模式（`z.object` 預設丟棄未知欄位）而非 `strictObject`/`passthrough` 例外；若任一 live schema 為 strict，該處改法（改 strip 或保留欄位為 optional-ignored）須在計畫中顯式列出。
3. **LivePresenter 視覺零接觸**（旗幟牆/加冕/煙火/夜景照舊）；公會佈告欄（`/app/leaderboard`，`.guild-board`）與本案無關、不動。
4. 其餘載重字串一字不改；被刪字串（`隊伍計分板`/`團隊模式`/`・第 N 隊`）以外的可見文案零變動。
5. e2e：live-advanced（既知紅、acceptance 守門）**不碰**——其 team/排程情境由後續「紅 spec 重寫批」直接以無 team 版本重寫（owner 0802 已裁：該批 live-advanced 與 assignments-live 可合併）。
6. 批次慣例沿用：commit 隔離（平行 session 檔清單同前批）、`git commit -F`、prettier gate、ledger 新節、SDD 報告檔前綴 `liveteam-task-N-`。

## 4. 可見行為變化（唯一）

歷史團隊場次的報表/頒獎台不再顯示隊伍資訊（隊號、隊伍計分板、「團隊模式」標示），以個人樣式呈現。新場次不受影響（本就全是個人模式）。

## 5. 風險

| 風險                                   | 對策                                          |
| -------------------------------------- | --------------------------------------------- |
| zod strict 解析在欄位移除後炸掉        | 鐵律 2 的盤點驗證先行                         |
| 測試 fixtures 大量引用 team 欄位       | 盤點授權清單＋逐檔同步，不得靜默弄紅          |
| live-session-page 刪分支動到頒獎台版面 | 刪除後跑該頁單元測試＋gate 真跑頒獎台截圖比對 |

## 6. 後續（非本批）

紅 spec 重寫批：assignments-live（M）＋learning-experience（S）＋live-advanced 無 team 版本（與 assignments-live 合併），依 `2026-08-02-red-spec-sizing.md` 執行。
