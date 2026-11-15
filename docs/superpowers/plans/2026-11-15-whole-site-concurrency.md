# 全站同步進站與 Staging 整合 Implementation Plan

> **For agentic workers:** 沿用同一實作 worker，root 統籌與唯一 review；依既有自主執行授權逐 task 完成，不新增 reviewer。使用既有隔離 checkout，不另建 thread。

**Goal:** 保留既有 Live 成果，修正全站從入口到遊戲的連線問題，以 40 人基線／60 人目標驗證，準備並依 exact-SHA gate 整合 Staging。

**Architecture:** React／Vite／Supabase 不變，先處理共用讀取、登入與不確定提交，再以真 browser 入口和獨立 backend actors 分別測量。所有正式結果維持後端交易與權限契約。

**Tech Stack:** 既有 TypeScript／TanStack Query／Supabase／Vitest／Playwright／pnpm，不安裝新依賴或變動 lockfile。

**Spec:** `../specs/2026-11-15-whole-site-concurrency-design.md`；直接規格為 `spec/02-system-architecture.md` 與 `spec/09-nonfunctional-requirements.md`。task 對應 AC 是追蹤範圍，非宣稱整個 AC 或 phase 驗收。

## Global Constraints

同一持久隔離 clone：`/Users/guanyucheng/.codex/visualizations/2026/11/12/01a1ce8a-3274-7cd1-821e-b0ae34d1d062/colorplay-live-recovery`，起點85c0843；既有產品 f6 與 base d92 關係保留。Root 只寫統籌文件／診斷工具，worker 寫產品／測試。不得回 dirty root 寫產品；stage 指定 paths，禁止 `git add -A`。

讀取最多重試兩次且 jitter，Auth／permission／validation／not-found／429 不自動重試；既有非阻塞媒體三次例外維持。mutation 不盲目重送；既有 deadline／分數／答案／RLS／800ms submit SLO 不放寬。secret／raw body／WS payload 不進 log。

Local 全流程保留 immutable ledger，不以 unsafe delete 實現清理。Hosted 資料政策、exact candidate 與 run 窗口批准前，不做 Hosted writes／load／deploy；Production 禁止。失敗保留收據，先定位不自動重跑。

## Review Focus

| 條件                                     | 負責 task 與可檢查行為                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| JWT 過期、403、429 被誤判                | WB1 repository→hook 實際呼叫次數是1，503對照最多3；固定 safe error                   |
| 上游故障冒充密碼錯誤／內部延遲           | WB2 handler fetch／clock 驗證401/429/503、總預算、abort與不重送                      |
| DB commit 後 reply 遺失                  | WB3 committed object 不刪／unknown 不破壞／未commit正常清理                          |
| 多 observer、換帳號／tab、generator 飽和 | WB4 deferred／browser先RED再修；發生器不足必為INCONCLUSIVE                           |
| 完成測試卻無法安全清帳                   | WB4 Local retain+stop；WB5 明確Hosted保留政策、owned transient counts、拒絕錯ref/SHA |

## WB1 — 共用讀取分類與 bounded jitter

狀態：**ACCEPTED**，source0f15b353053e44ceb658ff363abe1667b46273f2；48files407tests與root獨立4files105tests綠，唯一review findings0。細節見 `../reviews/2026-11-15-whole-site-concurrency-status.md`。

**Ownership:** worker：新增 `src/lib/query/read-failure.ts`、`read-retry.ts` 與直接 tests；修改 `src/features/learning/api/chapter-map.ts`、必要的 `learning-repository.ts` error type／安全 mapper、`rewards/api/economy-repository.ts`、`leaderboard/api/leaderboard-repository.ts`、landing 所需 `profile/api/profile-repository.ts`／`inventory/api/inventory-repository.ts` 與相應 types；修改 hooks `learning/use-chapter-map.ts`、`learning/use-learning.ts`、`profile/use-my-profile.ts`、`rewards/use-economy-summary.ts`、`inventory/use-blook-inventory.ts`、`leaderboard/use-classroom-leaderboard.ts`、`teacher-content/use-teacher-content.ts`，皆在各自 `hooks/`。不改 auth/session lifecycle、業務 mutation、教師 repository 或 DB。

