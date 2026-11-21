# M54：一次補齊 functional Live 結束與文件傳輸診斷

狀態：Root 核准離線實作；同一 implementer，Root 統籌與唯一一輪 review。依既有全站 60 人 Local 計畫之診斷工作，不擴產品範圍。基線 Source e7063d63d4ed4ee6dff4af87db4ac2e6430fe46d，VM6 真結果見 `docs/reviews/2026-11-18-gcp-vm6-functional-live-result.md`。

## 問題與驗收

前9功能階段PASS，live_finalized FAIL，後5及15容量legs未跑。20題 confirmed 在解析/排名/下一題或結算操作之前，不能證明結算/report成功。T1/page8 同一 APP_DOCUMENT GET request2259 ERR_FAILED 產生3個健康事件；沒有持久化確切操作、route意圖或Root分支，因此根因未知。124862ms不足以認定timeout。M53真sideband已核本輪父cancel/timeout/overflow=false，子exit1；舊VM5首因仍UNKNOWN。

目標是下一輪可以一次區分每題尾段、結算、completed snapshot、報表RPC/驗證、報表頁面導向/heading、health與cleanup失敗，以及該APP_DOCUMENT原Root route/CDP傳輸流程。只診斷；不改結果、不新增HTTP/UI操作、不重試、不放寬任何錯誤、guard、timeout、SLO或PASS。

## 唯一 ownership

五個 Source：既有 `scripts/concurrency/teacher-live.ts`、`browser-runtime.ts`、`functional-health.ts`；新增 `functional-live-diagnostics.ts`、`functional-document-observation.ts`（同目錄）。四個 tests：既有 `tests/contracts/whole-site-functional-live.test.ts`、`whole-site-functional-browser.test.ts`；新增 `whole-site-functional-live-finish-diagnostics.test.ts`、`whole-site-functional-document-observation.test.ts`。不得更動 config.safely、teacher-live-bridge、health schema/計數、產品、operator/package、M52六檔、M53五檔、exporter/workflow或其他Source。需要額外檔案先停該範圍報Root具體原因。

新檔與teacher≤500行；原functional-health已有613行，本輪允許≤650，只加原事件被動forward，不作不相關重構。新增helpers各≤450，tests各≤500。browser預期≤250。上限不是預定填滿的目標。

## 凍結介面與行為

1. `createLiveDiagnostics` 建立綁當前run/scope、實際Page/actor/owned session的memory lease。`step(closedStage,closedAction,position?,operation)` 在原位置單次呼叫並await原operation，回傳原值或rethrow同一原error。round1..20尾段解析visible、排名click、action enabled、next/final click分步；round後completed wait/count、report RPC/predicate/goto/heading、health與完成journal各有固定step。記已開始/已返回/已失敗與安全序號/position，不持久化sessionId、URL、raw error.message。
2. operationFailure與cleanupFailure分別first latch；每binding dispose與各actor close以安全ordinal/outcome記錄，保持原dispose順序、allSettled/settleCapacityOperations、throw優先序與safely壓碼語義。業務先錯再cleanup錯，兩者均可見，但不得藉診斷改原return/exception。沿原cleanup最終收束後一次best-effort現有journal.write（固定檔名 `teacher-live-finish-diagnostics`）。writer/observer失敗不改原結果或原exception；缺觀測明記UNKNOWN/UNAVAILABLE，不聲稱診斷已完整。
3. sideband schemaVersion1、authority NON_AUTHORITY；Source/run與既有scope可得的profile/job/boot綁定均復用，無額外proc/HTTP查詢，缺欄位不能編造。error分類限已驗證型別/closed code/errno/真正Playwright TimeoutError，未有結構證據則UNOBSERVED，不parse message、不因elapsed推定timeout。記固定上限/overflow/collection，超限不能猜關聯。
4. document helper綁實際Page、actor、本run/app origin和當前owned session。persist路由僅 LIVE_PRESENTER/LIVE_SESSION/LIVE_REPORT/CLASSROOM/OTHER 與安全ordinal；path/query/raw IDs/frame/loader僅memory，不寫記錄。原goto前BEGIN，原結果RETURNED/FAILED；samePage＋exact validated URL/method/resource type＋當前generation唯一pending才可關聯，CDP/route任一先到均支援；parallel、reuse、redirect、跨page/actor/origin、foreign query、late/ambiguous一律UNKNOWN，不nearest猜配對。已知route須比對實際Source定義，不能猜route拼法。
5. 原browser route只旁記既有MATCHED/FETCH/policy branch/FULFILL/ABORT/DISPOSE與returned/failed；未呼叫continue/fallback明記NOT_CALLED。functional-health只在原CDP request/response/failed/finished listener被動forward既有safe status/networkCode/blockedReason/cors/canceled/redirect欄位，frame/loader只有原event實有才記observed安全分類；不得新增CDP session/enable/getFrameTree/responsebody/header/HTTP讀取。原3個unexpected仍3，原FAIL仍FAIL。observer callback錯僅診斷UNAVAILABLE，不能影響原health。

