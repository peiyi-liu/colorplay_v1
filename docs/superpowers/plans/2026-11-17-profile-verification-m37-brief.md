# M37 固定 metadata 同批驗證與分段診斷 brief

## 結論與依據

Root 核准單一 M 級工具任務，由既有 implementer 實作、Root 唯一一輪 review。Base `b036123aed776b05cc4f8c2313a20b64f0bd05f0`。持續 40 基線／60 目標、真首次註冊與既有登入全站 Local 驗收；此 brief 不是 Hosted／Staging／Production 授權。

Native31 run44034779344/job133874903908 pushattempt1 已 final failure，functional15PASS、anon3/10/20PASS，fresh40 INCONCLUSIVE、其餘11legs未run。第一 invalid 是 host_stale@8744.556880ms，age3110.349358ms；HOST48 已 exit0／JSON parse，post-verify7854.018191→9021.943033 跨過 invalid。未證哪一項 FS／CPU／排程延遲，不能稱 M36 STABILITY 拒或網站註冊/API承載 FAIL。40 started、zero sends/auth creations；before-send readbacks先於 collector，cleanup在8899ms後，不可沿用「OTHER readback與此post競爭」假說。

Readonly packet `e3528788abcf7a2b3b13ecaa548e12b41d07220248fcde26b069bbf93f1ab656`、13 records／13Source／6coldJSON；Root independently4fakePASS wall785.824ms。Root readonly receipt `31aad790d7955f07e636b9e2b46874c6aec69971dc1322dd74aa4c69124d96d6`，Native31 final receipt `5059a84b7899c17a63f6469e7bbd85781af56817733a957da7595808f0a8a0ac`。純 fake collector 使用既有 Darwin fixture，只證 common algorithm，非 Linux Native 重現／性能證明。

## 唯一 ownership

3 Source：`scripts/concurrency/execution-profile-runtime.ts`（<=260行）、`scripts/concurrency/root-helper-contracts.ts`（<=500）、`scripts/concurrency/capacity-runtime.ts`（<=550，既有537行，僅verify callback接線，故保留既有分檔）。2 tests：既有 `tests/contracts/whole-site-execution-profile-runtime.test.ts`（<=500）、新 `tests/contracts/whole-site-capacity-profile-verification.test.ts`（<=500）。若需要額外 fixture/test/檔案，先報 Root exact path與必要理由，不先改。

Root 擁有 brief、review report與兩個目錄的 append-only handoff。實作 agent 不 commit/push，不改原目錄 Source／Git／依賴；不是獨自在 codebase，不回退 Root 或他人修改。

## 行為

只改 inspect/verify 的兩個既定 metadata reads：profile.json 與 closure.json 以同一 Promise.allSettled 批次起動，完整收束並核准原 profile hash／closure exact bytes 後，才起動原13 helper全 bytes read/hash batch。正常仍15 fresh reads、相同固定path/byte bounds/owner checks、原13 helper allSettled／完整authority／身份／來源／helperHashes核准，pre與post每次都完整驗證，不cache／不共享舊proof／不提前consume sample。原載入時profile/closure初始讀與preflight等無關行為不變。

Root 明授差異：metadata之一失敗時，另一固定metadata可能已讀；仍僅既有2paths，全部settle後才拒，不能留下pending I/O。原profile優先、closure其次的失敗／hash錯誤優先序與Error identity保持；metadata任一失敗不得啟動13 helper或執行child。abort仍fail closed，不掩蓋讀取錯誤或以診斷改原operation。不得宣稱這個3waves→2waves結構改動已證解決Native31；實測仍待下一candidate。

## 分段觀測

只擴現有 bounded Node PHASE 閉集：PROFILE_META／CLOSURE_META／HELPER_BATCH 的 ENTERED／COMPLETED／FAILED，使用現有同一 Node monotonic clock、64events／10000calls cap與既有journal。profileRuntime.verify可接受可選phase callback，capacity call在既有PRE/POST邊界接到同一diagnostic.phase；初始load無observer仍不捏造觀測。

