# M10 Local專案依賴唯一審查

結論：ACCEPTED_FOR_NEW_NATIVE_LOCAL_ATTEMPT。Root唯一review，Standards 0／Spec 0／工具blocker 0。Base `834c3e29d5150a5af13fe0cb69ed9d26c84640d1`；worker packet `d3f637a35419ad0a213fb70da646a463630815d642c6b00a649d558e52230db1`；Root summary `7f2489309dff80756fb7bb2b627e1938a50bd1b2e8c816eff2911fd76472226a`。

## 變更與範圍

6個核准source/test paths：linux_project_inputs.py完整讀取Source config；4份seed與共用模板去重成5份依賴、保留兩template引用與anchor；generated signing key及URL/DB schema搜尋路徑分別列示。admission綁canonical proof SHA，dependency-proof.json留存；source-bindings維持flat map並增config/template。變更不碰產品、migration、原config/template、ENV、M3/M5、operator manifest、imagepins或workflow。

AC：本task依核准M10 brief的工具初始化契約，沒有新增產品AC／phase驗收聲稱。原整站40基線／60目標仍待Native功能與容量實測。

## 審查與驗證

Root逐一驗6 source／22 logs-proofs／17 protected hashes，核前置capture與重驗發生於runtime/isolation/daemon寫入前；tracked、owner、regular、無link、固定anchor及unsupported active path皆fail closed。B.project消費原pin、wx600複製、核Source與目的地hash，原config hash與衍生runtime config hash分開；最後ready再核。

Root命令：`python3 -B -m unittest discover -s tests/contracts -p test_linux_project_inputs.py -v`：9 PASS／0.780s；同命令test_linux_local_bootstrap.py：17 PASS／1.387s。Worker完整95 PASS／5.639s，proof檔名對齊後focused9 PASS／0.676s，lint/typecheck/static/diff均0。Root原目錄7份protected及handoff前575959 bytes核符。

## 風險與證據邊界

Native初始化、kernel controls、functional、15容量legs均NOT_RUN；retention UNVERIFIED，Hosted authority NONE，費用US$0。原audit-only不存在檔名的準備失敗保留，正確檔名再核17protected；非產品finding。先前Mac cleanup PermissionError仍未定位／未改，這次95+26測試沒有重現，不能宣稱已修。G8／85 stopped資源與原product WIP保留。下一步精確commit與test branch lease核對後正常快轉新Source，跟進一個新Local job；不GH rerun、不改main/staging/Production。
