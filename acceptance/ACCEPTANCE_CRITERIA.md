# ColorPlay 正式驗收標準

## 1. 文件效力

本文件是 ColorPlay MVP 是否可標記為「完成／可發布」的最終判準。除非需求變更經核准並同步修改本文件，任何 AI、開發者或 reviewer 均不得自行降低門檻。

## 2. 判定狀態

每項 criterion 只能為：

- **PASS**：全部條件與強制證據具備。
- **FAIL**：行為不符、數值未達、存在反例或測試失敗。
- **NOT VERIFIED**：未執行、環境不符或證據不足。
- **NOT APPLICABLE**：僅限文件明確允許，且必須說明理由並經 reviewer 核准。

`NOT VERIFIED` 不得寫成 PASS。Release gate 要求所有 Blocking criteria 為 PASS。

## 3. 真實環境規則

Acceptance run 必須：

- 使用 production build 或等價 staging build，不使用純 Storybook／靜態 mock。
- 連線至 Supabase local 或 staging 真實 PostgreSQL／Auth／RLS。
- 使用 deterministic seed。
- 核心 application API 不得用 Playwright `page.route`、MSW 或假資料攔截。
- 至少一次 Chromium headed run。
- Production 資料不得作為自動測試寫入目標。

## 4. 強制證據類型

每個 AC 項目在表格標明證據：

- **S**：真實運行 screenshot。
- **Q**：有序 sequence screenshots。
- **V**：video。
- **T**：Playwright trace。
- **D**：DB query／pgTAP report。
- **N**：network payload／HAR／trace network。
- **L**：command log／test report。
- **M**：manifest metadata。
- **R**：真實行動裝置 screenshot／video 與裝置 metadata。

UI 與流程 criterion 至少包含 S 或 Q/V，不能只有 L。安全／資料 criterion 通常需 D/N，不能只看 UI。

## 5. 全域 Release Gate

- G-001：Blocking criteria PASS = 100%。
- G-002：所有自動測試 skipped = 0；若第三方限制不得測，需另立非阻塞例外，不得 skip blocking test。
- G-003：ESLint errors = 0、warnings = 0。
- G-004：TypeScript errors = 0。
- G-005：Unit/integration/DB/E2E failed = 0。
- G-006：Console errors = 0、unhandled page errors = 0、unexpected 5xx = 0。
- G-007：Known Critical／High security vulnerabilities = 0。
- G-008：Worktree 必須 clean，或 manifest 明確列出 dirty files；正式 release 要求 clean。
- G-009：Evidence manifest git SHA 與被驗收 build SHA 完全相同。

---

# A. 建置、環境與資料庫

## AC-ENV-001：可重現安裝與建置 — Blocking

**要求**

- 在全新 checkout 依 README 執行 `pnpm install --frozen-lockfile` 成功。
- `pnpm build` exit code 0。
- build 不依賴未記錄的全域 package。

**判定方法**

- 新 temporary directory／CI runner 執行。
- 刪除 `node_modules` 後重做一次。

**證據**：L、M。

## AC-ENV-002：本機 Supabase 可重建 — Blocking

**要求**

- `supabase db reset` 從空資料庫成功套用全部 migrations 與 seed。
- schema migration 失敗數 = 0。
- seed 後必要 users、classrooms、12 題以上、6 Blooks 存在。

**判定方法**

- DB query 驗證筆數與固定 stable codes。

**證據**：D、L、M。

## AC-ENV-003：環境隔離 — Blocking

**要求**

- local、staging、production Supabase project identifier 不相同。
- acceptance manifest 明確標示 local 或 staging。
- 測試不得向 production 寫入。

**證據**：M、N。

## AC-ENV-004：Client bundle 無秘密 — Blocking

**要求**

- Production bundle 與 source map 搜尋以下模式結果 = 0：`service_role`、資料庫 password、JWT secret、seed teacher password、`SUPABASE_SERVICE_ROLE_KEY` 真值。
- 允許 publishable／anon key。

**判定方法**

- 對 `dist/` 做 secret scanner + pattern search。

**證據**：L、report file。

---

# B. Auth、角色與班級權限

## AC-AUTH-001：Student 登入與 session 恢復 — Blocking

**要求**

- 合法 student 可登入並進入 `/app`。
- refresh 後仍為同一 account，頁面可用。
- header 顯示 display name 與 role-appropriate navigation。

**UI 證據**

- 375×812、768×1024、1440×900：login 與 lobby。
- Sequence：login form → submit loading → lobby → refresh 後 lobby。

**證據**：Q、S、T、N、M。

## AC-AUTH-002：無效登入 — Blocking

**要求**

- 錯誤 credentials 不建立 session。
- 顯示繁體中文可理解錯誤。
- 不洩漏 stack trace、DB error 或 service details。

**證據**：Q、T、N。

## AC-AUTH-003：登出與共享裝置 — Blocking

**要求**

- 登出後 protected data 不再可見。
- Browser back 不得重新顯示可操作的敏感頁面；若顯示 cache，任何 API 仍拒絕且立即導回 login。
- 第二個使用者登入後不看到前一使用者的個人資料／quiz state。

**證據**：Q、T、N、D。

## AC-AUTH-004：Student 不可升權 — Blocking

**要求**

- Student 嘗試修改 `profiles.role` 為 teacher 被拒絕。
- UI 顯示的角色即使透過 DevTools 修改也不會取得 teacher API 資料。

**判定方法**

- 直接 Supabase client mutation。
- 直接呼叫 teacher query／export function。

**證據**：D、N、L。

## AC-AUTH-005：Teacher route 與 API 雙重保護 — Blocking

**要求**

- Student 存取 `/teacher` 導至 unauthorized/login。
- Student 直接呼叫 teacher data endpoint 得 401/403 或 0 rows。
- 不得只因 UI 沒按鈕就算通過。

**證據**：Q、N、D、T。

## AC-AUTH-006：跨班級隔離 — Blocking

**要求**

- Student A 不可讀非成員 classroom 的內容／排行榜私有 projection。
- Teacher A 不可讀 Teacher B 管理班級的 raw answers、analytics、export。
- 所有負向案例通過率 = 100%。

**證據**：D、N、L。

## AC-AUTH-007：加入班級 idempotency — Blocking

**要求**

