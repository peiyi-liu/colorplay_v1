# 免費 Linux Root operator／suite — 唯一審查

**ACCEPTED_FOR_ONE_NATIVE_LOCAL_ATTEMPT**。Standards 0／Spec 0／工具安全未解blocker 0。Root單一review，沒有額外reviewer或架構變更；M5已另完成其唯一task review。AC-PERF-001/003、AUTH-001/003、SEC-005僅工具支援，Native Linux／60人驗收仍NOT_RUN，retention UNVERIFIED。

## 變更摘要

公開無秘密Root operator package（31 operators／10 tests／1 image-pins，4968行、單檔最多324）；保留7business helpers共52function AST，平台／private IO adapter另列。新增真Linux profile／六kernel controls／owned cgroup+pidfd closure、獨立post-close publication authority、固定read-only psql adapter，以及build巢狀私鑰掃描。

Root安裝器固定官方Node24.18.0／Supabase2.109.1／pnpm11.25.0完整archive checksum；workflow只專用測試分支／standard ubuntu-24.04／contents:read／no Hosted secrets或OIDC／無自動重試。M4 optional checked=False只供Root保留failed-stage私有stdout；原default仍拒非0。流程為fresh bootstrap→profile/kernel→build/bind→functional→15legs sequential fail-stop→正常snapshot→bounded age export。

## 修改範圍

scripts/concurrency/linux-operator/；prepare-linux-runner.py、linux_suite_support.py、run-linux-local-suite.py、local-export-recipient.json；linux-local-bootstrap.py的有界adapter；三份直接Python tests；專用.github/workflows/local-capacity-linux.yml；自有brief/report/append-only handoff。原產品程式、lockfile、原root WIP、legacy、G8與85資源不變。

## 驗證結果

Root62個受影響Python檢查（38 operator＋3archiveFS＋3suiteFS＋1真subprocess＋17 M4回歸）通過；full lint/typecheck exit0，MJS/JSON/workflow Prettier與syntax通過。17實際Darwin拒啟動控制 `65e2bc33c248584a824439fc6a315d5f1d09d3acc58d15620c1da64813d32e37`，沒有啟動任何服務；既有7 publication capability controls `5ec49e15cbf52ab46f057dba2192b980010dcbe1ce6b727d55c5cc2566f138cb` 與52function AST證明仍保留。Root package以真正M4 operator_package admission實驗，42 listed files精確、32 installed files相容；manifest `34cc8763c87fe034b3f2011b79053d010a202daed00a7c7cf6c2fc0c84605a55`。

固定vendor checksum／pnpm 455 regular archive members與官方Actions checkout v6、upload-artifact v5實際commit SHA均唯讀核實。上游原始碼/apps/cli-go路徑曾404後正確定位；不存在服務試跑。Root測試最初一個census預期digest自行寫錯，改用已知abc/SHA256向量；原失敗不是產品RED，不隱藏。巢狀JWK秘密與failed-stage subprocess介面各有真RED→GREEN，沒有將非0當PASS。

## 執行限制與保護

只有全部真kernel控制通過才建立business identities；Native、protocol、hybrid不混用，五SLO／250ms dispatch／40→60／前級hash鏈不變。第240分鐘不開新leg；snapshot正常stop，未知/failure保partial，不重試／裁資料／調大cap。M3成功且ownedProcessClosed才寫marker，避免上傳未完成.age；只有cipher≤100MiB留1day。M5失敗可一次PARTIAL診斷，omissions明列、整體NOT_VERIFIED，不能當完整冷備或留存證據。

真runner／DB／Docker image實際配置／kernel closure與60人能力尚待驗證；完整snapshot也須Root下載解密/census核對後才可宣稱留存完成。初次prebusiness失敗尚無profile時不偽造archive authority。此允許僅建立新測試分支與一個免費Local job，不授權Hosted/Production設定或流量、Staging deployment或寄信。

### 提交前EOF衛生（同task，無行為變更）

首次cached diffcheck exit2抓到capacity-root-readonly.py檔尾多1byte newline，gate已阻止commit。只移除該byte、AST完全相同，未重跑無關行為測試。manifest更新為 `65816b8617998ffcda436ea4c36b4cb66d79a2b71c136dc2f8daaa9370e80760`；原34cc與v1 packet保持歷史，v2 packet `5335b80cf11a556fd952910bc94d7035e48ab3ec2e755e053ab4ffe28b4db532`重新pin53source/config。Root下一次stage check必須0才commit，沒有第二輪review或變更判準。
