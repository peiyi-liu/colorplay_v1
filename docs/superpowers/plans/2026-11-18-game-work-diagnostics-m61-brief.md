# M61：game work與操作分項完整首因診斷（Source核准）

Root核准同worker有界實作，Root唯一一輪review。app base4eeb0b32a72ba370b5ce7b24d1bf1f5fe28e8569；operator9f9cb不混。不是產品修法；executionAuthority NONE。

## 事實與目的

VM11 run44255304545/job134635465442/runner31，functional15與anon3/10/20、fresh40/60已由Root真下載重算PASS。plan wsc-261118-f84e3316e4f7；existing3 wcr-261118-a1e93eecad6a INCONCLUSIVE。entry/login3及兩學生完整遊戲已完成，health VALID、父程序無逾時/溢位/殘留，firstCollectorInvalid/firstReadyFailure null。firstAbort21780.54由共用COLLECTOR_INVALID標籤，缺teacher迭代/action原錯，metrics null。52 native/22unattributed不能拆成教師次數，也不直接觸發abort。

學生正常結束而教師30次未滿即拒是確定Source路線；教師UI或measurement先拒也尚未排除。不指定唯一Native首因。READ_ONLY manifest73557d8da45f10b54593365fbdf5f8c5ef91ded2b8cc135d75c163b90318c81a，6records/8inputs/14Source，原包保。

## Ownership

四原Source：scripts/concurrency/capacity-game.ts、capacity-game-load.ts、capacity-operation-observer.ts、capacity-journeys.ts。可新增單一cohesive capacity-game-diagnostics.ts避免擠入業務檔。兩新tests：tests/contracts/whole-site-capacity-game-stop-diagnostics.test.ts、whole-site-capacity-operation-accounting.test.ts。既有tests若需新passive欄位strict-shape接線，先報確切assertion；不得刪/改弱測試。

Root owns brief/review/雙handoff/Git/Cloud/Native。不改產品、M59 UI/gate、497/M55/M56/M58、collector/health/SLO/OTP/Localguards、operator/workflow/依賴/SQL。你不獨佔codebase，不得revert別人修改。

## 診斷契約

在原closure被動記teacher iteration0..29與BEFORE_ACTIVE/GOTO/HEADING/MEASURE/AFTER_ACTIVE閉集步驟ENTERED/RETURNED/FAILED、active/completed/observed counts與signal；保第一個local stop來源STUDENT_FAILURE/TEACHER_FAILURE/NO_PHYSICAL_WINDOW/SETTLE_FAILURE及closed errorClass。學生僅補正常完成/拒絕及原finally active轉移、physical-window開始/結束。未觀測明列UNKNOWN；後續stop不能覆寫首見。

保原error identity、trace、await、30次、stop次數/順序與最後替換行為。observer例外、clock不確定、overflow不改業務。只有Node單clock，不跨clock相減，不記error.message/URL/ID/身份/秘密。

operation observer在同一原callback、同次分類讀值記5operation的total/attributed/unattributed及activeOperation或NONE有限cross-counts；sum須對原數值，不能改原實體計數/metrics或把新診斷升authority。不二次scan/CDP/network、不retry/加teacher操作/延長學生負載。

沿原stop writer保存sealed NON_AUTHORITY閉集，journey失敗仍可讀，快照immutable。不得為讓30次完成而延慢學生、重玩/加假負載、減樣本或放寬門檻。每檔<=500；journeys既有563行只准必要writer接線，說明既有coordinator責任及行數增減，不廣泛refactor；其他超界先報Root。

## 驗證與交付

先actual exported caller控制學生在teacher前/中/後完成、30th after guard、goto/heading/measure各拒絕、student真正失敗與settle，原版缺closed首因形成有效RED。核原trace/error identity/回傳/stop相同、callback故障隔離與first-trigger不覆寫。observer原callback核52/22與各op/active/NONE、未知/late/overflow閉集合計。fake不冒稱Native因果。

完整capacity/send受影響tests、type/lint/globalformat/import/diff，凍結final Source與raw RED/FAIL。保VM11八指定inputs、M59/M58等歷史records、Original七文件/handoff prefix/package/lock、所有非owned tracked/operator45。無真browser/Cloud/Hosted/SMTP/fixtures/Native/Git。Root唯一review後才exact Source新commit/fresh單次VM12；不重跑VM11、不回填INCONCLUSIVE。US150/noPaid/Production禁。
