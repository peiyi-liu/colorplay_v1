# M84：Local migration 基線與 pinned operator 一致修正

## 授權、事實與邊界

延續使用者授權的完整60人Local修正／審查，通過後整合Staging；US$150總額、不升級付費、Production禁止。Base 07ccdf3800452c5c028a86f9683a7be1a5a538b9，PR74 draft；真CI44466098478 attempt1八綠：unit434/5024、pgTAP2342、真SDK等integration36、Chromium29/2原環境選擇skip。M83產品wire修正未撤銷，未降低任一原測試。

Native25 run44466089904/job135364101389/attempt1在bootstrap project失敗；functional/capacity全部NOT_RUN。Root真SSH核同Source tracked122對舊固定121、target已建但copiedFiles0、containers0/volumes0。PREBUSINESS artifact14502684947已真age解密且5檔manifest核符；原10min hold已完成、runner45自動移除/repo0，Root正在正常STOP新VM25，不重跑run、不重啟舊機。原Source與失敗證據完整保留。

此為新的單一M級bounded task，相同worker實作，Root唯一一輪review。你不是唯一codebase工作者，不得revert他人修改。只改下列12路徑，私有證據只新增.git/m84-migration-baseline/；不得commit/push、Cloud/Hosted、啟MacColima/G8或任何舊VM。Root另管brief/review/handoff與新VM admission。獨立operator checkout仍在54065...且四處121，只作後續scope記錄，不得現在修改或冒稱已接受122。

## 唯一 ownership

1. scripts/concurrency/linux_bootstrap_backend.py
2. scripts/concurrency/linux_status_contracts.py
3. scripts/concurrency/functional-runtime.ts
4. scripts/concurrency/local-runtime.ts
5. scripts/concurrency/linux-operator/functional-preflight.py
6. scripts/concurrency/linux-operator/capacity-root-readonly.py
7. scripts/concurrency/linux-operator/package-manifest.json
8. tests/contracts/helpers/whole-site-functional.ts
9. tests/contracts/whole-site-functional-guards.test.ts
10. tests/contracts/test_linux_local_bootstrap.py
11. tests/contracts/test_linux_status_contracts.py
12. tests/contracts/test_linux_migration_baseline.py

## 必須完成的五項契約

1. 六個runtime guard同步為固定122：bootstrap project、status、functional TS、Local TS、functional operator preflight、capacity operator readonly。其他publicTables71／publicWithoutRls0／RPC-表列／Auth-RLS／proof／基線值／錯誤分類不變。不能改成>=、範圍、自動接受任意migration數量或靜默fallback；121與123必拒，既有120負向保留。不得改任何SQL migration、產品Source或資料模型。
2. package-manifest.json保原46entry/相同paths/order/metadata，只有兩個owned operator entry的實際bytes/hash可更新，其餘44（含core5）逐byte/值核同Git base；installed仍35，舊core5全部SHA不變。不得只放寬operator validator或繞過hash。新實際manifest SHA需完整交付，Root下次admission改綁新digest；不得沿用c567...或舊request/profile/snapshot/closure收據。所有digest消費點保持原closed validation，不新增依賴、白名單或寬鬆compare。
3. 新 regression 必讀實際candidate tracked migrations，核122與既有20261119000100 migration SHA80b3e9890cd2551aee797ec16d3306072ebb4f75b75695936bb381189c45d592，使用原capture_project_inputs／實際B.project caller＋TempFS/FakeIO取得有效舊Source RED。不能以假121列表或parser字串測試冒充caller。修後122成功、121/123拒絕且未copied files／無Docker或服務操作；可用closed fake ports產生非secret測試資料，不跑真DB/Cloud。要讓下一次新增migration在離線階段即紅，避免再付費到Native才抓數量漂移。
4. 保原全部assertions，僅更新正向fixture122及『122曾當錯誤值』的stale assertion；補121/123拒絕，原120等負向不刪。對實際Python snapshots及兩個TS guards驗同一新baseline，原runtime evidence/permission/ownership/profile/SLO契約不變。新test不放進operator目錄，不改core5/profiles/CPU-memory/15或20秒/deadline/retry/樣本門檻，不增skip。
5. 六runtime/manifest/四既有tests/新regression共12檔均≤500行。先有效RED→focusedGREEN，最後一次受影響Python及TS union、typecheck/lint/ownedformat/import/diff、46entry兩變44不變／35installed／core5／protected inputs／prefix／Gitinverse核對。保所有FAIL、命令/loghash、Source freeze及完整packet；無需要重建未commit snapshot。真Native/DB/SDK/Chromium此次均NOT_RUN；不能挪用前Source真CI當新版本已驗。

## 完成與後續

Root只一位reviewer／一輪往返，核12paths與完整保護後，新exact Source新CI attempt1，不rerun任何舊失敗。八CI全綠才freshVM與原functional15/完整capacity15 legs/60；全通後protected Staging。AC-PERF-003仍待完整容量，task離線修正不能宣稱60人或Staging PASS。Root後續依新manifest真hash與相同35installed／core5重新admit；舊Native25僅PREBUSINESS失敗，沒有容量結果。
