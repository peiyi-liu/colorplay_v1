# M82 Root 唯一審查：Source 候選通過，真 Local DB 待 CI

## 變更摘要與範圍

Root 是唯一 reviewer，Round 1 的三個 findings 已在同一次往返修正。這是 Source 候選放行，可保存 exact candidate 並建立 draft PR 執行 clean Local DB CI；不代表 task、完整60人容量或 Staging 已通過。

Base c94a624b02c7c861f5545e6e41c2d202e71cd056；21檔 final freeze 556f1216dee64010d0e0f4a55f316230b2971a9e99dabee976d09a74001c8826；worker packet 27ce3c1b98b551283b2059577ae74a2c3a7b886714792274a2b71dce6e1481ad；Root clearance b9b9da0d628fb91fae02a8c10d616bcd8fe087de8da0ef3227ea376a2e006577。

正常與逾時作答的 answered_count 改送 owning Host 的 private progress topic；shared join／roster／participantCount／所有 phase 保留。Host 的雙 channel 共用原生命週期、retry budget、版本協調器與 cleanup，真 state 確認角色後才附加 progress；兩個 ACK 完成才 connected。Student 仍只訂閱 shared。答案、計分、交易、冪等、關題與獎勵 body 未改。

## 對應 AC

對應 AC-PERF-003 與 spec02 §11 的 Private Realtime／DB SSOT／RLS 邊界。AC-PERF-003 仍待完整原15 legs／60人真 Local，不能由單元測試、加密備份或 Source 審查推為 PASS。

## 修改檔案

| 範圍      | 檔案／效果                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB        | 20261119000100_live_host_answer_progress.sql、130_live_host_answer_progress.test.sql；非公開 live_private helper、Host receive-only policy、兩個 sender callsite與真 pgTAP來源                |
| 產品      | use-live-session.ts、live-session-topics.ts；延後角色確認、同組雙訂閱與原版本協調                                                                                                             |
| Native    | live-connection-diagnostics.ts、staging-capacity-browser.ts、live-topic-ack.ts；exact session／ref／generation雙ACK；capacity-live-game、teacher-live、舊capacity-browser-actor的Host模式接線 |
| Tests     | 新topic／hook／真SDK integration、ACK／decoder／頁面／actor controls與窄fixture抽取；原兩個hook test bytes未改                                                                                |
| Root docs | 技術契約、brief及三個ownership補充、Staging release effects/gates、handoff；既有無關WIP不納保存範圍                                                                                           |

共21 frozen paths、實際19 Source/test有變更。唯一既有超500行例外 capacity-live-game.ts 是564行、上限565；其餘各檔≤500。未改 lock、deps、歷史 SQL、Linux core/package/profile、原等待或性能門檻。

## 命令與結果

- 同版受影響 Vitest：114 files／1643 tests PASS；focused 3 files／74 tests PASS。115 requested中的既有 integration 依原unit config排除，未假稱執行。
- 真SDK檔另執行9個純離線拒絕判讀 controls PASS，唯一真SDK case 由 runner pattern 未選取，Source沒有 skip。真 pgTAP／SDK integration 均 NOT_RUN，須由 draft PR 既有 local-database job 真 start/reset/seed 後完整執行。
- typecheck、lint、owned format/import/diff、AST與static final exits全0。Root重算137 records／55 checks的實際 bytes/hash，並驗21 frozen files、20017 protected inputs／22 symlinks／兩handoff prefixes，原目錄WIP保持。
- Root獨立用小fragments將目前13個historical檔還原比較原Git blobs，另核submit全文只有兩個sender替換、teacher一行與舊CLI呼叫inverse。四個 actual Source probe 原錯配均修正；未額外重跑已綠full suite。
- 歷史單元6FAIL、R1有效9RED、lint及私有工具失敗全保留。R1六檔反推未commit v2 bytes的三次工具定位失敗已停止，該項 NOT_PROVEN；以六檔old/new SHA、其餘15相同、Root讀修法與實際controls驗證，不挪用舊PASS。

## 唯一 R1 與判讀更正

三項已清：late Host create/attach 的同步與cleanup後例外保留原Error、走原fail-closed；非法大小寫topic及非string join_ref不能假冒雙ACK；SDK拒絕需明確permission CHANNEL_ERROR且持續拒絕late SUBSCRIBED，不能拿網路逾時作授權證據。

Root另查固定官方 Realtime v2.112.6／b19bbb54ed400387072e389f4410624abd36a9fc：BroadcastHandler write=false是noreply，所以先前要求broadcast send必回error的推測已撤回；send無ACK只作transport觀測。權限證據須結合真pgTAP RLS拒絕、原Host訂閱後續合法RPC進度收件／無forged payload；Presence unauthorized則明確error。原finding與更正均保留，仍同一輪審查。

## 風險與下一步

現在只允許 exact Source正常FF推既定停用Vercel部署的Local branch，draft PR取真DB證據。真DB／SDK尚未通過前不建VM25；全原15 legs／60人未通過前不merge／deploy Staging。Native24仍是8/15／40人q5 INCONCLUSIVE與實測rate拒發，不能追認本候選容量已修好。

全部24舊VM停止、2400GiB磁碟留存，永久刪除待批准；US$150、不升級付費，費用預留／磁碟假設不是invoice或硬cap。Staging OTP仍30/IP/5min、SMTP provider quota UNKNOWN，設定或Hosted load另按具體gate；Production禁止。Source或artifact若實質改動，須標新候選、重驗受影響項目，不重跑舊失敗run冒充新證據。
