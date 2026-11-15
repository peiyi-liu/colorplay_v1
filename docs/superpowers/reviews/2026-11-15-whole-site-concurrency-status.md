# 全站連線修正：Codex 唯一審查

## 結果

目前：G6 followups **ACCEPTED1449561**，S格式整合 **ACCEPTED088ab08**，G7空VM準備完成、尚無服務/fixture/build。實際CI format:check已綠，16Live檔固定點格式/原CSS非空白bytes不變，兩個CSSassert僅容許合法換行；196distinct Live cases分段皆綠，未宣稱原失敗suite重跑PASS。Append-only交接log保留全部bytes並明確排除自動重排；617行round JSX為純formatter展開理由已記錄。接最終共同freeze及G7服務/真完整functional，再40/60容量。

G6修補細節：G6 followups **ACCEPTED 1449561**。Root唯一1round／Standards0、Spec0、Security0、unresolved0；21source／20logs hashes皆符。Worker68files731tests16.88s與完整checks0；Root9files120tests5.14s綠，真SQL舊schema23505 RED、migration+076/121/122共62assertions綠且每次106表及public schema/extensions hash前後一致，未persist migration。真教師postfix9.143s全checkpoint health0；受控S2 revoked refresh15.053s expectedReject1/health0且實際await/login，兩browser process正常closed/remaining0/stderr0，0新帳信。Root review summary SHA126a180929c01f9f763f431c8649b3f37b6694d88dc14ab12f824b3c1227efd8。

修正fresh Request-event quiet、真fieldset combobox/7slot duplicate與安全substeps、shared strict own auth aliases，以及只移除digest全球唯一、保留其他UUID/FK/immutable/權限的最小migration與exact121 guards。原common b084的G6完整functional **FAIL/media仍保留**，所有資料不刪，不能稱全站或容量PASS。接共同版本freeze與新空白G7真7slot/WASM/16objects完整驗證，通過後才40/60容量。Hosted限流/SMTP仍UNKNOWN，Staging設定頁瀏覽器讀取受阻；0Hosted寫入/Gmail讀寄/push/PR/merge/deploy。

WB1 **ACCEPTED**，root 唯一 review：base `85c0843ac26bce9fa9b37eeb798d66cc759f2ad4` → source `0f15b353053e44ceb658ff363abe1667b46273f2`。25 檔、835+/140−、最大498行、clean。Standards 0／Spec 0／信任邊界安全 findings 0；未改 DB、quota、Auth lifecycle、Live gate、正式答案／成績／獎勵／mutation 重送。

## 變更與 AC

六種入口讀取在401／403／429／validation／not-found時不再多發請求；profile malformed成功回應用安全錯誤且不retry。503保留最多兩次讀取retry；媒體Storage／Functions讀取同樣分辨拒絕，UNAVAILABLE既有三次例外維持。指定學生／教師read hooks共用500ms exponential、4000ms cap、0.5–1 jitter；learning舊exports與mutation mapper保留。

對應 AC-AUTH-001、AC-SEC-005、AC-PERF-003 的部分契約，不能據此宣稱完整AC／全站容量或phase PASS。依據為全站design／plan及被測clone的spec02／09；原root acceptance文件不同，不沿用其行號。

## 修改檔案

`src/lib/query/{read-failure,read-retry}.ts`及其direct tests、兩個真repo→hook→QueryClient tests；learning error／response驗證抽出、chapter map／learning讀取；profile、economy、inventory、leaderboard read mapper與必要safe error types；指定hooks與受新jitter影響的economy既有test。精確25paths／行數與48個test paths在隔離clone `.git/wb1-validation.json`／`.git/wb1-affected-test-paths.json`；權威source可由exactSHA取得。

## 命令與結果

worker：`pnpm --config.verify-deps-before-run=false lint`／`typecheck` exit0；`exec vitest run src/features/learning src/features/rewards src/features/inventory src/features/leaderboard src/features/profile src/features/teacher-content/hooks src/lib/query --maxWorkers=2 --reporter=dot`：48files／407tests PASS15.95s；指定25paths Prettier與base→head diffcheck exit0。均使用Node24既有依賴，無install／lock變更。

root：核對exactHEAD／clean／25files／max498／無禁止範圍diff，實讀產品與測試diff；獨立 `exec vitest run src/lib/query/read-failure.test.ts src/lib/query/read-retry.test.ts src/lib/query/whole-site-read-retry.test.tsx src/lib/query/whole-site-media-read-retry.test.tsx --maxWorkers=2 --reporter=dot`：4files／105tests PASS1.22s；diffcheck0。

原RED保留：landing54cases有36FAIL／18PASS，拒絕3calls、random兩端皆1000ms；media8cases有6FAIL、拒絕4calls；Storage symbolic code追加3RED。現在拒絕1call，503分別3／4calls；確認repo分類遺失、profile過寬predicate與缺jitter，反證production QueryClient default retry:false為原因。整合test曾放在錯誤TS project，最終移入App test專案，沒有放寬tsconfig／lint或刪assertion。

## 風險與下一步

本次未跑build／真Local服務／60人browser／Hosted，未證明60容量根因。教師repository、Auth handler錯誤分類／deadline、media complete不確定提交與Auth/profile/tab假說仍待後續task。接WB2登入handler RED→最小修正→root唯一review；WB1不得被當成Staging已修好。

計數補充：WB1 synthetic client seam量的是repo API呼叫次數，不是經真SDK的完整HTTP次數。後續WB2真SDK證profile GET503另有內建4次HTTP／1+2+4s backoff；同時存在QueryClient層時的總數仍須WB4用真SDK transport驗證。WB1通過不代表這個底層budget已符合全站要求。

新Local專用project `cp-whole-site-261115` 設定已備妥，API58321／DB58322／App58373；新random HMAC secret與ES256 key，CLI token對新key簽章驗證成功，服務仍未啟動／尚未驗證runtime採用。CLI指定不存在keyfile會先載入失敗，gen輸出單JWK而config需array，已依實際錯誤定位並修正root preparer。舊project／volumes／憑證／WIP保留；7份WIP與handoff既有前綴hash皆不變。

## WB2 同輪審查與必要修正

base0f15b353053e44ceb658ff363abe1667b46273f2 → 初交source84a728787c3cd7a0c002ec5e9bfa4df9223ef5b6，9檔961+/116−／max272／clean。worker17files249tests PASS9.46s、lint/type/format/diff0。Root實讀9檔：單request12s含incoming body／SDK／grant body、角色／安全錯誤／timer與並行abort隔離符合brief；named-key failclosed保留，browser只新增504→AUTH_TIMEOUT，SDK／quota／Auth lifecycle未改。

唯一review判定 **CHANGES REQUIRED：1項Spec P2**，Standards與其餘信任邊界findings0。`auth-login/handler.ts`回429會丟掉upstream已提供的合法`Retry-After`。Root以真handler＋真SDK的Node/tsx inlineprobe重現：grant429帶120秒，輸出仍429但合法metadata未保留，exit1；malformed user非JSON對照503且SDK console.error0。spec02§錯誤／重試契約與spec04§限流要求優先於最初brief對metadata的可選描述。

已交同worker同輪補正：只反射有界合法秒數Retry-After並CORS expose、每request隔離；無效／超界／無header不能猜時間或反射任意值；401/503不反射。先三hop與並行metadata RED→GREEN，再綁新SHA檢查；不增加自動登入或grant重送。此項清除前WB2不ACCEPTED，不進WB3，沒有第二reviewer／第二輪審查。

同輪修正source `b52957ca6cd04abfcd0c7baadcd370e54dd58a8c`，相對84a僅4檔162+/10−／max324／clean。三hop合法120秒先3RED→GREEN；0–86400整數秒正規化、無效／超界／date／CRLF省略，非429不反射，並行request各自metadata。worker最終17files272tests PASS9.84s及lint/type/format/diff0；root僅核對同輪4檔delta與finding已清，獨立handler/deadline／frontend504／teacher契約4files76tests PASS1.15s、diffcheck0。**WB2 ACCEPTED，1項finding已清，無未解finding。**

Root另在新Local重啟唯一owned Edge，核對index／handler／deadline實際容器file hashes與此SHA一致；nullJSON400／不存在的合成帳號401皆安全body相符，結束source仍clean。這是非真帳密的runtime探針，不是合法student／teacher登入或容量證據，未建身分、未grant。第一root helper誤用legacy `/home/deno/functions`路徑，在HTTP前hash查找FAIL；唯讀Mounts定位後改用本CLI真實owned絕對bind路徑，產品碼未改；初FAIL後診斷報告與PASS分檔保留，不覆寫原紀錄。證據位於新runtime `wb2-runtime-probe*.json`。

## WB3 唯一review與同輪修正

初交base b529→source325321fe68a85c7a30ac5fe50507e12b27d92d72，17檔2118+/526−；先分組摘要，再逐模組讀產品與關鍵tests，未整份貼超1500行diff。核心含先svc_fail原子fence確認ok+same run才刪、processing replay不重做、權威receipt恢復、單張／ZIP checkpoint及顯式recover/cancel。既有Db schema／RLS／magick-wasm0.0.43／ZIP parser不變。

worker必要15files111tests PASS6.43s，lint/type/format/diff0。額外未改assets CLI有2case因sandbox MachPort在Chromium啟動前環境FAIL，原命令／結果保留，非本task affected，未改skip/assertion、未稱PASS。Root新Local scoped pgTAP076 32＋121 10＝42 assertions PASS；測試／臨時extension全在原交易rollback，Auth/profile/media/XP/wallet前後0，canonical259題9卡、120migrations不變。此為原子guard實證，非60人或正式圖片處理phase PASS。

