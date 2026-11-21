# M26 — 一次完整媒體取消請求的安全工具診斷

ROOT_AUTHORIZED_IMPLEMENTATION。base47f2c5cfadf7ca9f710429203b708d3db84866c1；同worker實作，Root統籌且唯一review。WB4／AC-PERF-003前置觀測，不是產品取消修復、expected新增或容量PASS。

## 已知事實／禁止推論

Native20 run43934004541/job133533644322前14functional stages PASS，最後health4errors。M24安全events：phase media/pageOrdinal9，4個UNAPPROVED_FAILURE/status200/ERR_ABORTED，3 MEDIA＋1 FUNCTION，ordinals3523/3554/3569/3592；其餘components0、collection OBSERVED。method/action/cancel來源未capture，status200不等body完整消費；8.458s不反推15s timeout。Source正常路徑page9吻合A1，下一輪仍直接記閉集actor，不能把ordinal當角色授權。Native18原1error不回填。

Root核只讀proposal6829f3d091003f6f9201a2ea34df6a8cb623cbc95012efe7abed0ab41786f588／manifestc3dd010f1246aeb35442dca4d3fc2b77436eeb1d9a4487b2ccad64a0260c2ca8，23Source/1record。Source否證「unmount經TanStack signal取消」：相關queryFn未傳signal，mutation沒有卸載abort cleanup。boundedFetch正常EOF只close/finish，沒有無條件abort/cancel；TIMEOUT／UPSTREAM／BODY_CANCEL不同路徑，僅CDP不能區分。

## 唯一ownership exact11paths

Source7：scripts/concurrency/functional-network-event.ts、functional-health-diagnostics.ts、functional-health.ts、functional-navigation.ts、media-journey.ts、functional-journeys.ts，以及新增functional-media-observation.ts。
Tests4：tests/contracts/whole-site-functional-health-diagnostics.test.ts、whole-site-functional-health.test.ts、whole-site-functional-navigation.test.ts、whole-site-functional-media.test.ts。

你不是唯一在codebase，保留其他修改。Root owns docs/handback。禁止stage/commit/push／Native／服務／HTTP／mail/comment／Hosted/Production writes；不讀raw private captured payload。所有src/產品、browser-client.ts、Rootoperator44、M25 runtime/collector/health-caps、Auth/Image helpers不改。不新增全域AbortController/fetch patch、header/query/request副作用或產品observer tap。Root明確選工具診斷，取消來源與app body消費仍必UNOBSERVED；不能用root intent或CDP finished偽稱client EOF。

## 固定資料與邊界

新增focused functional-media-observation承擔閉集media context／Rootintent／lifecycle bookkeeping，避免原500行module被擠成通用框架；原classifiers/predicates不搬動。M24 details events加method(GET/POST/OPTIONS/OTHER/UNKNOWN)、actor(A1或其他固定角色/OTHER/UNKNOWN)、exact有限function family與closed action、原12mediaStep、Rootintent摘要及同request lifecycle。依實際Source有限action只記MEDIA_BEGIN/PROCESS/ABORT/RESOLVE、IMPORT_BEGIN/PREVIEW/COMMIT等固定枚舉；不把preview/resolve字面當read或授權。exact API/app origin/path、無query/hash才分類，其餘UNKNOWN，不記raw URL/path/body/headers/token/userID/requestUUID或低熵摘要。

Root mediaStep callback只在原step started journal成功、原abort check之後更新，無新journal次數或HTTP。Rootintent只有ROOT_GOTO_ADMIN_CONTENT與ROOT_EDITOR_TO_IMPORT，有限ordinal／issued/invocation/settled Node performance時點／閉集state/null。goto在原quiet/fonts ready後、originalGoto真正呼叫前成立；view-switch在原dialog/click邊界宣告，沿原UI assertions確認。React view switch不冒充Document導航或新loader。任何失敗/abort不產生成功intent，不mask原operation error。

每個request在CDP requestWillBeSent時凍結actor／phase／mediaStep／可觀測document counter或UNKNOWN／request時Rootintent；failed時另記當下intent，不事後套最近intent。只同CDP requestID內部對應request→response→finished/failed，轉安全ordinal；用Node收到事件的同clock，不混CDP epoch。Unknown/duplicate/contradictory lifecycle明列UNKNOWN，不能捏造body完整。未知/metadata parse/late/overflow只收緊原availability，原四snapshot欄與五components總和保持。

原256events/2000active bounds保持，成功retired request不無界留存；新context/intent同樣有界。snapshot純讀不重複append，dispose後純讀封存、真正late標不可用。沿M24原stage/before/cleanup wx600 journal自然匯出，metadata無執行權威。所有4個失敗仍FAIL；原deliberate drops4/refresh1、原endpoint/resourceCode分類與Auth/Image predicates/controls全保持，不加expected或吞錯。

## 行數與必要例外

新focused module／network-event／navigation／media-journey與未列例外tests≤500。health.ts≤600、health-diagnostics.ts≤560、functional-journeys.ts≤510，是為就近觀測保原分支及同步snapshot、schema純化而非改判定；新增focused module避免更大檔或無關重構。health-diagnostics直接test≤560、media直接test≤540，保原405/443行fixture／斷言及必要actual caller控制，不為行數搬大fixture或壓行。超界或需第12檔先回Root。AGENTS超500理由明示，非驗收放寬。

## 驗證與交付

先actual public seam有效RED→GREEN：method/action/actor精確sanitizer、private sentinel/query/foreign/unknown/malformed不洩漏；Root step與intent真invocation順序、SPA switch不當Document；原pending request先於intent不可retrofit；同phase多請求不可模糊配對；status200/ERR_ABORTED仍非finished、沒有body EOF或cancelSource證明。actual navigation/media caller：journal先成功才記step、operation/intent失敗/abort/late保原error與UI/API呼叫次數。四原errors對應synthetic仍FAIL，不能稱重現Native20各實際動作或根因。

完整受影響functional health/navigation/media/diagnostics/runner與原Auth/Image contracts、lint/type/globalformat/import/static/diff通過；核原分類/增量/if條件保持、非owned Source actualGit／operator44／original保護。凍結 .git/m26-media-abort-context/ validation Source rawSHA/bytes/lines、records、逐check command/exit/elapsed/logsha、RED/GREEN、setup資格與UNKNOWN界線。每個checks沿明示實際schema，不需新增報告儀式。

Root唯一review後才exact Source+Root docs commit/clean/specialremote freshness正常FF新Source/push/attempt1正常six-person→15legs。任一非PASS停升級，不GHrerun/0business gate。M25真正採樣仍NOT_RUN，Native19 host_stale因果UNKNOWN；40/60未驗。原WIP/original7/prefix、G8停止85、全部cold custody與6Auth資料保護；主機US$0/US$5 cap、Hosted/Production/真寄信NONE。