**Interfaces:** `classifyReadFailure({error,status})` 接受未知 upstream error 及可選 HTTP status，產生 safe classification `AUTH | PERMISSION | RATE_LIMIT | VALIDATION | NOT_FOUND | UNAVAILABLE`；不回傳 upstream message。各 domain 只增加所需 error codes，保留既有 domain mappings。共用 `calculateReadQueryRetryDelay(attemptIndex, random = Math.random)` 與 `readQueryRetryDelay(attemptIndex)` 沿用目前 learning 的 500ms exponential／4000ms cap／0.5–1.0 jitter；保留 learning 原 exports 以兼容既有 caller。hook retry 只接受該 domain 的暫時 unavailable，budget2，媒體例外3。

- [ ] 真 repository→hook／QueryClient failing tests：401／JWT、403／42501、429 不多發請求；503對照、known domain／invalid-response、profile／inventory reads 一併直接驗證。fake clock pin delay，不跑服務；先回報 RED cases 與命令。
- [ ] 列可否證假說與最小重現結果，由 root 核對；確定錯誤分類與 retry 時序後最小修正。狀態在 result.status，不能只靠 message；測試真 PostgREST response shape。
- [ ] jitter extremes 與2次上限測試；mutation無新增 retry；learning媒體三次與現有 exports 不退化。若 read共用 mapper 需改其他必要 callsite，先列 paths 給 root，不擴業務寫入。
- [ ] `pnpm --config.verify-deps-before-run=false exec vitest run <explicit affected test paths>`、lint／typecheck／changed-file prettier／diffcheck綠，exact files commit，回報 base/head／AC-AUTH-001、AC-SEC-005、AC-PERF-003（僅對應部分）與未驗事項。
- [ ] Root 比對真 diff 做唯一 Standards／Spec review，含信任邊界；必要同輪修正後核對，未 ACCEPTED 不進下項。

## WB2 — 登入回應與 deadline；身分恢復診斷

狀態：**ACCEPTED**，source b52957ca6cd04abfcd0c7baadcd370e54dd58a8c；初交84a唯一Spec P2於同輪清除。worker17files272tests與root4files76tests、Local兩個非真帳密探針／真container sourcehash皆通過，非容量／合法登入PASS。

**Ownership:** worker：`supabase/functions/auth-login/index.ts`、必要同目錄抽出的 fetch/deadline helper、直接 handler tests；既有 auth browser client/repository/context tests。產品 auth lifecycle 只有 WB4 重現確認後才改。

**Interfaces:** 保留現有 endpoint／body／session response；有效帳密仍走正式 password grant；safe 429／503／deadline response 和 UI既有型別相容。內部 operation 共用總 deadline，fetch傳遞AbortSignal、不自動重送 grant；用依賴注入測真 handler 而非字串檢查。

- [ ] 先 handler RED：invalid credentials401；password grant429/500不變成帳密401；各 internal hop hung時同一總deadline終止、後續hop不啟動；known account與unknown account不洩露存在性。
- [ ] 回報最小 root cause，列精確 error/status/UI文案契約；root已選server總budget12,000ms（profile／Auth user／grant／body共用），保留browser每request15s，不得每hop各12s或延長外層掩蓋。安全401／429／503／504分別對應既有AUTH_INVALID_CREDENTIALS／AUTH_RATE_LIMITED／AUTH_UNAVAILABLE／AUTH_TIMEOUT；必要client504 mapping限直接repository與tests，Auth lifecycle／transport retry策略不動。
- [ ] 最小修正＋相關 auth／function tests、lint/typecheck與root唯一安全review；commit及fresh Local function部署綁新SHA。

## WB3 — 媒體 complete 不確定提交

狀態：**ACCEPTED**，source d4934df5540ad1b242a8af420e434d3a5857cbc6；初交325兩項P2同輪清除，worker15files117tests及root4files53tests綠，原42 SQL assertions的sourcehash未變。不是全站容量／phase PASS。

