# M50 — fresh40 cohort 最終判定一次診斷

## 目標與已核事實

Root 唯一審查／同一 implementer。base e2dbeb69a284c309dfafa291b24c0a44fb367b4e。新 VM2 run44182576471/job134390502411/runner22：functional15、anon3/10/20 PASS；fresh40 INCONCLUSIVE，healthVALID。40sent/verified/completed與40 finalconfirmed/後端student/registrationComplete/membershipConfirmed全真；send40/40 VALID220.079ms。唯一已定位阻擋是 capacity-registration.ts:418–429 final runtime/actor-observer gate，哪項條件仍UNKNOWN。161registration helper均ok；44.8s outerJourney錯誤在內層finally40partialreadback之後，retention錯誤更晚，不作首因。沒有產品修法證據。

## 本次唯一實作範圍

保留原判定，新增 NON_AUTHORITY 的 bounded、closed-schema、安全 final-gate snapshot，記錄**實際用於原gate**的 runtime available 與 actorIndex/available/pendingAction/unexpectedHttpErrors/unexpectedNetworkFailures，以及 gate判定與時點；保存前已固定原判定，不因診斷await而改結果。診斷寫失敗也不能造PASS或掩蓋首因。補 runtime/proxy/request observer 的閉集 first-reason（單次鎖定）與必要安全來源分類，能區分 intentional stop/abort、startup/createActor/observer parser-action failures、popup、proxy invalid、unexpected HTTP/network；捕捉原失效事件，不能從finally後snapshot倒填原因。狀態、counter、predicate、retry、timeouts、barrier/SLO/health/security guards一律不變。成功也保存同schema以作對照。

Ownership：scripts/concurrency/capacity-registration.ts、capacity-browser-runtime.ts、capacity-request-observer.ts、capacity-network.ts；准新增一個 capacity-registration-final-diagnostics.ts 或同職責小module；focused tests 只在對應 whole-site-capacity-{registration,browser-runtime,request-observer,network} contracts，必要單一新診斷test。不得改 operation observer／kernel／manifest／operator45 package／產品Auth或任何src/supabase。若確需額外interface檔，先列具體原因給Root，不先擴張。registration目前514行，優先把原finalgate同義抽至小module使其≤500；不為拆檔做廣泛refactor。其他新增檔≤500。

## 隱私與證據界線

禁止記錄 raw URL/path/query/body/headers、error.message/stack、email/account/user UUID/password/JWT/key/requestId或CDP payload；actorOrdinal、閉集 endpoint category、HTTP數字狀態、計數與monotonic時間可留。未知原因必須UNKNOWN，不能把現行true counts「合理化」或忽略。finaldiagnostic不是權威receipt，不回填舊run或讓INCONCLUSIVE變PASS；保留全舊檔與M49三版packets／VM1/VM2/Native36/G8停止85／Original7文件與true575959prefix／lock/package／非ownedGit／Root docsWIP，絕不還原他人修改。你不是唯一在codebase的人。

## 驗證與freeze

有行為的診斷先RED、再GREEN；實測對照各gate分支與PASS，同一snapshot供gate與diagnostic、first-reason不覆蓋、unknown、無敏感字串、writer失敗failclosed、不增加physicalrequest或mutation。只跑必要focused/受影響contracts與typecheck/lint/format；不用完整acceptance，不做Native/Cloud/Hosted/credentials/commit/push。保留私有validation packet、檔hash、命令/exit與RED預期失敗，Root docs/brief/handoff以Rootowned WIP排除且不修改。凍結後交Root一次唯一review。

## 後續執行權限

本task只離線工具診斷。Root審查通過後才exact新Source＋fresh隔離attempt1；不自動重跑舊job，不復活VM2舊Local。VM2完整age/cold證據已保本機，job正常hold後停VM保disk。總US$150、不升paid帳戶、不碰Production、不部署Staging至Local gate通過。修正後仍須原完整矩陣，不能靠diagnostic宣稱容量PASS。
