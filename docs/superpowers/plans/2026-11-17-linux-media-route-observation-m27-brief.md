# M27：同一請求的媒體轉送觀測（工具限定）

Root授權的M級單一task；base fa0682d6712bd6c3b4c1aab6445b5d26f979311f。既有唯一實作agent執行，Root唯一review。WB4／AC-PERF-003前置診斷，不是產品修復或容量PASS。

## 已知與目的

Native21前14功能PASS、health FAIL1：A1、MEDIA_BEGIN、zip_recovery、POST200後ERR_ABORTED/canceledtrue。view已先完成；取消來源/appBodyEOF仍UNOBSERVED。readonly SDK成功JSON無clone/cancel、PW response.dispose僅刪buffer，不能推因果。單次component17POST/20HTTP/16.097s，12正常direct/routed identity/gzip全部JSON/schema及CDP FINISHED；未重現同錯誤，不支持修改header/dispose。body.cancel未達、early-dispose未跑、live browser version未capture，不能當Native資格。

目的只在下一次正常Local功能測試，把同一個請求的Root fetch/parse/hook/fulfill/dispose時序與既有CDP診斷精確對上，分清Root收到完整body與頁面消費body。四個舊abort仍FAIL，不增加expected類別。

## Ownership（exact8 Source/tests）

1. 新scripts/concurrency/functional-media-transport-observation.ts，focused schema/registry，≤500行。
2. scripts/concurrency/browser-runtime.ts，原route呼叫前後被動觀測，≤260行。
3. scripts/concurrency/media-http-contract.ts，從原已讀Buffer提供safe metadata，≤500行。
4. scripts/concurrency/functional-media-observation.ts，連同Page/CDP context，≤500行。
5. scripts/concurrency/functional-health.ts，最小註冊/available接點，≤620行。
6. 新tests/contracts/whole-site-functional-media-transport.test.ts，≤500行。
7. tests/contracts/whole-site-functional-http-hooks.test.ts，≤600行。
8. tests/contracts/whole-site-functional-health-diagnostics.test.ts，≤650行。

第5/7/8行數是有理由窄例外：保留既有健康分支、路由fixtures與原tests bytes作prefix，加入實際caller反例；不壓行或擴第9檔。Root另負責本brief／handoff／review，agent不得改docs或任何未owned檔案。若必需改其他interface，先具體回報，不能自行擴scope。

## 行為契約

新觀測只啟用於已註冊owned Page、media phase/A1、exact固定API origin/path及validated media/import metadata；其他活動保原行為。registry以同Page＋完整validated request identity（私有UUID/actor token identity/action等僅memory）對上CDP與route，支援兩方任意到達順序。不得按時間最近、同action最近、URL substring或跨Page猜配。多候選/duplicate/foreign/late/overflow/parse失敗為UNKNOWN且收緊available；處理原有sequential process recovery重用logical identity，明確退休成功/終態，不能把重試套到舊route。只安全ordinal可匯出，raw URL/query/header/body/token/userId/requestUUID/digest均不得寫入。

沿原M26 mediaContext加入bounded transport context，閉集stage FETCH/PARSE/HOOK/FULFILL/DISPOSE及state STARTED/COMPLETED/FAILED/UNKNOWN，finite Node同clock時點與安全routeOrdinal。只從已存在同一response/同一次Buffer讀回報Content-Type JSON/OTHER/NONE/UNKNOWN、Encoding NONE/IDENTITY/GZIP/BR/DEFLATE/OTHER/UNKNOWN、bounded wire length/Root body bytes、status、known schema outcome與長度比較閉集。重複/畸形header不能冒充known；gzip decoded buffer與wire length不同本身不當錯誤。error只closed Error.name/code，不message/stack。

保持原route.fetch(maxRedirects0/maxRetries0)、parse/hook、drop/fulfill與finally dispose之順序/次數/參數/錯誤與abort語意。callback觀測不可遮原error或讓原未執行操作變成功；無新增HTTP、response.body讀取、journal寫入、header/query/body欄位、重試、等待/flush或normalization。結果沿M24既有journal匯出。Root fullbuffer/schema/fulfill completed不等app bodyEOF；cancelSource/appBodyEOF字面保持UNOBSERVED。原4snapshot fields、5components/總和、Auth/Image、drops4/refresh1/classifiers及所有freshness/resources/SLO/caps不改；所有未知只能收緊。無產品src、SDK、migration、全域fetch/AbortController patch或tap。

## 驗證與交付

先有效RED→GREEN，測actual route/export caller順序與每call恰一次；fetch/parse/hook/fulfill/dispose各失敗、callback異常、abort/journal fence、同Page任意到達/並行歧義/foreign/順序retry/late/overflow/敏感欄位/schema反例，HTTP200/canceled仍FAIL及原Auth/Image/drop計數。保原test bytes prefix，不刪assertion/skip。完整affected contracts、lint/typecheck/globalformat/import/diff與語意/保護proof一次完成；記所有失敗與修正資格。

私有packet .git/m27-media-route-observation/：commands/exit/log hashes、Source hashes/line limits、actual Git未owned保護（含symlink target bytes不follow）、operator44、Original7/prefix、無Source超scope。凍結unstaged等待Root唯一review；不得commit/push/Native/獨立browser或component重跑／新agent／Hosted/Production/寄信/原G8操作。Root接受後才exact paths gated commit/clean、fresh remote、新Source push/attempt1正常six-person→15legs，不GH rerun或0business gate。任何非PASS停升級、完整保留；主機US$0／US$5 cap、40/60未驗。
