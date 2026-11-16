# M22 brief：一次完整註冊細步與 Mailpit 安全診斷

Root 統籌與唯一審查，沿用同worker。Base **68b87006e36f2bc57b4dd94b3d30f46078b3812e**。Owner 已授權 Local 多輪實作／審查直到完成；此為原 WB4 功能失敗的工具診斷，不先修改產品或 Hosted。原WIP／G8停止85／US$0與US$5 cap保持。

## 實證與未知

Native16 run43894234282/job133393317333/attempt1 已 completed/failure。bootstrap／profile／kernel6／build／bundle／Edgebind／prepare通過。真functional wsb-261116-cac748242d58用17,242.516ms，前三stage通過（canonical、fixture5、classrooms2/學生2），registration_recovery2,647.049ms FAIL/FUNCTIONAL_AUTH_FAILED；其餘未跑。registration-intent有，confirmed/recovery checkpoints沒有；Auth/users及profiles各6、sessions/refresh5，不能稱零業務、已寄到、已驗碼或完成註冊。根因仍 UNKNOWN，不從時間／count猜定。

Root真age AEAD outer342files/154128895B、inner309files/三cold volumes6176regularfiles129956311B、DB2/127tables/31roles前後全值一致、8停止與全部角色正向proof均已核，6Auth資料完整保留、未restore。Final Rootreceipt **1f2efd5bac3877775554287e4ec00b362fc175083ff29aa91c1f42a39ab72ba7**；joblog21925B/b57985656d5ccb9d56a68c35219c8f52e8b399ae30aca862f815d1d6fd801b1c。15legs全未跑，Source summary functional NOT_RUN不能抹掉實際attempt FAIL。8 image本輪均firstattempt成功，不當真M21 retry分支已測。

Readonly manifest725341a6886c483ed51a2127fee626a69166efd43dce5c0a908ddc68e22faf85與proposal e5957d17ab718fdd038f491817d421436f798a2e307c88b0c8b31be93bcb65cb已定位確定缺口：register全段safely壓為AUTH_FAILED；Mailbox baseline/wait內又壓為MAIL_FAILED。只加最外層step仍不足，一次補細步及純安全mail snapshot。

## 唯一 Source ownership（5 paths）

1. scripts/concurrency/auth-journey.ts：只registerFunctionalStudent包原14細步；既有Recovery／其他auth流程不改。
2. scripts/concurrency/auth-recovery-diagnostics.ts：新增 registration schema／factory與閉集error分類；**舊Recovery enum/schema/body/exports/filenames保持**，不抽大框架。
3. scripts/concurrency/mailpit.ts：增加純in-memory diagnostics()與原判斷點設定；不增加HTTP／重讀／權限，不改原API結果／safely拒絕／polling節奏。
4. tests/contracts/whole-site-functional-registration-diagnostics.test.ts（新增）：真register caller、factory、PrivateJournal與合成外部Page/HTTP/SDK ports。
5. tests/contracts/whole-site-functional-mailpit.test.ts：保既有斷言，補安全snapshot與原拒絕回歸。

你不是獨自在codebase，不覆蓋他人／Root docs/handoff。其餘全部Source、functional-journeys494行、全域config.safely、公用scope/Local brands、mail真schema/recipient/newID/唯一OTP/Recovery link guards、產品src／Functions／SQL／seed、operator44/manifest、workflow正常模式、M17–M21停機保留/pull、依賴/lockfile、SLO／15s/12s／Mailpit30輪1秒／全部caps保持。若path或每file500行不足先回報，不擅擴；本task不用改產品或runner summary。

## 閉集細步／資料契約

14 phases依原順序：mailbox_baseline（含建立mailbox）、registration_intent、register_form、basic_details、otp_send_action、otp_mail、otp_verify、credential_fields、completion_observation、complete_submit、post_registration_login、session_readback、profile_membership、registration_publication。每phase一次started→confirmed或failed、最多28事件，固定 registration-<phase>-<status> private0700/0600 wx檔；不得與原registration-intent/confirmed碰撞。phase/body固定schemaVersion/status/sequence/elapsedMs/code/errorType/mail；不序列化operation return。起始guard仍原R1且userId null；不跳、弱化或新增正式API動作。

otp_send_action confirmed僅原click返回，不代表寄信成功。otp_verify confirmed須原✓已認證斷言；complete_submit保原/login等待；原beforeLogout registration_completion、帳密／session設定／profile registrationComplete/student/預期membership及journal確認仍完整。原public AUTH_FAILED fallback保持；不順手改所有error mapping。