**Ownership:** worker：`supabase/functions/content-media/index.ts`、其直接 tests 與必要同目錄 helper；若正確重現需要caller，另含 `src/features/content-studio/api/content-media-repository.ts`／其tests與 `components/content-media-workflow.tsx`／直接tests，僅同operation恢復，不做Admin redesign。不改 storage/RLS/migration。

追加必要caller範圍：`import/package-media-batch.ts`小型協調helper、`components/content-import-workflow.tsx`及直接tests；原 `import/package-media.ts` ZIP parser保持原bytes。單張與ZIP皆同run/request顯式確認恢復／取消，pending鎖輸入；confirmed abort才允許新選檔，已verified批次前序receipt重用、不刪已提交資產。只有當頁記憶體checkpoint，沒有新增跨reload續傳。

**Interfaces:** 先查既有run完成結果；DB committed或無法確定時不可刪final object，post-commit cleanup例外亦不可回頭破壞正式物件；確定未commit才走既有清理。Root唯讀新Local確認service_role對run表**沒有SELECT權**，不得直接select或擴grant假裝可用；既有 `admin_claim_content_media_upload` 有id／actor／auth_session／requestId guard、verified回receipt，但processing分支會更新updated_at並回replayed，不能稱純status read。若沿用作reconciliation須承認其寫入，processing replay不能再執行刪物件／重做process。若確需新RPC先提出具體缺口，不先加migration。

- [ ] 用當前來源重現：complete RPC commit但response lost；另測commit後quarantine cleanup throw、reconciliation unavailable／wrong scope／malformed receipt、確定未commit與正常success。補同run重疊process／late commit的handler interleaving RED，不能靠client disabled防刪物件。
- [ ] 走真 `uploadAndProcess` caller 的不確定回應→使用者再試：目前每次都begin+upload，DB begin對processing／verified直接拒絕。不能以僅測server process replay宣稱browser可恢復；若需checkpoint只暫存原run/request參考、沿用同idempotency，不重上傳／不重做已提交處理、不由client決定verified。若改UI，須將unknown顯示為待確認而非已確定失敗，維持明確且可測的使用者恢復操作。
- [ ] root核對既有權威查詢可用性及最小修法後修正，未知狀態fail-closed保留可診斷結果，不做Hosted故障注入。
- [ ] 直接function＋相關媒體tests、lint/typecheck、root唯一review，記錄P1已修的實際證據和未做的Hosted驗證。

## WB4 — 新 Local 全站實證與 60 人工具

執行拆成可獨立核對的有界段落：WB4a真SDK／fetch retry budget及bootstrap診斷→WB4b既有全站routes functional→WB4c 60人fixtures／entry與backend分立harness、health／receipts→WB4d同source逐級實證。每個產品修補仍一次root review，不重做design或逐段要求Owner啟動。

WB4a狀態：**ACCEPTED**，source7a82f6d909357da4686e6d5f64ec5069c017fb71，32檔；worker105files931tests與root7files80tests綠、唯一review findings0。真HTTP12→3、拒絕1、profile雙observer3→1；其他subtasks尚未完成，細節見正式review。

WB4b-B1已ACCEPTED：9086e1fd649577c2e6694b24e1b9d3ce680b4793，四P2同輪清除；worker17files177tests／root14files98tests綠，仍僅offline工具，不是browser／容量PASS。B2依獨立 `2026-11-15-whole-site-b2-brief.md` 接續。

WB4b-B2已ACCEPTED：562074fe3709b61675c3a8df378edfc655f2ef44，唯一逐題checkpoint P2同輪清除；worker初交48files541tests／修正26files385tests／root final9files56tests綠。仍僅offline工具；oracle與真UI/WASM/容量未跑。

Auth copy產品補丁已ACCEPTED：6e45708b8f32ef8c84920c754d30ae315f8fab97，worker25files372tests／root5files58tests與NativeChromium fakeAuth控制PASS，唯一review0finding；僅client隔離，不是完整App/GoTrue/60容量。

