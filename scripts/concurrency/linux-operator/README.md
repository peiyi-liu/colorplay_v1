# Local Linux Root operator package（未核准執行草稿）

只含無秘密source與外部FS／純契約測試；沒有Root runtime、approval、DB、Storage、OTP、信件、identity或私鑰。公開image pins只是同版本linux/amd64 digest，尚未拉取。

由Root獨立核准job／clean source／package raw SHA後，bootstrap才將manifest明列OPERATOR檔案複製到checkout旁的`live-recovery-runtime/whole-site-261115`（0700／0600）。不能在此source package路徑直接當runtime執行；相對source imports依該安裝位置設計。測試可在此以`python3 -B -m unittest discover -s scripts/concurrency/linux-operator -p 'test_*.py'`執行。

Native執行固定ubuntu-24.04/x64/4logicalCPU/16GiB；8個本機Supabase服務共同4CPU6GiB parent cgroup、另唯一空generator leaf。Root在leaf外，用kernel pidfd／完整cgroup inventory與startup gate追蹤orphan/late children，close不只看browser root退出。缺kernel事實／未知profile／closure不合／資源不足即拒絕，既有Mac profile與SLO不動。

先fresh完整functional與Root close，再原15legs/fail-stop。M3 archive建立不代表留存，下載真解密／manifest/hash與DB/Storage census尚需Root。所有kernel/cgroup／Chrome Native校準與遠端run仍NOT_RUN；Source工具通過不代表40/60人或Hosted PASS。此package不建立workflow或啟動Hosted；Root已另備專用測試分支限定workflow，須Root整體review通過才推送啟動。
