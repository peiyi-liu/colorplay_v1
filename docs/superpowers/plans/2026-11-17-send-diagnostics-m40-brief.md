# M40 真 UI send 路徑完整被動診斷 brief

Root 核准單一 M 級工具任務，既有 implementer 實作、Root 唯一一輪 review。Base `11b1d6891bcfa4bb8084090ca81fb6d212295c8b`；全站40基線／60目標、真首次註冊＋既有登入 Local 任務保持。這是診斷，不是已定位產品修法或Hosted授權。

## 依據

Native34 run44067209605/job133983863432 pushattempt1 finalfailure(updated11:00:59Z)，functional15PASS、anon3/10/20PASS、fresh40INCONCLUSIVE、其餘11legs未run。40healthVALID/null firstCollectorInvalid；40send/Authcreated、zeroOTPverified/complete。40個實際CDP timestamps獨立重算send skew327.751ms>250，entry105.670ms；最早response仍晚於最後dispatch1521.121ms，故after-response confirmed journal與之後retentionhelper107fail/cleanupHOST109abort非初因。原Source確實同批arm/map，不逐人等待。Node發起／Playwright actionability／renderer click／產品trigger(email)等待各占多少仍UNKNOWN；不猜auto-wait、PKCE、hardware或網站後端FAIL。

Root final43d259dd0353feaf990e878d973846bf0dc10c83707ed766a807515b719e241f；typed firststop318b6ffea46572e61168a2bebef55cfef2b27004c7dbbeed0ddd15a31c79c891；CDP40 v2b4863405a0c548796d7fca56a353557327b08d7f1817f23ebe9f10fd201b277d（v1lowerP50誤標median已保並更正）。Readonly cdb2ca64d009124cd76abb66c395a577c2004ca7a0d7b1fd10d3e9e5d4f9adbb/19records15Source2pinnedvendor46coldinputs Root全核，receipt7110933a0fab45b29ba515559955f753cfdb393807dc0b6b3867f7304408beed。其profile-runner命名撞metadata exit1原log與safe資料保留，freeze/send分布成功，不稱所有runner全綠。V8非CPUms且不能硬映CDP epoch。

## 唯一 ownership

Source共7：

- `scripts/concurrency/capacity-registration.ts` <=560行（既有499，限send adapter/finally與optional diagnostic，不趁機重構其他流程）。
- `scripts/concurrency/capacity-registration-ui.ts` <=230（既有167，限actual send前後被動callback）。
- `scripts/concurrency/capacity-browser-runtime.ts` <=360（既有282，限可證native actor/observer/page/context binding與callback接線；原launch/context/權限/close保持）。
- `scripts/concurrency/capacity-request-observer.ts` <=400（既有301，保M39七schema成果，每event原位parse/guard；只optional閉集ARM/匹配REQUEST callback）。
- `scripts/concurrency/capacity-journeys.ts` <=590（既有566，限既有Linux instrumented fresh-registration的diagnostic/writer接線）。
- 新 `scripts/concurrency/capacity-send-diagnostics.ts` <=400：閉集typed records、binding/clock/limits、原send settle之後一次readback、best-effort writer。
- 新 `scripts/concurrency/capacity-send-dom.ts` <=300：已核native頁面exactsendbutton的page-local有界listener/owned handle/cleanup adapter。

Tests：既有 `tests/contracts/whole-site-capacity-registration.test.ts` <=500、`whole-site-capacity-registration-ui.test.ts` <=500、`whole-site-capacity-request-observer.test.ts` <=500、`whole-site-capacity-browser-runtime.test.ts` <=500、`whole-site-capacity-journeys.test.ts` <=500；新 `tests/contracts/whole-site-send-diagnostics.test.ts` <=500、`whole-site-send-dom.test.ts` <=500。若既有test本來超500，先報Root實際行數與必要窄例外，不先改。必要extra path/helper/型別拆分先報Root。

Root擁有brief/review與雙目錄append-only handoff。你不是獨自在codebase，不回退Root/他人修改；不commit/push/改OriginalSource/Git/依賴，不動G8停止85。Source ready後freeze四項：exacthash/lines、diff、適當tests、全部原始失敗資格。

## 記錄與可信界線

一次合併Node dispatch-enter/settled、各actor ARM實際generation、perform/nativeclick entered/returned/failed、原CDP request callback received。使用同Node monotonic時鐘；requestAtMs仍Chromium Network clock。每個事件只phase/state/actorOrdinal/generation/finite時間與閉集flags。原opaque requestId只可在記憶體內綁定，不persist ID/digest/rawURL/body/error.message。

