# M29：固定已驗證的 Playwright 瀏覽器基線

Root授權M級工具維護task，base2d341fce15bb8e53ac0e54c88bbd27bf93adf1e9。唯一既有實作agent，Root唯一review。WB4／AC-PERF-003前置驗證修復，不是網站/容量/phase PASS。

## 證據與界線

Root primary verified microsoft/playwright#42742：維護者確認no-store/getReader在頁面EOF後可能仍回CDP取消，Oct21表示Chromiumfix8508456已進canary。official release1.65.1 Nov13包含Chromium159.0.8154.6。私有固定對照manifest ac2978cd6a469c4227549402a92e97f347d925a47918edcf7f3d068f81f40c68，Rootreceipt8ac860aabf52dd3a9c7f24887446b8edba8dd1fa332ffa144b0aafba74b91145：old149/new159各23正常案例全JSON/schema成功，舊CDP20/23/new23/23完成；old三次direct no-store split取消（plainReader1、actual boundedSDK2）internal abort0；new正常全完成。兩版4genuine negatives仍app/CDP失敗。50data/56HTTP/6.671s，全部owned資源closed；累計3launch包括原失敗setup1/0HTTP。

這只支持更新工具基線；driver/browser pair一起改、Darwin fullCfT、actual-routed兩版均11/11完成、Native23三媒體事件未被此路徑重現、圖片未測、argv unavailable／未prelaunch hash整個Mac engine framework等限制全部保留。Native23取消/image原因不自動回填為已證，40/60仍未run。禁止為通過而改no-store、stream、timing、expected、failstop或Root guards。

## exact2 Source ownership

- package.json：只把devDependency @playwright/test從^1.61.1固定為exact1.65.1。
- pnpm-lock.yaml：只允許對應Playwright/test/core與必要peer snapshot重接；不得更新其他產品依賴或格式化整份lock來掩蓋變更。

Root另寫brief/handoff/review，agent不改docs/任何其他tracked檔案。無新測試RED儀式（純dependency設定），以已實跑private差異控制與實際checks驗證。不得擴第3Source檔；遇真正型別/API相容問題先具體回報必要最小scope。

## 安裝與保護

本recovery node_modules已由Root確認是本checkout獨立目錄、不是Original連結。允許pnpm進行上述精確依賴更新，保既有pnpm11.25.0與所有其他版本，不用廣泛update或packageManager/registry/全域設定變更。network如受限以已授官方registry/CDN範圍交auto-review；不用帳號/secret/env dump。保Original/node_modules及G8資料，禁止碰舊browser cache或執行會移除舊版本的browser install。驗證如需瀏覽器只引用已下載private159 cache的per-command環境，不再launch額外實驗；正常Native下一步由Root啟動。既有private差異封包、兩版private installed artifacts與全部失敗log保持不動；歷史Source/lock hash是舊版本證據，不篡改。不要複製大型Source/node_modules作基線，用Git/SRI/版本紀錄。

升級前後各記production dependency graph（pnpm list --prod --depth Infinity --json或等價canonical解析），核產品解析版本與依賴閉包完全相同；root Node_modules正常更新可接受，Original不可變。記old/newtest/core版本、lock package SRI與精確依賴列，核新core1.65.1與私有已驗證package一致。pnpm命令保持--config.verify-deps-before-run=false避免意外安裝/驗證噪音。不得修改.env/Hosted設定/Root operator44或建立新credential。

## 驗證／交付

完成fresh frozen-lockfile一致性、fulltype/lint/globalformat/import/diff、全部受影響concurrency contracts（至少既有40files582範圍）與build；不跑Phase8 acceptance、不更新visual基線/skip。純依賴變更不新增鏡射實作的test。可引用private50case實驗，不能稱Native或網站PASS。必要安裝setup失敗全部保留；不重跑Native或增加browser batch。

私有packet .git/m29-playwright-baseline：exact2Source bytes/hash、commands/exit/log hashes、production graph前後證明、1950減2未owned actualGit blobs/symlink target bytes、operator44、Original7/trueprefix、歷史differential35records不變（Sourceindex指舊Source版本不強求current相同）。凍結unstaged等待Root一次review，不commit/push/Native/新agent/Hosted/Production/寄信。Root接受後exactpaths gated commit/clean、freshremote2d341fc正常FF新Source/push/attempt1正常six-person→15legs，任何非PASS停止升級並完整保留，不GH rerun或0business gate。主機US$0／US$5cap、原WIP/G8停止85/所有custody保持。
