# M66 — operation lifecycle完整診斷（Root草稿，尚未委派）

狀態：AUTHORIZED_OFFLINE_IMPLEMENTATION。M65已完成Root唯一review且保存，現在正式dispatch同一worker只做本task；不直接建立VM14／重跑VM13。

## 已確定與未確定

VM13 exact app e46562c5504a66e0dff6815f2d75f3a62bccef53，run44271087230/job134687575488/attempt1，age/cold/business Root實核functional15＋capacity5/15 PASS。40/60真註冊完成40/60、原entry/submit250ms與SLOPASS；existing3 wcr-261118-ac77a1507957 INCONCLUSIVE。M61 sealedgameWork firstStop TEACHER_FAILURE，iteration1 AFTER_ACTIVE，active0/completed2/observed2，21356.823102 Node ms，之前學生15854.327844／16028.841801 window自然結束。MEASURE1起6134.026497，goto返6221.294611，heading返6356.657984，measure返21356.53369。無parent firstCause；M64 transition未觸發，不宣稱合法exec原因已證。

Source createCapacityOperationObserver.settle等待原records清空，deadline15000後available=false並done，原run仍可回action結果。這與Native等待相符，但Native未保pending attempt/status或first-invalidation來源，不能斷言是後端慢／CDP漏事件／schema拒絕／重複request或其他分支。原metricsnull，不從accounting3requests硬推HTTP延遲。

Root actual exported observer＋readCapacityTeacherDuringLoad、安裝的macOS Chrome、自有loopback syntheticHTML/API兩種控制：30fullgoto/heading＋30physical POST，FAST0.669秒及DELAY120ms4.610秒，均30success/pending0/availabletrue。排除「固定30次本質不可能在約10秒學生window完成」之假設，不能外推真ColorPlay／Linux或Native唯一原因。v1 missingbaseURL與v2缺UTF8兩setupfail raw保，v3才有效；無Source修改。私有m66-root-operation-native-control-result-v3.json。

## 預定ownership與界限

若Root正式dispatch，owned僅新scripts/concurrency/capacity-operation-diagnostics.ts、capacity-operation-observer.ts、capacity-journeys.ts、新tests/contracts/whole-site-capacity-operation-lifecycle.test.ts及必要新caller contract test（最後path正式dispatch前固定）。不得改game/game-load/actor contract／產品／DB／policy／SLO／新合法exec；以原observer map接新getter，不需擴actor interface。journeys既有573行僅必要少量wiring之既有coordinator例外，其他<=500。Root ownsbrief/review/handoff。

只沿原callback/timer/active/records事件值觀測；保存first-invalidation閉合原因、first settle deadline、當時pending有限attempt分類/status/end是否存在/active op/cache/during、各事件bounded first/tail及available/pending計數。可用同observer內只記憶體遞增ordinal關聯already tracked Attempt，禁止保存CDP requestId／URL/body/header/errorText/任意digest、帳號/nonce/SQL/token，不能raw payload丟helper。Node與CDP clocks分欄不交叉相減；只有有限已知CDP failure分類可輸出，未知OTHER，不存原訊息。

第一個invalid與觸發點保，不被dispose/abort後續覆蓋。最多固定events與attempt上限且明列、overflow／getters/Proxy/throw/缺getter只新diag UNAVAILABLE/UNOBSERVED，永遠NON_AUTHORITY，無authority transfer。原guard/schema checks、requests/attempts/sample字節語義、available分支、finish/cancel/timeout15s、30reads、businessActive、學生完成、原return/throw identity、stop/close及任何SLO不變；不加wait/retry/延長window/假業務。不要把提前throw當修復救PASS。

## 預定驗證

actual exported observer＋fakeCDP/timers，補全REQUEST/RESPONSE/FINISH/FAILED各schema非法／duplicate／serviceworker／時間倒退／cap／enablefail／abort／pending-at-deadline與dispose，正常cold/warm0/1/multi requests及late completion、next navigation cancellation、active window交疊等。原trace/outcome/timer／樣本深等，診斷失敗／overflow/秘密不落地、first保持、真journeys finally writer caller測試。Root另actual exported control（先offline，再必要owned browser無ColorPlay）與一輪review；保所有RED/FAIL及VM13六inputs原bytes。驗明缺口後新exactSource才可能fresh Native，不用新VM猜不具體原因。

僅diagnostic task-level，非Native cause修正／全站容量／Hosted／Phase PASS。US150/noPaid；13舊VM等待正常stop收束時不得說全stopped；無VM14。

## Root離線actual exported timer控制（草稿證據補充）