- 合法 join code 建立一筆 membership。
- 同一請求重送 10 次，membership 總筆數仍為 1。
- 無效／過期 code 不建立 membership。

**證據**：Q、D、N。

---

# C. 學生學習內容

## AC-LEARN-001：只顯示已發布內容 — Blocking

**要求**

- Published chapter／review card 對合法 student 可見。
- Draft／archived 新內容不出現在 student navigation。
- Student 直接以 ID 查 draft 被拒絕或回 0 rows。

**證據**：S、D、N。

## AC-LEARN-002：章節題數真實顯示 — Blocking

**要求**

- 有 2 題時按鈕顯示 2 題，不可顯示 10 題。
- 有 ≥10 題時依 template 顯示 10 題。

**證據**：S、D、T。

## AC-LEARN-003：複習卡完整呈現 — Blocking

**要求**

- title、body、media、alt 正確顯示。
- loading、empty、error 三狀態有明確 UI。
- 圖片載入失敗有 fallback，不造成 layout 崩潰。

**UI 證據**：三 viewport 的正常狀態；至少一張 error state。

**證據**：S、Q、T。

## AC-LEARN-004：瀏覽恢復 — Blocking

**要求**

- 在 chapter／review route refresh 後仍回同內容。
- 未登入時記錄 intended route，登入成功後返回。

**證據**：Q、T。

---

# D. Quiz 建立、作答與結果

## AC-QUIZ-001：後端建立固定 session — Blocking

**要求**

- create 後 DB 有 1 session 與固定 question order。
- refresh／重進 route 不重新抽題。
- client request ID 重送 10 次只建立 1 session。

**證據**：Q、D、N、T。

## AC-QUIZ-002：題目 payload 不含正解 — Blocking

**要求**

- 建立／讀取題目的 response body、Playwright trace network、React query cache dump 均不含：`is_correct`, `correct_option_id`, `correct`, 正確索引或 explanation before submit。
- JS bundle／static JSON 不含 production 題庫正解。

**判定方法**

- 自動 schema assertion。
- Network artifact 搜尋 forbidden fields。

**證據**：N、L。

## AC-QUIZ-003：一般答對計分 — Blocking

**Seed 情境**：response time > 5,000 ms 且 ≤ 20,000 ms。

**要求**

- Quiz Score delta = 100。
- Provisional XP = 50、Token = 15。
- UI 顯示正確圖示與文案。
- DB answer status = correct。

**證據**：Q、D、N、T。

## AC-QUIZ-004：速度答對 — Blocking

**Seed 情境**：server response time ≤ 5,000 ms。

**要求**

- Quiz Score delta = 150。
- XP = 75、Token = 25。
- 判斷使用 server timestamps；修改本機時鐘不改結果。

**證據**：Q、D、N、T。

## AC-QUIZ-005：答錯與解析 — Blocking

**要求**

- selected option 鎖定，answer status = incorrect。
- 顯示本人答案、正解、解析。
- XP／Token delta = 0。
- 點下一題後上一題解析完全消失。

**UI 證據**：三 viewport incorrect feedback；sequence 至少包含選擇前、答錯後、進下一題。

**證據**：Q、S、D、T。

## AC-QUIZ-006：逾時 — Blocking

**要求**

- server deadline 後只能得到 timeout terminal state。
- UI 顯示未作答與解析。
- 選項不可再產生正式答案。
- XP／Token = 0。
- DB 只有 1 answer。

**證據**：Q、D、N、T。

## AC-QUIZ-007：答案重送防重 — Blocking

**要求**

- 同一 answer payload/idempotency key 並行或連續送 10 次。
- `quiz_answers` = 1 row。
- finalize 後對應 XP ledger ≤ 1、Token ledger ≤ 1。
- 回應一致，不出現餘額倍增。

**證據**：D、N、L。

## AC-QUIZ-008：Option ownership 驗證 — Blocking

**要求**

- 提交另一題 option ID 被拒絕。
- 不建立 answer、不發獎、不洩漏正解。

**證據**：D、N。

## AC-QUIZ-009：Refresh 恢復 in-progress — Blocking

**要求**

- 第 3 題 refresh 後仍是同一 session、同一第 3 題或 authoritative current state。
- 已答前兩題不重答、不重發獎。
- timer 依 server deadline 恢復，不重設 20 秒。

**證據**：Q、D、T。

## AC-QUIZ-010：Finalize authoritative — Blocking

**要求**

- Client 傳入假的 totals 被忽略／拒絕。
- DB totals 與 answers aggregation 100% 一致。
- finalize 重送 10 次結果相同，ledger 不重複。

**證據**：D、N、L。

## AC-QUIZ-011：結果頁 — Blocking

**要求**

- 顯示 correct/total、accuracy、Quiz Score、XP、Token。
- 錯題摘要與 DB 一致。
- refresh result route 後仍顯示相同 authoritative result。

**UI 證據**：三 viewport result，至少一個含錯題、一個全對。

**證據**：S、Q、D、T。

## AC-QUIZ-012：未完成 session 不發獎 — Blocking

**要求**

- 中途離開／abandon／expire 的 session 不產生 XP／Token ledger。
- 若重新開始新 session，舊 session 不被 finalize。

**證據**：D、N。

---

# E. XP、Token、Level、商店、排行榜

## AC-GAME-001：Level 公式 — Blocking

**要求**

- 0 XP → Level 1，0/500。
- 499 XP → Level 1，499/500。
- 500 XP → Level 2，0/500。
- 1,250 XP → Level 3，250/500。
- 前端顯示與後端 total XP 一致。

**證據**：L、D、S。

## AC-GAME-002：每日獎勵衰減 — Blocking

**要求**

- 同 template 同日 completed attempts 1–3：100% XP／Token。
- 第 4 次：XP = 原值 20%（整數規則需固定，例如 floor）、Token = 0。
- 以 `Asia/Taipei` 日界線計算。
- 前端不可偽造 attempt number。

**證據**：D、N、L、S（結果頁提示）。

## AC-GAME-003：Wallet ledger reconciliation — Blocking

**要求**

- 對每個 seed user：wallet cached balance = initial balance + transactions sum。
- 差異筆數 = 0。
- 一般 user 不可修改／刪除 ledger。

**證據**：D、L。

## AC-GAME-004：餘額不足購買 — Blocking

**要求**

