# M30：一次補齊普通圖片失敗與實際瀏覽器診斷

Root核准M級、純Local工具task；base b1fa158412b105034dd0b3243e6eefc6f99e140a，唯一既有worker實作／Root唯一一次review。WB4／AC-PERF-003驗證前置，不是產品或容量修復。

## 已證與疑問假設

Native24 run43977983798：actual first14PASS、healthFAIL21／7個request-linked Image GET失敗，auth_controls，page2/S1五筆、page4/S2兩筆；Root獨立CDP皆LOGIN→LOGIN／closingfalse／canceledfalse／no200。failure與log各7可exactrequest配對；console另7沒有requestID，不能逐筆聲稱已配對。兩個observer均把原錯誤碼折為OTHER，blockedReason/CORS未留，actual live Browser.version/revision亦未留。疑問假設是「現在的圖片失敗能用先前媒體取消解釋」：沒有證據支持，停止以此假設重跑或豁免。

唯讀packet c267f1867a6d5ca84277d405d129fa442bfe664ef83cce802f619ca5f00dd51a／9records＋18Source；固定登入PNG tracked29589B／128×128、SHA efbd51ecff410ac4ca737c3cec2f5636318777d0b115b0795321cdf58af54c19，在Native actual572files build manifest同SHA，否證候選未進Git/build，但actual7失敗URL仍未知。Native23／24不可推定同cause。現資料不可逆還原原碼，先完整補診斷一次再判斷修正。

## ownership／最小範圍

- 新 scripts/concurrency/functional-image-diagnostics.ts：安全strict schema／bounded collector。若schema＋transport pairing塞入同檔會超500行，允許另建同目錄functional-image-transport-observation.ts，專責相同圖片傳輸關聯，不抽無關helpers。
- scripts/concurrency/browser-runtime.ts：普通Image既有handler操作只觀測既有stage／outcome與already-returned headers，不增body／journal讀取或HTTP；保所有calls/order/flags/retries/fulfill/dispose/abort分支。
- scripts/concurrency/functional-health.ts、functional-health-diagnostics.ts：existing CDP event接線／新安全context，保原counters/classifier／details舊資料，failureCode不可被後來console/log覆寫。必要的strict missing fallback只可改business-diagnostics.ts；不改publisher/Rootoperator44/authority。
- tests/contracts/whole-site-functional-{health-diagnostics,health,browser}.test.ts，加新focused image diagnostic test（可兩focused檔以維持500行）；只必要接線調整，不改既有assertions含義。其他tracked檔只有Root brief/report/handoff，不改產品/PNG/config/lock。

你不是alone；不revert任何他人修改。所有新Source／tests<=500行；browser<=190、既有health582/diagnostics521各允許最多620/560，理由僅保既有collector契約與窄接線，不增加無關責任。既有超500 test僅必要接線<=原長+40行，新增測試集中focused檔。更大的實際需求先報明確責任，不盲目擴範圍。

## 必須觀測與fail-closed界線

1. actual CDP loadingFailed：安全net::ERR_閉集合與blockedReason／corsErrorStatus明確CDP枚舉，unknown=>UNKNOWN；禁止任意後綴／errorText／console自由文字／rawURL／rawID／userAgent或secret。保存獨立immutable failureCode與console/logCode，不改existing networkCode分類與21個unexpected語義。可新增診斷閉集合含ORB／local network/access／MIME/blocked/HTTP/connection類已知常數；不是新增expected例外。
2. actual Image GET identity：same Page＋exact private validatedURL/method／CDP lifecycle／controlled known pathname，只輸出LOGIN_PNG或approved BLOOK ordinal／OTHER_IMAGE／UNKNOWN與safe resource/method。嚴格same apporigin/no credentials/no query/hash，不能依suffix或時間最近判identity。URL只記memory。Root離線join固定PNG Sourcehash與actual bound build manifest，不宣稱觀測image response bodyhash。
3. 兩邊先後順序皆可；相同URL同時多請求／不完整identity＝UNKNOWN，不最近時間配對；證terminal後才可sequential reuse。保request/response/failure times、status/canceled、現有route ordinal／stage settled/closed、cache/MIME/encoding/length/nosniff/CORP/redirectpresence明確枚舉；只讀既有response headers、不新增body解析、不改route順序。無關GET/POST/asset不能污染；dispose/late/overflow/ambiguous缺證failclosed，不能吞錯讓availabletrue。
4. 一次既有owned CDP session只讀Browser.getVersion，立即保存validated product/protocol/revision安全shape；不queryargv或加automationflag，不從package猜live版本，不留userAgent。未觀測／malformed標UNOBSERVED；完整health availability需正確反映缺必要證明，不得空值當PASS。保既有listeners順序／app網路語義，不新增browser/context/page/HTTP批次。

禁止調expected image allowlist：LOGIN PNG只診斷，當前canceledfalse不能被當superseded。保image/media/refresh counts、no-store/stream、SLO／3s/7s freshness／resource/caps／failstop／15legs／Rootoperator44全部不變。M29166records/differential35/全部歷史資料與Original7/trueprefix保持。Recovery active node_modules已真獨立，不允許Original安裝／重新修復／舊cache清除。

## 一次驗證與交付

對有行為的新增collector先有效RED再GREEN；測originalcaller-shaped Native24 fail/log7pair＋7unpairedconsole與21counts不變，原碼枚舉未知/secret不洩、同Page/不同Page/同URLparallel/seq／both-order、HTML/3xx/catch/closedroute、failure不被log改、late/overflow/dispose/schema缺證、getVersion正常/缺失/壞shape。不可把synthetic稱Native24重現。先focused再全部受影響至少既有40files582功能contracts＋26files208 capacity，fulltype/lint/globalformat/import/diff/build；不因綠而重跑無關全站tests。

不launch新browser／Native／Docker／DB／HTTP／restore／刪資料，禁止skip/assertion放寬。不commit/push；private packet含精確Source/index、commands/log/exit、以actual HEAD ls-tree枚舉減owned的全部未owned actualGit blobs與symlinkbytes（不猜總數）、operator44、Original7/trueprefix、M29原166/differential35、Native24唯讀9全部hash保持。Root一輪收束後才可exactpaths新Source正常push/attempt1 Native25六人→15legs，且必須Native24 finaljob與完整custody已留存；不GHrerun或0business gate。US$0／cap5、HostedProduction真寄信NONE／40與60未run。

## Root補充：必要fixture-only接線

既有actual-health fake CDP.send 預設{}，新增真實版本觀測的failclosed gate會使舊正向fixture失效。Root另准以下4paths，僅在既有cdp.send mock接Browser.getVersion分支，提供固定synthetic product Chrome/159.0.8154.6／protocolVersion1.3／revision @加40個a；其餘method返回／timeout/error cases與assertions全保留，不以schema default當OBSERVED、不加production fake捷徑：

- tests/contracts/helpers/whole-site-functional-image.ts
- tests/contracts/whole-site-functional-auth-observation.test.ts
- tests/contracts/whole-site-functional-recovery-diagnostics.test.ts
- tests/contracts/whole-site-functional-diagnostics.test.ts

此為純mock接線必要範圍，不新增產品Source權限；超500的既有tests只增必要三欄分支，不轉移原assertions責任。既有snapshot假port無CDP可顯UNOBSERVED診斷；actual createFunctionalHealth則必須observed真getVersion才能available=true。
