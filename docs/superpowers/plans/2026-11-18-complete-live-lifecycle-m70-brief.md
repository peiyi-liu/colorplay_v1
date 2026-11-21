# M70 — 完整 Live 被動階段診斷與60人診斷索引

## 結論、證據與責任

Root核准同一task1_implementer執行本Task，Root是唯一reviewer。Owner已授權持續執行/審查至全站60與Staging，本Task仍僅Local/offline工具；沒有Hosted/Production權限。

app base31feebc03006b9e7f116bf7b0eb248a6ffa3293f。VM15 functional15/匿名3+10+20/fresh40+60 PASS，existing3 wcr-261118-77bd35639012 INCONCLUSIVE，後9未跑。Root真age/cold/business核完；教師30與兩學生自然完成、healthVALID/七parentclosure無首因，Live已create；第一題intent檔未留存。區間包括joins/ACK、outsider拒絕/私有channel、lobby/bind/count/start、第一題intent writer本身。exactfailedawait UNKNOWN，不可把缺檔解讀成writer尚未呼叫、不可歸因M66溢位或教師，更不可猜測修產品/放寬拒絕。

Root finald4b61ff5bc258fe6a1b2786156e10f098cf754729a419af077d94b299ffa432b；原Native不重跑。十五VM strictSTOPPED/runner0；VM2–15永久清理另候Owner確認，與本Task無關，不得刪資源。M69 operator3081400e70c9b2b622d8cab9f7fd91c639edeaaa四Source與Root工具獨立，不改app source比較。

## 僅九owned paths

- scripts/concurrency/capacity-live-game.ts
- scripts/concurrency/capacity-live-gate.ts
- scripts/concurrency/capacity-live-diagnostics.ts
- tests/e2e/helpers/staging-capacity-browser.ts
- tests/e2e/helpers/live-browser-join-diagnostics.ts
- tests/contracts/whole-site-capacity-live-game.test.ts
- tests/contracts/live-browser-join-diagnostics.test.ts
- tests/contracts/whole-site-capacity-live-diagnostics.test.ts
- tests/contracts/whole-site-capacity-live-lifecycle.test.ts

五個Source（兩新、三既有）＋四tests（兩新、兩既有），均<=500行。capacity-live-game.ts原createCapacityLiveGate搬到新module，維持原public export介面；移除本輪診斷接線後，機器證原gate/核心行為AST或byte inverse同31fe，不複製大baseline檔。既有tests不得刪assertion/skip；只有明確40→60邊界案例可窄改invalid index為61，需列原assertion變更。

## 不變的行為契約

- 本Task是完整被動診斷，沒有runtime產品修正。動作及original await順序、Promise.allSettled並行、等待20s/既有caller與budget、timer/abort、permissiondenial判定、participant/questionCount/report predicates、每題操作、resource close順序與原throw identity/cleanup覆蓋原錯語意、原HTTP測量/30reads/15s/window/profile/SLO全不改。
- 不新增poll/retry/sleep/業務動作/DOM/network/storage讀取來取得診斷。不把sideband當authority，也不把診斷失敗變成業務成功。writer只能放原清理之後的單次best-effort private journal；無論writer/snapshot/observer/seal throw/reject，不能替代原結果或錯誤。若原cleanup覆蓋先前operation錯誤，維持原語意但獨立保存兩者。
- PageDiagnostics.realtime()有page.evaluate，禁止在failure/cleanup為診斷新增await。新增optional同步safeRealtimeSnapshot，只投影現有closure安全counts/status/events；缺方法/generation0/截斷/丟失各明列UNOBSERVED/PARTIAL/UNAVAILABLE，不補假0、不泛稱完整ACK。原realtime/auth/session token讀取方法保持byte/AST不變（除必要type/interface接線）。
- 重用joinLiveThroughUi(options.observe)現有隔離callback，按原actorIndex記，不能重編41–59來逃診斷範圍。已確認live-browser-join-diagnostics兩個actorIndex schema目前max40，准只將診斷域升max60並補1/40/41/59/60/61邊界；不更改真正profile/人數/API/權限。這是未來60診斷契約修正，不能說是VM15三人的原因。

## 一次完整覆蓋範圍

建立與UI/API選項→host ACK→journal CREATED；每個學生UI加入全步驟及ACK/API join+subscribe、allSettled；outsider join/getState permission predicates與private subscription callback/refusal/remove結果；lobby read/bind/count/start UI或API及確認；每題intent writer、學生state/prompt/options/submit response、feedback/count、排名/advance/finalize；completed wait/report讀取/UI/predicates；最後原cleanup與單次diagnostic writer。