- Token < cost 時 purchase 被拒絕。
- balance 不變、transaction 0、ownership 0。
- UI 顯示差額或清楚原因。

**證據**：Q、D、N、T。

## AC-GAME-005：成功購買原子性 — Blocking

**要求**

- balance 扣除恰等於 cost。
- 1 負向 transaction。
- 1 ownership。
- 任一步驟故意失敗時全部 rollback。

**證據**：Q、D、N、L。

## AC-GAME-006：重複購買防重 — Blocking

**要求**

- 同 Blook purchase 重送 10 次，ownership = 1，扣款 = 1 次。
- 已擁有 UI 顯示「選用」而非「購買」。

**證據**：S、D、N。

## AC-GAME-007：裝備權限 — Blocking

**要求**

- 可裝備已擁有 Blook。
- 未擁有 Blook 被拒絕。
- refresh 後 active Blook 保持。

**證據**：Q、D、T。

## AC-GAME-008：排行榜真實性 — Blocking

**要求**

- 排名由 DB authoritative XP 產生，不接受 client score。
- Top 10 排序正確，tie-breaker 符合 spec。
- 目前使用者不在 Top 10 時仍顯示自身 rank。
- 正常更新延遲 ≤ 5 秒。

**證據**：S、D、N、T。

## AC-GAME-009：排行榜隱私 — Blocking

**要求**

- response／UI 不包含 Email、學號、raw user ID（除非 opaque internal ID 不顯示）。
- 非班級成員不可讀班級 leaderboard。

**證據**：N、D、S。

---

# F. 教師內容、匯入、分析與匯出

## AC-TCH-001：Teacher Dashboard 正確統計 — Blocking

**要求**

- attempts、unique students、average accuracy、worst subtopic 與獨立 SQL query 一致。
- 每項誤差 = 0（百分比顯示可四捨五入至 1 位小數）。
- 無資料顯示 `—`／empty state，不顯示誤導 0%。

**UI 證據**：三 viewport dashboard，含有資料與空資料。

**證據**：S、D、T。

## AC-TCH-002：題目 CRUD 與版本 — Blocking

**要求**

- Draft 可新增／編輯。
- 發布後修改正解建立新 version；歷史 session 仍顯示舊 version 結果。
- Student 看不到 draft。

**證據**：Q、D、N。

## AC-TCH-003：真實 XLSX 範本下載 — Blocking

**要求**

- 點擊後取得可被 Excel／LibreOffice／SheetJS 打開的 `.xlsx`。
- 含三個規定工作表與必要欄位。
- 不得只顯示「下載成功」Toast。

**證據**：Q、L（程式讀檔驗證 sheet names）、檔案 artifact。

## AC-TCH-004：合法匯入 — Blocking

**要求**

- 上傳合法範本後顯示 total、valid、error=0、warning 數。
- Commit 後建立預期內容且 transaction 完成。
- Student 只在發布後可見。

**UI 證據**：upload → validation preview → confirm → success → student page，至少 5 steps。

**證據**：Q、V/T、D、N、檔案 artifact。

## AC-TCH-005：不合法正解不得預設 A — Blocking

**要求**

- 正解 `X`、空值、指向空白選項均列 error。
- Commit disabled／server refused。
- DB 不建立該題。

**證據**：S、D、N。

## AC-TCH-006：匯入逐列錯誤 — Blocking

**要求**

- Error 顯示 sheet、row number、field、error code、message。
- 至少測：缺工作表、重複題號、空 prompt、0/2 個正解、惡意 script、超大 row count。

**證據**：S、L、D。

## AC-TCH-007：Import transaction rollback — Blocking

**要求**

- Commit 中故意觸發 DB failure，新增 content rows = 0 或全部維持 commit 前狀態。
- import status 明確 failed，不顯示成功。

**證據**：D、N、L。

## AC-TCH-008：XSS 防護 — Blocking

**要求**

- 題目／複習卡輸入 `<script>window.__xss=1</script>` 後，student page 不執行。
- `window.__xss` 未建立。
- 內容被拒絕或安全顯示為文字。

**證據**：S、T、L。

## AC-TCH-009：Analytics filters — Blocking

**要求**

- classroom、date range、chapter、subtopic 篩選結果與 SQL 一致。
- Date boundary 依 `Asia/Taipei` 顯示、UTC 查詢正確。

**證據**：S、D、T。

## AC-TCH-010：研究資料匯出 — Blocking

**要求**

- 只有授權 teacher 可匯出。
- CSV/XLSX 可開啟，包含 schema version、generated_at、timezone。
- 預設不含 Email。
- export rows 與 DB query rows 一致率 = 100%。
- 產生 audit log。

**證據**：Q、D、N、檔案 artifact。

---

# G. 安全與反篡改

## AC-SEC-001：修改 localStorage 不改正式資料 — Blocking

**要求**

- 將 localStorage 中任何 XP／Token／role 值改為 999999。
- refresh 後 UI 回到 DB authoritative 值。
- DB 無異動。

**證據**：Q、D、T。

## AC-SEC-002：直接 wallet mutation 被拒絕 — Blocking

**要求**

- authenticated student 直接 insert/update/delete wallets／transactions 全部失敗。
- 成功操作數 = 0。

**證據**：D、N、L。

## AC-SEC-003：Cross-user IDOR — Blocking

**要求**

- Student A 以 Student B 的 profile／session／answer UUID 查詢、修改、刪除均被拒絕。
- 所有測試案例 pass = 100%。

**證據**：D、N、L。

## AC-SEC-004：Server time 防竄改 — Blocking

**要求**

- 將 browser clock 前後調整 24 小時或 stub `Date.now()`，速度／timeout 結果仍依 server。

**證據**：D、T、N。

## AC-SEC-005：Rate limiting — Blocking

**要求**

- 超過 spec 限制後回 429／明確限制錯誤。
- 未產生重複資料。
- 恢復時間後可正常操作。

**證據**：N、D、L。

## AC-SEC-006：CSP／安全 headers — Blocking for production candidate

**要求**

- HTTPS。
- HSTS、CSP、nosniff、Referrer-Policy 存在且符合部署規格。
- CSP 不允許任意 `unsafe-eval`；若 dev tool 僅 staging 需要，不得進 production。

**證據**：N、L。

## AC-SEC-007：Secrets scan — Blocking

**要求**

