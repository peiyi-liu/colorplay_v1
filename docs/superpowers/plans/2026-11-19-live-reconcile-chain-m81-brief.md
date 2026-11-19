# M81：Live 第 5 題完整通知／讀取鏈診斷

## 授權、基線與判讀

本 task 是使用者已授權的「完整 60 人 Local 修正與驗證，通過後整合 Staging；US$150；Production 禁止」內的一個 M 級有界診斷。相同獨立 worker 實作，Root 統籌且為唯一 reviewer，只一輪 review 往返。這不是新增產品修法或架構變更，也不表示 capacity PASS。

Base exact Source `9eb3bf3020c3bc5edd6fb950f0870d51f8577b42`。Native23 Root final `3da3f7e200e726307a5e80483ce83ebb2fc12764be01a934d3146b481c129caa`：functional15、capacity8/15 PASS；40 人第 5 題失敗、其後 6 組未試。39/39 的 Node state 是 q5 open/version11，browser 最後既有公開 HTTP response 是 q4 feedback/version10，實際 UI feedback VISIBLE、COUNTER FAILED，全部 UI OBSERVED／closed／pending0。這不是直接讀取 Query cache 的證據。

沒有找到固定四次讀取上限；v11 若進入有效 handler 且 cache 是 v10，應排 authoritative reconcile。是否沒收到通知、callback forwarding、scheduler／coordinator 等待或 cache 採用，仍缺完整鏈。官方固定 Realtime v2.112.6 有訊息速率限制與 60 秒平均機制，但實際 tenant settings／本輪 rate-limit incident 仍 UNKNOWN，禁止猜預設值當實證。

沿用 spec/02-system-architecture.md 的 committed public projection／DB SSOT；spec/09-nonfunctional-requirements.md:26 要求 bounded payload、cleanup/reconnect 上限，禁止每秒 polling 代替既有 Realtime projection。只補被動觀測，不變更既有等待、讀取、重試、訂閱或權限決策。AC-PERF-003 尚未通過。

## Worker ownership：六 Source、五 tests

只允許下列六 Source；其餘 Source、DB、deps、workflow、Linux package/core5、M57/M65/M69、profiles、Original、獨立 operator 不得修改。你不是唯一使用 codebase 者，不得 revert 他人修改。

```text
src/features/live/lib/live-reconcile-diagnostics.ts                         NEW
src/features/live/hooks/use-live-session.ts
src/features/live/lib/live-reconcile-scheduler.ts
src/features/live/lib/live-state-read-coordinator.ts
tests/e2e/helpers/staging-capacity-browser.ts
scripts/concurrency/capacity-live-question-observation.ts
```

只允許下列五行為測試檔：

```text
src/features/live/lib/live-reconcile-diagnostics.test.ts                     NEW
src/features/live/hooks/use-live-session.reconcile.test.tsx
src/features/live/lib/live-reconcile-scheduler.test.ts
src/features/live/lib/live-state-read-coordinator.test.ts
tests/contracts/whole-site-capacity-live-reconcile-observation.test.ts        NEW
```

所有檔案 ≤500 行；只有既有 `capacity-live-question-observation.ts` 從495行做窄接線例外 ≤525。`staging-capacity-browser.ts` 現476行，仍 ≤500；不可壓格式換行規避。若必要 scope／行數不足，先回 Root 說明具體最小差異，不自行擴檔。

Worker 的新私有檢查／RED／freeze／manifest 只放 `.git/m81-live-reconcile-diagnostics/`；Root 的 baseline 是唯讀，不可覆寫或改。不得改其他舊 .git 證據、任何 handoff／review／brief 文件；Root 負責雙根文件與 server read-only helper。不得 commit/push、Cloud/Native/Hosted 操作或建立 fixtures。

## 五項行為契約

1. 真實產品鏈：分開記 SDK callback entry／現有合法 parse 後的公開版本、handler older/equal/roster/newer／inactive 等實際分支；scheduler enqueue/coalesce/start/return/fail/dispose；coordinator active/queued、實際 repository read start／settle／同步 throw；exact live query cache 的實際更新版本。未進分支、未見更新、pending 與 UNKNOWN 都如實呈現，不能從期待值或沒有事件推造採用／丟棄。沿用原一次 parse，不加 RPC、refetch、retry、poll、timer、delay、deadline 或 listener 造成的新讀取。原 return／promise／error identity、排序及排程語意保持。

