# Task4 有限重連與可操作恢復

## 摘要

在獨立 clone `/private/tmp/colorplay-live-task1-ch5xftfh`、branch `codex/live-recovery-task4` 實作；base `c000d47bc54d681d76bbdb82894910ecaf3afed1`，初版 code `0ec39eec9f66a2131a3ab228ecaf40dac1424d08`，**最終被測 code／App `159b38387eac3cb80a0c57e8eaf06fc08a3326a6`**。首次 jitter 0–1500ms、每輪最多兩次自動重連（500／1000ms＋0–250ms jitter），跨 SUBSCRIBED 不重置；明確手動操作才開新輪，連點去重。只有 removeChannel 回傳 ok 才能替換，其他結果保留同 stale channel 供手動重試；status／broadcast／異步移除皆有 generation fence，dispose 不建後繼 channel。

新增 reconnect／reconnecting 與安全 connectionBlocked，保留原 connectionStatus。學生及 Host 投影各有自身恢復控制；明確 Auth／permission 拒絕走既有拒絕畫面，未知錯誤維持有限重試，不輸出原錯誤。手動只重建 transport＋讀 state，不呼叫 join／answer／finalize。Task3 真 read 協調、query retry／錯誤、答案／phase、20秒／800ms／RLS 與後端 mutation 不變。Root 唯一 review 最終 findings open0，Task4 **僅 Local 範圍 ACCEPTED**；本次最終 HEAD 僅新增此報告，Local 證據綁159b，不以文件 SHA 冒充被測 App。

## AC

AC-LIVE-002／005／006／007／008 的有限重連、權限拒絕與後端衝突處理關聯。Local controlled channel fault 不等同實際 WiFi 斷線；不構成 Hosted、真人裝置 AC-LIVE-012 或完整 phase 驗收。

## 檔案

- `src/features/live/lib/live-subscription-lifecycle.ts`／`.test.ts`：有限預算、嚴格移除、手動去重、generation／cycle fencing、拒絕分類及 dispose。
- `src/features/live/hooks/use-live-session.ts`／`use-live-session.recovery.test.tsx`：既有真 read scheduler 整合、恢復後 authoritative response、舊 callback 與無額外 mutation。
- `src/features/live/components/live-connection-recovery.tsx`／`.css`：共用 secondary 恢復控制；`pages/live-session-page.tsx`／`teacher-live-session-page.tsx`／`live-recovery.test.tsx`：學生（含全螢幕結果）及 Host 投影與既有拒絕流程。9個 source／test 檔均小於500行。
- 本文件：獨立 report-only commit；不改 runtime／環境／產品。

## 命令與結果

Node24.18.0；命令前置 `PATH=/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin:$PATH`；Git 使用 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`，沿用既有依賴、無擴 heap。

1. RED→GREEN：舊碼 removeChannel resolved error／timed out 仍建替代 channel，兩個 public hook RED 修正；學生／Host 缺手動控制與拒絕畫面四個 page RED 修正。初版新增25tests。
2. Root Local proof 後發現同輪 race：第3次耗盡預算的移除尚在途時手動恢復，舊 continuation 清掉新輪 busy。Deferred RED 實際得到 reconnecting=false；159b 以 generation／cycle fence 修正。新增1test 驗移除完成、1499／1500ms jitter 及延後 SUBSCRIBED 期間 busy 不被覆蓋，連點不移除新 channel 或增開輪。`pnpm --config.verify-deps-before-run=false exec vitest run src/features/live/lib/live-subscription-lifecycle.test.ts src/features/live/hooks/use-live-session.recovery.test.tsx src/features/live/pages/live-recovery.test.tsx --reporter=dot`：3files／26tests PASS；root 獨立同26tests PASS，finding resolved。
3. 最終 `pnpm --config.verify-deps-before-run=false exec vitest run src/features/live tests/contracts/live- tests/contracts/staging-capacity --maxWorkers=2 --reporter=dot`：51files／519tests PASS（20.58s，exit0）。完整 `pnpm --config.verify-deps-before-run=false lint`、`typecheck`、受影響檔 scoped Prettier／git diff check 皆 exit0。初次 lint 的測試 callback 型別及樣式已修，最終全綠；新增總數26tests。Root 初版獨立51files／518tests PASS，159b 僅同輪 race 最小核對，未宣稱另跑完整519。

Root 執行的 Local 證據（所有原件保留，各 run report 有清理及精確結果）：

| source | run／安全報告                                                                                             | 結果                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0ec    | [正常3 c4436c](/private/tmp/colorplay-local-task2-073tfjwo/runs/c40-t4n-261114-c4436c/report.md)          | PASS，31秒／3rounds各2unique，獨立cleanup0                                                                                              |
| 0ec    | [controlled 3f7acb](/private/tmp/colorplay-local-task2-073tfjwo/runs/c40-t4r-261114-3f7acb/report.md)     | PASS，34秒；feedback比較不足另補強，不覆寫原proof                                                                                       |
| 0ec    | [補強063516](/private/tmp/colorplay-local-task2-073tfjwo/runs/c40-t4r2-261114-063516/report.md)           | PASS，34秒，直接比較myFeedback／stateVersion，獨立cleanup0                                                                              |
| 159b   | [正常3 6dc52a](/private/tmp/colorplay-local-task2-073tfjwo/runs/c40-t4v-261114-6dc52a/report.md)          | PASS，32秒／3rounds各2unique，p95 10／19／22ms，health／outsider／獨立cleanup0                                                          |
| 159b   | [controlled 193dde](/private/tmp/colorplay-local-task2-073tfjwo/runs/c40-t4vr-261114-193dde/report.md)    | **FAIL保留**：恢復／衝突通過，最終unknown console1；根因UNKNOWN                                                                         |
| 159b   | [controlled診斷ac97ef](/private/tmp/colorplay-local-task2-073tfjwo/runs/c40-t4rd-261114-ac97ef/report.md) | PASS，34秒／7steps，3phases直接比myFeedback／version；Host兩tab同version→1ok＋1STATE_CONFLICT，3rounds各2unique／outsider／獨立cleanup0 |

159b 正常3 receipt SHA256 `7746d97c0263e40347f9b7919334d273bfef4389b231fd092af7b1db173e752c`；最終 controlled proof SHA256 `9938689c7098caf5ad548658b85f06a50cb69dbc30b9364ccf17bc4585d6cfe4`，見[validation.json](/private/tmp/colorplay-local-task2-073tfjwo/runs/c40-t4rd-261114-ac97ef/validation.json)。3個 headless contexts＋同Host context 額外page及SDK outsider；lobby auto1、已答question_open auto2、feedback耗盡後手動連點僅一輪，同session／question／deadline／answer／feedback不變，DB與join／answer／finalize無重寫。Host衝突使version／position只前進一次。獨立清理run資料全0，既有teacher Auth1／shared-IP1保留、lock移除，保護hash均true。安全診斷新增 intentional-close／injected-fault console 豁免使用數均0；唯一console為預期Host400，未知仍FAIL。

## 風險

193dde unknown console1 在後續被動診斷未重現，**根因仍UNKNOWN，不能說已修或改判原FAIL**。Task3 原20人偶發FAIL同樣不由本次重連工作追認修復。Controller 可在移除失敗時阻擋替換，不能宣稱未獲ok時遠端已清除。證據只涵蓋本Local／瀏覽器版本與受控channel fault，不代表真網路／裝置／Hosted可靠性；正常capacity health gate未放寬。未做Task5、Hosted／Production／push／merge／deploy；實作者未自行操作Live／build／runtime，後續由root統籌。
