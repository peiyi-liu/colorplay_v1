# M18：固定 REST 有證據的中斷辨識唯一 Root review

結果：**ACCEPTED_SOURCE_ONLY_ZERO_BUSINESS_NATIVE_PENDING**。Root唯一一輪審查，Standards／Spec／Security各0 findings。下一新Source仍零business；未宣稱完整冷備份、40/60或Staging通過。

## 變更與對應 AC

固定PostgREST v14.14的原Dockerstop不改。只對其255增加完整證據例外：approved plan/context/Source/job/profile/nonce/boot及確切容器、image/tag/Cmd/null entrypoint，實際top單一postgrest PID1；前後identity/config/restart不漂移，正常stop/client closure與90秒內完成。bounded logs須前後bytes原prefix不變，before無TERM/INT，新增恰一條具有效日曆/time/TZ與官方完整訊息的TERM行；其他新行、未知、fatal、INT、重複、截斷或rotation均拒絕。

raw logs只在private記憶體；成功保存600 receipt與deadline重核後才有terminal evidence。logs不足但read client正常close仍保留原stop與0/143路徑；取消、closureUNKNOWN、identity不符或過期不續。其他4普通roles、M17三角色與Edge15/DB0不變。對應WB4工具／AC-PERF-003準備部分，無新增容量實證。

## 檔案與固定點

Base20c4656c10a6d1ad4e5a6b7627f1280b033bb9f4；brief df1b0583f95d4d9bf96576e1b2106831b497de2035121e46aac8351f745d19fe。Exact5：new local_rest_shutdown.py及test_local_rest_shutdown.py、修改local_snapshot_native.py／snapshot-local-evidence.py／test_snapshot_shutdown_diagnostics.py；max445行。

Worker packet .git/m18-rest-interruption/m18-validation.json SHA62ebb36c45342f719f38b9519aabdc576b4b5c526f5328c746e5f28b19a7f807。Root核5 Source／27 records／59 protected actualGit bytes／operator44 raw，另外核原7protected與handoff575959Bprefix。所有其他NativeIO／snapshot方法原Source bytes保留；root helper／TARGETS／workflow diagnosticOnly1／產品／SQL／Functions／依賴／額度均不改。

## 命令與結果

Worker直接36tests、fullPython164 PASS（reported14.342s），lint/typecheck/static/import/EOF/diff皆0。Root另跑36 tests PASS/2.276s；獨立28 parser/date/injection/transition/topology controls、14真Native12 provider結構normalizer controls、9 coherent job/boot/finalizer/lifecycle controls與9既有Edge adversarial controls全PASS。AST核pure module只有標準純計算imports／無I/O或signal權限；read completion另由actual NativeIO.run與普通owned Python subprocess控制驗證。

Root summary .git/m18-root-review.json SHAb537a2b219e689ba8b8c4590ff0abc13f9d266c93b4d0425c4a1068ed8666bc7。Worker兩個behavior RED及fixture deadline setup失敗保留。Root初始finalizer8/9只是boot測試把fixture原all-e再設all-e的無效mutation；原script/output保留，保證不同boot的v2為9/9，沒有產品修正。不重跑無關3,785產品單元或build。

## 風險與下一步

Native12沒有REST TERM日誌，因果維持UNKNOWN，不回填255正常。固定官方Source支持PID1／RTS中斷機制，但vendor實際compiler provenance未attest；TERM handler entry不等於pool release completed或v16式request draining。合成ports／真provider結構控制均非新Native syscall、完整備份或容量證據。

下一exact8paths commit/check0/clean，核specialremote仍20c4656再正常FF一個新Source attempt1，diagnostic flag保持。Root須核實際REST正向證據、DB INT自然停止及完整dump／volume／runtime逐檔備份後才另授權business。原WIP/G8/85保持停止保留；主機US$0，Hosted寫入／Production／寄信0。
