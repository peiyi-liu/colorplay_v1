# M32：一次補齊容量停止事件的因果診斷

Root核准M級純Local診斷；base9ee8d92bc45d6192da43ce83df001e88e9ed7f38，同一worker實作／Root唯一一次review。WB4／AC-PERF-003驗證前置，不是網站修正或容量PASS。

## 已證與不得腦補

Native26 actual功能15關PASS/health0、anon3/10PASS、20INCONCLUSIVE，其他12legs未run。Root全鏈／全cold已核、jobfinalfailure、receipt25bbdc7611b02e969a67bf8737c30df71b784a4a51f9005aa3c3bf4885ed3909。readonlypacket .git/native26-anon20-readonly/manifest-final.json SHAb160d21a0dc39b15c1d5cf804b5ce53a2a878d718597f5b08960bc9da5f4b2d2／9records，12cold-safeprojection／12Source hashes／304歷史records。

20entry全部HTTP200，actualbarrierVALID/skew54.040ms，ready未完成／readback0。healthUNKNOWN唯一host_stale；不是GeneratorLimited，沒有已觀測PSI/swap/OOM/PSS/RSS/eventloop持續超限。host3 call2024.623ms後另wait1009.088ms，host4 start-gap3033.711ms、最後hostage3741.442ms超3s，是已證completion+delay排程hazard；M25並行13closure仍在，不能稱退回逐檔await或每tickhashChromeELF。底層CPU/IO原因未知。

first collector invalid、UI readyerror、signal與finally stop順序沒有保留。finally無條件stop可導出runAborted/timeout標籤，不能當timer到期或首因。疑問假設「最後stale代表它先abort UI」尚未證實；此task只補一次完整first-event，先不改cadence、freshness或錯誤分類。

## exact5 Source責任與測試

- new scripts/concurrency/capacity-run-diagnostics.ts：有界strict純collector／schema，<=350行。first-wins、有限scalar與單一Node performance clock；不做IO/HTTP/新timer。
- scripts/concurrency/capacity-collector.ts：只在既有notify判定後／原onInvalid前記同一已算snapshot的first invalid，不新增snapshot或sample。<=240行。
- scripts/concurrency/capacity-browser-entry.ts：actual default ready的既有await前記閉集合subphase與actor index/count，outercatch記first safeerror＋signal狀態後保原throw與FAIL；<=540行窄例外（原493，只留同一ready契約接線，不無關拆分）。
- scripts/concurrency/capacity-runner.ts：父signal／原collector callback／businessdeadline／journeyreject／FINALLY_ENTER／stop request／stop completed之first事件接線，保原控制流與runAborted/timedOut/finalizer。<=310行。
- scripts/concurrency/capacity-journeys.ts：同一純diagnostic port跨上述邊界，<=530行窄接線例外（原496）。不得創第二clock或各自collector。

測試ownership：tests/contracts/whole-site-capacity-{collector,browser-entry,runner,journeys}.test.ts只必要接線；新whole-site-capacity-run-diagnostics.test.ts及必要的whole-site-capacity-run-diagnostics-caller.test.ts各<=500行。既有>500 test僅窄接線<=原長+40，其餘案例集中新focused檔。若既有writer/type接口需要額外Source或共用fixture，先給actual最小paths與原因；Root處理，不找user當郵差。Root另寫docs，worker不改docs／Original。你不是alone，不revert其他修改。

## 事件與出版契約

1. firstCollectorInvalid、firstReadyFailure、firstAbortRequest、firstSignal、firstStopRequest均不可覆寫。必要fixed finally/stop完成標記讓先後可比較；同一Node monotonic clock，禁止用wallclock或混helper子process clock猜先後。首次安裝listener時signal已aborted，只可記ALREADY_ABORTED／時間未知，不捏造原abort時間。NOT_REACHED/null、UNKNOWN、OBSERVED要誠實區分。
2. 所有reason/status/errorName/ready-subphase/abort-source採明確閉集合（既有reason enum可重用），actorIndex/count有界<=60，timeout/abort/targetclosed/name未知各保UNKNOWN；不要用arbitrary error message推定。每actor latest有限state、first-event有界，不留URL/argv/message/stack/account/email/token/rawID/hash或任意字串。getter/壞shape/overflow/late不洩資料或覆寫原error；signal request與實際abort event分開記。
3. actual default ready每個原await前有限標記LANDING_CTA/LOGIN_ROUTE/REGISTER_CTA/REGISTER_ROUTE/NAME/NICKNAME/CLASS/NEXT/EMAIL/SEND_BUTTON_VISIBLE等實際分支；custom/fake ready沒有真subphase就UNOBSERVED，不把mock當真UI。並發actors後來error不覆寫全域first failure。保原Promise/await順序、原error identity／abort理由與原timers。
4. 完整finally stop可能晚於transport-accounting寫入，所以Root明確授權：runner全部原finally工作收束後、原candidate出版前，透過既有scope-bound private journal新增**一次固定名稱 capacity-run-diagnostics**的safe最終紀錄；不可假稱較早accounting已含後來signal。可在既有entry/accounting附當時snapshot，但不是final替代。禁止新directory／任意檔名／第二writer／新Root權能；用原privatewriter／schema界線。writer失敗或缺必要證明不能讓原PASS繼續出版；沒有readback/retry/額外讀取。fixture缺writer應正確接線，不用production fake捷徑。
5. 所有觀測用既有已取得值，不增加health.snapshot／roothelper呼叫／body或檔案讀取；只有上述一次明授private write。不要把診斷throw改成新的業務失敗，不吞原error，完整stop前後順序仍按原控制流。缺證正式標UNKNOWN/UNAVAILABLE，不製造first-cause。

## 保持與驗證

不改1s/5s completion cadence、3s/7s freshness、Roothelper／13closure／operator44／profile authority、health reducer、200ms/10s/PSS/RSS/Node/SLO/barrier250／run與cleanup budgets、functional流程、產品UI／Auth／DB／dependencies／expected規則。沒有scheduler修復權限。

先有效RED，再測collector先invalid→signal→readyabort、ready先reject→finally→stop時stale、parent/deadline/finally/cleanup各源、alreadyaborted未知時間、並行first-wins、late/overflow/privacy／badgetter、writerfailure不得PASS、原operation/error/計數/順序保持。控制都是0browser/HTTP的actual caller fakeports；不冒稱Native26重現。跑全部受影響capacity26files208＋新cases，fulltype/lint/globalformat/import/diff；不重跑無關functional635／產品build／Phase8。

privatepacket記Source/tests exacthash/commands/log/RED資格，actualHEAD減owned全未ownedGit blobs/symlinkbytes、operator44、Original7/trueprefix、M29原166+differential35+Native24readonly9+M30原51+M31原43+Native26readonly9（歷史records含重疊應如實去重／分列，不編總數）。freeze unstaged等Root唯一review，不commit/push／新agent／browser/HTTP/Native/Docker/restore/刪除資料。Root收束後才可正常新Source Native27 pushattempt1六人→15legs，Native26已final且全custody保留；不GHrerun/0business。US$0/cap5、40/60未run，HostedProduction真寄信NONE。
