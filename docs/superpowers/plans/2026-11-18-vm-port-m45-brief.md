# M45 完整 Linux VM 的離線 profile／workflow 移植

Root 核准既有 implementer 一個 M 級工具任務，Root 唯一一輪審查。Base 49402116b542473b2665211bd7404ff7f51249fd；沿用你已完成的 readonly impact map，不重跑探索。Owner 允許實際扣款但總額 US$5，本任務仍離線，不開計費資源。

## 固定設計

新增獨立 kind `LINUX_VM_16CPU_32G_V1`：Ubuntu24.04 x64，logicalCpu16，16 個不重複 affinity，nominal32GiB、實際 MemTotal28–32GiB（含邊界），host quota unlimited 或精確16CPU，host ancestor memory limit unlimited 或至少28GiB。維持 dedicatedGenerator=false：後端仍與 generator 同一 VM，由獨立 cgroup 固定4CPU／6GiB／8services／swap0。舊 `LINUX_FREE_4CPU_16G_V1` 行為／正負向保持，嚴格將 kind 與硬體整組綁定，不能只擴成 cpu4|16／memory16|32 的交叉組合。Host sample CPU／affinity／quota 必須符合已核准 profile，不能直接接受兩者。

必須是真 GitHub ephemeral self-hosted runner，使用 UID1001；不造 GITHUB_*，不改 owner guard。新 exact branch `codex/local-capacity-vm-20261118`，新 `.github/workflows/local-capacity-vm.yml`，job `capacity-linux`，唯一 label `colorplay-local-vm-20261118-a61f29`，只用該 label（operator 後續用 --no-default-labels／--ephemeral）。新 branch／workflow-ref／paid kind 綁定，GITHUB_WORKFLOW_REF exact `peiyi-liu/colorplay_v1/.github/workflows/local-capacity-vm.yml@refs/heads/codex/local-capacity-vm-20261118`，event push／attempt1／repo exact；free branch 保原資格，paid/free 混合一律拒絕。環境只由 GitHub 注入及既有 allowlist 傳遞，子程序需要 provenance 時明確傳其最小欄位，profile shape 可維持既有 jobSha／instanceSha；Root 將另獨立比對 API 真實 run/job/runner identity，環境字串不是平台真實性證明。

新 workflow 使用既有 exact SHA pinned checkout/upload，persist-credentials:false／contents:read／無 secrets／無 Hosted；全 functional→15 legs fail-stop 保持。新 Vercel branch 精確 deploymentEnabled:false，原條目不動，必須於 Root 第一次 push 前已在同一 Source。既有 free workflow 完全不改，不能觸發 Native37。

預算採更緊 outer admission：paid job timeout150分鐘，paid suite 75分鐘後不再 admit 下一 leg（保留一 leg25分鐘＋snapshot30分鐘＋export／hold餘裕）；old free 的240／330不變。這是費用外層限制，不能放寬任何 leg／freshness／barrier／resource／SLO／成功條件。VM 建立→刪除最多3小時計畫由下一 operational task 實作，M45 不宣稱平台硬 cap／已清理／已滿足容量。paid workflow 若 outer budget 耗盡，報 NOT_RUN／NOT_VERIFIED，不能 PASS 或 skip 剩餘。

## Ownership（不可擴為產品修改）

你不是獨自在 codebase；不回退 Root／他人，Root 擁有 docs／handoff。可修改下列 Source：execution-profile.ts、capacity-linux-health.ts、run-linux-local-suite.py、linux_suite_support.py、linux-local-bootstrap.py、linux_bootstrap_contracts.py、local_snapshot_contracts.py、local_snapshot_native.py（均在 scripts/concurrency/）；linux-operator/{collect_readiness.py,linux_runtime_common.py,linux-host-sample.py,pin-execution-profile.py,calibrate-linux-runtime.py,package-manifest.json}；新 `.github/workflows/local-capacity-vm.yml`、vercel.json。可新增一個小的共用 profile/provenance contract helper（若確有必要，先報 exact path，避免多處獨立不一致）；包內新 helper 需 manifest/安裝 closure 綁定。對應 tests/contracts/ 既有受影響測試與必要新 VM contract／fixture helper 可改，需列 exact files。其他閉包檔若實際同樣硬編碼形成阻塞，先報 Root 該位置，不偷放寬／全域替換。

禁止 commit／push／遠端 API／新 credential／啟服務／真 browser容量／VM／修改 Original source/Git/deps／G8／legacy。不要安裝依賴或改 package/lock。Linux UID1001、systemd／cgroupv2／PSI／pidfd／PSS／Docker preinstalled & empty 仍是明確前置，M45 不實作安裝或擴權。

## 必要驗證與交付

保留 free positives，paid profile／observation／sampler／bootstrap／calibration／snapshot positives，加錯 kind/hardware/memory/affinity/quota／branch-workflow混合／缺 provenance negatives。測試 actual shared validator/collector，不能只 regex 原始碼冒充行為；workflow/config 靜態契約可直接檢查。保證 snapshot/export 後仍攜帶 exact Source、真 job、profile 與 helper hash custody。新 paid 28–32、free14–16 観測範圍及 ancestor 限制均測邊界；TS 既有 free schema 接受範圍勿偷偷收窄。受影響 tests、full lint/typecheck、format/import/diff scope檢查，不跑全產品4000tests／pnpm acceptance。

`.git/m45-vm-port/` 私有簡潔 packet：exact owned hashes／命令 exit與初始 FAIL／final結果／已知待真 Linux 驗證項；維持上一 task／Native36 inputs／operator manifest 原未改 entries及 Original基線，不複製大檔／不回讀圖片。單檔500行規則保持。只提交實作給 Root 審查，不委派第二 reviewer、不宣稱60人或Staging PASS。

Primary docs： https://docs.github.com/en/actions/reference/runners/self-hosted-runners （ephemeral僅一個job）；https://docs.digitalocean.com/products/droplets/details/pricing/ （建立開始計費，poweroff仍計費，destroy才結束）。Root 後續會先完成 vendor bootstrap、私有證據與清理 runbook，再要求真正必要的新access。

## Root 實作前 scope 接線拍板

採新增 scripts/concurrency/linux-operator/linux_host_contract.py（<150行），集中嚴格硬體 tuple／provenance mapping。manifest 可由44增為45 entries；原未改 entries保持。新增 dependency 必納完整 Root/function/capacity hash closure，明授必要接線 scripts/concurrency/root-helper-contracts.ts、linux-operator/execution-profile-preflight.py、linux-operator/capacity-root-readonly.py、linux-operator/prepare-capacity-plan.mjs；只接 dependency與profilekind，不放寬closure guard／產品規則。

當次 UI 供應定位：Tier1／Droplet usage0 limit3；RIC1 v5 General Purpose 最小配置已明示 This size is currently restricted, please open a ticket to increase your account tier。這只證該配置受帳號tier限制，舊款 c-16 在所查地區 disabled 的精確理由尚未證；不推定所有機型根因相同。Root 已向 owner 詢問是否允許送出一份有限額度申請，尚待回答／未傳送支援訊息。新access與VM都未建，M45離線繼續。

Root追加窄接線：execution-profile-runtime.ts僅以共用strict observed schema取代union.pick，禁止放寬kind或觀測深等比較。DO已正式受理owner核准之單台VM申請#13013994，預計24h回覆；未核准，M45仍離線。
