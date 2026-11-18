# M79 — 預先準備 existing-login cohort，保250ms真physical gate

Owner已授權持續Local修正／唯一Root審查／完整60人後Staging，US150/noPaid/Production禁。app base bc2581a6afa3b4d4b7779de7957619afb35499ef；VM21 run44404679498/job135156629863 已functional15PASS、capacity8/15PASS（anon3/10/20、fresh40/60真SLO、existinggame3/10/20）。40existing wcr-261118-fb0a0f5b0fc3 在登入同步gate INCONCLUSIVE，6後續未試，不能稱全站60PASS。

Root真age artifact14476657330/ZIP48174851B/8abfa7418aa9cb8ee191f6a0e88d4bfa96e81d29329882e0a6aaa95d50d6fbfc，cipher48174713B/dcb12458a932020da91ba0193f60482aff70dd81c1b606b72fe9ef7a80614ccf；3517files232642359B/outereb8a979f83a9ee20987f45665fc5b5613031fb29f9c1f6c43531145976aed9a7；cold3444/snapshotd253bdb7dbd39400c568245264baadc3af6a7cfa36faa72e3816fdc5a0372c72真核，8stop/2DB127tables31roles/3volfilehash及metadata，未restore。原hold22:14:12→22:24:12Z自然完成/job22:24:16failure/runner0後Root正常Stop一次，正在核strictSTOP。

確認40entry與login各40physicalHTTP200；entry70.017ms VALID，login346.639ms GENERATOR_LIMITED/readback0。firstJourneyFailure13092.826794/signalAbortedfalse，finally13851.847904→stop13852.033757→abort14104.268027；collectorInvalidnull/healthVALID/noReasons/PSS4170339328/Node385200128/PSI/swap/OOM0/receipt timedOutfalse。confirmed blocker是physical submit skew>250ms；現有Source對existing-login仍locator.click、自動actionability未預備，是具體harness gap與合理修法，非獨立證明所有browser scheduling唯一首因，也不是已確認網站timeout或12GiB超限。rootcustody9e6a2b4b15b006dc584c3355500cb8e3393df092ab80de9c404ed6da6593ef44。

## 唯一ownership與實作

3Source：scripts/concurrency/capacity-browser-entry.ts、capacity-send-cohort.ts、新capacity-browser-entry-ui.ts；3directtests：tests/contracts/whole-site-capacity-browser-entry.test.ts、whole-site-capacity-send-cohort.test.ts、新whole-site-capacity-login-cohort.test.ts。其餘Source／manifest／policy／operator M78／原目錄全保。你不是唯一編輯者，Root寫本brief／Native21review／handoff／.git VM22工具，禁止還原或清理他人修改。先等Root protected baseline檔就緒才Source edits。

將identity schema/types/loginFields/capacityEntryUi必要約150行從既有570行entry抽入新UI module，舊入口reexport保API；無產品行為改動。新/修改Source及tests<=500。只內部固定OTP_SEND/EXISTING_LOGIN兩intent與兩factory；保原OTP API/standalone send/post-registration login，不能接受任意label/type/URL/selector。login factory要求genuine CapacityScope、genuine actor/runtime bindings與teacher/student roles對齊actorIndex及合法planidentity；perform(actor)只消費同instance同intent之準備，OTP/LOGIN跨消費、clone、tuple/generation/page/observer漂移及重用皆拒，不能fallback legacy。

existing-login且ui===capacityEntryUi才準備真cohort；custom UI維持舊trace。所有login-intent先完成，再並行prepare全員可見/可用/focus/精確handle/純readonly DOM；全員成功才release純flags，沿原dispatchCapacityActions先arm所有physical observers，再每actor freshreadonlypredicate與一次真native Enter。禁止DOMclick/dispatchEvent/requestSubmit/form.submit/自造requestAt/假HTTP/fakeIP/stagger/replay/requestretry，250ms CDP truephysical判定不改。準備任何失敗必須零press；genuineRoot readback/confirmed/單physicalrequest全部保。

以actualSource保既有15s entry/observer timeout與cohort lease（不是20s），各actor準備開始到press結束共一份15s，不重開或延長。產品實碼name登入/type=submit；學生直接/app、教師直接/teacher，admin未批准。LOGIN只有已consumed且PRESS開始、同genuinelease、固定scope.appUrl origin＋驗過role對應精確目的地的正常主frame導航可避免誤拒；這不是成功證明。pre-press、foreign/wrongroute、/register、/unauthorized、回/login、abort/close仍拒；OTP原導航拒絕全保。所有paths finalclose/revoke/listener removal/handle dispose保，正常導航不讓late重用。

不新增loginPreparation或其他report欄位為預設；若要必要有界non-authority安全摘要，先報Root列明schema及<=16KiB，不能成另一大diagnostics task。此輪不改產品登入/security/Auth限流/Live/DB/RLS/Rootoperator。

## 驗證與交付

有效RED需actualexisting-login caller在舊locator-click流程缺少全cohort prepare/arm前一次activation，再GREEN；新factory單元fake測試明標非Native能力。覆allready/armallbeforepress、任一prepareFAIL零press、15s總預算、按鈕/焦點/handle/tuple/generation/錯intent/一用/abort/close/dispose、正常login role導航允許與wrong/prepress拒、OTP原斷言不刪。既有cohort468行需保originalassertions，必要參數調整逐fragment inverse記錄。原entryUI抽移需AST/實碼精確對照，不拷大型基線。

跑全部既有容量／registration／functional受影響65files基線及新檔，fulltype/lint/format/import/compile/diff和全保護核；不跑pnpmacceptance。Native12GiB/old6GiB/250ms/SLO/15legs不改。private .git/m79-login-cohort packet逐actualargv/log/hash，保所有FAIL，final Sourcefreeze6與baseline。先交未commit，由Root唯一一輪review；你不commit/push、不能VM/SSH/Cloud/Hosted/DB/Auth/Mail/secret，不能M79bridge實作／新增agent。Root核准後新exactSource＋freshVM22原full15；不得重跑/重啟VM21或以M78工具SHA代替app測試SHA。M79 earlier Root-connector bridge只讀提案延期，未實作，之後另task。
