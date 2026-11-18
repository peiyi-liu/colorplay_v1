# M74 — 投影幕／裝置模式的學生題目契約與容量工具一致化

Root授權同一task1_implementer，Root唯一一輪review。base e9fa16a1bc4088000ec658eee5f57aab01819012。Owner允許持續Local全站60與Staging、US150、不升級付費。本Task只修容量工具對既有產品規格的誤解，不改產品或預設顯示模式。

## 確認的來源與證據

spec/05-game-mechanics.md預設screen_only。既有LiveSessionState.questionDisplay為screen_only/device；canonical get_live_session_state對非host/screen_only剝prompt與option.text，沒有openAt才釋題的分支。functional teacher-live.ts同樣公開教師UI，學生依題號與答案按鈕作答，不強求prompt。capacity-live-game.ts卻在QUESTION_OPTIONS無條件要求prompt，此契約不一致已證。

Native18 sourcee9/run44356453255：functional15與capacity5/15PASS（匿名3/10/20、truefresh40/60）；existing3 wcr-261118-099ddcbaaf3a INCONCLUSIVE、後九未跑。M73 OUTSIDER_REFUSAL returned，host start/dialog/question1intent過；兩學生STATE/COUNT returned後OPTIONS立即失敗，尚未進PROMPT_VISIBLE。Live檔e7caf43e40ecb10542b20aa707f9de5b2424cbbb765c82b2c8d3b5fce09b560f、SSH/真下載bytes一致。原wire未存，不能追認實際q欄位。

Root .git/gcp-vm18-root-dump-mode-read-v3.json實際從已保存dump解碼owned session三表：questionDisplay screen_only、currentPosition1/statequestion_open，兩participants active/eligibleFromPosition1。固定原DBimage/無網路readonly128MB一次性pg_restore --file=-，不連DB/未restore，helperremoved/原8stopped/vol與dumpSHA cf29cb12261a9cb86f41cff9b1d6e21c150a82755fb592874e0c72ed54f57f1f不變。v1/v2診斷工具失敗保留，v3才PASS。Root真age2293files221821456B/cold2232/8stop/2DB127表31roles/3vol全部hash已核；原hold17:37→17:47自然、job17:47:03failure/runner0，正常Stop已送待GooglestrictSTOPPED。本Task不把該輪改判。

## 唯一五owned paths

- scripts/concurrency/capacity-live-game.ts
- scripts/concurrency/capacity-live-student-question.ts (new)
- tests/contracts/whole-site-capacity-live-student-question.test.ts (new)
- tests/contracts/whole-site-capacity-live-game.test.ts（僅合法fixture補齊）
- tests/contracts/whole-site-capacity-live-lifecycle.test.ts（僅合法fixture與新增readonly UI查核所需窄fake接線）

game與lifecycle既有行限例外可<=545：game原542/lifecycle原523，理由保持原Live全流程/診斷與原故障測試可對照，helper抽出後能減則減；其餘三<=500。不得壓成一行或刪舊assertion。舊fixtures缺questionDisplay/question.position且只有1option，補明確device、本輪position、至少2唯一非空option IDs；保原assertions/操作trace/錯誤注入，若某assertion真依賴非法fixture先具體報Root，不擅刪改。這不是改產品schema。

## 實作邊界

1. 純helper同步檢查既有公開state：mode只接受screen_only/device，缺／未知拒絕，不預設；question_open、currentPosition與question.position皆為本輪、questionCount等於原綁定數、isHost=false、waitingForNext不為true、question存在、options>=2且ID非空唯一。沿用repository strict schema，不從host補學生payload、不取答案或前端算權威分數。
2. device保原非空prompt及真UI prompt可見；screen_only要求prompt與所有option.text為undefined，意外洩漏也拒絕，不改server來補送隱藏字。使用已有option ID／index作答，保原每人單次choice規則。不能把預設改device、切教師UI來躲screen_only、忽略waiting room或缺題。
3. Native readiness只用既有公開UI：題號「第 n / total 題」；screen_only精確「請看投影幕作答」，device原prompt；原答案群組role/button仍可見、數量與publicOptions相符。新增readonly查核必共用原stage剩餘20s：題號＋mode文字共享原PROMPT_VISIBLE預算；first option可見＋count／額外button檢查共享原OPTIONS_VISIBLE預算。finite/expired/abort拒絕，不重新開20s、不sleep/retry/寬限；原後續click／response／finished與a.measure原樣保。若全合成更短單20s，需明列無擴期限且原stage trace保，不任意增加等待。
4. API模式只做state/mode guard與原submitAnswer，不建立Locator或等UI。原20題、questionCount綁定、position、feedback/ranking/advance/finalize/completed、原idempotency/權限/outsider/M73/cleanup、所有health/barrier/SLO不變。診斷保原各stage/error/return，helper不能變新不可定位await；不新增秘密/rawquestion或error文本到報告。
5. worker不寫docs/Git/deps/runtime/network/browser/child/container/Cloud/Hosted；只可新增 .git/m74-live-question 驗證資料，不覆歷史。你不是唯一工作者，不revert其他WIP。Root負責brief/review/handoff/精確Source和之後fresh Native。

## 測試與交付

先有效actual caller RED：用合法screen_only公開student state（無prompt/text、2options、position/count與mode正確），現原game確實卡QUESTION_OPTIONS，非缺export/import；修正後須走原Native click／API submit及完整20題收束。newhelper正負：screen_only/device、mode缺失/unknown、device缺prompt、screen_only洩prompt/text、nullquestion/waiting/host/wrongstate/position/count/duplicate或過少options；Native題號/文字/count mismatch、期限在新查核間共用、abort、原throwidentity/diagnostic trace；API不觸Page。保原M73拒絕41cases與原所有舊assertions。

跑M73最終58files1042 TS union＋新test、fulltype/lint/affectedformat/import/diff/static；Python81/產品1771與所有Native原結果保留，不重跑無關套件。Root baseline .git/m74-live-question/protected-root-baseline.json會記nonowned/nondoc tracked、Original9prefix、M73兩/37records、M72七/76、M70其餘、Native13–18/Rootcold/projections/三個auxdecode結果、M69四與Root只讀m74-provenance-samples。新owned舊Source另外historical基線，current按finalfreeze，避免宣稱owned current不變。validation-final列實際commands/exits/raw SHA、所有FAIL/ERROR、五Sourcefreeze、舊fixtures最小diff與舊assertion保、game非必要段落inverse。

只一輪Root review，不另agent/reviewer。本task是測試工具契約修正，不是產品/Native/60全站/Hosted/phase PASS。