固定closed stages及ENTERED/RETURNED/FAILED、actor/題次/Node時點、首失敗安全class/code、abort/predicate結果，不能把未知錯誤安在已RETURNED的phase；operation與cleanup首失敗分開。SDK subscription狀態只有限enum、first callback/error class、explicit-refusal是否匹配、removeChannel有限結果；不能保存Error.message或topic等內容，也不改匹配規則。

collector純記憶體、NON_AUTHORITY/executionAuthority NONE、有界counters/首失敗/head+tail與每actor最後進度；正常60actors×20questions不能丟失首失敗/最後進度而只能得UNAVAILABLE。尾段截斷明示PARTIAL、counters與firstfailure獨立保留。aggregate實際UTF8 JSON bytes<=512KiB，沒有任意深度/無限事件陣列；over-limit/late/seal/poison資料failclosed診斷且不影響原業務。只留有限enum/數字/boolean/null與無秘密常數，不放session/user/class IDs、URL/topic/code/email/account/password/OTP/token/body/header/error message/stack、可識別字串或其hash。

## 必要驗證與保護

1. 先有效行為RED再實作；完整phase故障矩陣、並行多學生同時失敗、原error identity與cleanup覆蓋錯分存、writer失敗、unknown await不誤指、abort/predicate/SDK拒絕移除與等待20s、操作trace/呼叫數/順序均不變。observer/getter/proxy/snapshot/writer異常隔離、60人20題、首失敗/尾段/byte邊界/late/seal/privacy與界線1/40/41/59/60/61。
2. 同31fe實際49files843受影響TS union（從M68既有packet/fixtures回用命令與discovery，避免重複計數）＋本輪新tests，lint/typecheck/affectedformat/import/gitdiff/source移植inverse與export/cold保留路徑核。Python parent五module/manifest及81既有結果均不變，不為純TS被動診斷重跑Python或全產品1771。
3. Worker只准Vitest fake boundary/本次owned TempFS，不執行真App/Auth/browser/network/container/Nodechild/cloud/runner/Hosted/Git/deps操作。若測試確需額外執行方式或exports/retention新增path，先回Root給具體原因，不擴九檔。新journal必須能經現存snapshot/export原路保留，若受現有bound/allowlist擋住需先報、不可偷偷改export authority。
4. Root .git/m70-live-diagnostics/protected-root-baseline.json保非owned/non-doc tracked bytes、Original9+prefix、M69四Source、Native13/14/15 inputs與歷史參考。你不是唯一codebase工作者，不可revert他人內容。Root負責brief/review/handoff，worker不改docs。Raw命令/stdout/stderr/exit、ERROR/RED/FAIL歷史與immutable manifests放app .git/m70-live-diagnostics，不覆舊證據。不碰legacy內容進報告/依賴/Git/Original Source，Original G8 STOPPED85保持。

交九owned diff、有效RED→GREEN、完整test/fullchecks/Source freeze與保護packet。每Task一輪Root唯一review；M70完成不等於VM15重分類/Native16/60全站/Hosted或Phase通過。下一fresh exactSource single attempt仍由Root另作實際Source/資源admission。

## Root範圍補註 v2：單檔行數的唯一窄例外

Root依AGENTS「超過500行需說明理由或拆分」核准capacity-live-game.ts最多545行，其餘八檔仍<=500；只覆蓋前文對該檔的500行限制，不擴九paths/行為/權限/測試標準。原gate139行已移出，完整inline await階段標記後目前532行。Root已檢視尾段，保留原finally cleanup與cleanup覆蓋原例外的語意在同函式，可避免僅為行數再次跨async函式搬移原cleanup與publisher而增加trace/inverse邊界。完整Sourcefreeze與原操作trace/原error identity/inverse證明仍必須，不能以此例外夾帶其他行為。此為實作前範圍補註，非第二輪review。原brief前綴bytes/hash保留。

## Root範圍補註 v3：完整caller矩陣測試的窄例外

再准tests/contracts/whole-site-capacity-live-lifecycle.test.ts最多535行（去重後目前525），因同一protocol/UI public-caller fixture與38phase故障矩陣、parallel錯誤/cleanup覆蓋/20題成功控制需一併閱讀；不為25行差額引入第十檔或改動矩陣/原47case assertions。保前一v2 game最多545，其餘七檔仍500、九paths與全部行為/驗證/權限不變；這是測試檔的有理由例外，非新一輪review。根據既有AGENTS可說明>500行，未提升產品範圍。原全部brief前綴與FAIL/ERROR記錄持續保留。
