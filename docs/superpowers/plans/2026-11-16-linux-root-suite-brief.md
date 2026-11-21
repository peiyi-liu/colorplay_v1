# 免費 Linux Root operator／suite 接線：有界 brief

依Owner自主完成全站40 baseline／60 target與後續Staging整合授權，這一段限Local；Root實作/唯一review，沿用同一worker只M5四檔。禁止新agent、原root產品WIP/G8/85資源修改、Production/Hosted流量與設定、Secrets上傳、擴權、額外付款、CI自動rerun。AC-PERF-001/003及AUTH-001/003/SEC-005僅工具支援，不代表這些AC或60人驗收通過。

## 範圍與固定介面

Root公開化先前無秘密operator草稿至scripts/concurrency/linux-operator：平台samplers/Root process observer/preflight oracles/publishers/preparers/build/bind/bundle，以及獨立profile pinner與六個真kernel校準控制。Source manifest精確列OPERATOR/TEST/PUBLIC_IMAGE_PINS；私有runtime不在repo。新local-psql.py只准固定8服務中approved DB的既有read-only argv；Source／installed bytes／actualID image project target env須一致，不接受任意SQL旗標/host。補強build對runtime-secret巢狀ES256 d與HMAC掃描，不把public x/y當秘密。

Root新增prepare-linux-runner.py／linux_suite_support.py／run-linux-local-suite.py與三個tests：官方Node24.18.0、Supabase2.109.1、pnpm11.25.0完整checksum固定；只fresh GitHub Ubuntu24.04 standard4CPU16G，repo/job/attempt1/clean exact GITHUB_SHA。API/DB/Mailpit/App固定loopback58321/22/24/73；有界setup、M4一次bootstrap、Root wrappers/profile校準、build/bind、fresh完整functional→原15legs sequential fail-stop。截止第240分鐘不開新leg、單leg25分鐘與snapshot30分鐘，不放寬五SLO/250ms barrier/原判準。

為保failed-stage stdout，Root僅擴充M4 bounded optional checked=True；預設完全不變，explicit False回(code,raw)。新增真subprocess非0保留與預設拒絕控制；M4既有17tests須回歸。Root suite把所有stdout只存private600、失敗仍拒絕；不把非0轉成PASS。

M5 plan在任何business前由Root獨立產生並hold raw SHA；固定8 actual containers/mounts/preview boot PID start exe與source/profile/context/job/package/tools/bootstrap。business/monitor settle後M5正常停止/capture，Root加closed requests/tool provenance再M3 plain2GiB/cipher100MiB/20k caps。不省資料，不因可encrypt就宣稱retention；下載解密與完整census仍Root獨立完成。初次prebusiness若profile未建立，未獲snapshot admission，標未驗留存與0business，不能用假profile補收據。

## 遠端啟動界線

新增.github/workflows/local-capacity-linux.yml只push專用codex/local-capacity-linux-20261116觸發，contents:read、無Hosted env/secrets/OIDC/manual/schedule、自動重試、large runner。checkout與upload-artifact官方實查commit pins；只cipher一件1day，預留10分鐘Root下載窗口。vercel.json已只對此分支git.deploymentEnabled=false；現有staging/main部署規則不改。Root審查整個新source與worker M5接受後才精確stage/commit/push新branch，不PR/merge/deploy。

## 驗證要求與聲明

公共seams沿用先前批准的外部FS/process/kernel/native ports；Root目前純契約/真tempFS/Mac拒絕控制，不假Linux。Root operator既有7business helper共52function AST對照、7Linux publication capability控制保留，actual profile與六kernel控制必須在真runner成功後才准business。Native及60人全部仍NOT_RUN。提交前各檔<=500、manifest精確、秘密/路徑檢查、Python syntax/unit、MJS lint/format/typecheck、原保護prefix驗證。Root sole一次review報Standards/Spec/工具安全與限制；不再拆多reviewers。

## 同task Root failure-diagnostic接線補充

M5失敗且尚未嘗試M3時，可一次匯出existing partial＋closed Root controls。若尚未copy Runtime，Root另存runner-owned regular files作DIAGNOSTIC_ONLY_DATABASE_AND_VOLUMES_NOT_ATTESTED，unknown UID/type/link逐列omission，所有資料與私鑰仍只600加密；不刪任何來源或假完整備份。標captureCompleteness PARTIAL、retention UNVERIFIED、整體NOT_VERIFIED；不是重試M5或裁資料救PASS。M3一旦嘗試失敗就不重試、不raise cap。Workflow只在Root確認CIPHER_ARCHIVE_CREATED/ownedProcessClosed後的export-complete.json marker存在才上傳cipher，不能把未完成的.age partial檔上傳當已匯出。原M5成功scope與full-retention驗收不變。
