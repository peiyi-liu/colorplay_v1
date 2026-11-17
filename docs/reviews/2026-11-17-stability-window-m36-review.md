# M36 原窗口完整取樣修正審查

結論：ALLOW_TASK_LEVEL。Root 為唯一 reviewer，一輪 1 個 P2 已修正；這是工具修正通過，尚未完成 40／60 人 Local 驗收。

## 變更與對應範圍

WB4c／AC-PERF-003 工具資格：在原 1.5 秒窗口內執行完整 pre/post set 與身份比對，20ms cooperative yield、最多 76 attempts；逾時的 stable pair 不再回傳成功。原正向 shape、全組 PSS、普通權限／binary／identity guards、30 秒外層時限與 freshness 門檻保持。Kernel IO 仍可能阻塞，非 hard realtime 保證。

僅 5 Source 與 2 tests：host sampler、其 manifest 唯一 entry、新 pure stability schema、helper contracts／decoder、新 Python fake driver 與 TypeScript contracts。其他 43 operator entries、M35 全 8 檔、collector／runtime／journeys、產品／DB／依賴／workflow／exporter 未變。

## Review 與驗證

唯一 P2：解碼器曾接受 WINDOW_EXHAUSTED／elapsed 0 或 ATTEMPT_CAP／elapsed 2000。已補時間一致性與明示 1e-9ms 浮點容差，保留 raw 值；Root 獨立 7 個邊界 probes 通過。

原兩個 actual Source fake RED 已轉綠；受影響 34 files／336 tests 通過。最終 worker 與 Root 各自 3 files／66 tests 通過，Root wall1544ms。新 Python 18 controls、原 failure5／tempFS1 通過。typecheck、full lint、global format、import-only、diff、static 全 0。初 type／lint／tsx sandbox IPC setup 錯誤與被後續浮點限定取代的 exact1500 負向資格均保留，未宣稱全程無紅。

Root 核對 81 records（v1 原 53 全保）、607 unique 歷史資料、7 Source hashes、2218 unowned Git entries 的 type／exec bits、Original 7 檔／真 handoff prefix／package lock、Native30 的 7 冷封存輸入。原 sample AST、generic executor body 保持；同輪僅 schema／test 兩 delta，逆向 schema／原 test prefix 與 v1 hash 相同。

## 固定證據與下一步

Final packet：`6957ec69d1e65ac8a7896593fdfe476ae2d8aa21688ebaa46ad8cffe706cb296`；Root receipt：`c32bbe07ec19256ac51303a9624ad0a6e763c2b7bc8e603e31e66c5ec70f04f1`。完整原始記錄在 private `.git/m36-stability-window/` 與 Root receipts。

下一步由 Root exact 10 paths commit／clean、fresh special remote 後正常 FF，啟動新 Source Native31 push attempt1，完整六人功能驗證→15 legs；不得 GitHub rerun 或零業務探測。Native30 failure／完整冷封存保留，不回填其具體 process churn 成因。US$0／上限 US$5、Original WIP、G8 停止85、Hosted／Production／真信 NONE 保持。
