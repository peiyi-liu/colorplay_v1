# M15：零 business 準備與停機診斷唯一 Root review

結果：**ACCEPTED_SOURCE_ONLY_ZERO_BUSINESS_NATIVE_DIAGNOSTIC_PENDING**。Root 唯一一輪審查，Standards 0、Spec 原 1 個 P2 已同輪修正／0 open、Security 0。僅允許下一個新 Source 免費 Linux Local 診斷作業，仍不執行 functional／15 capacity legs，不代表 40/60 或 Staging 通過。

## 變更與對應 AC

Prepare 改用既有 M4 固定 privileged read 取得 daemon bytes，保留原 SHA、root600 與 Source admission；增加有限 phase／errno／pathKind，不輸出私密路徑。停機前後記錄已核 container role、client allowance／closure、實際 Running state、有限程序與訊號枚舉。Workflow diagnostic flag 在準備成功後、business 啟動前停止，正常缺省流程維持原15 legs。對應 WB4 工具與 AC-PERF-003 準備部分，沒有新增容量 AC 實證。

## 固定點與檔案

Base `ab5bd6c4f5470415d2bc8512a7958da3054c5bef`。Exact8 paths 依 M15 brief：prepare／operator manifest、snapshot native／wrapper、suite／workflow、新 preparation／shutdown 兩組 tests。Packet `.git/m15-prebusiness-diagnostics/m15-validation-v2.json` SHA `afa14d9129b0e7315352b5139626ac9383a4b6fbe553c1a80af93c9ceb340f49`；保留 v1 `799eb2957c34186bacaf5eb1c74ce58724a8cb4ea97aa4eff2d593131e65a516`。

Root 核 8 raw／54 records、53 protected 與 base Git 真 bytes 相同；manifest44／其他43相同、7 stop/admission strategy symbols 相同、max328行。產品／SQL／Functions／JWT／13helperclosure／M3／SLO／caps 不變。原目錄7 protected與575959B handoff prefix核符，G8/85保持停止保留。

## 審查與驗證

唯一 P2 是 Docker CLI top 回文字表格，原 JSON decoder 使 topology 永遠 UNKNOWN；測試先前用了 Engine API JSON。Root actual method＋合成 documented CLI stdout 重現 RED，再核修正 GREEN；改為16KiB／64rows／固定header／3columns嚴格 parser，JSON、畸形／超限一律 UNKNOWN，無 raw args／外部 process。

Worker fullPython134 PASS/12.148s、shutdown6與 lint/typecheck/static/import/EOF/diff全0；Root獨立 preparation7 PASS/0.292s、shutdown6 PASS/0.197s、actual diagnostic RED→GREEN、barrier AST與workflow僅env delta控制。Root summary `.git/m15-root-review.json` SHA `c3995e3462483e5429ecc8cc2fd980b0acb8b6a624837eb9e0c2f3f4d2fb7f2d`。無產品JS變更，不重跑既有3,785 unit與Local build。

## 資格與下一步

外部 Docker／proc／logs 為合成 ports；ordinary owned child只證 client timeout／close。Native9首個 PermissionError call仍UNKNOWN。原 RED／setup FAIL／Root metadata shape KeyErrors 保留，不倒填 Native 根因。原 --timeout -1／90／600／1800、signal與exit allowance（exit15仍拒）全部維持。下一個新Source attempt1只定位 preparation與正常停機，Root實際下載／解密／manifest核後才決定下一 bounded 修復。主機US$0，Hosted／Production／mail NONE。
