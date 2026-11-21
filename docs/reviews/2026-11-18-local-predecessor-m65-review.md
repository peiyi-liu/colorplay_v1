# M65 — Root Local predecessor adapter review

結論：ACCEPTED。Root唯一review一輪、actionable findings0；base9f9cb0caa2975a4f61d455fa15e03fe5985fa7fe。只補離線Root read port，不代表真Native15/15／Hosted驗收通過，不建立執行權。

## 範圍與變更

新增hosted-local-predecessor.ts（466行）、hosted-private-evidence.ts（220行）、whole-site-hosted-local-predecessor.test.ts（507行）。test准<=510窄例外，完整Linux synthetic15/15 fixture約350行需與semantic/privateFS負向表同處，無壓格式或無意義拆path。舊guards／Local wrappers／產品／DB／依賴宣告／workflow保持。對應全站WB5前置證據，不新增產品AC／Phase PASS。

Root constructor固定獨立expected index／predecessor／兩publisher/validator組／profile expectedSHA及observed host/identity/backend；普通evidence JSON不能提供profile authority。81個固定actual files、每檔16/32/64/128/256KiB、總12MiB、metadata<128，canonical/owned0700/0600/nlink1/NOFOLLOW與前後stat＋SRI＋use前重核。拒duplicate decoded keys，不讀secrets/private-plan。

## 唯一review與驗證

Root逐行審兩module與directtests，並對照原profile、manifest、functional close與mjs出版PASS謂詞。沿原TS validators驗完整15functional stages、有序15legs、close/request/candidate rawSHA／deep-equal／Source／profile／publisher／前級及registration-ready；任一缺失只NOT_FOUND/PARTIAL/UNKNOWN。publication是本次對原bytes的domain-separated重核摘要，非虛構Native獨立檔；checkedAt只本次read時間。

worker final5files231tests（原4/198＋新33）、fulltype/lint/globalformat/import/diff/static全0。Root獨立actual exported private reader八控制（正常＋錯SHA/publicmode/hardlink/symlink/invalidUTF8/duplicate/未知basename）與三decoded duplicate控制PASS。55records／15captured checks與historical/raw初RED、fixture/template、欄位/chain順序、type/lint/Rootbriefformat等FAIL保留。Root直接逐bytes驗2321base保護檔、三Source、Original七文件／package／lock與575959handoff prefix。

## 資格、風險與證據

單機讀取前後核不是global atomic snapshot；Root固定獨立設定是信任邊界，無抗惡意Root承諾。原mjs stdin scripts未直接當library執行，逐謂詞對照在私有handback。原stdoutSha仍只是close原欄，沒有宣稱獨立rawstdout可重建。仍缺real remote provenance、durable nonce、Hosted runtime與OTP relay等；這不撤銷既有已授Staging唯讀範圍，也不產生新的Hosted寫入／部署窗口。

既有tsc -b經symlink寫入Recovery node_modules/.tmp/{tsconfig.app,tsconfig.node}.tsbuildinfo兩生成快取；沒有before清冊，不可聲稱node_modules全bytes唯讀／所有payload逐bytes不變。Original node_modules不是此target。未install/update，不刪／回復他人cache；精確realpaths/currentSHAs及資格見dependency-cache-qualification.json。

Final `.git/m65-local-predecessor/validation-final.json` SHA04f6b4c6afbe41e81f4687ed544b0ec35c1d1f3141f90d456cc073b65ff4efa7；Root `.git/m65-root-review.json` SHA a7f705d14d1b900eccccb5c61128f6c0ce9f7d810dbeb345457c33c907a8e514，均在/tmp獨立checkout私有留，不入git。三Source f24e01b764ddc5c9f95d706cd3f45a0ecc1999063b6833eb3c80cf4138b32799／6709adeabf45621375f39449ddb1aeb7d397ae57c3c9b3c9ae25f5b4d742c54d／347e55a11280b39324889505a3295e57b4cfdc2e91735d45635ba54fd1303e58。

## 下一步

Root exact-path保存operator提交，將已接受M57/M65七Source/test路徑帶入app候選後，單獨dispatch M66完整operation診斷；不動原產品或SLO、不直接建VM14。後續fresh Native測最終組合exactSource，真全15未過不Staging部署。十三VM均STOPPED／runner0／US150/noPaid／Hosted0／Production禁。