.git/m66-root-settle-control.json：原observer＋fakeCDP，以合法POST＋HTTP200刻意不送finish，原15,000ms timer被明確捕捉後合成觸發，pending1／availablefalse／sampleerror＋endnull，但run仍回ACTION_RETURNED。非真的等待15秒、非Native缺finish原因；原Source a2a702c3a3c164d52d270b1bcc28572723a09bd2f393f8714e7f79b2b6d4ab61前後相同。這確認需要第一個invalid與pending的資料，不能只依下游AFTER_ACTIVE錯誤判原因。VM13已實際strictSTOPPED，十三VM全停／runner0，M66仍未dispatch／無VM14。

## Root正式dispatch與exact ownership（2026-11-18）

M65 Root已ACCEPTED一輪0finding，231contracts/fullchecks0，Root receipt a7f705d14d1b900eccccb5c61128f6c0ce9f7d810dbeb345457c33c907a8e514；獨立operator local commit6cdc66c9c609f187f7883ce19aeb30a39ae5ed5b／parent9f9，未push。Root已將已接受M57四檔與M65三檔以committed exact bytes帶入Recovery app候選，未改vercel或其他Source，私有.git/m65-app-integration-source-receipt.json列七檔SHA。這七檔是他人既有WIP，worker不可改、回退或刪；不是未審工具。最終組合將在M66接受後才共同提交並fresh Native，不能沿用VM13聲稱新組合已測。

現在只在Recovery app checkout `/Users/guanyucheng/.codex/visualizations/2026/11/12/01a1ce8a-3274-7cd1-821e-b0ae34d1d062/colorplay-live-recovery`，HEAD e46562c5504a66e0dff6815f2d75f3a62bccef53，已有Root docs/handoff及上述七檔WIP。獨立/tmp operator已凍結，不再改。

worker明確owns五檔：scripts/concurrency/capacity-operation-diagnostics.ts（新）、scripts/concurrency/capacity-operation-observer.ts、scripts/concurrency/capacity-journeys.ts、tests/contracts/whole-site-capacity-operation-lifecycle.test.ts（新）、tests/contracts/whole-site-capacity-operation-lifecycle-caller.test.ts（新）。不得改oldtests／game／game-load／live actor interface；需要extra先具體報Root。沿原observers map新getter接finally writer，舊fake缺getter只新diag UNOBSERVED。journeys573行只加必要wiring，<=590窄coordinator例外（M61既有）；其餘每檔<=500，超界先報。

新每actor閉合diagnostic最大16KiB，pending最多64項＋實際pending總數；events固定32或first/tail總32，overflow與bytecap明記UNAVAILABLE，不能假裝完整。相同original Attempt可用內存ordinal關聯，禁止任何raw requestId／其digest／URL/body/header/errorText/actor身份。不要新讀其他網路或clock資料冒充過去；original Node/CDP clock分列與phase/event明確。原first-invalid／deadline證據捕捉後不能被dispose/abort覆蓋；正常dispose只是收尾，不等於測量失效。diagnostic snapshot錯誤／throw/getter/proxy只影響新collection，原outcome/trace與樣本完全保持。

TDD先actual exported有效RED，worker只fakeCDP/timers/owned tempFS；Root已做ownedChrome控制不用重跑Native。測各callback schema拒絕／duplicate／SW／time倒退／cap／enablefail／abort與pendingdeadline、正常及late/cancel/跨window；原request/response/finish/failed branches、15s timeout、oldavailable／records／samples／return/throw/error identity與listener/close trace不變，保舊assertions。actual finally caller測新getter缺/throw/Proxy/oversize及writer接線失敗隔離。只捕捉原因，不藉提前throw或改window救PASS。

檢查必要capacity/send完整41files564baseline＋Hosted5files231baseline＋新focused（46files795原baseline不省send-dom），fulltype/lint/globalformat/import/manifest必要scope與diff；不重跑product1771或原真gate_run/Python child/proc／Browser/Cloud。許可既有tsc -b寫Recovery兩generated tsbuildinfo快取，明列而不稱deps全bytes唯讀，不install/update/修改依賴payload；Original依賴永不改。

保所有RED／FAIL、M64/61/59/58/56/M65與M57歷史、Original七文件／575959handoff prefix／package/lock、VM13原六inputs與Rootfinal/cold結果／RootownedChrome與settle controls。Root只會append本task必要決策與handoff，納入RootWIP例外。交一次finalpacket含source freeze、raw commands/checks、protected與inverse/AST原semantics證明，Source停止供Root唯一review。無Git mutation、network、fixture帳號、真Native／Cloud／Hosted或新agent。所有十三VM STOPPED／runner0／無VM14／US150/noPaid／Production禁；本task不宣稱全站／Hosted／phase PASS。
