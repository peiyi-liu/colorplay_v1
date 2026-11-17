# M32 容量first-stop診斷審查

Task級接受；Root唯一reviewer／同一輪往返。1個P2已解、open findings0。WB4／AC-PERF-003前置，不是容量或phase PASS。

## 變更與目的

新增strict bounded同Node monotonic clock記錄，區分first collector invalid、ready failure/subphase、owned abort request、actual signal、finally／work.stop request／stop fulfilled或unknown。first-wins不覆寫；already-aborted不捏造時間，custom ready不假裝有真subphase。相同診斷instance透過既有runtime facade傳至40／60 registration轉交的entry，registration/ui原檔未改；此為轉交接點控制，沒有新真註冊證據。

## 範圍與審查結果

5Source＋3tests；newhelper347、collector185、entry538、runner254、journeys502，newtests225/477、runner-test211行。entry/journeys超500依brief僅窄觀測接線。Root發現async map使自訂ready同步throw後仍啟動其他actor，P2有效RED後改非async map的同步try/catch＋Promise then，原同步／非同步kickoff與error identity保持。Root逆還該區塊可得到精確v1 entry SHA，其他6owned raw不變，未擴大修改。

## 出版與可信界線

Root明授的唯一新增IO是在原finally全部收束後、candidate前，使用原scope-bound writer／cleanup deadline一次固定capacity-run-diagnostics private journal；writer缺證、late或unavailable不能PASS。沒有新增health.snapshot／Roothelper呼叫／檔案讀取／HTTP／timer／頁面操作；沒有cadence／3s7s freshness／flags/classifier／Rootoperator44／13closure／profile權能／SLO或資源門檻修改。只存閉集合與有界數值，不存error message/stack/URL/帳號/秘密。

## 驗證與保護

原actual-runner有效RED→GREEN；乾淨capacity28files234tests、最後facade/style6files53tests、同輪P2後5files44tests分列通過。Root獨立3files36tests／1.49s通過。fulltype／lint＋delta changedlint／globalformat／import／diff／static全0。原type/lint、遞迴spy假GREEN與錯predecessor fixture之log保留，後兩者不算乾淨通過。不重跑無關functional635／產品build。

v2packet .git/m32-capacity-first-stop/validation-v2.json SHA d70ce62e725f82a4cc882344f39d1f309e8861760422a8cb5e733a0ca9919962／75records30checks，含v1全55records與原manifest raw。Root .git/m32-root-review.json SHA f3e728922f6a2148b6457ec767724a6c20f37a904dcd31ccd1ff0794da638a34；8files／2198unownedactualGit blobs/symlinkbytes／operator44／Original7trueprefix及package/lock／313unique歷史records全部核符。Root初次readonly schema probe使用v1 key，已按v2 protection欄位核正；未做Source修補。

## 限制與下一步

Native26 host_stale與completion＋delay hazard已觀測，first invalid／readyerror／finally先後與CPU/IO根因仍UNKNOWN；不能將最後timeout當首因。先用一次完整診斷取得順序，再決定修復，不放寬標準。Root exact11paths commit/clean、fresh specialremote9ee8d92、正常新Source Native27 pushattempt1六人→15legs；不GHrerun/0business。Native26final與全cold已留。40／60未run，US$0/cap5、HostedProduction真信NONE。