- Repo history current tree、build artifact、acceptance screenshots/logs 中 secrets findings = 0。

**證據**：L、report。

---

# H. UI、RWD 與真實畫面

## AC-UI-001：核心狀態三 viewport 截圖 — Blocking

每個狀態均需 375×812、768×1024、1440×900：

1. Login
2. Student lobby
3. Chapter/subtopic
4. Review card
5. Quiz unanswered
6. Quiz incorrect feedback
7. Quiz result
8. Profile/shop
9. Leaderboard
10. Teacher dashboard
11. Question import validation
12. Teacher analytics

總最低截圖數：12 × 3 = **36 張**。同一張不得重複冒充多 viewport。

**要求**

- Screenshot 來自真實 app + real Supabase seed。
- 每張在 manifest 有 route、viewport、user role、AC ID。
- 重要內容未被 modal、cookie banner 或裁切遮擋。

**證據**：36 S、M。

## AC-UI-002：核心流程序列證據 — Blocking

至少提供以下 6 組完整 sequence：

1. Student login and refresh recovery。
2. Review → correct quiz → result。
3. Incorrect → explanation → next question。
4. Timeout flow。
5. Shop purchase/equip。
6. Teacher import → publish → student visibility。

每組至少 5 張有序截圖，或 video + ≥3 關鍵截圖 + trace。

**證據**：Q/V、T、M。

## AC-UI-003：320px 無水平 overflow — Blocking

**要求**

- 所有核心 route：`document.documentElement.scrollWidth <= clientWidth + 1`。
- 固定 header、modal、table 不超出 viewport。

**證據**：L（automated assertion）、S（至少 login、quiz、teacher table）。

## AC-UI-004：Touch target — Blocking

**要求**

- 核心互動元件 bounding box 寬、高均 ≥ 44px；文字 inline link 可依 WCAG 例外，但主要按鈕與選項不得例外。
- 自動抽查所有 `[data-acceptance-target]`，違規數 = 0。

**證據**：L、S。

## AC-UI-005：Visual regression — Blocking

**要求**

- 核心 stable states `maxDiffPixelRatio <= 0.01`。
- 動畫／時間／seed deterministic。
- Baseline 變更有 reviewer 核准紀錄。

**證據**：visual report、diff images、L。

## AC-UI-006：Loading／empty／error 不可空白 — Blocking

**要求**

- 核心 query 頁面都有 loading、empty、error + retry。
- Error state 不顯示 stack trace。

**證據**：S、Q、T。

## AC-UI-007：頁面無 console／network 異常 — Blocking

**要求**

- 12 核心狀態 console error = 0。
- unhandled rejection = 0。
- unexpected failed requests／5xx = 0。

**證據**：T、N、L。

## AC-UI-008：扁平化設計與視覺降載 — Blocking

**前置條件**

- 使用 production/staging build 與 deterministic seed。
- 驗證 Login、Student lobby、Review card、Quiz unanswered、Quiz feedback、Quiz result 六個學生核心狀態。

**要求**

- 核心學生介面未使用未核准的 3D/WebGL 場景、浮雕、斜角、玻璃擬態或多層陰影作主要操作樣式；違規元件數 = 0。
- 持續循環且沒有功能目的的裝飾動畫數 = 0。
- 一般內容卡優先以邊框、背景與留白建立層級；同一元件陰影層數不得大於 1。
- 長文、題幹、表單與按鈕使用 sans-serif；立體字、陰影字、拉伸字違規數 = 0。
- `prefers-reduced-motion: reduce` 時，位移、縮放與閃爍動畫數 = 0。
- 視覺 reviewer 能在 5 秒內從每張核心頁面指出唯一 primary action；若有兩個同等主按鈕則 FAIL。

**判定方法**

- 自動掃描核心 route 的 canvas/WebGL、animation iteration、computed box-shadow 與字型。
- 三 viewport 真實截圖人工比對 design tokens 與 primary action。
- Reduced-motion headed run。

**拒收條件**

- 只提供 CSS class 名稱或設計稿，沒有真實 app screenshot。
- 以「風格看起來簡潔」取代可重現檢查。

**證據**：S、Q、L、M。

## AC-UI-009：問句、輸入與主要操作自然配對 — Blocking

**要求**

- 每個學生核心任務畫面的 primary action 數 = 1。
- 同一 `data-interaction-group` 內同等高權重 action 數 ≤ 2。
- 問句、輸入控制與提交按鈕位於同一 form/card/dialog/fieldset，且中間沒有無關的排行、獎勵卡或其他 section。
- Login、加入班級、Quiz 送出、錯題解析四種操作在 375×812、768×1024、1440×900 均符合。
- 主要提交按鈕不得只存在於與輸入內容缺乏視覺關聯的頁面底部。

**判定方法**

- DOM assertion 計算每個 interaction group 的 primary action 數。
- 真實截圖確認關聯與視覺順序。
- Keyboard focus order 與 DOM order 一致。

**拒收條件**

- 只用 hidden/aria-hidden 隱藏多餘 primary action。
- DOM 在同一 form，但畫面上被無關內容分隔。

**證據**：S、L、T、M。

## AC-UI-010：虛擬鍵盤不得遮擋必要操作 — Blocking

**前置條件**

- 至少測試一個學生文字輸入流程與一個 Dialog/form 文字輸入流程。
- Automated viewport：375×812、768×1024。
- Release candidate：至少一台真實 iOS 或 Android 裝置。

**操作**

1. 點擊 input，輸入至少 8 個中文字元。
2. 保持 OS 軟體鍵盤開啟。
3. 不手動收起鍵盤，點擊完成該任務的 primary action。
4. 驗證送出結果。

**要求**

- focused input 至少 50% 高度位於 visual viewport 內。
- primary action 的 bounding box 完整位於 visual viewport 內且可點擊。
- 使用者不需手動收起鍵盤即可完成送出。
- 水平 overflow = 0。
- fixed/sticky action 不被 keyboard、browser chrome 或 safe area 遮擋。
- 真實裝置畫面中必須看得到 OS keyboard、input 與 primary action；只做 desktop resize 不算通過。

**判定方法**

- Playwright mobile emulation + visual viewport assertion。
- 真實裝置 screenshot 或連續 video。
- 送出後驗證 UI 與必要 DB/network 結果。

**證據**：Q/V、T、R、M。