原request observer可選callback須在原parse/權限/匹配/計數等關鍵判斷保持後被動通知；所有callbackthrow不得改available/terminate/counters/原回傳與exception。duplicate/unknown/foreign/錯generation不變成有效native match。無observer無假觀測/default；M39靜態schemas與原incoming語義不改。不要為新診斷在原authority schema收窄可忽略欄位。CDP listener/session數不增加。

native witness必須來自實際default browser ports建立的當前actor/page/context/observer關係；custom runtime/UI/mock不能只靠布林、actorIndex、mode字串製造native證據。可module-private WeakMap/同等封閉身份綁定，檢查原tuple未被替換、lease仍當前；不能export任意register setter。實際UI也須區分原actualUi與custom port。診斷即使native仍明標 NON_AUTHORITY，不決定成績/OTP/容量PASS。

send batch前在每個已核owned page的exact「傳送驗證碼」element安裝capture listener。只在page-local有界buffer存trusted click count/time/closedflags；最多4events/actor、60actors、總2000events與單檔1MiB上限，不得反覆全journal stringify。只有限clock reads/原元素listener，不讀任何input值/text/email/URL/DOMsnapshot/screenshot/network body。記錄各document自己的clock與handle/document binding，無紀錄/duplicates/navigation/invalidclock/overflow明標UNKNOWN/UNAVAILABLE，不補時間0。

不得exposeBinding、criticalwindowIPC/新polling/新CDPsession/Performance或trace API、另一profiler。listener不能click、dispatchEvent、trial/force、觸發驗證、攔改fetch/header或新增HTTP。原真Locator.click保持原selector、預設actionability及原admit次序。Page記憶體可被frontend影響，因此僅diagnostic，不當authority。

原send dispatch完全settle後（成功/拒絕皆須原allSettled已收束），才每owned buffer一次parallel readback/cleanup。不得提早讀、排隊send、等待前一actor回應。原send錯誤identity及原barrier決策保留；診斷install/read/write/cleanup錯誤只使新診斷不可用，不取代原結果。所有listener/handle/新pending工作必收束；沿用原剩餘時間與原abort/close，不加長budget，不以Promise.race丟孤兒工作或宣稱已closed。途中abort/navigation/late promise需清楚標實際cleanup與original runtime close結果。

Node／每document／CDP三時鐘分開，不把一方epoch硬套到另一方；僅可同domain算spread/interval。不要time-nearest配對。將實際ARM generation、owned page/handle及既有request identity在記憶體精確配對，持久記錄只安全ordinal/閉集clockmetadata。可保留缺少哪段的explicitunknown；不宣稱已量出產品trigger內部或實體CPU時程。

## 驗證與交付

公共seams：actual registration caller→原send dispatch/actualUi、現有observer ARM/request事件、owned DOM lease、最終安全診斷writer。先actualSource RED：原send不可提供新native診斷，和真DOM adapter trusted event/cleanup缺口；fake端用當前caller而非手寫投影。再最小GREEN。

測同40/60 sibling starts先於responses、both callback arrival orders、原錯誤identity與barrier/計數不變；custom ports非native；malformed/duplicate/foreign/generation/closed/navigation/abort/overflow/clock/writer錯誤不launder；after-original-allSettled才read；handle/listener/pending收束；fake對照原返回/錯誤/guard不被診斷改。Native available須有實際來源證明，fake不能自證。

允許另一次有界本機controlled Chromium readiness（最多4空白contexts、單批<=120秒，既有installed matching browser，無新增安裝/服務/Auth/DB/外部網路）：自有簡單button DOM證實真Playwright click event.isTrusted、local buffer讀回/清理與custom分離。這只是adapter readiness，不能當網站/Native容量驗收；若binary unavailable如實標記，先報Root不擴環境。可放同newtest可選受控入口；必要private小runner在.git內，不把baseline大Source拷貝。無截圖/trace/輸入資料。

相關registration/request/browser/journeys/generator contracts適量批次、fulltype/full lint/globalformat/import/diff/static，不跑無關Python/4000產品/build/Phase8 gate。命令exit/log各自保留，初setup/實作錯誤如實資格。新診斷writer/CPU錄製不改既有M38profiler或資源判準。

