# Native25：Local migration 基線在建庫前拒絕

## 結論與原因

Root 唯一 Native 審查：PREBUSINESS 失敗，functional／capacity 全部 NOT_RUN，不能宣稱完整60人通過或網站容量失敗。Source 07ccdf3800452c5c028a86f9683a7be1a5a538b9／run44466089904／job135364101389／attempt1／runner45。

Root 真 SSH 在原保留窗口核同Source tracked migrations122，但 linux_bootstrap_backend.py 的 project guard 固定121；target 已建立、copiedFiles0、containers0／volumes0。新合法 Live migration 後，Local 工具六處固定基線尚未同步。不能只修第一道 guard，也不能改成自動接受任意新 migration；M84 已限定12檔，同步固定122、manifest兩個entry及實際 Source caller regression，保121／123拒絕與原120負向。

## 本次執行與證據

候選真 Feature CI44466098478 attempt1八綠：unit434files5024 tests、pgTAP98files2342 tests及3 controls、SDK等integration14files36 tests、Chromium29 PASS／2原環境選擇未執行。原Live smoke與reset-account通過。此證據屬本候選 CI，不是 Native 容量通過；M84新版本仍需新 CI。

VM25 cp-capacity-20261119-m25d73／40106201476969299／europe-north1-c，12CPU32GiB/browser12GiB、backend4CPU6GiB配置未變。Google兩份相同收據＋獨立hostkey、strictSSH一致；四真kernelcontrols PASS／移除8 cgroups，70Source／5kernel及原46entry35installed package 核符。05:55:14Z開始，bootstrap project失敗後保原十分鐘hold，06:06:40Z job failure結束；未重跑或重啟。

artifact14502684947，ZIP2186B／cf84d6245fcb182c8710369b097ad92cba3188db77c14975ee7fc30b2c14c59d；cipher2048B／837db3bb9666dba20247a695a343c5988aa032db9771b18fd4e7de8169fa7b33。本機真age解密，PREBUSINESS manifest五個payload的safe path／bytes／hash與Source／job binding全核；沒有DB/cold資料可restore。另保存25份bootstrap log共31130B。測試未跑，沒有擷取產品畫面或以headless圖片宣稱驗收。

## 清理與下一步

全25VM strict STOPPED、VM25外部IP釋放、repo runners0；未刪任何VM／磁碟、未重啟舊機。2500GiB保留磁碟仍計費，先前清理提案仍待授權。基本配置預留US53.0208非invoice；先前含下一測試及儲存假設的126.7708是planning allowance，不是已付費金額或provider硬cap，下一Create前重算。總US150／不升級付費。

Root固定server collector因DB未建立，SETTINGS／LOGS均未執行。私有工具的inverse字串、重複O_EXCL及SSH前NUL組裝失敗均保，已逐項限定修正，沒有變更Source、測試矩陣或容量判讀。

Root final .git/m83-vm25-root-final-review.json SHA 7eb055b3cb91cfda194bc372c88b521fb77201dcd70c8ab468d06c53b075307d。M84 brief docs/superpowers/plans/2026-11-19-local-migration-baseline-m84-brief.md，12路徑、相同worker、Root唯一review；Linux core5／profiles／門檻／原15與20秒不變，獨立operator checkout不在實作scope。完整Local15/60未通過前不merge/deploy Staging，Production禁止。AC-PERF-003仍待完整容量。