2. 原有純資料 Native opt-in：優先在既有不可替換 `window.__colorplayCapacityRealtime` 加固定純資料槽。不得新增可執行 global、callback／getter／任意命令、page binding、逐事件 IPC 或 UI；正式網站沒有槽時廉價關閉，不建 cache listener／timer／事件物件。只在有效 opt-in 觀測 exact query；filter 可在 closure 使用既有 owner/session，但任何持久化與跨 realm 資料禁止 session、身份、URL、auth、題文、選項、答案、raw error。generation／ordinal 的 namespace 要明確，不能把 SDK version、state_version、document trace generation 與 Native generation 混稱。

3. 有界且無 authority：browser 原始 trace ≤4KiB；failure-only evaluate 回 Node 的 trace 投影 ≤768 UTF-8 bytes，保必要的各階段計數、最後進度及 active/pending 起點，可用文件化固定 enum index tuple，Source 必須正常格式化。M80 每 row ≤2048 bytes、questionObservation 總 ≤128KiB／最多60 rows、整 Live diagnostics ≤512KiB 原 guard 全保留；原 base 欄位不刪、不縮檢查。超限／缺失／取消／未知格式明列 PARTIAL／UNAVAILABLE／UNOBSERVED，不冒稱完整鏈。若768B無法保必要欄位，先回 Root 提出精確最低 shape，不擅改上限。

4. 收尾與資料衛生：同一次原 failure-only DOM evaluate 投影 trace，不加新的 evaluate 或工作。維持 M80 original wait error 立即傳出、原 browser close→all admitted work drain→同一固定 writer 一次；原無 owner caller 保持相容。診斷故障完全隔離，不干擾產品與原錯誤；舊 generation 的 async 工作可完成追蹤但不可冒認新 generation。只投影白名單 primitives／閉集值，不能把 raw slot／event／cache object 回傳；Node 端在讀欄位前保留 Proxy／accessor／function／custom-prototype 拒絕。不得宣稱一般 browser JavaScript 能無副作用識別所有 Proxy；實際 Native 槽為受控純資料，其餘不可信分支只能安全隔離／UNKNOWN。

5. Root server 證據另管：Root 將在下一 fresh、原 full15 取得固定 owned Realtime 實例的有效 tenant numeric limits，以及原窗口閉集 quota/drop/replication/DB error code/count。禁止把 upstream defaults／fanout 算式當 actual incident，也不先調高 limits。server helper 不屬 worker scope；Root 會在同一整體診斷對照 browser 收到版本、實際 product 分支與 physical read。全部23舊 VM 已 STOPPED，現階段只離線工作，無權重跑／重啟。

## 測試與交付

TDD 要有實際既有 caller 的有效行為 RED→GREEN，缺 import／setup FAIL 只能記環境失敗，不能算有效 RED。至少驗 SDK v11→handler→scheduler→physical read→實際 cache update 的完整正向；20 題連續／同版與舊版／roster；inflight＋coalesced＋queued；同步 throw、reject、取消／dispose／generation 切換；原 promise／error identity、RPC 次數與零新增 timer／retry；預設關閉、exact-query filter 與 cleanup；overflow／最壞實際 UTF-8 bytes；敏感資料哨兵、Node Proxy／getter 呼叫0、function/custom-prototype 拒絕；同一原 DOM evaluate＋M80 writer/drain。成功 actor 的內部 trace 可 UNOBSERVED，不能為補齊證據加額外 browser 讀取。

保留所有舊 assertion，不能 skip、刪測試或改舊 timeout。完成後 freeze 所有11檔 bytes/hash/linecap，跑 full typecheck／lint、owned format/import/diff、全部受影響單元／整合與 M80/M79/Live Native 相鄰 contracts。Root會做一次唯一 review。以小片段 inverse 重算8個既有 owned Git blob 與所有 protected inputs；不能複製大型檔案作基線。

交付 `source-freeze.json`、命令／exit／log-hash 索引與 final packet：區分有效 RED、環境失敗、fake ports 控制與真正 Native；保護 baseline／Original WIP／prefix／operator／既有 Native age/cold；此 task 不執行真 Native／Cloud／Hosted。最後報告修改摘要、AC、檔案、檢查與限制，不回原 ChatGPT 對話。