## AC-UI-011：Dialog 明確關閉與提示一致 — Blocking

**測試範圍**

- 任務說明 Dialog。
- 一般學習提示 Dialog。
- 錯題解析 Dialog。
- 離開 Quiz 確認 Dialog。

**要求**

- 每個非阻塞 Dialog 至少有一個可見關閉方式。
- Icon-only close control 具有 `aria-label="關閉"`，bounding box ≥ 44×44 CSS px。
- 不得只依賴 backdrop、Esc 或系統 Back 關閉。
- 同類 Dialog 的主要 action 文案、位置、圖示與結果一致率 = 100%。
- 標準文案符合 UI spec；不得以模糊「確定」取代具體行動。
- Esc 行為符合產品規格；關閉後 focus 返回 trigger。
- Mobile Dialog 完整位於 visual viewport，不遮擋必要 action。

**判定方法**

- Component contract test + E2E sequence。
- 四種 Dialog 三 viewport screenshot。
- Accessibility tree／locator assertion。

**證據**：S、Q、T、L、M。

## AC-UI-012：Back 操作不得意外中斷學習流程 — Blocking

**操作**

1. 在進行中的 Quiz 開啟 Dialog。
2. 執行 browser back；真實 Android 裝置另執行 system back。
3. 再次執行離開操作。

**要求**

- 第一次 Back 只關閉最上層 Dialog。
- Dialog 關閉後 route、quiz session ID、已作答數與 authoritative timer state 保持不變。
- 第二次離開 Quiz 必須顯示明確確認，不得直接無提示離開。
- 同一 Dialog open/close 10 次，不得產生無限或重複 history entries；每次 open 最多新增 1 個可回退狀態。
- Automated history test 與真實 Android back evidence 均需通過；缺少 Android 實機證據時狀態為 `NOT VERIFIED`。

**判定方法**

- Playwright `page.goBack()` sequence + session assertion。
- Android 實機 video，顯示操作前後頁面。

**證據**：Q/V、T、R、N、M。

## AC-UI-013：圖示隱喻與教育情境一致 — Blocking

**要求**

- 一般學習求助不得使用 `SOS`、警報器、救護車、受傷或危難圖示；違規數 = 0。
- 學習求助使用 `?`、`HELP`、「取得提示」或「請求協助」等明確語意。
- 送出答案、離開 Quiz、刪除/重置、購買與求助等重要 action 必須有可見文字標籤。
- Icon-only button accessible name 缺失數 = 0。
- 同一功能跨頁面的 icon + label mapping 一致率 = 100%；同一圖示不得代表不同核心功能。

**判定方法**

- 掃描 icon registry、accessible names 與 UI copy。
- Student lobby、Quiz、Review、Shop、Teacher dashboard 真實畫面人工檢查。

**拒收條件**

- 只用 tooltip 補救重要 action 的模糊圖示。
- 使用 `SOS` 但宣稱學生「應該看得懂」。

**證據**：S、L、M。

## AC-UI-014：當前位置、進度與狀態持續可見 — Blocking

**要求**

- Quiz 未作答、selected、pending、feedback 四個狀態均持續顯示：章節/關卡、當前題號、總題數、Quiz Score。
- Lobby/Profile 顯示 Level、XP、Token，資料與後端結果一致。
- Review 與 Chapter 頁至少使用標題、breadcrumb、step indicator 或等價方式顯示目前位置。
- 不得只依賴 URL 或瀏覽器標題表示位置。
- 在 375×812 時，題目進度不得被 header、toast、keyboard 或 Dialog 永久遮擋。

**判定方法**

- 依序截取 unanswered → selected → pending → feedback → next question。
- 對照 network/DB authoritative values。
- 三 viewport screenshot inventory。

**證據**：Q、S、N/D、M。

## AC-UI-015：點選、Focus、Pending 與錯誤狀態可辨識 — Blocking

**要求**

- 所有 `[data-acceptance-interactive]` 適用狀態均有可感知視覺回饋；缺失數 = 0。
- Focus-visible 與相鄰背景對比 ≥ 3:1。
- Selected 狀態至少具有兩種線索：2px 以上邊框、背景變化、圖示、文字/aria state 任選兩種。
- 使用者送出後 100ms 內進入 pending/locked，重複 click 不產生第二個 request；後端 idempotency 仍需另驗證。
- 等待超過 300ms 出現 loading；超過 10 秒顯示說明與 retry/cancel。
- Loading 前後 primary button 寬度差 ≤ 1 CSS px。
- API error 在原操作脈絡可見，不得只顯示會消失的 Toast。
- Console error、unhandled rejection = 0。

**判定方法**

- Quiz option 與表單按鈕有序 screenshot sequence。
- Bounding box、contrast、network request count 自動 assertion。
- Slow-network headed run。

**證據**：Q/V、T、N、L、M。

---

# I. Accessibility

## AC-A11Y-001：自動檢查 — Blocking

**要求**

- axe critical = 0、serious = 0。
- Lighthouse Accessibility 每個核心 route ≥ 95。

**證據**：reports、L。

## AC-A11Y-002：鍵盤完成學生流程 — Blocking

**要求**

- 不使用滑鼠完成 login → review → quiz → result → shop equip。
- Focus visible。
- Focus order 符合畫面。
- 無 keyboard trap。

**證據**：V/Q、T、manual checklist。

## AC-A11Y-003：鍵盤完成教師主流程 — Blocking

**要求**

- 不使用滑鼠完成 content navigation、upload control、validation result navigation、publish confirmation。

**證據**：V/Q、manual checklist。

## AC-A11Y-004：對比 — Blocking

**要求**

- 一般文字 contrast ≥ 4.5:1。
- 大字 ≥ 3:1。
- 非文字 UI component/focus ≥ 3:1。
- Brand yellow 上使用 dark text。

**證據**：automated contrast report + sample manual measurements。

## AC-A11Y-005：Reduced motion — Blocking

**要求**

- `prefers-reduced-motion: reduce` 時，浮動／縮放／持續 pulse 動畫停用或縮短至無明顯位移。
- 功能與回饋仍完整。

**證據**：S/V、computed style assertions。

## AC-A11Y-006：正誤不只靠顏色 — Blocking

**要求**

- Correct 包含 ✓ 與文字。
- Incorrect 包含 ✕ 與文字。
- Timeout 有文字。

