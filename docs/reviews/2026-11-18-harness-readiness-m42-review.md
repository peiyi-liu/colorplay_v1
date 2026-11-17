# M42 Harness Runtime 離線工具審查

ALLOW_OFFLINE_TOOL_PREPARATION_ONLY：Root唯一一輪審查，未解finding0。僅接受離線準備；CLI spec尚未驗證、真沙盒readiness UNKNOWN、executionAuthority NONE。

## 變更與 AC

對應WB4c／AC-PERF-003工具準備，base1ebf3525a52690ca04efb5152b62c7c869d4959f。新builder產生exclusive private700目錄與600的固定harness:none／16CPU32GB／5分鐘idle spec、精確probe/hash與人工逐步runbook。只讀probe回報自身Linux／UID／CPU／MemTotal／boot與PID身份／PSS／cgroup與既有Docker daemon版本，不啟服務、不寫sys/proc、不安裝、不執行API；所有結果保持UNKNOWN/NONE。

## 檔案

harness-readiness-plan.py139行、harness-readiness-probe.py212行、harness_readiness_driver.py200行、whole-site-harness-readiness.test.ts11行；2新Source／2新tests。既有free executionProfile、operator44、產品、DB、依賴及workflow保持。Ubuntu canonical OS release與hierarchy root缺limits的正常情境已在凍結前納入；Docker body4097byte邊界、非object JSON及daemon關閉以actual Native路徑fake transport控制。

## 驗證

Root獨立11 Python controls PASS／0.004s；worker final11 controls與1個TS wrapper通過，不把wrapper內11項再加總。fulltype／lint／globalformat／import／diff／static最後全0。原Python setup IndentationError、有效2behavior RED、clock fixture耗盡、TS import URL setup與初format FAIL均保留，未變更為skip。

Token-free pinned doctl2.1.0 dryrun先以access token required退出1，尚未parse spec；Root明授的network-deny sandbox smoke因本機sandbox_apply拒絕而exit71，依停止條件沒有執行placeholder doctl。不能稱spec遭拒、CLI已驗或已呼叫API。官方binary/archive/checksum雙hash核，僅私有安裝。

Root核final59records／4Source／2252 tracked protected bytes／M41原105records／Native36十inputs、operator44與Original7／真575959prefix／pkglock；生成bundle mode／probe bytes／所有manifest hash同。packet5e7ecf7341fe404cee4eb9a0280d87a5803aafb34640ad5ca15639067e5529bb；Rootreceipt93526a377790648a5a2c050de678bce246697cbc10133c361b77b771ce7a094a。

## 限制與下一步

published1.008USD/hr全額配置的5分鐘compute約0.084＋0.016預留為0.10估算，非provider強制spendcap。idle不是absolute TTL；egress空陣列的provider語義未驗，不稱硬網路隔離。Docker啟動、cgroup委派、32GiB advertised tier與實際MemTotal關係、API schema／size可用性均待真事實；不得偽造GitHub identity或接受為容量PASS。

更新DO帳號可見Inference Cloud Trial5USD，普通Droplet抵扣未證；官方明示promo可供Harness Runtime。其harness:none只有CLI/API。Root已準備token草稿：僅agent_harness_session create/read/manage/operate四scopes，share與其他服務未選，最短可選到期30天，未點Generate。依瀏覽器操作規則，建立新security-sensitive access必須action-time owner確認；預算授權不取代此確認。完成後才可先以真config跑dryrun、observed size／session binding、一次5分鐘readiness與保留結果／pause／清理，不建立月費或auto-topoff。

M42不push／不觸發Native37；Native36 final仍40INCONCLUSIVE、60未run，停止同freehost微修。花費US0／總cap5／無新credential或cloud resource，OriginalWIP／G8停止85／HostedProduction真信NONE／未Staging。
