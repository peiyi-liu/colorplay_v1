# M64 parent transition diagnostics — Root review

結論：ACCEPTED。Root唯一review一輪，P2一項已在同輪修正，無未解finding。基線 `116442a1349960a5bb1f852569876f0a889b647f`。本task只新增非權威診斷，不宣稱VM12原因已確定、合法exec或Native修復。

## 變更與範圍

保留原身份比較、seen/pidfd、拒絕、kill/stop/grace與parent-stop JSON；沿原讀值留FIRST/SECOND閉合類別，失敗後最多兩PID固定前後stat/cgroup與cmdline，總64KiB／100ms軟截止。固定已綁SHA、同一已驗bytes載入新module；兩caller共用獨立wx0600 sidecar，writer失敗不改原outcome。對應已核准全站計畫之容量工具診斷；無新增產品AC或Phase gate通過宣稱。

## 修改檔案

owned七檔為linux_owned_process.py、新linux_process_transition.py、run-functional-owned.py、package-manifest.json、test_linux_owned_process.py、test_linux_parent_stop_diagnostics.py、新test_linux_process_transition.py。run-capacity-owned.py原bytes與固定Root14+1 closure未改。新module180行，parent382行，均小於500行。

## 審查與驗證

Root發現afterFailure只有單次stat時，cmdline期間生命週期可改卻仍OBSERVED。原反例保留，修正固定前後核對，漂移／消失清不可綁argv；明示atomic=false。Root獨立actual exported五控制（正常＋birth/ppid/leaf/gone）及12 focused tests PASS。不是retry-until-equal，R→S自然變化仍可觀測。

capacity/send 41 files／564 tests PASS；Python distinct57 PASS（新12、parent13、operator pure3、bootstrap18、inputs11）。type/globalformat/import/diff/static全0；lint全0在Python-only本輪delta前，TS/lint inputs原bytes保持。原business36函式AST與GATE literal等價。90 records／40 checks原始RED與工具setup失敗保留；v1 55records未覆寫。

Root逐bytes核七Source、2,323範圍外tracked、VM12四冷inputs、M61/M59/M58/M56共222歷史records、M62/M63五records、M57獨立75records、Original七文件／handoff575959 prefix／package與lock。operator46entries，42舊entries不變；只三既有entry變與新增一entry。

## 證據與限制

Final packet `.git/m64-parent-transition/validation-final-v2.json` SHA `2bf6f8d439496681282f74f8e716bfd03ab6c6b6d9f23ad6b35d21f4bd87865e`；Root receipt `.git/m64-root-review.json` SHA `b0d7724d324f6d7f867156827db3ae5b27c02f71b0f682fa1c6b7d8038394254`。所有私有raw保在隔離checkout，不入git。

AFTER_FAILURE為有界非原子事後觀測；uidFresh與pidfd birth仍UNOBSERVED。git/docker/psql只有模板／path分類、UNPINNED；PSQL_READONLY不代表SQL或權限獨立驗證。100ms是soft deadline，非硬即時保證。VM12原INCONCLUSIVE不回填。下一步：exact reviewed Source提交＋normal FF推專用Native branch，fresh VM13單次；US150/noPaid/Hosted0/Production禁。