新增已重現Auth補丁：root以正式browser-client/SDK及真Chromium native opener＋owned fakeAuth重現copy storageKey/channel碰撞與三種canonical/notification身份分歧。B2 ACCEPTED後、B3之前，同worker依 `2026-11-15-whole-site-copied-tab-fix-brief.md` 最小修補產品browser-client與直接tests，root唯一review；不更動合法共享server-session撤銷/15s/backend權限，不先建fixture。這是新產品診斷，不重開B1工具review；完整App UI影響仍待共同freeze後驗證。

Mounted單張產品補丁已ACCEPTED：ccab5fc4edb022fee47736d7351c5ac68cfdfa7c，worker35files229tests／root7files63tests綠，唯一review0finding；actual Form stable checkpoint/pending恢復/confirmedcancel及6slot工具已接，真UI/WASM/物件readback仍未跑。

另有actual mounted單張caller缺口：AdminContentPage實際用ContentEditorForm，沒有pending recover/cancel且每render重建repo/checkpoint；依 `2026-11-15-whole-site-mounted-media-fix-brief.md` 在Auth copy補丁後、B3前由同worker先actual component RED再最小caller＋single故障工具修補/root唯一review，server/repo/DB/deps不擴。

WB4b工具拆B1 guards/owned fixtures/auth/student→B2 teacher/Admin/media→B3總runner/receipts。各子task同worker實作/root一次review，三段工具均通過後才由root首次真functional run，避免為每段建立重複帳號。採6身份：先T1/T2/S1/S2/A1五個，新R1真註冊入T2/C2並兼任T1/C1 outsider；S1/S2正常join-classroom Edge入C1，報API加入而非不存在的UI。Admin只svc bootstrap。controlled expiry只測owned S2 revoked refresh後本機觸發真refresh拒絕，標CONTROLLED_REVOKED_REFRESH，不當自然JWT過期證據；放學生業務之後。Recovery verify在58321手動接必要302/303，Location僅58373/reset-password且無error，token不進log；完整functional工具外層stop25min，產品timeout/SLO不變。B1不提供假成功占位CLI，package script在B3接線時新增。 為保留共同exactSHA，工具順序為B1/B2/B3→WB4c工具/manifest→納入自有design/plan後最終freeze→先真functional→3/10/20/40/60。即先完成必要工具再建立一次小樣本，仍是功能通過才進負載；不為每個工具commit各建六人或重跑全流程。若真functional發現bug，依原failure/最小修正/review與新candidate處理。

WB4c preflight不能再要求整個DB全0：首次functional以前維持空基線，之後immutable與fixture必須依先前owned retention manifest精確核對，拒未知外來資料而非刪除它。依Owner追加的雙情境，容量fixture重用functional的T1與R1（其新密碼以成功recovery的私有checkpoint為準），採fresh40／fresh60真UI註冊cohort；後者59位學生＋T1成完整60人登入／遊戲前綴，另一學生保留註冊證據。教師先正常建兩個owned班，60班重用capacity class，outsider另外列。不得另預建59個Auth帳號替代首次註冊。這是Local工程選擇，Hosted帳號數／資料政策仍依具體窗口批准。

**Ownership:** root：全新持久 runtime／keys／服務隔離與獨立SQL／證據；worker：`scripts/concurrency/` 的配置／entry-browser／journeys／metrics／receipts／owned-fixtures modules及直接tests、需要延伸的 `scripts/live/capacity-config.ts`／fixture計畫／checkpoint／cleanup tests、scoped verify command與package script。功能 bug先實際RED後另列最小owned paths再修，不把未重現假說寫進產品。

**Interfaces:** config分 Local執行與Hosted fail-closed；profile僅3/10/20/40/60；actorCount含teacher，outsider另外計；accounts/ownership/receipts/checkpoints使用同一 plan；每run記source/artifact/keyfingerprint/profile/predecessor。entry-browser使用真UI登入barrier，並區分protocol/hybrid，不能混列結果。

