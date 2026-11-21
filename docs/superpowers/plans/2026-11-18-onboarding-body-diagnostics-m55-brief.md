# M55：一次補齊 onboarding 單次 body parser 拒絕原因

狀態：Root核准離線實作；同一implementer，Root唯一一輪review。基線 Source be38f50b9b274a66a03244123e8ce85590971300。這項只補安全診斷，沒有證據允許改產品、schema、403白名單或PASS。

## 實證與未知

VM7 run44227747989/job134544990007/attempt1/runner27：functional15與匿名3/10/20 PASS；fresh40 INCONCLUSIVE。40完成、40 Authcreated、ownershipKnown=true，entry58.027ms、send40/40 skew171.415ms，皆<250；readback階段最終gate actor0拒絕，其他39因some短路UNOBSERVED，不推同錯誤。父M53 contextMatches/OBSERVED、cancel/timeout/overflow=false、firstCause=null、exit1/residue0，非父取消。

actor0原onboarding candidate1/bodyReads1/decoded92/status403/codeUNKNOWN/registrationObserved=true/uiComplete=true/pending0/firstFailure=CODE/finalized/revoked=true。CODE發生在CDP `{body,base64Encoded:false}`與UTF8 byte92已一致之後，僅剩 canonical key lexer、JSON.parse 或 strict body schema。CODE revoke後loginObserved/loginUiComplete不再記成功，不能由它們false推真UI/login失敗。40completed原本已通postLogin與same-subject Root readback。

Root真讀owned stopped Auth/Kong，03:15–03:17UTC只有40 POST/logout403 session_not_found與40 Kong POST/auth/v1/logout?scope=local403；無其他>=400。這是aggregate serverlog，不是actor0 wire body。body未持久化，不能追認原字串，也不以新HTTP重現作原body證據；不擴user_not_found。尚未確認產品或parser行為bug。

Root實際age1394files216095835B、cold1341/8stop/2DB127tables/3volumes hash核，未restore；資料在相鄰runtime/gcp-vm7/downloads/files/files，投影.git/gcp-vm7-owned-auth-log-projection.json，Rootfirst.git/gcp-vm7-root-first-review.json。VM7 job03:27:02UTC finalfailure/runner27已移除/repo0，Root正常停機中。舊VM6錯誤仍未解釋，不回填舊結果。

## Ownership 與輸出

必要Source僅 `scripts/concurrency/capacity-onboarding-logout.ts`；新test `tests/contracts/whole-site-capacity-onboarding-body-diagnostics.test.ts`。若為內聚與≤500需要抽純memory投影，可新增 `scripts/concurrency/capacity-onboarding-body-diagnostics.ts`，只供本helper使用、≤300行；既有helper與新test各≤500。原497行onboarding-logout test整檔保留；其他M52五檔、M53、M54十檔、operator45/package/workflow、產品、BaseSchema/parser guard、所有舊tests均不改。需要額外路徑先停該範圍回Root。

沿現有onboarding exported schema/snapshot附 `bodyDiagnostics`，仍schemaVersion1/NON_AUTHORITY。final-diag既有import可自然取得，不改caller。先回Root最小精確欄位與預設/缺觀測語義，Root核介面後才改Source；可先準備不依賴欄名的fakeports/RED設計。

## 凍結行為與隱私

- 只在這一次既有readBody結果與原lexer/JSON/schema guards原位觀測。原guard順序/條件、JSON.parse與schema呼叫次數、單次body-read、HTTP/UI/CDP操作、時序預算、readback、lease/lifecycle、CODE撤銷、discount及PASS全部保持。觀測器失敗不得改原return/exception/判定，缺觀測明記UNOBSERVED/UNKNOWN，不能編造解析後欄位。無第二parse/bodyread/HTTP來補不足證據。
- 固定closed `parserStage` 與首個 `parserReason`，至少區分KEY_NONCANONICAL、KEY_DUPLICATE、KEY_UNKNOWN、JSON_INVALID、TOP_SHAPE、ERROR_CODE、CODE_FIELD、MSG_FIELD、OTHER與UNOBSERVED/ACCEPTED；實際原guard無法細分時明記OTHER，不推測。保留原firstFailure=CODE等既有欄，不混成新產品錯誤碼。
- 在原解析已產生plain值的階段，記topLevelKind、已知欄presence/type、unknownKeyCount；錯在前階段則後欄UNOBSERVED。為一次完整定位，可對公開Auth常見key `code/error_code/msg/error/message/error_description/status/status_code/request_id/error_id` 只記closed presence/type，不改當前允許key集合；未識別key只計數，不記原字串。值只允許boolean或固定分類：例如error_code是否精確session_not_found、code是否精確number403；任何其他value保持OTHER/UNOBSERVED，禁止任意code/message輸出。
- 不持久化body、msg、raw key、URL/query、任何hash、OTP、JWT、headers、信箱、SQL或任意exception.message。新診斷欄數/值域/bytes均有限；原4096body cap保持。對closure getters/proxy/未知錯誤需不破壞原路徑與隱私；不因diagthrow增加health錯誤。

