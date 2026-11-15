# WB4b-B3 — Local完整功能runner與真收據

狀態：B1/B2/Auth copy/mounted media均已root ACCEPTED；base ccab5fc4edb022fee47736d7351c5ac68cfdfa7c。沿同一worker/root唯一review，僅runner/tools與直接contracts，現在不開服務、不建身份、不真browser/WASM、不執行完整run。先補WB4c（含Owner雙60情境）的工具／manifest再共同final freeze，由root首次真functional。

## Ownership與交付

worker：`scripts/concurrency/`新增run-functional／runner／runtime-loader／receipt等最小模組、直接`tests/contracts/whole-site-functional-{runner,receipt,runtime}*.test.ts`，以及package.json僅新增scoped Local功能script（不用全域acceptance、無lock/deps變動）。先列精確paths／必要既有介面調整給root。不是獨自在codebase，不revert他人/root文件、不得寫dirty原root產品碼。產品Auth、editor、backend/DB/RLS/timeout不在此段；若真source矛盾需精確回報，不猜改。

B3只是**六身份小樣本完整functional runner**，不是新增的40/60批量註冊runner；後者屬WB4c，不能把範圍藏進六人identity enum。scoped command須真接完整流程，缺root port／缺stage／not-run都不可能產PASS，不提供假成功CLI占位或可跳oracle的旗標。

## 流程與生命週期

使用B1 preflight／ready capability／0700 root＋0600 write-once journal：exact clean SHA／artifact marker／key fingerprint／fixed新Local project/ports／fresh live DB identity與120migration/71RLS空基線通過前，不得任何fixture mutation。不啟服務、不reset/seed DB、不讀舊env/test-users fallback。外層stop25min，所有child/Promise立即觀察、abort/finally關本run的browser/pages/clients/channels/listeners/timers，不碰他人process；產品12s/15s/Live20s/800ms均不改。

依現有已接受helper整合必要順序：T1/T2/S1/S2/A1 setup（A1僅svc bootstrap）；正常teacher RPC C1/C2及S1/S2 join；R1真UI register→Mailpit own-recipient/fresh OTP→正式完成入T2/C2→真recovery；auth invalid/identity/reload/switch/copied-session vs independent-session控制；S1/S2真學生學習／正式Quiz／remediation／S1 mastery/reward/purchase自然鍵replay/equip／achievements/leaderboard/ledger；T1真C3/成員/進度/analytics/questions與T2/R1跨租戶；T1/S1/S2真UI Live完整合法題組finalize/report＋R1 outsider；A1真UI MFA/主要Admin讀取與S1/T1越權；實際mounted單張happy/critical pending recover/cancel＋ZIP第二圖回覆loss/recover與cancel、root必填SQL/物件readback。controlled revoked refresh只owned S2，放所有學生/Live業務後，不冒稱自然JWT expiry。

正常fixture setup的API登入／建班／join明列為setup/protocol，不能冒充UI；真正UI helper登入使用者仍核canonical subject。R1成功recovery replacement password留private confirmed checkpoint以便後續重用。所有Auth/profile/classes/正式XP/wallet/media/drafts/audit留存；cleanup僅關本run資源，不能調用舊Live刪帳號清帳或promise全0。逐stage write-once intent/confirmed/failure，若中途出錯保留已知與unknown，不自動重新送不可確定mutation。

## Root只讀ports與CLI安全

Root負責實際read-only權威adapter；worker先列最小typed契約，root同期準備。`preflightFunctional`的baseline/databaseIdentity/attestation必須來自本次真讀，不能只信舊JSON counts。固定新Local API58321/DB58322/app58373/Mailpit58324/project cp-whole-site-261115，Root最後產exact候選attestation／private request，secrets只讀0600本runstatus記憶體，不進scope public receipt／argv／log。db URL在公開資料只用credential-free固定URL。

Root runtime位置：`…/live-recovery-runtime/whole-site-261115`，不是repo的一部分。已備`canonical-baseline.py`（exact reviewed/frozen SHA/run、固定10canonical表server digest）與`media-readback.py`（stdin typed MediaReadbackInput，argv只exact SHA及private journal dir）。readback要求journal parent為runtime/functional-private、0700/0600/no symlink，root `media-approval-<runId>.json`與`canonical-baseline-<runId>.json`綁同source/project/run，再核A1/create/begin/intent/draft等proof；驗完整6slots/角色/原sourceHash與當前derived4verified2abort/4assets9variants、READ ONLY SQL及bounded實體Storage GET/SHA、前後canonical不變。回stdout只白名單counts/booleans。已有20pure guard controls，但尚無真DB/bytes PASS。Root會另提供fresh preflight count/identity helper。

若CLI呼叫root工具，僅已驗證root runtime下固定檔名與manifest hashes、固定Python binary、`execFile/spawn`參數陣列/stdin、無shell／任意command／dynamic-import user module能力；錯root/path/mode/owner/hash/source/target先拒，不能--skip/--force或改成Hosted。真正root approval manifest在最終freeze後由root建立，現在tests只能synthetic fixtures。Node24主要entry import smoke只驗無request/launch/fixture；無args invocation fail-closed。CLI讀取與public formatter不可spread全status-secret/config/私有identity，錯誤僅safe phase/code。

## 收據、diagnostic與測試

Public schema綁schemaVersion/source/artifact revision與hash/key指紋/environment/project/run/mode，列required stage verdict、safe counts、cleanup/retention與未驗範圍。`INTERCEPTED_FUNCTIONAL_CORRECTNESS`是HTTP proxy/cache-disabled功能模式，不是native latency/容量，真WASM／SQL／Storage讀回才可勾對應stage。只有所有必填stage/權威proof/資源關閉通過才functional PASS；fixture/cleanup/timeout/未執行/不完整一律FAIL/INCONCLUSIVE，不可幫缺值填true或把某個成功stage變整體PASS。原intent/fail/primary不覆寫，不自動rerun。

有意故障／負向與unexpected health分開：只精確本run action/actor/run/request的4個media drop、已知拒絕、controlled S2 refresh等既定phase可分類；不能全域忽略console、任意4xx/5xx。不保存raw console/body/WS payload/URLquery/token；可記憶體中以精確安全狀態及已知request phase/allowlist判斷，public只安全code/counts。測未知location/code／extra server error仍FAIL；沒有body或判不清不得當預期。

先行為RED（ports全stub，0真服務）：任一preflight錯誤0mutation、stage順序與controlled-refresh-last、缺required proof/未提供oracle不PASS、原失敗收據留存、25min abort與cleanup errors不PASS／no unhandled、late結果不污染次run、wrong artifact/source/key/root target先拒、public輸出深層credential/provider-marker/extra rawPath防洩漏與expected-vs-unexpected控制。test不要鏡像列印或只字串檢查。完整lint/type／explicit affected tests／changed Prettier／diff及Node import綠一次，exactpaths commit＋safe packet，root唯一review；未ACCEPTED不WB4c或真functional。

## 交付狀態

ACCEPTED 84c61dfc310408773cdd09f6e40a34c6011c70ab；唯一publication P2同輪cleared。Producer只留functional-result-candidate.json（PENDING_EXTERNAL_ATTESTATION、strict receipt無result），CLI最後回safe verdict；權威functional-result.json由root外層核正常processclose/exit/elapsed<=25min/strictstdout/候選相等/exact source及無owned殘留後建立。初7/61、delta2/21與真CDP4controls PASS，未真functional/容量。