phase定義清楚：ENTERED於該既定讀取／batch起動；COMPLETED須該read/validation或整batch proof完成；FAILED只對可證該階段失敗；兩metadata各自收束，錯誤優先序不受settle先後影響。parallel callbacks共享原clock，但不得改firstFailure已記錄事實／補過去timestamp。callback throw或觀測不可用不得修改operation／掩蓋原exception；不偽造COMPLETED或native child witness。無observer無新phase/default、custom port不能假executorWitness OBSERVED。只existing memory/journal，零額外讀取／probe／file／HTTP／helper；無raw path/body/hash/nonce/PID/error.message等新內容。

## 凍結範圍

collector/cadence／3s7s freshness／M36完整identity與PSS/1.5s76attempt／30s executor／Root權限/execute body/callback／M35全8／operator44及manifest／40actor同批entry／250ms barrier／所有資源caps與API SLO不變。不得減40readback／排隊UI／restamp／提前publish／skip assertion／改timeout／放寬cap。產品、DB、migrations、依賴、workflow、exporter、Hosted adapter與其他 Source不動。

## 驗證與交付

有效 actual Source RED→GREEN：metadata兩者同批start／complete gating及新PHASE caller journal。受控deferred tests證任一fail仍all settle、profile優先／原Error identity、未核准metadata之前helper零calls、所有15freshbytes及post tamper拒、無cache／abort／unknown／callbackthrow、實際capacity caller pre/post phase、custom無native witness、bounded firstFailure/events與既有行為保持。不得只測拼出的投影。可借既有synthetic fixtures，必列資格；不以真Native或HTTP/browser/Docker/proc作 RED。

跑execution-profile/root-helper/capacity相關contracts適量批次、fulltype/full lint/globalformat/import-only/diff/static；不跑無關151Python／4000產品／build／Phase8 pnpm acceptance。若發現實際相關失敗，先診斷再決定增補。各命令獨立exit與log原樣保留，初setup/實作錯誤如實資格，不透過composite cat洗綠。

Private `.git/m37-profile-verification/` freeze packet：exact5 Source/tests raw hashes／lines／checks、Original7／真575959prefix／package-lock、unowned實際Git blob/type/exec、44operator與M35/M36 frozen files、既有全部歷史raw封包／Native31指定6coldinputs hash均核；既有handoff僅Root append。Root sole review一輪後只clear findings，不再開重複review。報告列WB4c／AC-PERF-003 tool qualification與限制，不宣稱容量PASS。

## 執行閘

此時只有實作／純fake與受影響checks。Root 接受後 exactpaths commit/clean、fresh specialremote b036123 正常FF新Source Native32 pushattempt1，完整六人功能→15legs；不得 GitHub rerun／0business探測。失敗先完整封存／Root actual schema／第一因診斷，不自動重跑同Source。

US$0／上限US$5；Native31 fullcold保留、OriginalWIP／G8停止85保持。報告全部留Codex/repo，Hosted／Production／真信／新credentials／資源／清理NONE。後續Staging仍需全Local與具體release gate。

## Root 必要既有 fixture 例外（同一 M37，實作交付前核准）

原83測試批次的兩個既有 before/after-verification fixture 仍期待 firstFailure 為 PRE_VERIFY／POST_VERIFY。新增細階段後，實際最早 FAILED 為 HELPER_BATCH；不得刪除原父階段失敗證據。

Root 明授額外唯一 test path `tests/contracts/whole-site-capacity-runtime.test.ts`，只改既有 before/after-verification 的 firstFailure 預期為 HELPER_BATCH，同時新增 events 仍含原 PRE_VERIFY／POST_VERIFY FAILED 的斷言。原throw／accounting[]／execute count等其餘斷言保留，不skip／不刪。既有556行，僅此窄 fixture 例外允許<=570行，不因本任務重構既有檔案。總 ownership 為3 Source＋3 tests，其他paths仍禁止。

此例外不改產品／執行行為。初81PASS/2FAIL原始log與先前brief SHA必保留並資格說明，不能宣稱初次全綠；跑修正後相關窄測與fullchecks，仍同一Root review輪，沒有Native新授權。
