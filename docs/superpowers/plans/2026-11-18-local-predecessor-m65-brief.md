# M65 — Hosted Local predecessor adapter（離線，單一有界task）

Root核定：依M60實查缺口先只補verifyLocalPredecessor，nonce與remote provenance分開後續task；不把四檔建議當必須同時擴權。目標是讀Root固定持有之完整Local證據actual bytes，沿原validators驗function15＋capacity15有序完整閉合，回M57 LocalWitness；不能吃caller VERIFIED boolean／摘要json當原始證據。Root唯一review一次；同一worker實作，不另agent/reviewer。

## Checkout與owned

只在 `/private/tmp/colorplay-hosted-root-m65-20261118`，base `9f9cb0caa2975a4f61d455fa15e03fe5985fa7fe`，branch codex/hosted-root-predecessor-m65。App e46562c5504a66e0dff6815f2d75f3a62bccef53在VM13跑中、Recovery checkout與Original Source全禁改。App worktree tool仍不能驗sourceRoot，沿Owner既准/tmp獨立checkout已建；依賴只symlink既有node_modules，禁止install/update/修改target。

僅新增：scripts/concurrency/hosted-local-predecessor.ts、tests/contracts/whole-site-hosted-local-predecessor.test.ts，各<=500行。Root owns brief/review/handoff三根。不要改既有M57 contracts/guards、Local wrappers/receipts/scope/schema、產品/DB/deps/workflows；需其他path先報Root具體必要性，不自行擴。

## 行為與可信邊界

export只接M57 RootAdmissionPorts.verifyLocalPredecessor型別；Root建立時固定canonical private evidence root、independently expected Source與manifest/digests（config為Root operator信任入口，不由browser/caller JSON選path／authority）。每次實際read及hash完整固定manifest/functional結果close/stage proof/publication/capacity完整manifest＋chain、15個result/close/publication，沿既有真validators核same candidate、exact15functional stages去重、有序exact15legIds與ordinals、全PASS、closed resources／originalpublication有效、chain hash／前後綁定、不missing/foreign/混source。禁止僅檢schema後直接蓋VERIFIED。不要重跑流程、生成fixture帳號或動VM。

拒symlink/非canonical/path traversal/外部path/非regular/錯owner-mode/nlink／過大／重複key或繞過原parser；bounds須明列合理上限，不把上限放寬到任意檔。單機固定Root private evidence，不宣稱抗Root自身/磁碟毀損或分散式原子快照；各read非global atomic，fixed digest/完整hash與use前原RECHECK保持。已讀舊證據不能重寫issuedAt或以now冒充其原始時間；checkedAtUtc只代表本次實查時間，originalproof時間保持原bytes。不可下載/讀agekey/PAT/secret或冷volume內容，只Root獨立held固定必要證據；不搬秘密進CI。

UNKNOWN/PARTIAL/NOT_FOUND分類沿RootRead，任何parse/read/hash/check不確定均拒；不得回傳部分VERIFIED／未通15腿witness、不得更改原error門檻救PASS。witness evidenceSha引用實際immutableinputs，checkedAt不進內容hash變成新證據。總executionAuthority仍NONE；other remote ports尚未實作，不能整體Hosted admit／reserve／execute。不能寫出fake remote VERIFIED。

## TDD／驗證／交付

先讀clone AGENTS、M57契約與直接receipt/publication validators（不用重讀整spec）；無brief缺規就開始。先actual exported RED，temp privateFS＋真schemafixture鏈：完整15/15正向，以及缺stage／duplicate／錯順序leg／少leg／任一FAIL／未closed／錯source／篡改一byte／錯hash／foreign run／stale固定digest／summary-only／錯owner-mode／symlink/traversal／read途中變動／IO未知／bounded size等負向。不要模仿implementation一比一assert，不skip既有assert、不回填VM12／VM13狀態。若原validator本身無法提供必要證明，先回報具體path/缺口，停該範圍不發明新的權威捷徑。

必要focused＋既有Hosted4files198 baseline、完整type/lint/format與diff，保原RED及所有FAIL/raw。無真Native/browser/proc／網路／Cloud／Hosted／Git mutation／commit/push／fixture資料寫入；temp測試FS限這份checkout .git/m65-local-predecessor或受控temporary。Source freeze後一次final packet含Source hashes/行數、命令raw/結果、受保tracked hashes、M57 base/helper固定資料與資格限制；交Root唯一review後停Source。Root後續決定commit，不部署。

## Root M65證據接線核定（task內）

Root准constructor固定持有profile bytes的獨立expectedSHA及observed host/identity/backend，沿原validateExecutionProfile/requireExecutionProfile；不得由profile/manifest自填observed，缺獨立Root attestation則UNKNOWN，無默認捷徑。此可信config僅Root operator入口，不是普通caller manifest authority。

Root已實讀validate-functional-publication.mjs原PASS謂詞：不虛構不存在的獨立PUBLICATION_VALIDATED檔。actual result/close/candidate/stage-confirmed/15links沿原TS purevalidators重算，保candidate actual hash/deepEqual及process exit0/signalnull/finiteelapsed0..1500000/stderr0/ownedClosedtrue/residue0/sourceFrozen全部。交packet提供逐謂詞對照；缺任何必要持有證據要NOT_FOUND/UNKNOWN，不能只finishReceipt/schema當出版驗真，不改原mjs或擴scope。

## Root M65第三檔核准（同task內）

worker初版格式化568行，Root准新增唯一helper scripts/concurrency/hosted-private-evidence.ts，承接固定Root私有evidence root有界reader與duplicate-key JSON scanner；adapter保持唯一public Root port factory，責任拆分，各檔<=500。owned總共adapter/helper/directtest三檔。不得變通用任意IO、network/process或另一個authority入口；原568raw／初失敗留存，不以壓縮行數替代可讀性。既有Source／guards不變。

## Root M65原capacity request實讀核定（task內）

每leg沿原capacityRequestSchema實讀固定Root bundle原capacity-request.json，index以獨立SRI綁；核close.requestSha與run/leg/scope/plan/predecessor/publishers/registrationReady，不從close取SHA自比。缺原檔只PARTIAL；不讀private-plan/secrets，不新增Source path／executors。

## Root directtest行數窄例外

唯一tests/contracts/whole-site-hosted-local-predecessor.test.ts准<=510行（當前503）：約350行完整Linux synthetic chain fixture與約150行semantic/FS負向表必須一起理解，僅超原500三行，另增path或壓縮格式並無實質責任分離效益。符合AGENTS超500需理由之規則，final列實際行數及此理由；adapter/helper仍<=500，不擴任何其他path。type fixture drift只改真正logicalCpu欄位，不改原schema，保原typeFAIL。
