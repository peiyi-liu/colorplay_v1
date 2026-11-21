# M21 brief：固定 ECR 映像限流的有界重試

Root 統籌與唯一審查；沿用同一實作 worker。Base **4051b4007768d9db0e50cd89cf41bd5a0972ef09**。Owner 已允許 Local 多輪修正與測試直到完成，US$0／US$5 上限保持；本項僅修正 business 開始前的固定官方映像 pull。不改產品、Hosted 或容量標準。

## 確定的失敗與邊界

Native15 run43888488403/job133372980592/push/attempt1 已 completed/failure；start 階段 DOCKER_IMAGE_PULL 正常 closed/exit1，stdout0，stderr59B/SHA315bad000605c445bfd9911b426d2dbaf0b68e2654478d071dc39219e60c4295。Root 真 age 解密核全文恰為 Error response from daemon: toomanyrequests: Rate exceeded 加末尾 LF。所有 business、fixtures、functional／15legs 仍 NOT_RUN；不是網站容量 FAIL 或 PASS。完整 cold capture/transfer 前級 Native14 已核，不需為本 pull 修正重跑零業務 gate。

AWS 官方 https://docs.aws.amazon.com/AmazonECR/latest/public/public-service-quotas.html 列 anonymous image pull 預設1/s，支持精確限流的短退避；共享 runner/IP 是否實際成因仍 UNKNOWN。此錯誤不是 Data limit exceeded；不藉登入、憑證、換 registry、IP、quota、主機或 job rerun 規避。

## 唯一 Source ownership（4 paths）

1. scripts/concurrency/linux_bootstrap_backend.py：start() 對既有 approved pins 使用專用 pull_approved_image(pin,imageIndex) port；8 pins、inspect configDigest/amd64/Linux、tag、CLI start/status 保持。
2. scripts/concurrency/linux-local-bootstrap.py：NativeIO 實作專用 pull 與 private attempts evidence。
3. tests/contracts/test_linux_local_bootstrap.py：僅既有 Fixture 補對應 pull port，既有 assertion 不刪。
4. tests/contracts/test_linux_ecr_pull.py（新增）：直接測真 NativeIO／bounded 邊界、時鐘、writer 與兩條 export 收錄。

你不是獨自在 codebase；不覆蓋他人／Root docs/handoff WIP。其餘 Source 全保護；尤其 operator44/manifest、M17–M19 停機與保留、suite正常模式、src/Functions/SQL/seed、依賴/lockfile、workflow/toolchain/images/JWT/全部 SLO/caps 不改。任一新增 path 或單檔超過500行先回報，禁止擅自擴項。

## 重試唯一資格

專用 port 先嚴格核固定 DOCKER args、已核 immutable public.ecr.aws/supabase reference 與合法 pin/index；不將通用 run() 改成自動 retry。每 image 原總 deadline180s 包含所有執行、close、保存與等待；最多3 attempts，唯一 backoff5s/10s，下一 attempt timeout 僅剩餘 deadline。時鐘使用 monotonic，時間不足或保存後過期立即 fail，不重設180s。

只有正常 bounded 返回（finally 已 child.wait、streams/selector closed）、exitCode恰1、stderr逐 byte 等於上述59B，才有下一 attempt 資格；stdout可非空但仍受單 command2MiB cap。其他 exit、大小寫／額外行／Data limit／permission／其他訊息、timeout、未知實體close、取消與任一 error 都立即停。最多3次之後仍原 BOOTSTRAP_COMMAND_FAILED，不把 transient 任意換成功；只有真 exit0 才可進 inspect。CLI start 保持一 attempt，不重試整 job／business／OTP。

中途 exact rate failure 必須先 wx600 完整保存唯一平面 bootstrap-pull-<image>-attempt-<n>-* metadata/stdout/stderr（不覆寫，不公開 raw），綁 bootstrapRequestSha256/image/index/attempt/operation/exit/bytes/SHA；失敗／無 scope／超過獨立 cumulative2MiB history cap 即 fail-closed、不下一 pull。已取得 raw、writer partial 保留。這些 transient 記錄不能消耗原 _save_failed_raw 的 first terminal slot；耗盡或不同 terminal failure 照原 terminal raw 路徑保存，後續 CLI terminal error 也不能被早先 transient 吞掉。既有單 command2MiB、export/job/output caps 均不增加。requests 的現有有界列舉可直接匯出新平面檔，須真測 prebusiness 與 normal snapshot selection，不能只測字串。

## 驗證與交付

先有行為 RED，再精確實作；覆蓋 exact rate→success／3次耗盡／2次 transient後不同 terminal／transient後 CLI terminal、相似非精確錯誤／exit≠1、180s含等待與late-close、unknownclose／timeout／cancel不續、writer失敗／collision／cap／無授權不續、private modes／request binding／raw preservation、兩條 exporter 包含新檔。不得 skip/assertion刪改／mock success當實際 Linux proof。直接測受影響 Python＋完整既有 Python regression（較短可一次），pnpm --config.verify-deps-before-run=false lint/typecheck、AST/import/EOF/diff；不重跑無關產品3785unit/build。

每命令保留 UTC/start/elapsed/exit/raw SHA，保留 setup 失敗，不回填 Native15。freeze unstaged packet，列4 Source hashes/protected actualGit/operator44/unowned non-docs manifest、命令記錄；Root 唯一一輪 review。禁止 worker stage/commit/push/Native/Docker/DB/proc/signal／任何雲端/API/mail/settings；不讀 Root 私有解密／key／Hosted輸入。Root 接受後才 exact paths commit→核 remoteexact4051→正常FF新Source/newpush/attempt1，正常 six-person→15legs，非PASS即停升級。原目錄 WIP／G8停止85／Production／Hosted零寫入保持。