## 驗證與交付

先用actual exported helper的原factory/observer/lease fakeports作真RED，證實原CODE無法分辨lexer/JSON/schema原因；新schema不以mock成功冒充。原正向/負向流程對照決策、bodyRead/parse/schema呼叫數、return/exception/lifecycle/health/discount完全一致。覆蓋invalid JSON、非object、canonical與escaped/duplicate/unknown key、錯code/error_code/msg型別、92B小payload、multibyte/size/base64/UTF8 mismatch原分支、out-of-order/cancel/pending/foreign actor原拒絕、diag失敗與敏感字串不輸出。缺證據時後續欄保持UNOBSERVED；不驗未允許body為可折抵。

focused新test＋原受影響tests、typecheck/lint/format/import/diffcheck最終綠。保所有初RED/錯誤log，建立 `.git/m55-onboarding-body-diagnostics/` private packet，逐命令/exit/rawlog/manifest/final Source freeze/protected paths；報簡潔結果與風險。不複製大型檔案保存基線；不可使用上一輪失誤的通用AST style工具，手動做最小lint等價調整。

只離線，不真browser/Native/Docker/GitHub/Cloud/Hosted，不commit/push。原工作目錄Source/Git/deps、7protected docs、真575959B handoff prefix/pkglock與歷史證據全保護。你不是獨自在codebase，不能覆寫Root報告/brief/雙handoffWIP，不新增agent/reviewer。Root只一輪review，核准exact新Source後另fresh job；VM7原INCONCLUSIVE維持。

## Root 最小介面已核（2026-11-18）

准3paths（既有helper＋新purememory body-diagnostics helper＋新focused test），各cap依前文。bodyDiagnostics使用嚴schema，collection三態、parserStage閉集、parserReason首因鎖定、topLevelKind、十個固定public key presence/type，以及codeValue/errorCodeValue固定分類。

lexer已見canonical key只記TOKEN_SEEN，尚非JSON或top-level證據；原lexer早退時其餘全部UNOBSERVED，不當ABSENT。只在原JSON.parse與原safeParse返回後，安全投影已產生值（safeParse false也可）；無第二scan/parse/read。unknownKeyCount只計十個public觀測key之外已見數，和現在允許三keys的集合不同；已知alias仍由原KEY_UNKNOWN拒絕，即使count=0也不能接受。proxy先拒投影，descriptor不呼getter；diag失敗UNAVAILABLE，原值/exception/health/discount保持。

Root已核VM7停止終態，七VM全stopped/runner0。實作後唯一review，既有be38/VM7原INCONCLUSIVE不回填。

## Root 字面介面修正（2026-11-18，保原隱私測試）

最小介面只替代新metadata名稱／enum：`unknownKeyCount` 更名為 `unrecognizedKeyCount`；`codeValue` 與 `errorCodeValue` 都使用 `UNOBSERVED|ABSENT|MATCH|OTHER`。MATCH各自只代表精確number403與精確string session_not_found。其餘語義、十public keys集合、TOKEN_SEEN與提前拒絕UNOBSERVED、原guard及拒絕判定不變。原因是原497行test對整snapshot的privacy regex原封不動；不得放寬regex，亦不得用nonenumerable/toJSON隱藏新欄。保留最初2個RED及其後11個privacy字面衝突FAIL，不追認初次全綠。synthetic92B控制不是VM7實際body重現。

## Root 既有計時 fixture 最小修正（2026-11-18）

Root獨立重現既有runtime test21項中1FAIL，並以be38歷史逐bytes核runtime/profile/contracts/fixture六檔不變。原執行closure14helper＋2metadata等於16次read，每次synthetic clock+2，因此准唯一額外第4path `tests/contracts/whole-site-capacity-runtime.test.ts` 中同一case三literal：130→132、330→332、30→32。原產品、IO、closure、全部其他assertions不變；保所有既有FAIL。這是凍結計時fixture跟上既有closure，不是放寬SLO或新增IO。原497行onboarding test仍整檔byte保。Root的220組be38/新helper真factory行為/lifecycle對照皆PASS，private結果 `.git/m55-root-behavior-controls.json`，樣本不當VM7實際body。