- [ ] root先新project/key建立與health/DB盤點，保留所有舊project；secret只進0600檔，禁止raw entrypoint/env/error。完整遊戲產生的ledger保留，記停止狀態與最後計數。
- [ ] 先真SDK→repository→hook transport計數：profile GET503 SDK內建4calls已由WB2實測，同QueryClient外層組合的上限需RED確認；read budget與jitter不能只測fake rpc/single端點。既有SDK PostgrestBuilder有`.retry(false)`，SupabaseClientOptions.db無retry選項，不能猜加db.retry或修改依賴；最小修法僅在已重現的REST read使用既有介面並保留外層policy。再做offline guards／ownership／60名完整帳號計畫／process exit／generator saturation→INCONCLUSIVE tests及上述工具；run前所有閾值和場景manifest交root review。沿用Live安全清理，只清真的能清的transient。
- [ ] 單人/3人走既有入口、學生流程、教師與Admin負向；既有 /register OTP、/forgot-password→/reset-password 以新project Mailpit驗證小樣本，不使用舊port或預設TEST_USERS；另依Owner追加驗fresh40／fresh60學生真UI註冊、實際郵件與OTP，再以其中59位＋T1測既有登入／遊戲；不能以少量OTP涵蓋60註冊。Auth多observer／快速signout／switch／tab用deferred或browser測試確認，若需修正提供原RED→GREEN。
- [ ] 固定新candidate：真build+marker+bundle host／fingerprint／secret scan、scoped受影響checks綠、root review；3→10→20→40→60各級browser entry與backend leg分開取證，任何非PASS停止升級。保留fail與cleanup counts／resource health。 所有需進PR的設計／plan／工具在最終freeze前一併commit；load後結果留root統籌review/handoff與持久artifacts（不進git），用PR description呈結果，不為補report-only commit改動已被測exactSHA。若code或artifact有實質變更，明列新candidate並重驗受影響項目，不追認舊run。
- [ ] 彙總spec09 budgets、每actor fan-out/cache/retry、CWV適用界線、玩法資料保留、generator限制；不得以Local或headless數據宣稱Hosted／實體裝置通過。

WB4b-B3已ACCEPTED：84c61dfc310408773cdd09f6e40a34c6011c70ab，初交426唯一publication P2同輪清除。worker25files180tests／delta4files42tests；root初7files61、delta2files21與真Chromium CDP4controls PASS。producer只留PENDING候選，root外層正常processclose/exit/elapsed/strictstdout/候選相等與無owned殘留才發布權威receipt；真六人功能尚未跑。WB4c拆C1基礎manifest/metrics/health/receipt→C2nativebrowser入口及fresh40/60註冊→C3backend/game總runner與rootretention oracle，沿用同worker/root各段唯一review；brief見同日whole-site-c1/c2。

WB4c-C1已ACCEPTED：0452fb59a9b727be15826c05b3eeef6a59fe7501，初交0a0三P2同輪cleared。worker9files103tests，root初5/46＋delta3/44及七獨立postcontrols PASS，source/manifest固定雙cohort106及15分立legs。只是工具模型，真流程未跑；下一C2 native入口與first-OTP tools，C3及docs後共同freeze。

WB4c-C2已ACCEPTED：47cf7523913e82c33dcc66139c80fd93ca77ee89，初60b三P2同輪cleared；worker八檔36tests/fullchecks0，root初八檔27＋delta四檔25/三獨立post控制、真native synthetic四控制PASS，仍0trueAuth/容量。下一同workerC3依whole-site-c3-brief，完成後自有docs共同freeze才首次真流程。

## WB5 — Protected Staging 候選與授權窗口

**Ownership:** worker：Hosted入口 `scripts/concurrency/hosted-config.ts` 與直接guards tests；root：確切整合diff／protected branch與現有部署流程盤點／scope批准及唯一review。需要改workflow時先具體列path與side effects，不能先減弱既有gate。

