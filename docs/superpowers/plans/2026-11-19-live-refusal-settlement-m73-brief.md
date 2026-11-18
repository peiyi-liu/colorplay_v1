# M73 — 私人訂閱拒絕的單次決定與移除期間安全鎖存

Root授權同一 task1_implementer；Root唯一一輪review。base 638ba0f63ba898dc3cebd70276dc4d0413dd7ea5。Owner已授權持續Local至60與Staging、US150、不升級付費；本task只修已定位測試工具，不改產品權限。

## 真證據與範圍

VM17/run44349496804：functional15 PASS、capacity5/15 PASS（anon3/10/20＋truefresh40/60全部AuthCreated/completed）；existing3 INCONCLUSIVE，後九未跑。40 entry132.651/send86.517ms、60 entry234.625/send79.372ms，原250門檻未改。真age2292files221947533B/cold2231/8stop/2DB127tables31roles/3volhashmetadata已Root核，未restore。原hold16:56:33→17:06:33UTC自然等待，不干預。Source測試工作已closed，遠端hold只保留資料；新本機修正不改原Native證據。

Root .git/gcp-vm17-root-first-projection.json 七immutableinputs；實際下載Live診斷b30a204cb49af3636926a5303f5e9db09bf4fae8455a4d5de4b9d2846752b5a0與獨立SSH bytes相同。ordinal42 JOIN_INVALID_CODE、45 NOT_FOUND，兩predicate true；51 CHANNEL_ERROR/refusaltrue/explicittrue；原removeChannel觸發52 CLOSED/explicitfalse，53 remove ok，54 OUTSIDER_REFUSAL failed。Source每次非SUBSCRIBED重算explicit，既有fake remove未發CLOSED，故漏此路徑。這證明工具狀態覆寫，不能宣稱後續完整Live或60全站已通過。

## 唯一兩owned paths

- scripts/concurrency/capacity-live-gate.ts
- tests/contracts/whole-site-capacity-live-refusal.test.ts (new)

各≤500行；不改M70diag/game/join、M72registration/cohort、permission classifier、產品658src、workflow/backend/profile/matrix/SLO或任何其他Source。worker不寫docs/Git/deps/runtime/network/child/container/browser/Cloud/Hosted，不自行Native；.git/m73-live-refusal內可寫新驗證資料但不覆先前紀錄。你不是唯一工作者，保護其他WIP。Root處理brief/review/handoff。

## 必須行為

1. subscribe首個terminal決定只settle一次；非明確拒絕、未知error、timeout/CLOSED在明確拒絕前仍失敗，不能靠後來denial翻成成功。明確拒絕證據不可被自有remove期間的正常CLOSED覆寫。不要只把explicit做OR而容忍所有矛盾。
2. 獨立sticky joinedEver：所有操作仍有效期間收到SUBSCRIBED都記錄，包含已拒絕/已settle、同步或microtask、移除中、remove完成前。不能因決定已settle早return漏掉；只要曾joined，refusal最後必失敗。除已確認拒絕後自有移除中正常CLOSED，未知/矛盾後續狀態仍failclosed。允許重複同一明確denial但不改第一次決定。
3. 原remove只執行一次、仍同位置await，原ok要求/例外保留；移除不成功、abort/owned20秒timeout不得成功。正常正向subscribe後續失敗仍fault/notify，原wait/read/timer/listener/close流程不重構。observations保持安全status/refusal/explicit/removal，不能因新鎖存隱藏原callback。
4. 保原20秒總期限/既有capacityFailure/error/診斷與權威界線，不加sleep/retry/timeout寬限。已完成移除並返回後任意晚到SDK事件不能回溯改已resolvePromise，本task不宣稱該保證；避免晚到callback改寫已完成證據或資源。若真SDK支持unsubscribe完成後繼續SUBSCRIBED，需另有證據再擴範圍，不在本task編造caller健康接線。
5. 新真factory有效RED：gate.subscribe(...,true)的remove同步CLOSED與microtaskCLOSED→ok，舊碼至少各自有效行為FAIL（不是import錯）。GREEN保持明確denial→remove ok成功；拒絕前CLOSED/unknown、先SUBSCRIBED、denial後同stack/microtask SUBSCRIBED、移除中/完成前SUBSCRIBED、bad remove/throw/abort/20s、未知拒絕/permission classification、正向訂閱後fault、close與diagnosticcallbackthrow等負向。不刪原assertions，不skip。fake SDK只測harness，不冒真權限驗證。

## 驗證與交付

依M級TDD，先RED後最小完整fix。跑M72最終57files1001 TS union＋新test/fulltype/lint/affectedformat/import/diff；Python81/產品1771與所有Native歷史保持，不為此重跑。保所有舊測試Source bytes。Root baseline .git/m73-live-refusal/protected-root-baseline.json保非owned/nondoc tracked、M72七與76records、M70九+105records、Original9prefix、Native13–17/cold/Rootprojections/M69四。既有來源行限例外不擴。

validation-final.json列每個實際命令/exit與rawlogs sha、Source兩檔freeze、初RED/所有ERROR不覆、inverse可證其他gate within/wait/close與所有舊Source byte保持、brief SHA與baseline核。不做review儀式或第二reviewer，Root一次正式review後同輪最多修finding。完成只代表task，不等於Native/60全站/Hosted/Phase8 PASS。
