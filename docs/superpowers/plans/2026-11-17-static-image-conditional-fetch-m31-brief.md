# M31：修正 Local routed 靜態圖片的條件式快取請求

Root核S級窄修，base bd7b9a09153b327ba9fe984898045f010d055212。WB4／AC-PERF-003驗證前置，同一worker實作／Root唯一review，不重做brainstorm或大plan。這份是已證行為bug的bounded brief，非全面架構更換。

## 已證、規範與推論

Native25 run43984953629/job133710600407，actual first14PASS／healthFAIL21，7request-linked Image GET皆auth_controls，Root transport精確配對後全部FETCH304／無Location／REDIRECT_BLOCK／DISPOSE完成／無FULFILL，CDP blockedReason inspector、canceledfalse、noresponse200。3個exact LOGIN_PNG＋4個OTHER_IMAGE（不推測實際其他URL），另7console仍未逐筆request配對。Source browser-runtime把所有300–399當redirect，因此這輪7個304實際被Local攔截器主動abort，是已證阻擋路徑。不是網站圖片缺檔，也不回填Native24／23未觀測cause。failureCode原常數仍UNKNOWN，不藉此次另加診斷圈。

actual live HeadlessChrome159.0.8154.6／protocol1.3／revision@98a2592026af8d673b9fa83b626ac68bdf4ae78a已留。Root actualTS schema/receipt/candidate/close/finalizer重算FAIL；全561outer/528inner、8stops、DB2/127tables31rolesORDER_ONLY與3coldvol完整已核，無restore/刪除。Native25 job final尚待hold結束，下一個Native須等Rootfinal。

HTTP304表示條件式GET/HEAD的既有表示仍有效，沒有完整新的body可當200送出；Playwright官方指出routing會停用HTTP cache。因此不能只把304視為成功或偽造body。Root選最小Local修復：首次forward的same-app-origin Image GET移除If-None-Match／If-Modified-Since validators，讓同一個fetch取得完整資源；不新增retry或改網站cache規則。這是工程修法，Native仍待證。

Primary今日已核：

- https://www.rfc-editor.org/rfc/rfc9110.html#name-304-not-modified
- https://playwright.dev/docs/api/class-browsercontext#browser-context-route
- https://playwright.dev/docs/api/class-route#route-fetch
- https://playwright.dev/docs/api/class-request#request-all-headers

## exact4 ownership

- scripts/concurrency/browser-runtime.ts：只處理上述same-app-origin、actual resourceType image、GET之conditional forward；檔案<=225行（本task覆蓋M30較窄190限，不超專案500）。新helper可留同檔、避免第2產品Source。
- tests/contracts/whole-site-functional-static-cache.test.ts（new focused <=500）：actual handler／Native25-shaped 304 case、正負向header/call-flow控制。
- tests/contracts/whole-site-functional-browser.test.ts 與 whole-site-functional-image-transport.test.ts：只必要actual SDK形狀mock補allHeaders/resourceType或相應handler options斷言；原counter／guard／語義保留。

Root另管brief/review/handoff，worker不改其他tracked／Original／M29/M30 rawpackets。你不是alone，不revert其他人修改。

## 修復契約

1. 只能在既有origin guard通過後，確認same apporigin／Image／GET，再用完整request.allHeaders()取得header map，只刪case-insensitive If-None-Match與If-Modified-Since。request.headers()不含某些Cookie類header，不能拿不完整map覆蓋造成其餘header遺失。保全部其他headers（含synthetic測試中的Cookie/Auth／Accept等），不可輸出／持久化raw headers或值。沒有validators時fetch options維持舊值，不加空headers或全域cache清除。原URL／method／body不變。
2. 單次route.fetch依舊maxRedirects0/maxRetries0、原APIResponse fulfill與dispose次序，沒有重抓或body讀取；不改no-store／串流／redirectfollow。若無validators的fresh image仍回304，明確failclosed（可走既有catch abort failed、仍dispose），不得假200或加expected豁免。304不是Location跳轉，不再標REDIRECT_BLOCK；真正其他3xx維持原blockedbyclient阻擋、原origin/API/媒體路徑不變。
3. 非Image、POST、API origin、foreign origin不讀allHeaders、不改fetch options或Auth行為；allHeaders失敗／壞shape安全走原catch failure。沒有production fake特殊分支；必要mock就正確補SDK方法。
4. 既有health21error證明／expected image allowlist／4drops1refresh／browser evidence／Rootoperator44／SLO/freshness/資源門檻／容量15legs全部保持。M30純觀測欄位／配對／schema不另改，不把未知新rawerror常數當此次必要補丁。

## 驗證與交付

先有效RED證明現handler會收到conditional validators後304→blockedbyclient；GREEN證首次同一fetch的validators移除→完整200 fulfill／dispose。測mixed-case validator、只一validator、無validator原options、其他headers完整保留、原輸入map未mutate、真302/307仍block、unexpected304 failclosed、allHeaders rejection／shape錯誤、nonimage/API/POST/foreign不讀headers。不得以mock成功冒稱Native25重現或已修網站容量。

跑focused與受影響functional全集（當前42files614tests＋新增），fulltype/lint/globalformat/import/diff。純Local工具不進Vite產品bundle，無須為S級窄修重跑無關capacity208／完整產品或Phase8 gate；其餘此前M30 PASS只按原證據引用。維持Source/packet pins、actualHEAD未owned blobs/symlinkbytes、operator44／Original7/trueprefix／M29原166＋differential35＋readonly9＋M30原51records全保。

freeze unstaged、Root唯一review，不commit/push/Native/browser/HTTP/Docker/restore/清資料；沒有額外元件browserbatch。Root收束且Native25 finaljob完整保留後才exactpaths正常新Source/Native26 pushattempt1六人→15legs。主機US$0／cap5，40/60未run、HostedProduction真信NONE。