**Interfaces:** Hosted config只接受staging固定ref `onkxnkzeixpezetkmocf`／URL、批准的40charSHA／fixture marker／最多60actor＋明列outsider、前級receipt與cleanup/retention政策；Localguard維持。錯target/ref/keyfingerprint/SHA/role或無approval一律拒絕。

- [ ] 本機完成候選、完整受影響checks與root review，唯讀重驗staginghead／artifactmarker／部署side effects，準備可review PR內容與exactSHA。
- [ ] 依本次整合授權備妥隔離分支與可審核的draft PR；不把舊Local-only的push/PR限制誤用成新任務額外啟動關卡。呈Owner確切merge/deploy（含tracked Functions及monitoring）與Hosted資料保留/可清理範圍、帳號數、窗口、停止規則；merge/deploy維持現有exact-head owner-approval，未核准資料政策前不做Hosted測試寫入。
- [ ] 依實際批准走protected owner-approval與exacthead，artifact實證student／teacher登入後才alias；所有gate失敗停止不自動rerun。
- [ ] 授權的Staging分級40基線／60目標全站驗證，查實際Auth/DB/Realtime queue與metrics；若generatorlimited或需要hostedsetting改動，明列未完成並做具體修補方案，不把資源設定變更算容量PASS。
- [ ] root記最終Stagingsource／deployment／run／cleanup/retention與人工待驗；append handoff並停止。不得聲稱Production ready。

## Owner追加：首次註冊與既有登入都需60人（2026-11-15）

Owner已明確選「兩者都要：首次註冊與既有帳號登入」，取代原「60只測既有帳號＋少量OTP」的範圍。B1/B2與排定Auth/mounted補丁繼續；B3/WB4c接線時新增真正UI註冊／收信／OTP leg，不能預建Auth帳號再宣稱首次註冊，不能調quota／假IP／跳OTP／自動重送429。

為保留40基線／60目標且避免無必要cohorts：註冊採兩個**互不重用的fresh學生cohort40與60**；教師是事前setup/coordinator，不列為新註冊學生，不參與該學生註冊barrier。先以3/10/20無副作用匿名入口／註冊表單檢查driver，再40→60真註冊，每級fail停止升級。每批所有人同barrier開站／送出註冊，郵件與OTP依真實抵達各自完成，分列send-skew／email／verify／成功率；不人為stagger送出以造PASS。已存在身份不能進fresh-cohort。

註冊60群成功後，其59位學生＋既有T1教師形成原3→10→20→40→60同步登入／遊戲同一prefix plan，60群另一位保留註冊成果；outsider沿用R1額外分列。T1正常建註冊40與60的獨立班級；60班可作capacity class，不另建重複capacity學生。Local總身份規劃為原functional6＋新註冊40＋新註冊60＝106，全部留存（其中遊戲ledger/媒體/audit不可unsafe delete）。這是**最高同時人數**與**累計測試資料量**的區分，非已允許106個Hosted帳號寫入：Hosted仍待具體candidate與帳號數／保留政策／窗口批准。

Local設定檔email_sent=100僅custom SMTP啟用時生效；matched CLI2.109.1在目前Mailpit模式固定Auth env GOTRUE_RATE_LIMIT_EMAIL_SENT=360000，實際唯讀已確認。保持此既有runtime設定，不調額度；實際限流／mail delivery行為仍須記錄，不以增加額度／假時鐘／換IP救PASS。Local寬鬆Mailpit額度與IP limiter旁路不代表Hosted同NAT／真郵件容量。Root先唯讀查Staging SMTP與OTP能力，Local證據不替代Hosted真郵件／同NAT突發。任何必須配置變更均另列具體批准，不把設定改過當容量完成。

WB4c-C3已ACCEPTED：9e85053a282bb65b9ad4adcfaa0cf8e2b646fda9，兩P2同輪cleared；worker61files461tests/fullchecks0，root初61/448、delta3/34及兩actual-export postcontrols PASS。完整工具交付不等同真functional／容量完成；下一共同freeze及首次六身份functional，再依15分立legs逐級執行。