唯一review **CHANGES REQUIRED：2項P2**。一是handler harness的fake processor只給thumbnail，而假complete忽略真契約卻commit兩variant receipt；要求合法兩variant與實際uploaded paths／rows驗證，更新final3個物件斷言。二是catch recovered verified分支已知sourcePath卻未嘗試清理該run quarantine；要求只在權威成功確認且已知精確path時best-effort cleanup，失敗仍保留receipt／正式物件，不能倒回rollback。其餘核心產品／權限／scope審查暫無finding。

兩項交同worker同輪補正、先RED後GREEN；不新增reviewer，不改DB／processor，不為initial replay未知path猜刪或列目錄。325初交未ACCEPTED，WB4未開始。

同輪新source `d4934df5540ad1b242a8af420e434d3a5857cbc6`，相對325僅handler／harness／直接test三檔156+/32−。合法兩variant＋valid UUID／scope／uploads的模型先重現兩個quarantine漏清理RED，再補confirmed recovered known path清理；未確認仍保留、其他run不刪、清理throw仍保留200／權威receipt與正式3物件。worker最終15files117tests PASS6.45s，完整lint/type/format/diff0；root同輪核對delta，獨立4files53tests PASS1.41s、clean／diff0。兩項finding已清，**WB3 ACCEPTED**。

root另核對原processor／ZIP parser／media migration／deno.lock bytes與b529相同；SQL121 hash與既有42assertions的被測檔吻合，未因無改變而重跑。尚無真正WASM上傳、跨reload續傳／Hosted故障或容量通過宣稱。接WB4a真SDK／fetch層budget與bootstrap observer診斷，再全站functional及60人harness。

### WB4a — 真 SDK／fetch 診斷完成，最小修正進行中

base d4934df5540ad1b242a8af420e434d3a5857cbc6，產品未修改時3個新增test files／44 cases：33預期RED、11PASS，exit1／1.39s；直接ESLint/typecheck0。safe primary在隔離clone `.git/wb4a-consolidated-red.json`。使用安裝的Node SDK2.110.2、真repository／hook／QueryClient與Quiz頁／AuthBootstrap，只有fetch與時鐘合成；不是Local實體延遲或60人測試。

七個REST入口（profile、review_progress、quiz_templates、teacher review_cards／subtopics、quiz_session_question_state兩頁、live_activities）503全部12個實體HTTP：外層3次乘SDK內層4次。profile network／timeout亦12，timeout fake clock直到201750ms才settled，12個signals終止、timer/listener最後0。profile／review_progress拒絕401／403／429各1，其餘5入口各3；catalog／Quiz／activities缺jitter。RPC POST503為3、媒體Storage／Edge POST503為4，既有控制組PASS。

兩個profile observers於真登入／切換身分各3個GET，refresh額外0；晚到舊身分回應未覆蓋新UI／共享cache，不能宣稱已發現身分洩漏。已核准同worker最小GREEN：七read builder.retry(false)＋缺少的分類／jitter，profile user-scoped key移除observer reset，保留base prefix並修Admin invitation exact caller；server登入profile read使用共用production factory關閉SDK內層retry，維持@2、12s及grant不重送。必要quiz error小抽出允許，mutation／DB／配額／Live狀態與Realtime契約不動。尚未完成或審查。

### Root Local準備與Auth限流parity待驗

新Local唯讀content baseline：published course1／chapter6／section21／subtopic21／question258（total259）／quizTemplate26／Blook20，reviewCards9，Auth/profile/classroom/XP/wallet/media0；120migrations。receipt `functional-content-baseline.json`，非functional PASS。實機16GiB／8logical CPU，專用VM6GiB／4CPU；舊Node-only RSS gate不足全browser，WB4c須含Chromium子樹／host／VM分列。

`auth-limit-parity-audit.json`真Auth健康版本v2.192.0、TOKEN_REFRESH150、RATE_LIMIT_HEADER未設，source config sign_in_sign_ups30不能代表已enforce；官方同tag limiter token burst30、header空且無SBFF不套IP限制。Local enforcement／Hosted parity待實證，無登入burst／Hosted設定讀取或配額變更，不能據Local60推論校園同IP可用。完整官方來源已記design。

### WB4a — ACCEPTED，真HTTP預算與profile合併

**變更摘要／AC對應。** base d4934df5540ad1b242a8af420e434d3a5857cbc6 → head 7a82f6d909357da4686e6d5f64ec5069c017fb71，32檔1183+/170−，max499，clean。AC-AUTH-001／AC-SEC-005／AC-PERF-003的相關read／登入部分；不是完整AC或phase／60容量通過。root讀完真產品與直接test diff做唯一Standards／Spec／信任邊界review，findings0，ACCEPTED。

七個REST UI入口per-builder關閉SDK內層重試，外層兩次與jitter保留；503從12→3HTTP，拒絕401/403/429均1；RPC3、媒體4例外不變。profile timeout最多3×15s＋jitter，fake clock45750ms才settled，並非wholequery15s；3abort、timer/listener0。兩observer登入／切換各1GET、同身份refresh額外0，晚舊回覆不覆蓋新scopedUI/cache；AuthBootstrap lifecycle未改。profile base prefix export及Admin invitation active refetch相容。

**檔案。** profile／learning／Quiz／teacher／Live activities純read與直接tests；新增quiz-errors／10行queryoptions保留舊exports／mutation語意；auth-login 28行共用production factory與兩個adapter投影。Root獨立精確比對Quiz／teacher／Live既有mutation mapper bodies、AuthBootstrap／browser wrapper／Edge handler/deadline/timing／DB/config/deps全不變。32路徑與行數見clone `.git/wb4a-validation.json`，不重複貼diff。

**命令結果。** worker explicit affected105files／931tests PASS35.27s，完整lint/typecheck/scopedPrettier/base→HEAD diffcheck0。root獨立7files／80tests PASS2.77s（真SDK全矩陣／Auth transition／Quiz兩頁／teacher negative／Admin真prefix refetch／server factory與deadline）；`.git/wb4a-root-focused-summary.json`。原RED33、server factory2RED、Admin1RED、舊mock1失敗與TS2589原重現全保留。TypeScript阻點由root窄診斷定位，以generated profiles單表Pick替測試client限定型別，無cast／any／ignore／版本／runtime改動，project typecheck0。

**風險與下一步。** Node installed SDK2.110.2；Deno index保持@2，cache2.119介面存在不冒稱exact runtime proof。Root先對7a82做新Local Edge source hash綁定與非帳密探針，再做WB4b真流程工具／fixtures；全站3→60與Hosted仍NOT_RUN。Local Auth limiter parity待真request證明，見前段收據。

WB4a runtime follow-up：新Local owned Edge5檔hash綁7a82，null400／nonexistent account401安全body真PASS；source全程frozen。receipt `edge-bind-20261115T001628Z/result.json`。這證明production factory在實際Deno可以執行，並不量測真503重試數／合法登入／容量。WB4b先工具與fixture brief/review，web build延至該新SHA凍結，無使用舊dist。

### Root Auth限流實證診斷：原結果INCONCLUSIVE保留

7a82 clean時一次31個同來源、同不存在合成帳號的真 `/auth/v1/token?grant_type=password` 拒絕探針，send skew0.865ms；31HTTP400、0HTTP429，前後Auth/users/sessions/profile/XP/wallet全0，無成功登入／偽造IP／調quota／重試／Hosted。原primary `auth-limit-burst-diagnostic.json` 為 **DIAGNOSTIC_INCONCLUSIVE**：root腳本假設code為字串，但實際GoTrue JSON用數字code＋字串error_code。

追加僅1個安全shape診斷確認 `code:400,error_code:invalid_credentials`，原31批次未重跑／改判；parser已修且純合成欄位檢查綠，before/after sourcehash與原primary hash在 `auth-limit-parser-followup.json`，明示hash事後記錄。數值事實是該Local路徑未觀察到IP limiter拒絕，Hosted parity UNKNOWN，不能稱60容量PASS或校園限制已修，也無本證據衍生的產品碼修改。

### WB4b-B1 初交4efe — 唯一review CHANGES REQUIRED，4項P2同輪修正

**範圍／檢查。** base7a82→head4efe6ffda5e6be5bfbaa46915927dc23ef1ef750／clean；24新增檔2968+／max475，全在scripts/concurrency與直接contracts。worker13files157tests PASS（10新files78cases＋3既有suites）、完整lint/type/format/diff0、Node24三entry import smoke0。Root先摘要>1500 diff，讀完13tool modules及10tests/helper，唯一review如下；不另派reviewer，尚未ACCEPTED，不進B2或真run。對應AC-AUTH-001、AC-SEC-005及相關functional契約部分，非完整AC/phase。

| finding                   | 位置                   | 原因與最小改法                                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2 原始SDK例外輸出        | local-runtime.ts:39    | scopedFetch rejection仍進GoTrue console.error；root真SDK/synthetic fetch probe1GET造成rawConsoleErrors1/provider marker observed。SDK前固定safe503/504並保持abort/15s，不改全域console、不重送mutation；補true SDK拒絕privacy controls。                                                |
| P2 copied session測試語意 | auth-journey.ts:376    | native opener複製同server session，copy的local logout合法撤銷原session；不能要求first原token繼續有效。區分撤銷與不同session隔離，必要重新真UI登入，再各頁每次switch/logout斷言expected UI身份/anonymous及official subject，不能只Node clone與初始全0 wallet。禁止為測試削弱產品logout。 |
| P2 popup waiter生命週期   | auth-journey.ts:395    | bare context.waitForEvent預設無限、evaluate先throw會留下未觀察promise；改有界可dispose，abort/close/blocked/evaluate throw/timeout/finally listener/timer0，無unhandled/raw error。                                                                                                     |
| P2 缺購買重放驗證         | student-economy.ts:109 | 只買一次/equip未驗brief要求重放不重扣。此RPC無request key，沿既有(user,blook_id)自然鍵，捕捉真UI原目標並綁user；confirmed後原樣重放，對照inventory/餘額與blook_purchase ledger只有1筆。不得新增key/改產品，故意多扣模型必FAIL。                                                         |

