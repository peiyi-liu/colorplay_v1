# M47 GCP 12CPU／32GiB 窄移植審查

ALLOW_OFFLINE_GCP12_PORT：Root 唯一一輪審查接受，未解 finding 0。這是工具 task；真 VM、60 人容量與 Staging 部署尚未驗證。

## 變更摘要與 AC

對應 WB4c／AC-PERF-003 的容量工具準備。GCP 新試用專案全域 CPUs 用量0／上限12，us-central1 CPUs0／200；16CPU配置出現quota不足，12CPU草稿警告消失。Root新增獨立 LINUX_VM_12CPU_32G_V1，Ubuntu24.04 x64／12個唯一affinity／nominal32GiB、observed28–32GiB／quota12或unlimited，保留既有16/free完整tuple。未升paid、未以可配置推定Native可用。

## 修改檔案

8 Source＋3 tests：execution-profile、Linux health、shared linux_host_contract／manifest、pinner、bootstrap contracts／suite support、既有VM workflow及3個VM contracts。明確workflow selector與獨立12CPU confirmation，未知selector／錯branch-workflow／free帶paid selector均拒絕。VM仍只exact唯一label／push attempt1；75min admission／150min job不變。runtime／sampler／calibration／snapshot body原碼不改，沿shared strict contract讀12tuple。45個manifest entry中43個保持原hash。

私有M47 bootstrap僅改M46兩個CPU predicate為12，逆向精確回復accepted M46 SHA；M46所有歷史檔案保持。固定project／instance／UID1001、metadata allowlist、home guard、vendor pin、無token、PREPARED_NOT_REGISTERED保持。後端4CPU／6GiB／8services／swap0、60人cold同步／資源guard／SLO／fail-stop完全不變。

## 命令與結果

Final Vitest9files／99tests通過（內含10項pure Python，不能另外加總）；Linux86、私有bootstrap8＋compile通過。full typecheck／lint／global format／import／static／diff final均0。原schema RED與fixture/format failures留存，沒有skip或刪assertions。

Root讀完整11paths diff與私有bootstrap窄delta，獨立195項tuple／boundary／selector×branch×workflow×event控制PASS；核49records、11當前hash、2255未改Git、45manifest、M45原84／M46原12與index／Native36十inputs、Original7／575959交接prefix／package-lock保護。所有owned單檔≤500行，未新增exception。

Worker packet SHA256 f524c13174478dbf89aca0899950f512e229ef8eb102c4290099c42e13f5afda；Root receipt SHA256 af9c01ef8c4bb83b146f89f3f8fa972939f969bb066b70490c8d81bec117df1e，private .git/m47-root-review.json。

## 限制與下一步

已授Compute API與一次臨時SSH／ephemeralrunner，總US150，不升paid、不碰Production。UI draft約US0.39/hr（12CPU32GB／100GB），3h基本估1.17，不含IPv4／流量／稅，非實帳單。設定3h後STOP＋1min graceful、停機保磁碟；完成加密證據保全後清理本次資源。先exact本機commit，再建立exact新VM，驗真kernel／hostkey／UID與GitHub run/job/runner身分，才一次functional→15legs。Local完整PASS後才整合部署現有staging.colorplayapp.com；不能以工具PASS冒稱網站60人PASS。