Private `.git/m40-send-diagnostics/` final raw packet：exactowned hashes/lines/檢查、有效RED/GREEN與controlled readiness資格、Original7/真575959prefix/pkglock、unowned actualGit/typeexec、44operator及M35–39非ownership所有檔、全部歷史raw與Native34既定46coldinputs保護。Root唯一review後才決定exactcommit新Source Native35正常FF完整six-person→15legs，不同SHA新candidate；不rerun/0business。不作任何預先repair，250ms/N/coldload/3s7s/PSS/authority/caps/SLO/產品/DB/deps/workflow/exporter/Hosted不變。

US$0/cap5/public standard Ubuntu only；34finalfullcold/OriginalWIP/G8停止85/HostedProduction真信NONE保。對應WB4c/AC-PERF-003工具診斷資格，非40/60PASS。

## Root 同一 M40 controlled readiness 必要例外

為避免default native actor tuple接線完全延到Native35才首次正向核對，Root補充允許同一批最多4contexts／120秒使用實際 `createNativeCapacityBrowser` default ports；該adapter本來就會開啟的embedded loopback capacity proxy及BrowserServer屬此有界readiness本體，允許。這取代前段「無新增服務」對此兩個既有adapter元件的過寬解讀；仍不得另建app/backend/Auth/DB/外部服務或對外HTTP，不安裝新binary。

在owned空白page放自有簡單button（只相同send button角色名稱），用真Playwright click證trusted事件／page-local讀回與完整清理／default native tuple正向資格。可先arm原observer再cancel並完整drain以核實generation接線；零真OTP/Auth請求，不冒稱匹配實際CDP send、網站流程或容量PASS。不能export任意setter/測試後門來偽造native。若matching binary unavailable，保實際失敗資格並先報Root，不擅擴環境或重試安裝。

此為同一工具task的受控adapter readiness，仍用原兩個newtests或private小runner，不新增Source/測試ownership。原brief SHA239cdcc5b6809ea4a8e1e05390048cb0bf1e87ab6c32c6314ce24ef8b5e3fc65保留作決策沿革；不是產品或Hosted授權。

## Root 同輪三個 P2 與必要環境補齊

唯一review三P2：沒有原send batch時不得捏造batchSettled或讀DOM；close/unsubscribe與原dispatch完全settled分開。各document clock須在既有install callback記same-document anchor與該call Node前後bounds，明列不確定性與獨立時鐘；不能硬合epoch或新增criticalIPC。每actor觀測須exact prepared actor object與仍當前tuple，同index clone不能取得native-backed clickobserver，原operation與Erroridentity保持。診斷helper上限必要調整<=440行，仍小於500；其他caps不變。這些是診斷完整性/綁定問題，不是已定位產品bug；三P2同輪clear，不新增review關卡。

Default controlled readiness第一次9.38ms即CAPACITY_EVIDENCE_INVALID/0contexts/0pages/close=true/pending0，原底層catch未留錯碼，不追認此失敗已證缺binary。官方pinned Playwright1.65.1 CLI dry-run另證私有RECOVERY/.git/native23-browser-differential/browsers缺chromium_headless_shell-1255，已有fullchromium1255/ffmpeg1013；Chrome Headless Shell159.0.8154.6/mac-arm64官方CDN可補。

Root明授且由Root執行唯一環境補齊：用現有pinned CLI install chromium-headless-shell到同一隔離私有cache，只匹配component（revision1255/159.0.8154.6/mac-arm64）；不改Source/defaultports/package/lock/Original/全域安裝，不偽造binarypath，不下載其他browser。保install exit/rawlog，成功後同一controlled readiness再執行一次，仍4contexts/120s/零AuthDB外網HTTP與原資格。這不是容量rerun，也不是新測試主機支出；US$0cap5保持。若官方下載/沙箱仍阻擋，保實際錯誤不盲重試。

前brief239cdcc...及readiness例外2725738d7c864efb1addac7f2441356e1e82c58583d9e35fe77ad974e646dd8c沿革保，格式修正由Root擁有並保逆向文字差異，worker不得替Root改文件。

## Root 同一尚未回交 review 的第四項必要 P2

Root 以 actual installSendDom callback serialization＋隔離 browser-shaped VM 證實 pinned tsx 注入 __name 導致 page function ReferenceError；這不是環境或產品錯誤。須讓 page callback 自足，不注入全域 helper、不改編譯設定／產品；以實際序列化 callback 直接控制清除，再用已核唯一第二次 controlled readiness。原三項 findings／v1 保留，此第四項在 worker 尚未回交前併同一往返處理，無第二輪 review／新 scope。