**證據**：S、DOM assertions。

---

# J. 效能、相容性與可靠性

## AC-PERF-001：Bundle — Blocking

**要求**

- Initial JS gzip ≤ 300 KiB target；301–350 KiB 可 conditionally pass 但需 bundle analysis 與核准；>350 KiB FAIL。
- Teacher heavy route code split，不在 student initial chunk。

**證據**：bundle report、L。

## AC-PERF-002：Core Web Vitals — Blocking

在規定 mobile profile：

- LCP ≤ 2.5s。
- INP ≤ 200ms。
- CLS ≤ 0.1。

三次 run 取中位數；任一超標 FAIL。

**證據**：Lighthouse／Web Vitals report。

## AC-PERF-003：API latency — Blocking

Seeded staging，至少 30 samples／operation：

- content read p95 ≤ 500ms。
- answer p95 ≤ 800ms。
- finalize p95 ≤ 1,000ms。
- leaderboard p95 ≤ 700ms。
- dashboard p95 ≤ 1,500ms。

Cold start 可另列，但不能刪除；若 cold start 影響學生流程需改善。

**證據**：timing report、N。

## AC-COMPAT-001：Browser smoke — Blocking

**要求**

- Chromium、Firefox、WebKit 各完成 login、quiz one question、result、logout。
- Failed browser = 0。

**證據**：L、每 browser 至少 2 screenshots。

## AC-REL-001：交易 rollback — Blocking

**要求**

- 購買、finalize、import 在中途 failure 時無 partial writes。
- 檢查 orphan／ledger mismatch = 0。

**證據**：D、L。

## AC-REL-002：網路中斷重試 — Blocking

**要求**

- 提交時斷線，UI 不先顯示正式獎勵。
- 恢復後安全重試只寫一筆。
- 使用者可理解目前是否已送出。

**證據**：Q/V、D、T。

## AC-REL-003：Refresh／duplicate tabs — Blocking

**要求**

- 兩分頁同時提交同一題，只有一筆 authoritative answer。
- 另一分頁收到已回答狀態並同步 UI。

**證據**：V/Q、D、T。

---

# K. 文件與可追溯性

## AC-DOC-001：需求追蹤 — Blocking

**要求**

- 每個 Blocking AC 至少對應一個 test 或 manual evidence entry。
- Manifest 中未對應 AC 數 = 0。

**證據**：traceability report。

## AC-DOC-002：Migration 與 DB types — Blocking

**要求**

- 每個 schema 變更有 migration。
- Generated DB types 與 current schema 一致，diff = 0。

**證據**：L、schema diff report。

## AC-DOC-003：驗收摘要誠實性 — Blocking

**要求**

- `summary.md` 列出 PASS／FAIL／NOT VERIFIED 數量。
- Known failures 不得隱藏。
- 缺 screenshot 或 DB proof 的項目不得標 PASS。

**證據**：summary + manifest reviewer check。

---

# L. Achievements、Progress、Assignments、Live、Environment 與 Migration

## AC-ACH-001：Achievement unlock 為後端權威 — Blocking

**前置**：使用者尚未解鎖一項可由測試事件達成的 achievement。

**操作**：完成 authoritative domain event，並另以 browser/SQL 嘗試直接寫 progress/unlock。

**預期**：trusted transaction 建立唯一 unlock；直接 mutation 被 RLS/GRANT 拒絕，browser payload 不能指定成功結果。

**證據**：D、N、L。

## AC-ACH-002：Achievement unlock 冪等 — Blocking

**前置**：同一 user、definition、trusted source 可被重送。

**操作**：concurrently/repeatedly 送出相同 source/idempotency key 至少 10 次。

**預期**：unlock row = 1、progress 不重複增加、badge 不重複；各次回傳同一 authoritative outcome。

**證據**：D、N、L。

## AC-ACH-003：Achievement progress 真實 — Blocking

**前置**：建立已知 quiz、mistake、chapter、level、Live、Blook facts。

**操作**：讀取九項 initial achievement progress，並與 fact tables/ledger 重算。

**預期**：current/target/unlock 狀態逐項相等；空資料不產生假進度，client 修改不改 DB。

**證據**：D、L、S。

## AC-ACH-004：Hidden achievement rule 隱私 — Blocking

**前置**：至少一項未解鎖 definition 設為 hidden。

**操作**：檢查 student Query/RPC/network payload、bundle 與 source map。

**預期**：不含 hidden threshold、server rule parameters 或可推導內部條件的欄位；教師/系統授權讀取仍受 policy 保護。

**證據**：N、L。

## AC-ACH-005：Client achievement tampering 被拒絕 — Blocking

**前置**：Student 登入且未達成指定 achievement。

**操作**：修改 local state/storage、提交偽造 count/unlocked flag、直接呼叫 table/RPC。

**預期**：正式 progress/unlock 不變；越權回 safe permission/validation error，無 audit/ledger 副作用。

**證據**：D、N、L。

## AC-PROG-001：Review completion 以 current published version 計算 — Blocking

**前置**：subtopic 有已知數量 current published cards，且含 `requires_recompletion` true/false 的新版本案例。

**操作**：依序完成 cards、發布新版本並查 progress。

**預期**：completion = completed current required versions／current published versions；explicit completion 才增加；無 cards 顯示 `—`。

**證據**：D、S、L。

## AC-PROG-002：Coverage 公式正確 — Blocking

**前置**：current published question versions 與 completed/unfinished/old-version/Live answers 數量已知。

**操作**：讀 subtopic/chapter coverage 並由 DB facts 重算。

**預期**：coverage = answered current versions／current published versions；unfinished、old-version、Live 不進 numerator。

**證據**：D、L、S。

## AC-PROG-003：Accuracy／Mastery／Status 正確 — Blocking

**前置**：建立可得到 mastery 0、1–59、60–79、80–100 的 deterministic facts。

**操作**：查 server progress projection 並改 client percentage 重載。

**預期**：accuracy = latest correct／answered；mastery = coverage × accuracy／100；status 分別為 `not_started/learning/developing/mastered`，client 無法改寫。

**證據**：D、L、S。

## AC-PROG-004：Content version 變更不竄改歷史 — Blocking

**前置**：學生已有 old-version completed session，教師發布 current question/review version。

**操作**：讀歷史 result 與 current progress denominator。

