# M25：Profile dependency 並行與採樣時序唯一 Root review

**ACCEPTED_FIXED_READ_BATCH_AND_TIMING_PENDING_NATIVE**。Root唯一一輪，0 findings。base9063bd9b1f98609d933fa54a57ae2b161dbb2e67；WB4／AC-PERF-003前置觀測，非網站修復或容量／phase PASS。

## 變更與修改檔案

exact4paths：execution-profile-runtime.ts、capacity-runtime.ts與各自直接contracts test。保profile／closure前置兩讀，再對原固定13dependency以async map／Promise.allSettled並行；全已啟read收束後才處理hash／authority／abort或拒絕，包含IO同步throw。原owner／no-follow／nlink／mode／size／hash與前後verify全保留，不cache、不合併、不改helper／collector／health或3s/7s freshness及時間戳。

原accounting已入列rows只加四個Node單clock時點，分辨preverify／execute settle／postverify。舊elapsed仍排除preverify、outcome與10000上限／入列／關閉／錯誤語意不變；pre/post失敗原無row仍無row，明列UNKNOWN。無raw args／URL／input／stdout／secret或新IO，沿原private transport journal匯出，不當SLO樣本。

## 驗證

Worker69files779tests，lint-only fixture修正後final2files46tests；全域lint／typecheck／format／import／diff／static皆0。Root重跑2files46tests（962ms）。另外以actual public export＋獨立deferred fake IO／fake child控制核：load仍32reads、每verify仍15reads；13dependency重疊，使15波降3波、max13。前後order保持、篡改與preabort拒絕，executor仍等正常close且無額外FS read。這是SYNTHETIC_ONLY／NONE的排程資格，非真FS／Native19因果或硬體測量。

Root核46records／4Source／latest brief全SHA、1943unowned actualGit blobs（symlink hash link target、不follow）／operator44、原7protected與handoff575959Bprefix保持；原tests bytes皆為prefix，production兩窄delta外不變。單一530≤560行test窄例外保原448行fixture與完整caller斷言，其餘148/477/418≤500，無第5檔或壓行。

有效RED兩組、初lint4規則、首次baseline symlink IsADirectoryError及RED timeout警告均保留，未skip／刪assertion。Root兩個只讀probe先猜錯filename／exit欄位，依actual manifest更正，無Source mutation或finding。

Packet ac62935f91fe599138a31132827de3b444529d7134df5a3c40c19d36bcc9c157；Rootreceipt 2a23876342f8d6edfcc30fc8aab1f1dcc342335b12ce0653130edde4905739c0。

## 限制與下一步

Native19真functional15stage與匿名3/10 PASS，匿名20 host_stale INCONCLUSIVE。實際前後verify時間未capture，不能把合成延遲代數當該次根因；Native18 health1本次未重現亦不回填為已修復。779tests不是40/60驗收。

Root exact7paths（4Source/tests＋brief／本report／handoff）cachedcheck／commit／clean，核specialremote仍9063後正常FF；新Source／push／attempt1正常six-person→15legs，不GH rerun／0business gate。原freshness／CPU／memory／SLO保持，任何非PASS停升級並保全部資料。原WIP／G8停止85、主機US$0／US$5 cap、Hosted／Production／真寄信NONE，40/60未驗。