## 實作與一次審查

先以真 exported helper/actual journey和原route factory 的假ports重現缺診斷RED；不以複製實作的模型測試取代actual factory。測actual teacher20題後每step失敗、operation+cleanup兩錯、cleanup-only、writer錯、正常20題原值；原route每branch operation trace/count/order一致。覆蓋CDP/route兩順序、duplicate/reuse/redirect/parallel/foreign page/actor/origin/query/late/overflow、closed schema與隱私負向；未觀測值保持UNKNOWN。原timeouts、signals、guards與權威health無變。

使用既有pnpm/Node24工具。focused新增與受影響tests、typecheck、lint、format、diffcheck一次最後綠；保留所有真RED與setup失敗，不重寫歷史。私有packet `.git/m54-functional-live-finish/` 保每命令/exitCode/rawlogs/manifest/final source freeze，報簡要結果、九ownedpath hash/行數、已知風險。不跑Native、Playwright真browser、Docker、GitHub/Cloud/Hosted；不commit/push/merge/deploy。

不得新增reviewer/subagent；你不是獨自在codebase，不可覆寫Root docs/WIP。原目錄Source/Git/deps、7protected docs、handoff真575959prefix/pkglock、其他Git tracked與既有私有證據全保護。Root目前只改報告/雙handoff，本brief不將Root docs歸implementer ownership。Root完成唯一review並凍結exact Source後，才另啟fresh job；不改/回填VM6舊結果。

## Root 窄幅行數修訂（2026-11-18）

`functional-document-observation.ts` 上限由450調為490行，仍低於repo500。實際Prettier後481行，保同一document memory closure與單向型別依賴，比為31行新增第6Source或引入Live/document型別循環更容易維護。不得壓縮格式；其餘ownership、行數、時限、行為與驗證要求全部不變。此為Root實作選擇，不是產品或架構範圍擴大。

## Root 唯一一輪 review：三項 P2 合併修正

Root actual exported helper/fakeports三項控制均重現，私有 `.git/m54-root-controls.mjs` 與 `.git/m54-root-initial-controls.json`（不是Native）：

1. wrapped step 已 RETURNED 之後的未包步驟錯誤，外層 operationFailure 不得誤標該已完成stage；保原exception，診斷fallback為UNOBSERVED/UNKNOWN。
2. intent RETURNED/FAILED 之後新出現的request/CDPid不得配到舊generation並稱OBSERVED；沒有active intent的新row為UNKNOWN。已在active intent建立的同一row合法terminal仍可於後續收束，不能以此拒全部延遲terminal。
3. Root main-frame request與CDP Document只比page/URL不夠；iframe可用同URL。重用既有Page.frameNavigated listener作被動forward，memory-only主frame id/cache，無額外CDP session/send/HTTP；主frame pin缺失或frame/loader矛盾為UNKNOWN，persist只安全enum/boolean，raw IDs/URL不出memory。

為保內聚與repo≤500，Root明確允許新增第6 Source `scripts/concurrency/functional-document-observation-types.ts`，只純type、≤180行；document helper cap調為≤500。其餘ownership與cap不變；若5 Source可合理完成則無須新增。理由是正確性/mainframe關聯與lint格式所需空間，不為行數壓縮或塞錯domain。這項type拆分不改產品架構或資料契約。

同一agent將本輪三finding合併RED→GREEN、保初freeze及全部原logs，最終另freeze-v2/packet。Root只核本輪finding閉合與最後checks，沒有新reviewer或第二review輪。

### Finding② 關閉所需的最終窄 cap

Root核准document helper≤510；實際505行，純type已先拆82行。新增必要active/pending guard，避免候選fast-return把已closed/terminal row當新請求；配合主frame/loader的同一memory closure，為多出的5行再拆runtime模組反而增加狀態關聯複雜度。這是AGENTS「單檔超過500行需說明理由或拆分」的具體理由，不能刪觀測欄位或壓縮格式。其他ownership/cap及行為全不變。
