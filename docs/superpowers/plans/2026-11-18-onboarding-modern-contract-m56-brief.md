# M56：onboarding logout 官方雙格式嚴格契約

Root核准有界離線實作準備；同一implementer，Root唯一review。基線Source47f281275628e5a3bb1fbe3b4daf2f09486a5b95。VM8真functional15＋anon3/10/20已由Root actualage/cold/business重算PASS；fresh40 INCONCLUSIVE，60未跑。這項只修驗證工具漏掉的官方Auth格式，不改產品或放寬一般403。

## 確定的證據與未知

VM8 run44234070950/job134565843675/attempt1/runner28。40started/completed/Authcreated、same-subject ownershipKnown=true，entry65.633ms、send40/40 skew208.322ms<250；readback gate actor0 AUTH_LOGOUT403、單bodyRead1/decoded92/firstFailureCODE。M55真diag LEXER/KEY_UNKNOWN，code和message TOKEN_SEEN，error_code/msg等UNOBSERVED，unrecognizedKeyCount0；39actors短路無snapshot。原wire body未保存，不能還原code型別／值或完整shape；不回填VM7／VM8 PASS。Root actualage1394files216117573B/cold1341、八服務自然stopped/2DB127tables/31roles/3volume hash與metadata皆核，未restore。

官方Supabase Auth Local pinned v2.192.0（image digest288d880ebc80a1cb5ad52dc7d12328f76e9c90127003306864a270118bba00a8），tag commit5acfdea63bc033b79cfb0ebb08a1d4696d942aac：errors.go75/146分支現代HTTPError是code:string＋message:string，X-Supabase-Api-Version合法日期>=2024-01-01選modern，舊格式才code:number/error_code:string/msg:string；auth.go140–149 SessionNotFound產生Forbidden403，api.go271 logout先requireAuthentication，shared.SendJSON不改欄位。直連 https://github.com/supabase/auth/blob/5acfdea63bc033b79cfb0ebb08a1d4696d942aac/internal/api/errors.go 。worker提供Git blobs errors=a9b467f36a268bc5a65c69fae43f78b4bf80d134 /apierrors=adab1d39cc3fcb6e4a746f06ca91db6775491c03 /auth=07f2ec5d4008e8e07fc50fa9c17fbd615ee71c67。

本機lock對應SDK/auth-js2.110.2實際src/lib/fetch.ts172–184在無顯式header時預設2024-01-01，constants.ts33指定header名稱；產品browser-client無此header override。既有functional-auth-code.ts已分modern/legacy；capacity-network只拒外網且bypassLocal三host，沒有轉換上游body。這些證明legacy-only契約不完整，與真key觀測相容；不是actor0原body值已證。

## 最小契約（先回Root guard／舊test影響再改Source）

保留既有嚴格legacy分支：error_code精確session_not_found、code若在必須number403、msg若在有界string<=2048，未知key全拒。新增獨立嚴格modern分支只允許兩個必要canonical keys：code精確string session_not_found、message必要string<=2048。兩種key順序均可；不能依JSON欄位順序猜碼，不能接受混合error_code/msg/message或衝突alias／未知欄位／重複／escaped keys。兩分支同一次既有JSON.parse，原4096 UTF8/body cap，選分支後只一個對應strict schema.safeParse，不用泛用functional helper的其他revocation碼。

除刻意新增modern格式契約外，原exactPOST/auth/v1/logout?scope=local403、owned page/actor/generation/唯一candidate/完整CDP/body accounting、registration/UI/後續登入與Root same-subject readback、lease/revoke/cancel/晚到/pending/finalize/discount/rawHTTP記錄、health/PASS/SLO/timers/HTTP/CDP/body讀取數皆保。任意錯碼、user_not_found、其他403不能折抵。不改產品、工作流程、quota或Hosted。

M55 bodyDiagnostics固定介面與語義保留：codeValue MATCH仍只number403、modern session string顯OTHER；errorCodeValue ABSENT才正確。可由ACCEPTED＋fields型別presence看合法分支，不新增raw值/format推測/額外parse/read/scan；錯碼與mixed仍拒絕。新branch需要改診斷分支／舊metadata預期時，先向Root列精確變更，不暗改已核語義。

## Ownership 與測試

先限既有scripts/concurrency/capacity-onboarding-logout.ts（<=500）＋新tests/contracts/whole-site-capacity-onboarding-modern-contract.test.ts（<=500）。原497行onboarding-logout test保持raw；M55新test／pure diagnostic／runtime三literal、M52其他檔、M53/M54/operator45、產品全部保。若新guard不可避免影響M55只metadata期待，先列最小path/hunks回Root批准；不用通用AST style工具，不新增agent/reviewer。你不是獨自在codebase，保Root新report／brief／雙handoff與舊證據。

真RED必經actual exported factory／observer／lease fakeports，以synthetic modern code+message兩順序在舊Source拒絕、預期安全流程應可折抵，標明synthetic不是原body。GREEN覆modern精確碼、錯碼/大小寫/型別/message missing/null/oversize、unknown keys、legacy正負向與混合／矛盾aliases兩順序、duplicate／escaped／非object／invalidJSON／body cap/base64/UTF8、single read/parse/safeParse、取消／pending／late／foreign owner拒絕、postlogin/oracle仍必需、敏感值不輸出。現有所有負向assertions不可刪/skip/改鬆；必要metadata變更先Root核。

交private packet.git/m56-onboarding-modern-contract/，保初RED/所有FAIL；focused／全capacity affected、typecheck/lint/globalformat/import/diffcheck、最終freeze與全保護。Root唯一review後才exactSource新commit/push/freshVM新job。不要跑真browser/Native/Docker/網路/Cloud/Hosted，不commit/push。VM8正等待原10min retention hold結束，Root負責停止VM保100GBdisk；US150/noPaid/Production禁。

## Root 最小介面與metadata窄hunk已核（2026-11-18）

准既有單matchAll canonical allowlist加message，同一keys Set判嚴modern（僅code＋message、無legacy）或原legacy；mixed在lexer拒，單JSON.parse、只對應strict schema.safeParse一次。message-only缺code仍lexer拒不補parse。唯一額外第3path為M55 body-diagnostics test的early-alias case：message先/error_code後，必須見第二key才能判mixed，因此只將error_code.presence由UNOBSERVED改TOKEN_SEEN，必要精確更新該case標題；兩keys已見、其餘仍UNOBSERVED、LEXER/KEY_UNKNOWN/topLevelUNOBSERVED與拒折抵不變。其他assertions/test內容、原497raw及M55pure/enum皆保。
