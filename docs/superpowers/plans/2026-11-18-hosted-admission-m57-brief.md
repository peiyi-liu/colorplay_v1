# M57：WB5離線Hosted admission控制器

Root已核准最小typed ports／opaque API，現在正式恢復此有界離線實作。M58已由Root唯一review接受，基線app Source3f1dd73da04b401793f310a77ffb523de8617efa；Root已建立獨立operator branch codex/hosted-capacity-operator-20261118（目前HEAD仍app base、尚無operator commit）。VM10 run44245300575／job134602672919／runner30正執行該app exact Source，舊九VM均stopped。Root唯一review，不增agent。此task僅資格化admission控制流程，executionAuthority保持NONE，沒有Hosted effect callback／executor或真遠端adapter。

## Scope與分支邊界

四新owned paths：scripts/concurrency/hosted-admission-contracts.ts（<=250行）、hosted-admission.ts（<=500）、tests/contracts/whole-site-hosted-admission.test.ts（<=500）、whole-site-hosted-admission-race.test.ts（<=500）。既有hosted-config/provenance、Local wrappers、M56三檔與M58六檔、產品、package/lock、workflow/operator45、舊tests全部byte保。你不是獨自在codebase，不覆Root reports/brief/雙handoff與歷史證據。需要額外路徑先Root回報；不可通用AST style。

新增Hosted operator工具會改Git tree，不能追認由3f1dd73 Local測得的產品candidate含新工具。因此這四檔先只WIP，Root後續會放獨立operator分支／SHA，產品candidate與被測app SHA分開，保既有VERIFIED_PROTECTED_MERGE的tree同值規則。你不切branch、不commit/push、不改vercel；新carrier首次push前Root另精確opt-out。不要以新operator工具SHA替代M58被測app SHA，亦不要將Hosted credentials放Local workflows。

## 批准介面與順序

普通caller只能交scope；Root由獨立operator組裝ports，不准request/ENV/任意JSON代替trusted readbacks。最小順序：readApprovedBytes並核Root獨立持有SHA/window → observeDeployment完整固定Staging target/artifact/key/Edge/migration → verifyLocalPredecessor完整functional15／原15legs及close/publication chain、candidate → VERIFIED_PROTECTED_MERGE時Root port實查Git/owner approval/branch protection/tree等同性 → 既有validateHostedConfig一致性校驗 → reserveOnce原子單用nonce。schema嚴格、任何UNKNOWN／partial／notfound／throw／不一致／過期／未到窗均fail-closed，缺證據不reserve。不用單一true聲稱真完整鏈已驗；ports的VERIFIED只是獨立Root adapter責任回值，本task只有明標fakeIO控制，不能宣稱actual驗證。Source proof的SAME_SHA與ProtectedMerge規則原樣保。

reservation binding至少含approval SHA、scope（含run/plan/fixture/target/fingerprints/source/web）、nonce SHA、完整target/predecessor/source-proof evidence引用、expiry；精確bind且deep freeze，禁止raw secrets/email/OTP/headers。store port提供durable atomic UNUSED→RESERVED，並明確區分RESERVED／ALREADY_RESERVED／UNKNOWN；兩個競爭者最多一個成功。成功寫入但回覆遺失與結果UNKNOWN視為nonce不可重用，controller不可自動release或retry；同controller也不得因外throw重試消費。未知store狀態不變成新run自動重試。失敗理由只closed codes，不透出arbitrary error.message或原回應。

回opaque reservation以closure WeakMap驗真，無公共constructor。JSON、clone、plain ValidatedHostedConfig、外controller物件、已失效或重用皆無效；保持executionAuthority NONE、無effects。提供安全inspect／首次使用前重核介面即可，不呼Hosted executor；重核時間／同scope完整freshness證明，漂移/expired則永久無效，不把多系統遠端觀測稱global atomic。外部durable store與真Root verifier仍待adapter，不fake目前可執行。請先回最小精確typed ports與opaque方法signature／UNKNOWN語義，Root核後才改Source；可以先準備RED設計。

## 測試與交付

TDD真RED到actual exported controller，不mock成功schema／不刪skip舊assertions。fakeIO覆完整order、fixedStaging/Production負向、任一缺證零reserve、完整Local predecessor必需、窗邊界、SAME_SHA/ProtectedMerge雙分支、nonce同/跨controller競爭、store寫入但reply lost、reserveUNKNOWN/throw、nonce不可重用、到期/target漂移/partial後inspect拒、JSON/clone/跨instance／純validated物件偽造拒、隱私/closed errors與deep freeze。明記FakeIO不是remote PASS、不是Hosted execution。

focused新tests＋既有whole-site-hosted*.test.ts、typecheck/lint/globalformat/import/diff、最終freeze與全保護；保所有RED／FAIL，privatepacket .git/m57-hosted-admission/逐命令exit/rawlog/hash/manifest。報僅Source task完成，不宣稱功能／容量／Hosted通過。你只做四新檔，不能真browser/Native/Docker/network/MCP external writes/Cloud/Hosted、不能讀憑證或跑真reserve；不Git mutation／不加worker。Root處理VM10與app整合，US150/noPaid/Production禁。

## Root typed ports／UNKNOWN資格已核（2026-11-18）

准上述4新檔開始actual-controller RED／實作。Root ports需完整供應validateHostedConfig所需controlledMail／runIdentity／sourceProof等typed觀測，不能由caller request補trusted值；可作observeDeployment的完整attestation bundle。fresh_registration缺controlledMail仍拒，不寄信、不擴角色或scope。

reserve UNKNOWN／throw先鎖本controller不可再試；跨instance安全依賴真durable port之單調性：不確定nonce後續只可UNKNOWN／ALREADY_RESERVED，不得回UNUSED讓新controller自動重試。分測『已寫成功但reply lost』與『store完全不可用』，不假設UNKNOWN已durably寫成。此task只能證process-local latch與依賴store契約，不宣稱已實作跨process durability或多服務原子性。checkBeforeUse成功僅消耗一次為USED，失敗永久INVALID，executionAuthority仍NONE／沒有effect。

## RECHECK與原UNUSED guard的界線（Root核准）

原validateHostedConfig只接受runIdentity.state UNUSED，admit原樣呼叫一次；reservation之後不可偽造UNUSED再跑該函式。checkBeforeUse由closure固定RECHECK phase，重新讀全部Root ports並strict parse，核同原approval bytes/SHA/window、scope/nonce與完整stable bindings，runIdentity必為RESERVED；原assertHostedSourceProof與必要protected-merge port重新驗，timestamp／controlledMail條件均保。UNKNOWN／partial／throw／漂移／expiry永久INVALID，不重新reserve／retry。成功僅OFFLINE_RECHECK_PASSED／USED＋executionAuthority NONE，明確不宣稱再次通過原UNUSED admission guard。caller不能傳phase或trustedfields，既有guard bytes不改。
