# 免費Linux runtime M2：Root authority與portable接線

Root核准本M實作；base `425af2f263d4be8cdf3cfc6d88d3ce57b7440ce5` clean（Root稍後放入本自有untracked brief）。同一worker實作、Root唯一一輪review，M1已ACCEPTED／P2同輪解完。本M依Owner既有工具移植／60人測試授權繼續，不綁卡、不加值、不訂閱、不建立付費資源。

## 本輪目標

共用bounded executor與profile runtime loader；接通M1 Linux health，保留舊Mac absence bytes、cadence與門檻。不更改產品／成績／RLS／API業務，不把接線測試宣稱真kernel或60人PASS。Root負責clone外的真private Python helpers／bootstrap／physical close與remote workflow。

## 凍結契約

1. Functional已有外部request approval hash；capacity Linux新增外部`--approve <request原始bytes SHA256>`，缺席或不符即在任何helper/API/Auth前拒絕。不能在同一request自報其expected hash再當獨立批准。Legacy Mac既有兩參數入口與request／stdout形狀保持；新增能力缺項不fallback。
2. Linux request新增optional profile runtime descriptor，至少綁完整helper closure文件SHA；scope的executionProfileSha256仍M1欄位。固定讀runtime內`execution-profile.json`及`execution-profile-helper-closure.json`，owner/mode/no-symlink／bounded file要求保持。Closure綁sourceRevision／profileSha與下面13個精確basename及bytes hash，不接受任意路徑、未知helper或遺漏imported dependency。descriptor只在explicit Linux profile分支使用，legacy不得帶入。
3. 完整closure核對後，執行固定`execution-profile-preflight.py`，args含sourceRevision／expected profileSha／fresh challenge；strict回`{sourceRevision,challenge,observed:{host,identity,backend}}`。實際observed由Root helper讀當前Linux kernel/job/cgroup/DB，不能照抄profile檔；public loader驗revision/challenge、M1 validateExecutionProfile及DB binding。這個profile preflight不要求baseline0，functional另用原fresh baseline guard。每次helper呼叫前後重核完整closure，profile/closure不得半途改bytes。
4. Closure的10個可執行basename：`functional-preflight.py`、`canonical-baseline.py`、`media-readback.py`、`capacity-root-readonly.py`、`capacity-registration-readback.py`、`capacity-retention-readback.py`、`capacity-preflight-readback.py`、`execution-profile-preflight.py`、`linux-host-sample.py`、`backend-cgroup-sample.py`。3個只可hash／載入而不可當入口執行的dependency：`linux_proc.py`、`linux_cgroup.py`、`linux_runtime_common.py`。舊functional helpers3、capacity helpers4、scope sampler／helper的既有hash與closure中同名項須相符，不能shadow。Linux scope.helpers可明列對應9項（3functional＋2sampler＋profile-preflight＋3libs），其餘4項在capacity request helpers；legacy原5項集合不變。
5. Native executor依實際平台與已驗authority選固定Python：Darwin原`/opt/homebrew/bin/python3`、Linux`/usr/bin/python3`，不能由request指定執行檔／root目錄。保留原最小env／不輸出raw error，bounded args/stdin/stdout、30秒／abort殺own process group且等待close，late child/close/timer必須收斂。Linux可用`-B`防寫pycache；Root會在新runtime僅部署上述allowlist source、不帶任何pyc。
6. Native Linux必須explicit新profile＋獨立approval＋capability＋Linux helper集合；任何Darwin／vm fallback拒絕。Native Darwin不得假裝執行Linux helper；trusted fake IO可明確提供測試平台，不能把假IO結果叫真機證明。Linux collector用host/backend真ports，接M1 createLinuxCapacityHealth；不製造vmSamples／Darwin flag。原初次取樣完成各自排recurrence、baseline前不notify、stop時取消並等待全部pending的cadence修正保留。

Root實際platform/cgroup/instance/header觀測、kernel完整process集合、PID reuse與orphan/late child實體關閉、GitHub job/免費條件仍是後續真校準；本M純fake外部ports只能證實工具的拒絕與接線邏輯。

## Ownership與exact allowlist

Worker只在isolated clone改10個source paths：

```text
scripts/concurrency/root-helper-executor.ts          (new)
scripts/concurrency/execution-profile-runtime.ts    (new)
scripts/concurrency/root-helper-contracts.ts        (new)
scripts/concurrency/functional-runtime.ts
scripts/concurrency/capacity-config.ts
scripts/concurrency/capacity-runtime.ts
scripts/concurrency/capacity-scope.ts
scripts/concurrency/capacity-collector.ts
scripts/concurrency/capacity-journeys.ts
scripts/concurrency/run-capacity.ts
```

測試8paths（3new／5existing）：

```text
tests/contracts/whole-site-root-helper-executor.test.ts       (new)
tests/contracts/whole-site-execution-profile-runtime.test.ts  (new)
tests/contracts/whole-site-root-helper-contracts.test.ts      (new)
tests/contracts/whole-site-functional-runtime.test.ts
tests/contracts/whole-site-capacity-config.test.ts
tests/contracts/whole-site-capacity-runtime.test.ts
tests/contracts/whole-site-capacity-collector.test.ts
tests/contracts/whole-site-capacity-journeys.test.ts
```

你不是獨自使用codebase：Root擁有此brief/review/append-only handoff，以及clone外linux-free-generator全部operator／credentials／證據；不可revert或修改Root檔。超出allowlist／單檔需>500先向Root報具體原因，Root處理例行必要相容調整。原M1其餘檔／原Mac guard／Hosted Stage1／src／SQL／Functions／lock／既有workflow、G8與85containers完全不動，不開新agent。

## 驗證與交付

TDD public seams：真loader接外部fake IO、實際export executor的spawn/abort/close界線、profile preflight與完整closure、collector fakeclock接真M1 reducer、真journey ports。內部模組不mock；只有外部filesystem/process/clock/kernel取樣可fake。既有Linux/Mac測試一起跑；必要的小型helper subprocess fixture可有界執行，不啟動browser／DB／長駐服務或network，不做額外VM bundle實驗。

重點負向：批准缺失/錯hash、closure缺漏/改bytes/未知路徑/非owner/symlink/資料library誤exec、錯challenge/source/observed/DB／scope混裝、Linux native缺profile／vm fallback、abort startup race／late close／overflow／timeout與timer收乾淨、Linux backend初採／recurrence／停止、原Mac absent JSON形狀。保五SLO、3/7秒、Node2GiB／PSS6GiB／10秒、250ms等全部原guard。

Full lint/typecheck、scoped prettier/import/diff與受影響whole-site contracts綠；保留真正RED與原failed logs，最後packet列exact18path hashes／checks exit/duration／限制。保持unstaged不commit，Root唯一review後再精確commit。此為AC-PERF-003工具前置，真kernel／60人／Staging／phase acceptance均NOT_RUN；不跑pnpm acceptance，不push／PR／merge／deploy／Hosted寄信／Gmail內容讀。