Mail snapshot只閉集 phase(IDLE/LIST/DETAIL/OTP_PARSE/RECOVERY_PARSE/WAIT)、reason、polls0..30、baselineCount/newMatches0..100|null、HTTP class、recipientExact:boolean|null、codeCount0..100|null。reason至少分LIST_HTTP/LIST_SCHEMA/MULTIPLE_NEW/DETAIL_HTTP/DETAIL_SCHEMA/RECIPIENT_MISMATCH/OTP_COUNT/WAIT_EXHAUSTED/ABORTED/UNKNOWN；原判斷點更新，不加IO。無法讀取snapshot記null/UNAVAILABLE，不假造0或success，metadata不能替代原真mail proof。區分recipient validation與其他detail schema錯；只針對本owned信件，不讀別人的mail。

**禁止**任何raw URL/query/stack/error.message/cause/name、mailID/地址/To內容、帳號/UUID、OTP/session/token/password/body或低熵OTP digest入record/publiclog；不擴error properties讀取、不觸發惡意getter/toJSON。errorType只能固定 FUNCTIONAL/PLAYWRIGHT_TIMEOUT/SCHEMA/ABORTED/ERROR/NON_ERROR/UNKNOWN，若不能安全判別用UNKNOWN。現有較敏感的原intent維持既有private處理，不複製到新checkpoint。

## writer／error／取消

沿既有recovery step模式但獨立registration family：started write必先成功再action；confirmed write失敗不能交回client/PASS。operation失敗先嘗試failed record，再**throw同一原error物件**（outer原AUTH mapping保持）；failed writer不mask原error、不續後段，missing checkpoint就是UNKNOWN。取消／late completion在跨await與mutation前後檢查，不能confirm或啟動下一步；已發送動作不重試。private writer使用原write-once/closed guard，不以memory狀態冒充已落盤。

## checks／交付

先actual caller RED：舊只有AUTH_FAILED／無細步缺口，再GREEN。真caller成功14phase次序；逐phase外部失敗只留該failed、不啟後續；原profile/membership負向不放寬。測started/confirmed/failed writer、原error identity、abort／late與readonlysnapshot失敗、惡意getter/toJSON/cause等synthetic秘密不洩漏；真PrivateJournal模式/固定檔名/overwrite拒。Mailpit測每個HTTP/schema/ambiguous/recipient/OTP/耗盡分支，原30poll/新ID與唯一信保持，request次數不增。真raw mail只在測試process記憶體，輸出僅安全結果。

跑新/原mailpit/recovery-diagnostics/auth/auth-observation及直接受影響contracts；pnpm --config.verify-deps-before-run=false lint/typecheck、tracked scoped Prettier、diff/EOF/AST或ts parse與max500。不重跑無關3785產品unit/build/183Python；只有受影響失敗才擴合理回歸。每命令UTC/start/elapsed/exit/rawSHA，保原RED/setupfail，freeze unstaged單packet列5Sourcehash/原重要檔與operator44 actualGit/其餘unowned non-docs保持。

禁止worker stage/commit/push/Native／Docker／DB／proc／signal／Hosted API／寄信／settings／讀Root private artifact/keys。Root唯一一輪review接受後 exact paths gated commit→核remote68b→正常FF新Source/push/attempt1，**仍正常six-person→15legs**；這是原完整工作中的必要診斷，不重開0businessgate、不GH rerun／跳註冊。先用真細步定位，沒有因果證據不修產品；任何非PASS停升級，所有資料保留／加密與Hosted／Production零操作保持。

## Root 窄接口補充（同5 paths，2026-11-17）

為使 post_registration_login 在既有 helper 的跨 await 邊界也能停止後續動作，允許同 owned auth-journey.ts 的 loginFunctionalPage 增 optional synchronous admit callback；default 保持原行為、其他 caller 不改。register 傳原 signal／diagnostic admit，helper 每個既有 await 返回後、下一 goto/fill/click 之前檢查，不增 Page/API 動作、不變 timeout 或 public fallback。已發出的 in-flight click 不冒稱可撤銷；只防止其後新動作。這是本檔「只 register」範圍的唯一必要窄接口例外，不擴至其他流程。新增 actualcaller deferred login fill 中 abort、settle後無下一 click/PASS 控制；仍每 Source≤500，若超先回報。

## Root 行數窄例外（同5 paths，2026-11-17）

首次實作通過3files15tests，scoped Prettier後 auth-journey.ts 為505行。Root依 AGENTS「單檔超過500行需說明理由或拆分」，只准本task此檔最多505行，取代上述對此檔500上限；其他Source仍≤500。理由是14細步完整診斷與既有login helper跨await admit必要安全檢查並存，保留原同檔API／Recovery流程與逐步可讀性；不為5行擴Source module、壓行或刪斷言。packet/review明列此唯一例外與原Prettier觀察，static只對此exact path允≤505，不一律提高。若超505先回報。此不改動產品、timeout／SLO／runtime limits或任何行為斷言。
