# 全站整合前測試設定修正（S級）

結果：全站 Vitest 3,785/3,785 PASS，0 failed／0 pending，reported test window 137.658 秒；這不是 Linux kernel、40/60 容量或 Staging 驗收。

## 變更與對應範圍

`vitest.config.ts` 排除 `.git` 私有診斷測試，避免把保留的舊測試副本當成產品測試收集。`tests/contracts/delivery-config.test.ts` 的完整物件斷言納入既有核准的專用 Local Linux 測試分支部署停用設定，保留其他所有 Vercel 設定斷言。`.github/workflows/local-capacity-linux.yml` 僅將 suite launcher 改為固定 `/usr/bin/python3` 與 quoted `GITHUB_WORKSPACE` 絕對腳本路徑，配合原 root installer 的嚴格 argv admission；不放寬安裝器、不改觸發條件、權限、runner、時限或上傳。對應 WB4/WB5 整合前工具驗證；本 S 級沒有新增產品 AC，不能代替 AC-PERF-003 容量實證。

## 命令與結果

`pnpm --config.verify-deps-before-run=false test --maxWorkers=2 --reporter=json --outputFile=.git/integration-unit-20261116-v3.json` exit 0，3,785 PASS。report SHA-256 `384b864980e1332b188713b834d5df9c83e93d50dba0d168e1c09d9b6afbf754`；receipt `.git/integration-unit-20261116-v3-receipt.json` SHA-256 `abe48119f4ec54282de726439300faadb8177b54b9886ebf1c81488e23605e99`。delivery focused 8 PASS；影片/trace 保留 focused 1 PASS；兩檔 format PASS。worker 在相同 WIP 下 lint/typecheck exit 0，原始紀錄列於 M13 packet，最終 Source commit 前再核其 hash/資格。

## 準備失敗與修正資格

首次全測試在 sandbox 失敗，另包含私有 `.git` 副本與尚未同步的部署設定斷言。第二次 3,784 PASS/1 FAIL；nested Vite 的字型 @fs 403 已由真 Chromium 回應及 Vite allow-list 訊息確認，原因是隔離 checkout 的 `@fontsource` scope 連到原目錄。Root 第一次複製漏查 scope parent symlink，短暫改到原依賴連結；已精確還原原 symlink，核 hash 後刪除只由本次建立的外部副本。隨後診斷補齊第二套 press-start-2p，兩套字型現在實體位於隔離 checkout，原產品 source/斷言與原依賴恢復。相關私有 receipts 保留，不把 setup 失敗抹除或誤報產品缺陷。

## 風險與未驗

`pnpm --config.verify-deps-before-run=false build` exit 0（TypeScript＋Vite），以 synthetic public URL/key、Local deployment environment 驗證可建置；未拿這份產物作真實後端或 Hosted 驗收。保留既有 >500kB chunk 提示，沒有放寬 build 門檻或改 code splitting。

三個設定／測試檔只在隔離 checkout 修改；原 protected 7 檔與 handoff 575,959-byte prefix 再核符，G8/85 未操作。M13 原 P1 經同輪 self0 設計與回歸控制清除，詳見該 task review；本 unit PASS 仍不代表 Native/40/60 或 Staging。費用 US$0，Hosted/Production/mail 無操作。

Launcher 的 actual workflow argv→actual installer AST 兩 guard 控制先 RED exit1（alias＋relative script），修後 GREEN exit0；資格只是實際跨檔契約，不冒充 Native `/proc`／sudo。三檔 final Prettier PASS。launcher 修正後產品程式與 3,785 unit 的輸入不變，未為單行設定重跑全套。Root 純唯讀 cipher watcher另以既有 run7 無 artifact→拒、run5 小型 ZIP→API digest 相符驗證；未重跑任一 CI，也未解密或讀私鑰。