**預期**：歷史 result/answer 不變；current progress 只按 current published versions，且保存 `2026-07-progress-1` 與 version set。

**證據**：D、L。

## AC-PROG-005：Remediation 不改原始成績 — Blocking

**前置**：存在 open mistake 與原始 incorrect finalized answer。

**操作**：完成 remediation、重送 finalize、之後再產生 current-version error。

**預期**：原 answer/Quiz Score 不變；Token +0、XP 使用 20% practice rule；mistake 可 resolved/reopened；mastery 只由 qualifying finalized attempt 更新。

**證據**：D、N、L、S。

## AC-PROG-006：Teacher progress analytics 班級授權 — Blocking

**前置**：Teacher A/B 各有 classroom，Student 只屬於 A。

**操作**：A 查 own progress analytics；B 與 outsider 以 A 的 classroom/student ID 查詢。

**預期**：A 的 metric 與 DB facts 一致；B/outsider 得 0 rows 或 permission denied，response 不洩漏存在性。

**證據**：D、N、L。

## AC-ASN-001：Assignment ownership — Blocking

**前置**：Teacher A/B 各有 classroom。

**操作**：A 建立 own assignment；B/Student 嘗試對 A classroom 建立或修改。

**預期**：只有 A 成功；B/Student 被拒且無 partial row/audit success。

**證據**：D、N、L。

## AC-ASN-002：Assignment lifecycle 狀態合法 — Blocking

**前置**：assignment 狀態涵蓋 draft/published/paused/archived。

**操作**：執行合法與非法 transition，包括 archived 回 published。

**預期**：只接受規格允許 transition；非法 transition 回 `CONFLICT/VALIDATION`，status/version 不變。

**證據**：D、N、L。

## AC-ASN-003：Attempt limit 並行防重 — Blocking

**前置**：assignment attempt limit 已設定且學生接近上限。

**操作**：concurrently start 超過剩餘次數的 attempts，並重送同一 idempotency key。

**預期**：成功 attempt 不超過 limit；同 key 回同 attempt；無跳號造成額外正式次數。

**證據**：D、N、L。

## AC-ASN-004：Assignment completion 後端推導 — Blocking

**前置**：assignment attempt 引用 in-progress/finalized quiz 或 Live session。

**操作**：偽造 client completion/score，之後完成 authoritative session。

**預期**：in-progress 不完成；偽造值被忽略/拒絕；finalize transaction 才依 passing rule 完成一次。

**證據**：D、N、L、S。

## AC-ASN-005：Deadline 與時區 — Blocking

**前置**：availability/deadline 跨 `Asia/Taipei` 日期邊界，server UTC 已知。

**操作**：deadline 前後提交，並修改 browser clock/timezone。

**預期**：server UTC 決定可開始/提交；UI 顯示正確 Taipei 時間；client clock 不延長期限。

**證據**：D、N、S、L。

## AC-ASN-006：Assignment cross-class denial — Blocking

**前置**：Student A/B 屬於不同 classroom。

**操作**：A 以 B assignment/attempt/session ID 讀取、開始、提交或查結果。

**預期**：全部拒絕或 0 rows；不洩漏 title、deadline、score、member 或 existence。

**證據**：D、N、L。

## AC-LIVE-001：Authenticated create／join — Blocking

**前置**：Teacher 有 active classroom、Student 是 member、outsider/non-member 存在。

**操作**：Teacher create Live；member 用有效 code join；anonymous/non-member/錯碼 join。

**預期**：host/member 成功且唯一；code 只存 hash；anonymous/non-member/錯碼拒絕且不洩漏 session/classroom。

**證據**：D、N、Q/T。

## AC-LIVE-002：Private Realtime channel — Blocking

**前置**：Live lobby 有 host、active participant、outsider。

**操作**：三者 subscribe/send `live-session:<sessionId>`，Student 嘗試 host event。

**預期**：host/participant 只有核准能力；outsider 無 subscribe/send；Student host transition 被 RLS 拒絕。

**證據**：D、N、T。

## AC-LIVE-003：Host transition 與 state version — Blocking

**前置**：session 在每個可轉移 state，current `state_version` 已知。

**操作**：host 執行合法 transition；Student/other teacher/舊 version 執行相同 command。

**預期**：合法 command version +1；非 host 拒絕；stale version 回 conflict 且 state 不變。

**證據**：D、N、L、Q/T。

## AC-LIVE-004：Question payload 不含正解 — Blocking

**前置**：Live question open，host/participants 已連線。

**操作**：檢查 Query/RPC/Realtime/browser bundle/source map 至 feedback close 前。

**預期**：Student payload 不含 correct option/index、explanation、individual answers 或可推導正解的欄位。

**證據**：N、L、T。

## AC-LIVE-005：Server deadline 防竄改 — Blocking

**前置**：Live question 有 server open/deadline time。

**操作**：deadline 前後提交，修改 browser clock/timer/elapsed，暫停 client 後補送。

**預期**：server receipt/deadline 決定 correct/timeout；client time 不影響 response time、score 或 reward。

**證據**：D、N、L。

## AC-LIVE-006：Live answer idempotency — Blocking

**前置**：participant/question 尚未作答。

**操作**：相同 key 重送 10 次並並行送不同 key/option。

**預期**：authoritative answer = 1；相同 key 回原結果；競爭 request 不覆寫；score/reward source 不重複。

**證據**：D、N、L。

## AC-LIVE-007：Refresh／Reconnect 恢復 — Blocking

**前置**：host/participant 分別處於 lobby、question open、feedback。

**操作**：refresh、斷 WebSocket、重連、漏過一個 broadcast。

**預期**：client 呼叫 authoritative state，以 `state_version` 恢復同 session/deadline/answer status；不重 join/answer/reward。

**證據**：Q/V、T、N、D。

## AC-LIVE-008：Duplicate host tabs 不重複推進 — Blocking

**前置**：同 host 開兩分頁且持有同 current version。

**操作**：兩分頁 concurrently advance/open/close/finalize。

**預期**：每個 version 只有一個 transition；另一 request conflict/reconcile；position、question、broadcast 不重複。

**證據**：D、N、T、L。

## AC-LIVE-009：Finalize 原子性 — Blocking

**前置**：可完成 session 且可注入 reward/assignment/audit step failure。

**操作**：先使 transaction 中途失敗，再移除 fault 重試同 idempotency key。