Root probe `.git/b1-root-review-probes.ts/json`，全合成fetch、實體network0；另generic503 denial control**正確拒絕**，因此沒有把NOT_AVAILABLE誤報為generic outage漏洞。Matched Auth v2.192 [logout](https://raw.githubusercontent.com/supabase/auth/v2.192.0/internal/api/logout.go):51–52 local→LogoutSession，及[auth](https://raw.githubusercontent.com/supabase/auth/v2.192.0/internal/api/auth.go):128–137拒不存在session，支持copy撤銷語意。

**證據界線（非finding）。** B1目前全HTTP route.fetch/fulfill是受限代理，且[Playwright routing會關HTTP cache](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)；routedWS有driver訊息轉送，但root讀installed1.61.1 coreBundle確認底層NativeWebSocket仍在browser，不誤說全Node socket或PNA已繞過。B1可驗INTERCEPTED_FUNCTIONAL_CORRECTNESS，B3 receipt須帶mode；WB4c需另作native entry/cache/latency方案，不能直接拿此context當Native60證據。Node答案oracle只用工具選擇點擊、不注入產品bundle；其他Scope/journal/預檢/303/ownedS2 guards無finding。

**尚未執行。** 0新Local身份/trueUI/服務修改/Hosted/Production。原4efe與RED/157PASS封存不改判；同worker接4項修正，root同輪核對後才下一段。

### WB4c 前置：原生瀏覽器隔離可行性診斷，非產品容量結果

Root在同worker處理B1同輪修正時，僅以自有loopback假服務／拒絕代理做一次Chromium149.0.7827.55診斷，不接app／Auth／Hosted。依[Chromium proxy規格](https://chromium.googlesource.com/chromium/src/+/a3e71ebfa307d8760eb68b777e2998a869940092/net/docs/proxy.md)使用單一HTTP拒絕proxy（不forward／不設DIRECT fallback）、`<-loopback>`先移除隱含loopback bypass，再精確允許假服務port；不安裝Playwright HTTP／WS routing。

實際PASS：相同cacheable asset兩次fetch只有1次server GET；Native WebSocket收訊成功1次。錯port HTTP／WS、allowed端302到錯port、外部.invalid全部拒，forbidden server HTTP／WS均0，拒絕proxy4，external forwarded0；全部ownedserver／socket／browser關閉。`.git/native-network-guard-probe.mjs/json`，receipt SHA256 e9061ed3c3808467244bb5b4f49bc3f86df96f9819d67f8b525926b06160a16d。第一次誤用未宣告playwright包在import階段停止（servers/browser0），獨立`native-network-guard-import-failure.json`保留；修為既有@playwright/test後才真執行，未安裝／改deps。

這只證明此瀏覽器版本與假服務的隔離／原生傳輸／快取可行；尚未驗實際API／PNA／全站／資源／60容量。WB4c仍須root審查完整兩個固定origin、所有hop／HTTPS／WS拒絕控制、proxy故障fail-closed與driver健康，不把前置PASS挪作產品PASS。

### WB4b-B1 — ACCEPTED，四項P2於同一review往返清除

**變更／AC界線。** 初交4efe→head9086e1fd649577c2e6694b24e1b9d3ce680b4793，12paths1080+/122−／max466，clean；僅scripts/concurrency與直接contracts。Root同輪核對全部delta及新helper/tests，無未解finding，ACCEPTED。AC-AUTH-001／AC-SEC-005與學生經濟／身份契約相關部分；不是完整AC、真browser、全站或容量驗收。

SDK前safe503/504保留15s／signal且無mutation retry，原root真SDK合成fetch probe由rawConsoleErrors1→0、provider marker由observed→false、仍1GET且拒絕。Copy logout明確查原token為session_not_found，允許已知cached source UI後清理／真UI重登入；之後三頁每次switch/logout各斷言實際displayName、官方subject、wallet／anonymous，equal-wallet錯UI負向控制會FAIL。Popup15s有界、所有terminal清timer/listener、建立後但evaluate微任務前abort也不再觸發window，late rejection已觀察。購買沿原(user,blook_id)自然鍵，真UI confirmed＋權威庫存／ledger確認後才原樣重放；原結果unknown不重送，第二扣款及unknown body負向皆拒，purchase ledger維持1筆。未改產品Auth生命周期／分數／DB／依賴。

**驗證。** worker17files177tests PASS（新4files20cases），full lint/typecheck/changed Prettier/diff exit0，packet `.git/b1-review-validation.json`；原157PASS／所有RED與root原失敗收據保留。root獨立14files98tests PASS2.778s，`.git/b1-root-focused-results.json`／summary；再次真SDK合成fetch probe `.git/b1-root-followup-probes.json` SHA256 2c4404a24632eed7386b4522fc63c3b58d76c901dbd549a03f2683ec47e5ac7f。Root前後exact9086／clean與12檔packet hashes全吻合；generic503負向仍CORRECTLY_REJECTED，並未把outage當權限拒絕。

**限制／下一步。** 所有本段tests是offline fake Page／真SDK synthetic fetch，實體network0；B1工具明列INTERCEPTED_FUNCTIONAL_CORRECTNESS，非Native/cache/PNA/60容量。Controlled refresh仍非自然JWT過期。工具共同freeze前0fixtures／0產品browser／0Hosted寫入；原runtime reviewed-candidate仍7a82，未把新工具SHA冒綁舊dist。下一步同worker依B2 brief做教師/Admin/media工具；B2/B3/WB4c均review後才真functional與3→60。

### Staging Auth限流設定：後續真唯讀可見值，非容量PASS

先前Dashboard sign-in阻點收據保留；本次恢復既有Chrome本工作tab時已顯示固定ref `onkxnkzeixpezetkmocf` 的Rate Limits，root本次未提交登入／改設定。可見值：sign-in/sign-up300 requests/5min/IP、refresh150/5min/IP、verify30/5min/IP、每用戶email間隔60s、IP forwarding關；email/h欄位工具redacted，維持UNKNOWN不繞讀。兩個Save按鈕disabled，0setting/HostedDB寫入與負載。

Receipt `staging-auth-limit-visible-settings.json` SHA256 2ce59cfe7c1c9b165cee1df07a6474a12ed3e58eb856404e02efb00147a3639c。這更新先前「設定值UNKNOWN」，沒有更新burst／enforcement／60人或校園NAT verdict；數字是補充速率，不能當可瞬間接受300登入。後續仍依具體candidate／Hosted窗口與exact-head gate，任何設定變更另需批准。

Staging設定解讀補充（官方文件事實與實測界線）：[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) 明確將 password/refresh/ID-token/PKCE 全歸 `/auth/v1/token`，目前Dashboard「token refresh150/5min」不是只管refresh；sign-in/sign-up300/5min對應signup/recover/resend/magiclink/otp/user等端點。文件描述多數IP bucket burst30；matched Local [v2.192 source](https://raw.githubusercontent.com/supabase/auth/v2.192.0/internal/api/apilimiter/apilimiter.go) Token SetBurst(30)。**需查證**的是此Staging實際版本／gateway IP鍵／執行期分布／當次60人拒絕，不得從設定或Local bypass直接推定實際429、也不得把300當60同步密碼登入保證。WB5需覆蓋真正UI→auth-login→password grant路徑的同步突發，保留429失敗、無假IP／配額先調大／自動重跑。尚無因此衍生之產品或Hosted設定修改。

### 新診斷：native copied opener 共用Auth BroadcastChannel，產品修補待執行

**確定事實。** root以正式 `getBrowserSupabaseClient`/`createTabScopedAuthStorageKey` 模組、installed SDK、真Chromium149.0.7827.55與原生window.open，對自有loopback假Auth做一次獨立診斷。模組hash `3bd0ffe2990c7383d10950e9fc61a05c7dc5ba7d5475d92357d52b49b165039f` 與9086原檔吻合；現有esbuild從tsx依賴解析，不安裝，不build產品dist。原生copy帶相同tabId/storageKey。雙頁舊session清除後，first新S1使仍無canonical session的copy收到SIGNED_IN S1；copy新S2使canonical仍S1的first收到SIGNED_IN S2；copy logout使canonical仍S1的first收到SIGNED_OUT。三項皆真重現，6請求只到假Auth，unexpected0、產品/Hosted/fixture0，所有browser/server/socket關閉。

`.git/copied-tab-broadcast-{probe.mjs,probe.json,entry.js}`，primary receipt SHA256 500298082f6c1bb0d250a0824314e12d884df6a9cbb42bb3fee64e58a5254c2f。installed auth-js的BroadcastChannel handler只通知subscriber、不更新該頁storage；正式auth repository原樣轉交session給listener。這與B1「同server session合法撤銷」不同：重新建立不同session後仍有跨頁身份通知污染。**尚未證明**完整產品UI的具體畫面／後端越權；RLS並未因此被證明繞過，不作此宣稱。

**處置。** B2維持工具scope，完成唯一review後，同worker另做有界Auth產品修補（browser-client與直接tests），root唯一review；保留reload/legacy canonical storage與15s/官方logout/backend session契約，不能用全域關掉BroadcastChannel掩蓋。共同final freeze之前完成此補丁，之後B1完整真UI與native control驗證。原診斷RED與B1接受結果保留；此為新產品診斷，不重開B1工具的review輪。

### 新source診斷：目前單張圖片route未接WB3恢復，待actual component RED

B2盤點正確指出actual route是AdminContentPage→ContentEditorForm→ContentEditorMediaField，root獨立核對；舊ContentMediaWorkflow未掛在此route。form240+對所有upload errors一律顯一般失敗、沒有recover/cancel；file change清request。更重要，prop default每render建立新createContentMediaRepository，而repo的checkpoint是instance closure Map。這是已確認source缺口，不宣稱真UI故障注入已完成；WB3後端／ZIP與舊component直接綠結果不改，不代表此實際caller恢復完成。

B2仍先做實際single happy插圖（不假稱保存run-prefix單張draft）、ZIP兩新draft與cancel工具。之後同worker按`2026-11-15-whole-site-mounted-media-fix-brief.md`對actual mounted component＋正式fallback/checkpoint做RED→最小caller修補，並擴single pending真UI工具，root唯一review。保持server/repo/parser/DB/deps及15s不動，不新增fake題庫或canonical發布；final freeze前解決，0真fixture/Hosted寫入。

### WB4b-B2 初交f7a691 — 唯一review 1項P2，同輪修正

**摘要／檔案。** base9086→f7a691117b875c38f88bd58ce8338f280977ccb8，22檔2947+/9−／max371／clean。Root先按teacher/Live、Admin/MFA、media/hooks/oracle及直接tests責任群摘要，再讀全部source/tests和browser-runtime/capacity-actors整合delta；沒有貼大型diff。worker48files541tests、新7files42cases、full lint/type/scoped format/diff/Node24 entry import全0，safe packet `.git/b2-validation.json`，初始RED/ZIP Buffer shape/type/lint失敗全保留。此是工具驗證，不是實際Admin/教師/WASM/容量或完整AC PASS。

**唯一finding P2。** `scripts/concurrency/teacher-live.ts`逐題流程只把前三輪留memory，完成全部才寫teacher-live-completed；中途第4～20題失敗缺逐題最小intent/confirmed，未符合已核brief「其餘逐題minimal safe correctness/result counts」。最小改法：每題UI答題前write-once intent，真backend feedback/answeredCount2後confirmed；session/position/題數/安全counts、不記答案或raw payload，失敗題不可confirmed，不改20s/800ms/finalize。這是唯一review，同worker同輪修，不另派reviewer；目前CHANGES REQUIRED，未進Auth/Media補丁或B3。

**其餘核對。** 原actor optional factory前保Local guard、內部combined signal/close與真request計數，預設舊路徑不變；typed hooks先origin guard、3xx不after/不follow、pre-send cancel真0provider call、response dispose有finally。MFA只用真UI steps，TOTP private journal，不呼叫舊public secret store；Admin每頁以真成功RPC paired heading，outage不當拒絕。Current mounted single只happy插圖/unsaved、ZIP第二張post-verified掉回覆同run恢復/前圖不重跑、獨立cancel pre-send；root SQL/object-bytes oracle必填且counts/booleans白名單。實體檔案oracle／完整UI與新已重現copy/mounted缺口仍待後續，不以本packet假裝完成。

### WB4b-B2 — ACCEPTED 562074，同輪逐題checkpoint完成

初交f7a691→562074fe3709b61675c3a8df378edfc655f2ef44／clean，唯一P2以teacher-live單檔+19/−1解決：每題UI答題前write-once intent，只有backend question_feedback/answeredCount2確認後才confirmed，首三題詳細timing、後續安全counts。任一journal failure直接阻止後續動作，失敗題不confirmed；20s／800ms／原template／正式finalize不動。Root同輪delta核對清除，無未解finding，ACCEPTED。

Worker初交48files541tests PASS；同輪26files385tests PASS6.132s及完整lint/type/scoped format/diff exit0，`.git/b2-review-fix-validation.json`。Root在final clean562獨立9files56tests PASS2.497s（七新直接suites＋原actor/default與browser guard），`.git/b2-root-focused-results.json`/summary；原packet其餘21檔hash及final teacher-live hash全吻合。既有RED/原packet均保留，未為低影響diagnostic紀錄新增鏡像測試。

對應工具範圍AC-AUTH-005/006、AC-TCH-001/004/009/011/013/014、AC-LIVE-001/002/003/009相關部分，不是完整AC/phase。無src/DB/grants/依賴/真服務／身份/產品流程/WASM/容量/Hosted操作。Root媒體oracle仍必填待接；actual copy Auth與mounted single pending兩個新產品缺口**仍未修**，下一步同worker先Auth brief、再mounted媒體brief，之後B3/WB4c及共同freeze後真實證。Root reviewed-candidate runtime pointer仍7a82，未冒用舊dist/Edge作新版本PASS。

### Auth copy產品補丁 — ACCEPTED 6e45708，root Native分頁控制PASS

**變更／AC。** 562074→6e45708b8f32ef8c84920c754d30ae315f8fab97／clean，僅browser-client.ts與新direct regression2檔393+/8−／max356。每document singleton建立時產生獨立SDK storageKey/廣播namespace，小adapter只映射session、-code-verifier、-user至既有canonical sessionStorage；未知key固定拒絕。原canonical helper/legacy優先、官方serialization、15s及backend logout/MFA/角色不變。Root讀完整diff/test做唯一review，findings0，ACCEPTED。對應AC-AUTH-001/003相關module部分；AC-SEC-005是rate limiting，**本補丁不覆蓋它**，不稱完整AC。

**證據。** Worker先3次setup failure皆保留（Node共用window setup、jsdom/esbuild TypedArray、VM漏WebSocket），第3次停止後root查installed SDK精確核對缺constructor/window.location；未改共用config或產品避開測試。再真production bundle/SDK/native Node BC得到2fail/2pass行為RED才改產品，新5cases及原9cases14PASS；完整25files372tests PASS4.743s、lint/type/scoped format/diff全0。shared GoTrue revoke僅合成負向，不當真server證據。

Root獨立5files58tests PASS1.236s，`.git/copied-tab-root-focused-results.json`/summary；packet兩檔hash全匹配。另真Chromium149/native opener＋正式client/SDK對owned fakeAuth獨立PASS：copy保留原canonical身份，fresh匿名控制、不同帳號sign-in通知/登出互不污染、reload保session、same-document singleton、new無opener匿名全通過。每phase3s通知觀察、最大action22ms，前後source frozen，6請求只到假Auth，unexpected0／產品API/身份/Hosted0，全owned資源關閉。新primary `.git/copied-tab-isolation-validation-6e45708b8f32ef8c84920c754d30ae315f8fab97.json` SHA256 dccac25433d6ba440c90bd06019deccb68c58e8b672fb0de5258b28aee71109c，原3項RED primary完整保留。

**限制／下一步。** 此為client真browser隔離證據，尚非完整App真帳密/GoTrue/MFA/60同進站；B1共用server session合法撤銷與最後完整UI仍必驗。Runtime pointer7a82/舊dist不冒綁6e。下一項同worker修actual mounted single editor pending/checkpoint，再B3與新增首次註冊40/60及原登入3→60工具共同freeze。

### 首次註冊前置：Custom SMTP已開，但送達／60突發未驗

Root在已授權固定Staging ref onkx的existing Chrome工作tab經Emails→SMTP只讀可見switch=on與Save disabled；未讀/記credentials/provider、未送信/改設定/寫Hosted。`staging-smtp-visible-status.json` hash b553ccea74f14ac4be675f3dd297a25972e97d244f5be6283ee5a96c74d9e9e4。這確認非單憑default內建郵件假設；emails/h仍UNKNOWN redacted，實際供應商發信額度與控制收件地址/alias、OTP per-IP burst/enforcement及送達仍待具體窗口。Local Mailpit不能冒充真郵件。Owner已要求首次註冊40基線/60目標和既有登入雙情境，Hosted累計106身份/受控信箱/保留窗口需在候選具體後明確批准。

### Mounted單張媒體產品補丁 — ACCEPTED ccab5fc，actual caller/checkpoint恢復

**變更／AC。** 6e45708→ccab5fc4edb022fee47736d7351c5ac68cfdfa7c／clean，10檔761+/104−，Form抽hook後455行。Root讀完整產品／工具／直接test diff做唯一review，findings0，ACCEPTED。實際掛載ContentEditorForm使用同mounted fallback repo與captured request/repository/file/alt/role；pending鎖file/role/alt/remove，明確同request recover／confirmed cancel，unknown不解鎖，shared同步gate擋upload/recover/cancel連點。用getValues保原圖片／排序、authority role與dirty，normal form保存／publish／repo/Edge/DB/parser/15s皆不改。對應AC-TCH-014不確定提交／物件保護相關module部分；未涵蓋full private delivery或AC-SEC-005 rate limiting。

**測試。** actual Form無mediaRepository prop，spy factory回正式repo＋合成transport，先3fail/1pass RED再4PASS。跨render fallback1、begin/upload各1、同request process RPC2／model processor commit1、unknown cancel維持pending直到confirmed、double click不重入。恢復後outbound save RPC payload保留原圖sort0及新critical alt/role/sort1，僅觀察mock outbound，不宣稱真持久化。工具6slots全列private proof：single/zip1/zip2/single-recovery critical verified4、兩cancel aborted2，variants9由typed receipt導出；readback每run新增semanticRole/sourceSha256，schema不硬編數量。

worker35files229tests與full lint/type/scoped format/diff/Node import全0，`.git/mounted-media-validation.json`；原RED/初始harness/type/lint錯誤保留。Root final7files63tests PASS1.829s，`.git/mounted-media-root-focused-results.json`/summary，10檔hash與clean ccab吻合。

**限制。** 未真UI／WASM／DB物件readback／新增身份／容量／Hosted；只保當頁checkpoint，reload durable resume未新增。Root oracle已同步mandatory role/source hash與全6slot approval/private proofs，20synthetic guard controls PASS，僅一次真Local缺失物件GET確認typed400/404 absence；不是4個真資產/9variants已保存證據。下一項B3只做Local functional runner／receipts接線，之後WB4c含Owner要求的新生40/60與既有登入3→60；共同freeze後才首次真functional。

### Local host埠隔離 — 已修正，非容量PASS

Root用host lsof確認專用Colima轉送的API/DB實為wildcard。Matched Colima0.10.3/Lima2.1.4後，正常stop/start唯一專用instance，以官方per-instance edit只改兩條hostIP0.0.0.0→127.0.0.1；結構比較確認無其他設定變更。最終API58321/DB58322/Mailpit58324皆host loopback，29容器（含archive）/8running/21stopped與全部ID/volume、DBidentity/counts保持，預設profiles/context保持；0刪除/新fixture/Hosted。首輪數量假設28於initial退出無mutation，原failure保留，新v2依實查29執行成功。`loopback-isolation-v2-result.json`，after configsha8c7f547373db25606143b0df1a042783b90be3e83c3573f33c42137382abd245。Colima resume會重生yaml，任何後續restart使此證據失效；不以一次修正永久假設隔離。

Root fixed`functional-preflight.py`已備：exactcleanreviewedSHA、新Localtarget、真Docker DBid/project/port、systemidentifier、實際hostloopback/configsha、liveREADONLY120migration/71tablesallRLS及7fixture表0counts。21pure負向controls PASS（0DB/network/fixtures），helperhash33eb9cdc639ab906ad38e42379334601f627dcc4db00ed709b6ed688469645de；尚未真functional執行。B3同worker繼續offline runner/CDPhealth，不因環境修正宣稱全站／60人PASS。

### WB4b-B3 — 唯一review CHANGES REQUIRED（1 P2，final publication）

**範圍／驗證。** ccab→426455de6b22a1a6aba7b69f34b2254edea4de7e／clean，11paths2516+、max470，先摘要後逐檔審查，排除generated/legacy/artifacts/lock。B1/B2實際15stage接線、固定root port／秘密與authority guards、strict public schema、25min含30s清理、晚到browser/context停止fence均在範圍。Worker25files180tests及lint/type/format/diff/import全0；packet SHA c29c454c327995de2d4f96b4f3fc4532abc47c767bdd07b58a86be662daa6763。Root獨立7files61tests PASS，11hash全匹配；另真Chromium149/CDP+owned fakeHTTP的4controls PASS（exact4media drop+1known refresh健康；偽裝JSconsole／同URL未批准drop／未知refreshcode皆拒），`.git/b3-health-native-426455de6b22a1a6aba7b69f34b2254edea4de7e.json` SHA7cf6e6bc73c3619fae13c2f7eaed74b55430b69601cc666873931610760c58e2。皆非App/身份/WASM/容量PASS。

**唯一finding。** Spec P2：functional-runner最後將PASS receipt交給可晚完成的journal.write，再以boundedStop逾時回INCONCLUSIVE；原write仍持舊PASS，稍後可留下主檔PASS，與命令結果／25min publication規則矛盾。Root正式runner+readyScope+deferred finalwrite已重現 returned INCONCLUSIVE/lateJournal PASS（只壓縮該30s timer的offline控制，0服務/身份）。`.git/b3-late-journal-probe.json` SHA d39423f336afde408ce5e4ed8d268e1fcd479cb5bd1802d15b9190ae54bb9c8c，原主收據不改。Standards0／Spec1／trust-boundary0。

**同輪修正。** 已交同worker，先具體pending candidate與外層權威publisher契約或等價可取消原子方案；不能只改mutable物件（真正journal已序列化字串）、不能覆寫／刪receipt、延budget或同步阻塞FS掩蓋。新deferred-finalwrite RED→GREEN後root只核同輪delta，未ACCEPTED不進C1。Root自身helper/60fake-driver/Host/VMcollector準備可保留，實際functional與雙60仍未跑。

### WB4b-B3 — ACCEPTED 84c61df，同輪publication cleared

426455→84c61dfc310408773cdd09f6e40a34c6011c70ab／clean，只三檔128+/1−。唯一P2 cleared：producer寫strict `functional-result-candidate.json`，top-level PENDING_EXTERNAL_ATTESTATION、receipt用既有strict schema移除result，任何nested raw/verdict extra拒絕；write完成再核同cleanup deadline，只回CLI verdict。producer不建立權威主收據。Root外層在正常close/exit0/no signal/elapsed<=25min、strictstdout/finish PASS、candidate去verdict逐值相同／exactsource/run/artifact/keys與ownedchild無殘留核對後，才write-once0600 functional-result.json與process-close證據。Late/缺檔/candidate-only/unknown不得升級，不延原budget。

Worker兩個publication RED保留，再正常actualCLI+fakeports、deferred serialization／write完成但clock過deadline GREEN；full lint/type、四檔42tests、format/diff皆0，packet SHA9c82e64a88e6050afc2b7d09a5ec61263552d6436e222dde197815999f37eeeb。Root同輪delta獨立兩檔21tests PASS，全部11path現hash吻合（原8＋delta3）。Root新deferred serialized control returned INCONCLUSIVE／latecandidate PENDING_EXTERNAL_ATTESTATION／nested verdict absent，`.git/b3-late-candidate-validation.json` SHA10a33bf2c37ea560b41cd08d8a3e2d99751310357e4ba5c63df6c567245e9560。原latePASS RED／426與nativehealth4control收據均保留，healthsource不變不重跑。`.git/b3-root-review-summary.json`。

無未解B3 finding，仍只是tools/組件證據，真六身份功能/WASM/物件/雙60/Hosted未驗；root external publisher準備中，final freeze後才spawn。下一項同worker C1 manifest/metrics/health/receipt依獨立brief，再C2 UI入口註冊、C3 backend與總runner，所有工具/自有docs共同freeze後才首次真functional。runtime pointer仍7a82，未build或新建身份。

### WB4c-C1 — 唯一review CHANGES REQUIRED（3 P2）

84c61df→0a0d1f8dce406d022c91164cf8b4ab8e1fa3c0f9／clean，11新增2384+/max463。先摘要後讀五production／五tests／synthetic helper；root唯一review Standards0／Spec3／trustboundary0。worker9files88tests（新五檔46+B3四檔42）及fullchecks/import0；packet SHAd4dbe9b7e084b8f678ba26b85cb313aaad36ebc8db1a050b39061adaf7331612。Root新五檔46tests獨立PASS，另正式exports＋既有fake helper的guard probes實證以下三項，0真服務/身份/容量。

1. metrics僅independent rows計錯誤，30真finalize success＋1replay error回PASS/errorCount0，但perActor errors1。重放不得多算p95獨立樣本，失敗仍須計入總error並阻止升級。
2. receipt parsed-summary重算不足：小樣本requiredop errorCount1但claimINSUFFICIENT，仍PASS且下一10人predecessor接受；perActor=[]仍PASS；VALID health卻NodeRSSmax>2GiB亦PASS。須驗可推定的summary一致性／完整actor索引聚合、error不能被不足樣本掩蓋、立即RSS/critical與VALID矛盾。Browser峰值超6GiB不能單憑max判10s持續，保持原guard。
3. Native／Hybrid真樹count>0但browserRSS/footprint0被當VALID。需positive，protocol維持null／count0語意。

`.git/c1-root-guard-probes.mjs/json`保留。已同輪交worker優先於metrics/health共用小validator、receipt呼叫，仍既有ownedpaths；若超500可提唯一focused validation helper，不擴產品／runtime／threshold，不進C2。原0a0/packets/RED完整保留，未解三finding故不ACCEPTED、不真load。

### WB4c-C1 — ACCEPTED 0452fb5，同輪三P2 cleared

0a0→0452fb59a9b727be15826c05b3eeef6a59fe7501／clean，六檔346+/40−，無新helper／threshold／產品變更，max455。Replay error/timeout計入全部operation errors但不灌獨立p95；共用validateCapacityMetrics在builder/receipt核label、全actor索引/aggregates/quantile/count；validateCapacityHealth共用核VALID即時NodeRSS/critical/reasons/正值，Native與Hybrid memory0回UNKNOWN，protocol仍null/count0。小級只容純INSUFFICIENT升級，missing cold/timing/concurrent teacher不可；保留短browser高峰正向，不將max當10s持續。三finding皆清，0未解。

Worker新10case RED與3case小級evidence RED保留；final9files103tests（C1五檔61+B3四檔42）與lint/type/format/diff/import0，packet SHAa05b7f551a20b70004a5d52c1076deb46195732785b5ab815a7af9c759d3c617。Root同輪三檔44tests PASS，11finalhash全match；獨立七個post-controls全PASS（replay失敗計數/三種矛盾拒絕/zeroNativeUNKNOWN/完整但缺cold不升級/正常small仍可升級），`.git/c1-review-root-guard-controls.json` SHA0ead6a6e5a26de5e8ccd15326e8c2d23bf28984d88544da30dad5febe443e107。原initial五檔46、全部root RED與small-leg probe保留，不改寫舊收據。`.git/c1-root-review-summary.json`。

AC-PERF-001/003與AUTH/SEC005僅工具模型範圍；0真UI/API/collector/身份/容量/Hosted，不能稱全站驗收。下一項同worker C2 Native入口與fresh40/60 UI-OTP工具，root準備readonly owned-data oracle；C3接實際backend/game總runner/外層authority。全部工具與自有docs共同freeze才真正functional及分級負載。

### 2026-11-15 — Local 郵件額度 config/runtime 區分（唯讀澄清）

- 原文件以config email_sent=100稱Local100/h並不準確：固定project Auth實際env GOTRUE_RATE_LIMIT_EMAIL_SENT=360000、SMTP_MAX_FREQUENCY=1s、TOKEN_REFRESH=150，RATE_LIMIT_HEADER absent；未改quota/重啟/寄信/新身份。Matched CLI2.109.1 `apps/cli-go/internal/start/start.go` buildGotrueEnv設360000，僅customSMTP enabled分支才用config EmailSent；現在Mailpit分支未覆寫。matched Auth2.192.0 numeric rate解碼為每hour interval的events，因此不能用100/h預算猜需等待1h。
- 唯讀receipt `local-auth-email-limit-readonly.json` SHA7218806ecf79f92e5d5687877b87b6a26405d13f09aebd83e80ef3c6a3a76cc9；官方來源 https://raw.githubusercontent.com/supabase/cli/v2.109.1/apps/cli-go/internal/start/start.go 。Plan/C2brief同步更正，禁止調額度/假時鐘/換IP/重送429仍保留。Local寬鬆Mailpit/IP旁路不代表Hosted SMTP與同NAT容量；Staging email額度/真送達仍UNKNOWN。
- 同worker C2 offline helpers持續，已完成observer/mailbox/proxy實際export RED→GREEN，尚未launch/listen/App/API/OTP。Root準備strictfresh/ownership readonly adapter（DB無registration_complete欄，依正式profile repository推導），之後C3共同freeze才首次真流程。

### 2026-11-15 — Root registration／retention readonly ports準備（C2仍實作中）

- Root runtime新增capacity-root-readonly.py＋capacity-registration-readback.py：fresh全cohort mapping/既有Auth精確owned集合、同DB時鐘baseline、write-once實檔hash，capture綁private sendintent/原freshproof/實際UUID/createdAt/profile derivedregistrationComplete/唯一active student membership。UNKNOWN/部分建立皆保留不當PASS，不補metadata/不刪帳。31actual-export purecontrols PASS，v2receiptSHA3ed8d9891f931a67cda3d2001fdcbac1a88c67742edb690e192592c12b4fac94；0DB/subprocess/network/fixtures。
- 另一次新Local單筆READONLY schema診斷確認SQL欄位/DBidentity/RLS、migrations120，Auth/profile/classes/members/XP/wallet仍全0；receiptSHA3c9f7b19f2bde99cd65abfbe34853c9485948ce9f009e9e5d6a6647e9e15c501。這不是最終sourcefreeze attestation或functional/容量PASS；runtime pointer仍7a82/未新build。
- Root capacity-retention-readback.py準備精確functional3班＋normalT1兩容量班/全部membership、ownedsubjects、此前XP/wallet每row id+digest保留與canonical digest不變；root順序前後proof/previousbytes hash。25purecontrols PASS，v2receiptSHA31c8e92092d54fbe9e88ff809f0c7461a107f7a9e53c2a93d06f256ad5b2b228，無DB/HTTP。Helpers最終hash與C3接線尚待freeze，不能當已實際核對新帳號。
- 同worker C2目前observer/mailbox/proxy/runtime實際exports RED→GREEN，entry/registration coordinators續作；0真browser/listen/OTP。Root C3有界brief已備，必須C2 ACCEPTED才開，接完整native/protocol遊戲/collectors/單legCLI與外層權威發布；不因準備brief跳task。原7protected檔hash與handoff原prefix重新確認全部保持，未push/PR/deploy/Hosted寫入。

### 2026-11-15 — Root oracle防錯與entry bundle準備

- Root context parser追加獨立strictscope/五helper集合/actualfunctional authority-close與key指紋/loopback/source gates，20purecontrols PASS，receiptSHA31927e3648d859ad491d1bacf17f9fce6eac805c95d860b7826477ad5485e84c；0DB/nativecommands/network。Registration/retention原31/25控制原檔保留；新main失敗路徑另2控制確認private唯讀snapshot與safeenum保存/write-once，無rawpassword/providererror，receiptSHA92615d5cd8e4fcdea8c9c6bc002a546fac854684772b11731d01840825294e7a。
- Root measure-entry-bundle.py準備從真HTML入口＋Vite manifest.imports遞迴去重，逐chunk實際gzip且比對整份dist fileshash；dynamicroute chunks不誤列initial。12purecontrols PASS（recursive diamond/cycle/dedupe/realgzip/tamper/非local/pathescape/symlink拒絕），receiptSHAb32ae992953f393152cb4bd24ef620b220dc1a2f60f412ab51bb9891d61a2be8。activate-candidate.py最後build會加installedVite CLI已核有的--manifest，未執行新build，舊allJsFilesGzipBytes不能當entry測量。
- C2同worker main18direct cases已綠，registration620行按root核准再拆capacity-registration-ui.ts＋directcontract（僅既有UI操作/report schema），另ownership185行，entry約480；這是既有C2責任拆分無新feature。Finalchecks預估8–10min，仍0真OTP/身份/容量。C3 brief已備但未開工。Root runtimepointer7a82維持/未push/PR/deploy/Hosted寫入。

### 2026-11-15 — C2 60b1424唯一review，三P2同輪修正中

- InitialC2 60b14241c0304463005f5e1e7ccdcda799d25f3a/clean，16newpaths3268+/max488。worker13files88tests（C2八檔27＋C1五檔61）及full lint/type/format/diff/import0，packetSHA0e552d2e42e35a5fe8b7e34bfd8938af3e5766378fcde7003746d7e4b70f891a，root16hashmatch、八檔27tests PASS1.44s。Root唯一review Standards0/trustboundary0/Spec3P2，尚未ACCEPTED、不C3。
- Root用actual C2 native runtime/proxy/CDP exports＋ownedfakeHTML58373真Chromium四controls全PASS：3blankcontexts physicalDocument skew0.899ms、nativecache兩讀1GET、observationsavailable/zero unexpected、browserPID實際退出/contexts-observers-proxy-close/pending0。receiptSHAd436da1a058421df3f9a00a0aa16f72255d6515c89d5fb2d69322168d4f274ca；0App/API/OTP/fixtures，不是三人產品或60容量PASS。原三native模組未改不重跑此控制。
- Root actual-export pureprobes確認：a01卡async complete-intent、a00 verify先失敗後放行，a01仍開始complete；40成功後mailbox.dispose期間abort仍reportPASS；合法mailbatch分頁total30→40因新信抵達被拒。`.git/c2-root-review-probes.json` SHA74377a1043c2a3bf4b3859c43539c7fe05b04f2b43d048498ceeef6ecfeb0bd3。已交同worker四檔最小RED→GREEN，同一review往返；stop fence/finalabort重核與bounded readonly stablemail snapshot，不改threshold/產品/不重送OTP。原probe/FAIL保留。
- Root C3 brief（完整native＋純protocol/正式遊戲/rootoracles/單legCLI與外層publish）已備但未開始。Roothelpers context20＋registration31/retention25/entrybundle12及failurepublication2控制屬準備；新Local仍0trueAuth/未新build/runtimepointer7a82/無Hosted寫入或發布。

### 2026-11-15 — C2 ACCEPTED 47cf752，接C3完整Local執行器

- Final47cf7523913e82c33dcc66139c80fd93ca77ee89/clean；同一review三P2 cleared，8delta365+/22−max493。主流程與actual UI填欄位後緊貼mutation的admit fence、finally後abort不能PASS、Mailpit只對正常total增長bounded readonly重取，原exactTo/舊ID/duplicate/下降拒絕保持。0產品/DB/依賴修改。
- Worker八檔36tests及full lint/type/format/diff/import0，delta packetSHA8341bd6de58d8c5d9b6c13b136ed89d997d8060f9daa59851e1e97e64203aed7。Root同輪四檔25tests PASS0.842s/全16hashmatch；三獨立post controls：lateComplete=[]、cleanup abort=INCONCLUSIVE/completed40、mailgrowth收全40/無error，receiptSHA9a968a5f3fbd1875ce6a9a2309b0dfb5807c483307c3eaaf140c09a2b82dde54。初八檔27與原真native四controls保留，native三模組逐bytes相同不重跑。`.git/c2-root-final-review-summary.json` ACCEPTED/1round/0unresolved。
- 下一項同worker依 `2026-11-15-whole-site-c3-brief.md` 接privateplan/strictconfig/rootoracles/collectors/native與protocol完整遊戲/單legCLI與外層權威發布。Native五API含老師30reads取真browserHTTP時序；SDK校對不混入native樣本。仍只工具/offline，C3與自有docs共同freeze後才新build/首次六人functional/雙60；不偷跑真註冊/帳號。Root runtimepointer仍7a82，未Hosted寫入或發布。
- Root新readonly snapshot精確publicTables71 gate的setup診斷先遇query區域變數遮蔽TypeError，SQL發送前退出0DB，v2failure已保留；改名select_sql後v3單筆真READONLY確認120migrations/71public/allRLS、Auth/profile/classes/members/XP/wallet仍0，receiptSHA6789c8aa8c03c069a22721b6716a0eab0302cc783deed8a7ea5a51c55c11a4b9。這是工具修正/非產品驗收重跑；roothelper finalhash待共同freeze。

### 2026-11-15 — C3接線與root第四只讀port準備中

- 同worker C3 base47cf；已核准聚焦capacity-publication/operation-observer/live-game/classrooms及directcontracts，仍同C3一次root review。Privateplan106/strictrequest/close鏈與跨fresh60、collector/protocol/五API CDP等目前34purecases GREEN，動態學生遊戲/全題Live與runner接線/type收尾，未freeze/未ACCEPTED，0真runtime/帳號。Native教師30正常reload同T1頁於studentbusiness內、之後同page Live；五op observer須先於navigate/firstlogin attach，不混Node校對SLO。
- C3 exactrequest採Local oneleg＋scope/leg/run、manifestSha(C1canonical)與manifestFileSha(actualbytes)、privatePlan/oracleApproval/secrets/bundle actualsha、四roothelpers、capacity pub/validator兩hash、predecessors/registrationReady(final+close+request hashes)、retention(sequence0..49/previousProofSha/completedCohorts)。Plan-root放C2 actor/send-intents/兩class confirmed，perleg子dir放candidate/final/close；anonymous不建class，fresh40前T1正常一次建兩班，intent未知不重建。Rootapproval再綁manifest canonical/bytes/privateplan/bundle四hash，無requestSHA循環。
- Root新增capacity-preflight-readback.py：固定三op preflight（exact artifact/approved filebytes/frozen source）、subjects（只functional真journal＋已確定OTP rootproof的UUID/role/account/student唯一class，不接受clientUUID）、anonymous（Auth精確集合＋owned Mailpit metadataIDs/To前後hash）。15actual-export purecontrols PASS，receiptSHAe15b4268dbe41b977cb7758733decb20cad0fbf3c09d7464b70af23926f3a416；context新plan bindings20purecontrols PASS，v2SHA378653cd93cb801a1840f899350611d3d74f1c4d1ea50f31867cce2cb548e45f。固定runtime/entry-bundle-proof.json將是C1flat bundle schema，詳細descriptor仍留activation attempt；尚未新build/發布flat檔。
- 一次真Local Mailpit GET列表確認messages0/start0、matchedv1.30.2官方MessageSummary有To欄；不detailGET/不讀code/不寄信/不寫fixture，receiptSHA730abc501ea9e44d8586324b4ae4b8e3121e3211c8700d95a7e139a2f0bdbca0。Root validate-capacity-publication.mjs純C1 verifier17controls PASS（正常close/錯exit/signal/deadline/stderr/resource/candidate/source/verdict），.git/capacity-publication-root-controls.json；首輪17控制後寫收據取helper hash路徑相對cwd錯ENOENT，setupfailure保留、改URL相對module後成功，無產品gate。Capacity外層launcher仍待實作/未真CLI，roothelper finalhash待freeze；pointer7a82/0trueAuth/無Hosted/push/deploy。原7protectedhash與handoff原prefix再次相符。

### 2026-11-15 — C3初交 c6b783b 唯一 review，同輪兩項 P2 修正中

- Initial c6b783b1bd70f1b0004d90a530868683a8b24e15，27 paths／5514+、最大498行；worker packet SHA f073e37008b5430ca4842b623ddacf574327d8ac06654dcb91066e5e710f4710，root 27 hashes 相符。Root獨立61檔448tests PASS9.94s；尚未ACCEPTED、未真functional／容量。
- 同一review兩P2已交同worker：40／60註冊前綴相同，需依cohort獨立並驗證；strictruntime以JSON key順序比較批准scope/helpers，root sort_keys 的合法批准檔被拒，需strict parsing＋不受key順序影響的值比較。Root actual exports probe c3-root-review-probes.json已重現兩項，0真requests；匿名sessionStorage已對canonical adapter確認相符，不列假finding。保留全部失敗與原收據。
- Root外層自身接線修正：capacity CLI只傳--request；先建立或接受空0700 perleg dir，但任何既有內容拒絕，同run write-once intent仍拒重跑；child close後再驗request actualbytes。Launcher SHA8a718a11e7cc9092dc592af8daade2f6dca8df337567a12191ca52d7f678c427，14pure admission/CLI controls PASS，receipt SHA64b5cf1b359ea7ed271998d6abd06db9d884954404eb688e307a14b2131199f1；0child/fixtures。
- Root artifact定義對齊已核准B3：scope.artifactSha256是admin-release.json實際response bytes SHA，不能誤當整份build-manifest bytes SHA。Entry詳細proof另綁buildManifestSha256／ADMIN_RELEASE_RESPONSE_BYTES，preflight逐檔比對整份dist且核兩digest；17pure controls PASS，receipt SHA14244cc074ae9c21d1f5a3b029b07b9b28b23982ab9523548a676633b62e403a。measure helper新SHAea61e269f24af8c6a7d1513d2f97c5ff48ccfc949b70e7906faa5202afcea8ea／preflight helper097c3f5a2d4aba72278c541e96e56f72bf5e58d3da7538a49c427e9f5fb832a3，未新build／flatproof／真DB query。Runtime pointer仍7a82，0trueAuth；未push／PR／Hosted寫入／發布。

### 2026-11-15 — C3 ACCEPTED 9e85053，準備共同freeze與首次真functional

- Final9e85053a282bb65b9ad4adcfaa0cf8e2b646fda9／clean，唯一review兩P2同輪清除，僅4delta121+/10−。40/60郵件前綴精確綁cohort／alias／account；批准scope/helpers先strictparse再deepEqual，保留實際bytes hash與extra/missing/value拒絕。產品／DB／C1C2／native三模組／門檻未改。
- Worker61files461tests PASS14.45s、full lint/type/format/import/diff0；root初61files448tests PASS9.94s、delta3files34tests PASS0.716s、全部27file hashes相符，actual-export postcontrols確認sorted批准接受／40與60不同prefix，0真requests。PacketSHA39b8e598a67b722ee3dd3c42939c137c72b427620ddda7e13a4408f376c52ce3；root c3-root-final-review-summary.json記1round／0unresolved。原RED與初交收據保留。
- 下一步由root只複製本次自有新design/plan/brief/review文件進隔離clone並append focused handoff，共同commit凍結後才更新Local review pointer、build--manifest／entryproof／綁all37functions及六身份functional。初次真流程尚未開始，不能稱全站功能／40或60容量PASS。原7protected與handoff原prefix再次比對均保持；未push／PR／Hosted寫入／部署。

### 2026-11-15 — 共同候選 d54436c 首次真Local功能執行中

- 自有11新docs＋focused append-only handoff共同commit，candidate d54436c59976db7f370fadb0eb155abd96aecc34／clean，產品與已核准工具未新增變更。Root獨立build-ready（572files／marker／secret scan全通過），真entry recursive static closure gzip236095 bytes、SHAf575caab8fd4198a498996e4d3f87fbde4a6119d36a236d26e95774d3f15c526；artifact markerbytes SHA04a478b7c63ea1652c6cbe5b23018cf3dac0cc800aaa31d25eb4b9273f9cbaca，整份dist buildmanifest另行bytes hash綁定。
- all-functions37 tracked files真container逐檔hashmatch；僅兩無帳號400／401探針通過，不是容量。Root審查pointer已由7a82更新至共同candidate，舊pointerbytes保留；prepare helper SHA3173ae33f32fe232af62d51d60e7cfc394e915cc83c740faff0c9023672f422b。
- 首次真六身份functional run wsb-261115-99ab481a47fc已啟動，root approval SHA7df9b87bd9e60590fefd7d9b9d88dd2a49f896ab3be2d0e0cb5182a24008708f、request SHAd3d732b8954a08d8f5cc52e4f676f3fbd0b093917f39ace0454b20345e29af22；25min outerbudget／獨立ownedprocess觀察／root finalpublication，現在僅RUNNING，尚未PASS。只有成功root functional+process-close才進容量15legs；所有Local帳號、ledger、媒體、audit保留，不觸Production或Hosted。

### 2026-11-15 — 首次functional FAIL已定位，保留第一代並完成第二代空白Local隔離

- d54436c／run wsb-261115-99ab481a47fc真functional權威FAIL（19秒、registration_recovery；前3 stages PASS）。Root close exit1/nullsignal/stderr0/sourceFrozen/ownedResourcesClosed true/remaining0；producer cleanup顯示false可能混入health錯誤，不能推斷實際程序殘留。主receipt SHAa342b38d27d0c819064bf1b44410708dcbe963a53fa97dc58fee612aef20892f，保留原FAIL，未直接重跑／升容量。
- READONLY確認6Auth／6profiles／2classes／0XP／0wallet／0media及2封全部owned Mailpit郵件；R1已true UI註冊/登入/送復原信，無active session。另只讀1封owned recovery信的URL形狀，verify仍未consume，redirectOrigin是58373但path空，不是/reset-password。來源白名單缺58373→auth-recover選Staging fallback→GoTrue夾回Local SITE_URL根頁，driver正確拒；不是猜測。原token、正文、credentials不輸出／不存診斷檔。
- 新有界M修補brief：whole-site-recovery-origin-fix-brief；同worker只新增exact loopback origin＋handler行為測試，另補固定safe code／recovery checkpoint／health與資源診斷，root唯一review；目前尚未freeze，無新true run。不得降callback guard、health、quota或放寬nonempty preflight。
- 原runtime整目錄移至 live-recovery-runtime/whole-site-261115-first-failure，完整files／主receipt SHA保持；原owned VM colorplay-live-task2已停、29containers/volumes全留、8running已正常stop、預覽exactPID已退、0刪除/reset。舊證據的原路徑請依此archive locator定位，原bytes未改。新VM colorplay-whole-site-g2（4CPU/6GiB/25GiB）／context colima-colorplay-whole-site-g2使用原8個Image IDs（官方matched CLI固定tags，0pull/升版）；預設Docker context及profile保持。
- 第二代current runtime仍whole-site-261115（TS固定入口），keys皆新且與舊不同，container IDs與舊全不交集。先空VM將2條hostIP改127.0.0.1再啟stack，原其他設定語義完全相等；實際三listeners全loopback，Lima config SHA53ba268dddea5af9afa0a5e75042b8de3415c76de016308141e48eb130c66a50。120migrations／71public allRLS／259questions(258published)／9reviewCards／26published templates／20blooks，Auth/profile/classes/XP/wallet/media全0。新keys簽章/Authhealth/受保護7files與handoff原prefix均PASS；audit-ready舊result文案CONTENT_NOT_SEEDED只是固定舊label，真seed counts已由audit-content確認。未需重seed，未build新candidate／真functional／capacity／Hosted。

### 2026-11-15 — Local recovery origin修補 ACCEPTED d228f37，第二代準備新candidate真功能

- Final d228f372e5c46fc69397495ae09b061f2a790a27（base d54436c），9paths／669+/32−／max492，root唯一review findings0。產品僅_shared/cors.ts精確新增http://127.0.0.1:58373；真handler的foreign origin fallback不變，driver callback/health/deadline等guards不降。另固定8phase≤16診斷紀錄、已知safe error保留、health snapshot與close operations結果分列，不以producer狀態代替root實體退出。
- Worker52files371tests PASS10.47s及full lint/type/format/import/diff0；root4files50tests PASS1.49s、9filehash全符。PacketSHAb12d0b28bfaafb8deb27b0df553e8535901866440645b8dde2517c905bea14af；原RED、setupfail與d544真FAIL均保留。這是修補task完成，尚非新真functional／容量PASS。
- Root第二代context colima-colorplay-whole-site-g2／4CPU6GiB25GiB／project cp-whole-site-261115，current runtime仍live-recovery-runtime/whole-site-261115；新keys與containerIDs不同於舊，三listeners僅127.0.0.1、120migrations/71allRLS、Auth/classes/ledger/media全0、canonical seeds已齊。Lima config SHA53ba268dddea5af9afa0a5e75042b8de3415c76de016308141e48eb130c66a50；禁止Colima resume後沿用attestation。原VM colorplay-live-task2停機保留29containers/volumes；原runtime完整archive於同parent whole-site-261115-first-failure，不得刪/reset。第一次真FAIL receipt SHAa342b38d27d0c819064bf1b44410708dcbe963a53fa97dc58fee612aef20892f不變。
- 只加入本修補新brief＋focused append handoff共同freeze後，由root更新Local reviewed pointer/build/entryproof/all37runtimehash，再以新runID/新rootapproval真functional；未push/PR/Hosted寫入/部署，尚未升容量。新Local額度實際四值已唯讀assert與第一代相同，不調quota；首次寫receipt的chmod錯用file object已保留空檔，以v2紀錄原成功觀察、未追加Docker讀取/寄信。

### 2026-11-15 — 第二代registration/recovery真PASS；Auth SDK／觀測／關閉完整診斷，單一修補中

- 新共同candidate9a1ada3644956eb728e8047f73ec4e86476739f6 build572files/marker/secret scan、all37functions runtimehash通過；entry gzip236085bytes。G2真run wsb-261115-e5c02e95a9b3（approval SHAab22ba8fa3d852cd21eb66e8e7b1bdd18ce770b4b54ca1413941d257d8a91f19、request SHA0d8751d1bcd5a406f0e0e9d3b489470e71bca1d1763036d2b862132859e935c9）22.08秒權威FAIL，registration_recovery完整PASS/8phase16confirmed；auth_controls2153ms以FUNCTIONAL_AUTH_FAILED中止，未學生遊戲／容量。Root exit1/stderr0/sourcefrozen/ownedphysicalclosed/remaining0；原FAIL SHA7564ee8de12f8967374d930a0a3e8e779b7e8acdbc30e9023a9e8fc8006b41ee不改判。
- Root只用既有S1/S2做有界診斷（不建帳／發信／遊戲／全gate）。真官方SDK probe確認raw403/session_not_found會被installed auth-js2.110.2 fetch.ts134–138改為AuthSessionMissingError(status400/codeundefined/nulluser)，原driver要求rawshape而誤拒。以唯一明列class分類overlay的actual lifecycle完成41actions/82前後紀錄，產品reload/copy/switch/independent/fresh-tab皆實際執行；這不是驗收PASS，health仍unavailable/6unexpected。
- Exact native CDP witness證明7個缺request的response全是owned S1 opener初次/app的同站/assets JS/CSS HTTP200；popup-only2秒亦重現available:false/unexpected0。3個normal logout POST各先204後同requestId ERR_ABORTED；一個刻意revoked source logout403。不可泛忽略unknown API／foreign／late／403或任意abort。Root原兩次continued setup退出因自有console location.url屬性誤作method；安全行號定位＋actual listener purecontrol後修正，原setupfail保留，非產品FAIL。
- Actual blank native close control（Node network全拒＋unready guard，0API／fixture）另證Browser先close、Context並行close拒絕而Browserfulfilled，healtherrors0，屬工具close race。該次browser太快退出，root1s observer未完整捕獲，僅remaining0，不能稱獨立完整physicalattestation；後續針對修正版需native postcontrol。所有證據hash集中current runtime/auth-diagnostic-evidence-manifest.json。
- 同worker依whole-site-auth-observation-fix-brief做一次工具M修補／root唯一review：official class、精確popup／logout期待、正常context→browser且late-start有界。核准functional-auth-observation.ts／functional-close.ts與directcontracts；不改產品/session架構、native3、DB、quota、C1C2或fresh gate。靜態例外需root attestation exact filename allowlist，Root prepare-functional-request.py新SHA68f3f403907b1cbb46a4b22346d34fb273611f533177dbd8edfc58e7fb14c58c會從已驗build.files產approvedStaticAssetPaths（目前74）；既有失敗attestation不修改，下個fresh candidate才新增欄位。G3 prepare腳本只備未執行，G2仍供修後既有帳號診斷。唯讀刷新Staging branch protected/d92，hostname lookup仍dpl_H1XfHX2WpTPV3czy1MrQFqXgrMjf/d92；未push/PR/deploy/Hosted寫入。Staging真OTP收件信箱/網域已問Owner，等待答覆，不寄信。

### G5集中tools — 唯一review ACCEPTED cd65df0

初交ca0a356相對3bfc為15paths1167+161−／max500；packet SHA668c5893d0f5ccaa8a41e835f4be9338656cc4ac1435ba04475bee974c3abd91。Root初review只1項Spec P2：新CDP observer未處理同document history/anchor URL變更。Actual public health合成CDP/DOM對照初始proof1/health0、historyApi換URL後proof0/health1；0真browser或網路。

同輪cd65df066c6284509d6ef11c45ce83c442734cd2只4核准paths292+101−：helper452行、既有fixture抽出111、原test396、新SPA141。新12controls加原64cases均過；真loader／當代tombstones及exhausted保留、pending舊URL失效、accepted late poison及雙listener清理皆符。Delta packet SHA758aeaccc146052d95df948fc7ac6c6e6e174f08b8c44d2140396e27fd380466。Root同一控制再驗兩組proof1/health0；finalreview SHAd7f94c589db2ca8408622873d1943691d0c2c50215b4419e3a5e8e4e340a4d30。初版／RED／G5總FAIL不改。

對應AC-AUTH-001、AC-SEC-005部分工具正確性及AC-PERF-003容量工具準備，非完整AC／Local容量／Hosted／phase PASS。真原生Live仍待完整執行；fake actual caller只確認authoritative20及inside dialog後進首題，刻意停止處明列，不冒充完成。Root新六槽媒體approval與安全network side-channel僅操作準備，嚴格Local且不改producer verdict／Native metrics。

## G6 followups 唯一review與實際Local控制

Base b08451ef5b41554e5cb67ab31d2517fe39764fd7 → source1449561133081c93b49c6b6eba56ada00626c817／clean，exact21paths1063+374−／max443；media wrapper有縮排churn，Root以-w核對實際行為並讀全部新helper/SQL/directtests。Worker packet SHA74ba9485f82ed6632488daa28abb60eb26552f943f88f602e9704b326b5565f5。AC-AUTH-001／AC-SEC-005／AC-PERF-003／AC-TCH-014只追蹤focused regressions，不宣稱完整AC/phase。

Root真SQL：舊schema122先3assertions後23505 exit3；各自BEGIN加migration與07632／12110／12220→ROLLBACK，62全綠。106表data hash269440fdb3df631b090d777367ddea4a31c0c89b08220c7afb11c2fcb136d4d1、public schema/extensions hash4061f20fce6b4f6d5feb215f3cc3a59b5a8eecb4e415975270ef7432197d635f前後相同。SQLreceipt SHA27d058176ecd5c5e6a6b136b4f2cd1d3bc460a01a96619490d360f309de02440。這是交易回滾實證，不是G6持久新schema或Hosted完成。

Actual tools144956／App artifact b084分列，教師原initial reads與assessment-next-route競態不再出現，health/failures/console皆0；refresh真拒絕已由shared code解析，helper完成await/login。兩process receipt SHA0262140a9227c0cd8cec0200587107703cb04d06ee0a0abd5087294df0e8a8dd／c0289f95ddfebdd7da9ee7a39f7743e39b795ea84c33add64a2e92f40163d3f3。初Rootwrapper進度label不在既有allowlist，在child啟動前拒絕；僅Rootwrapper改合法label，0產品/guard變更，原拒絕記錄保留。

下一步G7保留G6files/volumes並停owned8containers/preview/VM，新VM同8image IDs/keys換新、loopback先驗；121migrations/7media slots事先綁authority，5verified2aborted、5assets11variants、16objects、2ZIPdrafts與4intentional drops。Private容量bridge獨立綁observed functional publisher與physical observer，14pure admission controls綠；沒有放寬scope/PASS前置。新full仍待執行，所有前代FAIL與300秒terminatedprobe不改判。

## S 發布格式整合 — ACCEPTED088ab08

Baseba6f49a9d70188a485c208fc245ab5c829fe14fb → 088ab08d386da2913f9a0b654bef7106d3788e97 clean，exact17paths520+250−；16Live mechanical formatter與.prettierignore對append-only handoff的明確例外。Root核17source/24logs/proofs及兩份handoff hashes，前述G6修正21source hashes均未變。Packet321a236cb616d055483dd79b7da5cac438cd6dd25981dcb83f968dac1a1f76f4。

實際format:check0、原完整lint0+final style-test scopedlint0、final完整typecheck0。原28files196cases run有195pass/1純單行CSSassert fail保留；核准同test只colon/comma後空白regex替換，exact center72/auto120數值/順序/semicolon/mobile scope與其他assert全保留，final styles2綠，其餘27files194cases未變/未重跑，因此196distinct cases已綠，不能稱完整suite重跑綠。CSS某grid換行需第二次formatter才固定，已核全16fixedpoint/CSS非空白bytes同；9/10TS emittedAST相同，round去除無語意括號wrapper後AST同、literal/identifier差異0。

`live-projector-round.tsx`617行是純formatter展開既有JSX，emit等價/樣式值不變，本S不擴產品重構。資料庫integration格式檔未跑integration；0runtime/API/SQL/寄信/build/容量/Hosted。前兩個人工tracked-format診斷未同時套CLI的.gitignore而多列.impeccable/artifacts，屬診斷scope誤差，實際CI只17warnings；那些檔案未改。G7最初ba6只用於空VM/新keys/same8images準備，不是build或functional證據；初receipt留在sixth-failure不覆寫，最終source由新final receipt另綁。
