# M29 Playwright 基線更新審查

狀態：Task 級接受；生成依賴最小修復與隔離核對已完成，可進入 Native24。Root 唯一 reviewer，一輪往返。

## 變更與範圍

WB4／AC-PERF-003 的驗證工具前置維護。@playwright/test 固定 1.65.1，對應 lock 僅變更 test/playwright/core 與 axe peer，沒有產品程式碼、no-store、串流讀取、錯誤豁免、SLO、資源上限或 operator44 修改。正式依賴 lock 解析閉包維持 17 roots／146 snapshots；這是解析證明，不是更新前 installed graph。

## 驗證

真正隔離安裝後，full typecheck、lint、global format、import boundary、build、frozen-lockfile 一致性與 affected contracts 66 files／790 tests 全通過。Root 獨立驗證 Source packet 92 records、exact2 Source、1948 unowned Git blobs／symlink bytes、Original 7 protected files／true handoff prefix。Build 僅原有 chunk size 警告。pnpm list 的 sandbox SQLite 失敗保留，以完整 canonical lock closure 補證，沒有跳過未知 alias／peer。

## 隔離事件與同輪修正

第一次 Root 僅驗 node_modules 外層，漏驗內層 shared virtual store，更新因此影響 Original 生成依賴。Original package／lock／產品 Source 沒有改動。Recovery 舊外層 rename 私有保留，fresh frozen copy install 後 Root 深掃 external／broken／Original shared regular inode 均為零。Original 只按 exact11 計畫恢復已證舊版本及必要 metadata／shim，保留新版本目錄與所有 rollback；未知 prestate top alias 不建立。

Root 發現初始 v4 候選保留新版本 metadata 的 P1，從未套用。實作補有效 semantic RED，再由 Original lock 完整節點重建 v5，Root parse／deep equality 與不相關 raw bytes 核符；同輪 P1 已解。五個官方 tarball SRI／192 files／5 peer links與舊 core106 prior census 核符。完整事故前生成 census 不存在，不宣稱完整逐 byte 回到事故前。

Root 獨立 full raw census 核對 Original 45,707→45,956 entries：新增249項僅上述五個舊 snapshot 子樹，既有六 target 以原 inode 保留 rollback，其餘 raw bytes／metadata／inode 全相同（祖先目錄時間允許變化）。Actual core CLI Original1.61.1／Recovery1.65.1。Recovery37,807 regular／2186 symlinks，external0／broken0／shared Original regular inode0。私有 harness 排序差異與非直依賴解析失敗保留；均未改 Source 或擴大修復。Root receipt .git/m29-root-repair-review.json。

## 證據與限制

Final packet .git/m29-playwright-baseline/validation-final-v2.json，SHA cd28ce327714f20730b2d1bfd766f2aee742b6b31b63d2f1053c7adc7cc2ee2b，166 records 全核、Source 原92 records 保留。Root 最終 receipt .git/m29-root-review.json，SHA e1dade94a09ab5bfa6599fa19219d9f1376c85fa774c6331438bd5b8ee077a97。Root Source receipt .git/m29-root-source-review.json；最小套用授權 .git/m29-phase-b-root-apply-authorization.json。上游 issue42742 與私有 old149/new159 正負向對照支持工具升級，但未重現 actual-routed Native23 三個媒體失敗，也未測 image；Native23 根因不可回填已證。

## 下一步

Root 收束後，只 exact5 paths commit／clean、fresh special remote、正常新 push／attempt1 Native24。先 six-person 完整功能，再正常 15 legs；任何非 PASS 即停止升級並保留資料。40／60 尚未 run；這不是網站容量、phase 或 Staging PASS。主機花費 US$0，US$5 上限，Hosted／Production／真寄信操作 NONE。