**預期**：失敗時 session/rank/ledger/achievement/assignment/progress/audit 無 partial commit；成功重試全部一次完成。

**證據**：D、L、N。

## AC-LIVE-010：Live ranking 真實與隱私 — Blocking

**前置**：deterministic answers/ties 與非 member 存在。

**操作**：finalize 後比較 rank/score 與 answers；檢查 participant/outsider payload。

**預期**：rank/tie-breaker 可由 DB 重現；只顯示安全 display name/Blook/score/rank；無 Email、學號、raw answers；outsider 拒絕。

**證據**：D、N、S、L。

## AC-LIVE-011：Assignment／Economy integration 防重 — Blocking

**前置**：Live 關聯 assignment/reward rule，participant 可 finalize/replay。

**操作**：完成並重送 finalize，查 assignment attempt、XP/Token ledgers、achievement、progress。

**預期**：assignment/reward/unlock 各一次且 ledger reconcile = 0；Live 不進 mastery denominator/numerator。

**證據**：D、L、N。

## AC-LIVE-012：Initial Live capacity／latency — Blocking

**前置**：seeded Staging profile 為一 host、兩 active students、一 outsider，至少 30 answer/finalize samples，cold start 分開記錄。

**操作**：執行 concurrent answer、phase transition、outsider channel attempt 與 finalize timing。

**預期**：answer p95 ≤ 800 ms、finalize p95 ≤ 1,000 ms；authoritative answers 無遺失/重複；outsider access = 0；error/5xx 符合全域 gate。

**證據**：L、N、D、M。

## AC-ENV-005：Vercel scope 對應 — Blocking

**前置**：GitHub、Vercel、Staging、Production 已按 release runbook 建立。

**操作**：從 Preview 與 `main` Production deployment 讀 sanitized target fingerprint、Git SHA、build/output/deep-link result。

**預期**：Preview 只指向 rebuilt Staging；Production 只指向 new clean Production；兩 public values distinct；build `npm run build`、output `dist`、SPA refresh 無 404。

**證據**：M、N、L、S。

## AC-ENV-006：Production data hygiene — Blocking

**前置**：Production migrations/content import 完成但未開放使用。

**操作**：以 sanitized admin queries 檢查 migration range、Auth/data counts、anonymous access。

**預期**：migration 從 zero；seed/Staging/legacy users = 0；invalid legacy rows = 0；只有 approved content；anonymous product rows = 0。

**證據**：D、L、M。

## AC-ENV-007：Secret lifecycle 與 rotation — Blocking

**前置**：Local/Staging/Production secret owners 與 rotation runbook 已配置。

**操作**：輪替一組 Staging credential，重新部署並執行 old/new credential negative/positive checks；掃描 source/bundle/log/artifact。

**預期**：old credential 失效、new target 正常；環境不共用；browser 只有兩 public variable names；raw value findings = 0。

**證據**：L、N、M、sanitized rotation record。

## AC-ENV-008：Backup／Restore — Blocking

**前置**：daily provider、weekly encrypted logical、Storage backup 與 isolated restore target 已配置。

**操作**：執行 quarterly restore drill，核對 DB rows/ledger/content/Auth exclusions/Storage hashes 與時間。

**預期**：RPO ≤ 24 hours、RTO ≤ 8 hours；reconciliation differences = 0；active Production 未被覆寫；primary/backup owners 簽核。

**證據**：L、D、M、sanitized restore report。

## AC-MIG-001：Legacy inventory 完整且無敏感值 — Blocking

**前置**：Staging reset 前的 read-only audit 完成。

**操作**：review `legacy-supabase-inventory.md` 與 audit record。

**預期**：resource/count/security/content comparison 完整；不含 Email、UUID、URL、key/token/row payload；hosted mutation 明標 `NOT EXECUTED` 或有後續 evidence。

**證據**：L、M、reviewer check。

## AC-MIG-002：Invalid legacy rows/policies 不遷移 — Blocking

**前置**：legacy invalid row classes 與 anonymous disclosures 已列入 inventory。

**操作**：reset/rebuild Staging 後檢查 malformed serial IDs/sections、invalid questions、anonymous profile/`is_correct` access。

**預期**：invalid rows = 0；anonymous reads = 0；legacy SQL/policy objects 未出現在 tracked migration schema。

**證據**：D、L、N。

## AC-MIG-003：Verified 45-question baseline 保留 — Blocking

**前置**：repository content pipeline 與 rebuilt target 可查。

**操作**：重跑 importer/validation 並依 chapter/stable code/hash 比對。

**預期**：總題數 45、第三章 37、第四章 8；每題 2–4 options 且 exactly one correct；無 demo/remote-only invalid row。

**證據**：D、L、M。

## AC-MIG-004：Feature/content parity disposition 完整 — Blocking

**前置**：`colorplay-new` audit scope 已凍結。

**操作**：驗證 parity matrix/content ledger 每列必填 disposition、target、owning phase、acceptance IDs、reason/validation/rights。

**預期**：缺欄/未分類 rows = 0；hard-coded/mock/invalid items 明確 Reject；候選內容不被標已發布。

**證據**：L、M、reviewer check。

## AC-MIG-005：不複製不安全 legacy code — Blocking

**前置**：Phase 0 後每個 integration commit range 可 review。

**操作**：diff/search Next.js router、mock Auth/store、browser role/scoring/reward、formal localStorage、service fallback、legacy SQL/RLS、fixed rankings/PIN、third-party QR。

**預期**：transfer findings = 0；每個保留 capability 由 approved React/Supabase boundary 與 tests 重建。

**證據**：L、M、code review report。

---

# 6. 最終驗收命令契約

`pnpm acceptance` 至少需協調：

```text
1. verify clean/record git state
2. build production app
3. reset and seed Supabase test environment
4. run lint + typecheck + unit coverage
5. run DB/RLS/security tests
6. start production-like app
7. run Playwright acceptance in headed Chromium
8. run cross-browser smoke
9. capture screenshots/videos/traces/network/db reports
10. generate manifest + summary + traceability matrix
11. fail exit code when any Blocking criterion fails or lacks mandatory evidence
```

不允許 `pnpm acceptance` 在缺少 headed display 時默默降級成 headless 並回 0。應回非 0，並標示 `NOT VERIFIED: headed evidence unavailable`。
