# M13：Linux workload self-attach 唯一 Root review

結果：**ACCEPTED_SOURCE_ONLY_NATIVE_PENDING**。同一 Root、同一輪審查；初交 1 個 P1 已由 self0 設計及實際 ordinary-gate 控制清除。尚未證明 Linux kernel 六控制、functional、40/60 或 Hosted 容量。

## 變更與 AC

root-owned helper 只開／傳既有 nonce leaf 的 procs FD，不再有 privileged numeric-PID mutator。可信 observer 取得 FD、觀察 helper 正常物理退出後才建立 direct UID1001 Python gate；parent 關 FD、gate 固定寫 `0\n` 自遷移且 close 後 ACK。parent／child 目標 inode FD census 零、identity／membership／inventory 及原 cancel／budget 全部核對後才 release Node。Root policy／Source／job／ctx／boot／leaf、Root peer 及 non-dumpable root credentials 保持嚴格。

對應 WB4 Linux 工具、AC-PERF-003／Live 連線驗證的準備部分；不將 Source task 通過當成容量 AC 通過。可信 Source/hash Root preview/controller 是明示信任假設；producer Node／Chromium及 descendants 在 cap 關閉前不得存在。不是對任意惡意同 UID Root 工具的隔離承諾。

## 檔案與固定點

Base `d3b920549fe94ad2b2565972a82ad6a772fced6a`。Worker exact8 paths：`privileged-attach.py`、`linux_attach_authority.py`、`linux_owned_process.py`、`linux_suite_support.py`、operator `package-manifest.json`、`test_privileged_attach.py`、`test_linux_owned_process.py`、`tests/contracts/test_linux_kernel_diagnostics.py`，完整相對路徑與 raw hashes 見原 brief／packet。

v1 packet `ffe9b140b7ab59c1d61edc75d9765939cb1e0b21832980b374379a737fa5f387`；v2 `cac02217a5ddc52660d1fe78ef79302e860c0f74b5c9cdcea0a36ce34233c262`。Root 核 8 raw／94 records／52 protected；manifest 44、原其餘 40 entries 相同，max 424 行。v2 只改 5 owned paths，installer／suite support／kernel fixture 與 v1 相同。Root 另有 S 級設定修正：workflow 單行 canonical launcher、兩個 TS 測試設定；不放寬 installer。workflow 不在 52 protected，明確例外已寫 brief，與 worker ownership 分開記錄。

## 審查與控制

Standards 0 open；Spec 初始 1 P1、現 0 open；Security 同一 P1 已清除，沒有另設 reviewer。初交 close UNKNOWN 後仍 reap gate 的真 ordinary Python 控制 exit1：Node 未執行，但 writer close=false 已 reap，構成 PID-reuse 風險。Root 拒絕以延長等待／global Popen／PTRACE_SEIZE 遮掩，後者 pre-seize 仍有 numeric-PID acquire 競態。原 RED 保留，修正明確移除 numeric writer，不把舊協定誤記成已實證安全。

Root 獨立 operator 61 PASS/0.182s、kernel diagnostics 4 PASS/0.121s。另 4 真 Source gate＋普通 FS/Python/Node 控制：成功 self0 且 parent/Node cap inode copies=0；不 release、ACK lost、write rejected 都不執行 Node。AST 核 root server 無 numeric mutation／gate唯一 cap write 為固定 self0。這些是 macOS ordinary FS/FD 控制，不冒充 root f_cred 或 Linux cgroup 實證。

## 命令與結果

Worker affected65 PASS/0.322s、full Python113 PASS/10.079s；lint/typecheck/manifest format/static/import/EOF/diff 全0。Root 以 `python3 -B -m unittest discover` 跑上述兩組，並執行 `.git/m13-root-gate-v2-control.py` exit0。Actual workflow→actual installer AST guards 先 RED exit1，單行 launcher 修後 GREEN exit0；三設定檔 Prettier PASS。Root summary `.git/m13-root-review-final.json` SHA `647fd5d878cb6fbc914ece9bfa0ad22a010b572fc17bbfa8b53ad49053245d61`。

## 資格與下一步

v1 full Python112PASS＋既有 Mac cleanup EPERM 的原 FAIL、三個 gate fixture setup FAIL與 Root 私有檢查腳本準備錯誤皆保留；v2 未重現不等於修復舊 cleanup。Root 四 UID/GID0、dumpable0、observer無 capabilities／同 userns、實際 FD關閉均由 Native 路徑再核；尚無新 business actor／functional／15 legs。只放行一個新 reviewed Source 的免費 Linux Local job，不能 GH rerun 或碰 Hosted。原產品／JWT／SQL／Functions、13 helpers、M3/M5、六控制、資源 caps／SLO／barrier 不變；原 WIP/G8/85保留，主機費用 US$0。
