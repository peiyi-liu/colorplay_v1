# M16：已核 Edge pidfd 正常關閉與全服務診斷唯一 Root review

結果：**ACCEPTED_SOURCE_ONLY_ZERO_BUSINESS_NATIVE_PENDING**。Root唯一一輪審查，Standards／Spec／Security各0 findings。只允許下一個新Source免費Linux零business診斷，仍不恢復functional／15legs，不代表40/60或Staging通過。

## 變更與對應 AC

固定root literal自行核plan/context/job/nonce/boot、確切Edge id/name/image及derived exact Docker cgroup，先取得pidfd再核shell init與唯一runtime child的UID/start/namespace/PPID/exe identity與官方binary hash；只對該child pidfd正常SIGTERM一次。helper10s與原Dockerstop共用90s，未知或取消不續operation。exit15限定同Edge/current proof＋正常停止與正向signal證據，已知drain failure不eligible。全部8服務先留600private安全census，其餘7服務stop方式不變。

對應WB4工具與AC-PERF-003準備部分，沒有新增容量AC實證。固定CLI無startup exec參數，採受限正常stop修正，不改CLI/image／Runtime啟動設定或產品架構。

## 固定點與檔案

Base `7966bef299948dad3bab0cd7a11f595d6d520139`；brief SHA1740d1201d77edb9de3d9a4580fd9d90d09d5946bf16fe1c379405826d9a4a05。Exact5：新增local_edge_shutdown與其test、修改local_snapshot_native／snapshot-local-evidence／既有shutdown diagnostics test。Packet `.git/m16-edge-graceful-stop/m16-validation.json` SHA `d81e02e0eb7f0edfc30412ca54f6e6a759b2b27253d154216e1fcffae58305df`。

Root核5raw／31records、57protected actualGitbytes與operator44 raw／manifest相同，max360行。原13helper、M4/M13/M3、workflow diagnostic flag、產品／SQL／Functions／JWT／SLO／caps均不改。Root另有並行Staging Auth唯讀文件，屬統籌WIP。

## 測試與結果

Worker直接17tests、fullPython145 PASS/9.665s、lint/typecheck/static/import/EOF/diff全0。Root獨立8selector/wrapper PASS/0.711s、9snapshot PASS/0.311s；另9個actual selector/wrapper adversarial controls皆PASS：coherent foreign cgroup、已死pidfd、exe inode drift、hash後deadline、SENT後deadline、closeUNKNOWN等。AST核root程式無numeric kill／exec，唯一signal為pidfd SIGTERM；const binary165260008B/SHA3b7c6b9cc472f49fa7719a7f8988d099b1196d8fd0890cf2bd81c9480de57826與Root官方OCI proof相符。

Root summary `.git/m16-root-review.json` SHA `c02946f3b3c15d9ae22cf68de5cedbb890629dda539f4a57debaa7f28818ac09`。原exit15 RED、parent取消晚到RED與144/145回歸全部保留；未重跑無關3,785unit／Localbuild。

## 資格與下一步

Docker/proc/pidfd/signal均合成ports，不當Native syscall或完整冷備份證據。Root官方59MB layer只驗hash/ELF，未執行binary；Native10真正容器證據仍為Edge shell PID1／timeout，Kong/DB只是配置shell，實際PID1待census。SENT不能倒填NOT_SENT，UNKNOWN不發布成功。下一新Source attempt1維持0business，保存實際signal／exit／closure及all8census，Root下載解密核後再決定。主機US$0，原WIP／G8/85保留；Hosted寫入／Production操作／寄信皆0。
