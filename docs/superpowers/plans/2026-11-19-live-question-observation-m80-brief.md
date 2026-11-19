# M80 — Live 題目顯示失敗的完整被動診斷（單一 Local task）

Root已核方向與ownership。既有授權允許反覆有界實作／Root唯一review直到完整60人Local通過，再整合Staging；本task仍只離線工具實作，無Cloud/Hosted執行。不得把前序Native22 INCONCLUSIVE當網站根因已確定或容量PASS。

## 基線、真證據與 ownership

只在Recovery /Users/guanyucheng/.codex/visualizations/2026/11/12/01a1ce8a-3274-7cd1-821e-b0ae34d1d062/colorplay-live-recovery；base b1463f54137155887234faac271c05e6a05bdc9c。Root為唯一reviewer，同一worker實作。你不是唯一工作者，不還原他人修改；Original、獨立operator、M79全部packet、Native1–22真證據全保護。Root owns briefs/review/handoff/private Cloud helpers，worker不可改。

Native22 run44416228602 functional15PASS/capacity8of15PASS；40leg wcr-261118-8860818da906 entry55.614/login70.951ms均<250/80HTTP200/readback40/cohort40closed/pending0，M79已真驗有效。40人自然student/teacher work完成，Live39學生join/ACK、前4題完成；第5題全39在PROMPT_VISIBLE失敗，Node QUESTION_STATE/COUNT/OPTIONS全通，未進答案dispatch。first actor1 ordinal3665 at151563.60043ms/signalfalse；原stage內有題號與模式提示兩個wait，原rawmessage未保存，未知哪個predicate或產品UI view。healthVALID/無collector異常、PSS7446117376B<12GiB，wrapperTimedOutfalse，10parentsclosed/residue0。Root真age4739files＋cold4666／4entry與4Live byteparity已核，final d3ac5a6e7015124b11a49e96855eefc0d8d67bd65d2cd37938546553cc0af47a。全22VM strictSTOPPED/repo runner0，不重跑／重啟舊VM。

僅owned六Source：

- scripts/concurrency/capacity-live-student-question.ts
- 新 scripts/concurrency/capacity-live-question-observation.ts
- scripts/concurrency/capacity-live-game.ts
- scripts/concurrency/capacity-live-diagnostics.ts
- tests/e2e/helpers/live-connection-diagnostics.ts
- scripts/concurrency/capacity-journeys.ts

僅owned四tests：新 tests/contracts/whole-site-capacity-live-question-observation.test.ts；既有 tests/contracts/live-connection-diagnostics.test.ts、tests/contracts/whole-site-capacity-live-diagnostics.test.ts、tests/contracts/whole-site-capacity-journeys.test.ts。第四檔明確核准，必須實測真journeys.stop接線與drain/writer一次性，不能只測helper自洽。不得改產品src、其他舊test、DB、deps、workflow、Linux package/policy/profile、M57/M65/M69或Root資料。若必要API無法在此範圍完成，先報Root具體path，不繞過可靠性。

## 保持原行為與診斷邊界

原 waitCapacityLiveStudentPrompt 前四參數保持，尾加 optional callback即可；精確分類COUNTER/MODE_TEXT的ENTERED/RETURNED/FAILED，callback throw隔離。原locator/exact/first、原兩個await、既有20秒timeout／remaining計算與位置原樣保留，不重算續期、不加grace/重試/新poll。原outer PROMPT_VISIBLE不刪、不換原error identity，不改API calls、Node gate、答案arm/click/完成/計分與cleanup錯誤優先序。既有assertions不刪弱，提供原關鍵locator/timeout/dispatch AST語意對照，無行為更動的區域用完整inverse/AST實證。

原Node gate公開state只投影state/stateVersion/currentPosition/questionCount/questionDisplay/isHost/waitingForNext；不保存session_id、question文字/options/answer、auth或任意provider body。區分Node SDK state、browser已收到state、DOM呈現三來源，不能用任何一者冒充React Query cache。每次失敗最多一個固定readonly UI projection：解析題號/總數與固定mode提示、作答中／已作答、feedback/error/waiting/loading/connection可見布林或封閉enum，各欄OBSERVED/UNOBSERVED/UNAVAILABLE，不把不可讀當false；device題文只能保原wait已匹配結果，不能為診斷另讀題文。只固定允許selectors/結構，不讀任意DOM、任意text、URL、輸入值、截圖或token。讀取前後Node時間界線分別保留，不稱原子快照，不跨CDP/Node時鐘相減。

重用 live-connection-diagnostics 既有一次response.json＋stateSchema.safeParse結果，不能再讀body／再parse／新增request。對目前被Root綁定之genuine page、精確Supabase origin與只留記憶體session/generation匹配後，保存latest已接收公開版本/position/mode與ordinal；foreign/late/跨generation、前後nav漂移不採納，拒絕但不漏掉原task的收尾。不因缺資料而回填expected值，缺即UNKNOWN/UNOBSERVED。普通caller不能輸入一份schema JSON就獲native/page ownership，來源綁定沿既有真runtime邊界，不發明另一authority。

## Async ownership／唯一writer

完整UI失敗視圖需要第六個Source journeys，已核准。由journeys建立owner並傳窄port到game，stopAccepting/drain/pending與診斷handoff只管理被動資料，不執行業務。失敗時新read立即登記與處理rejection，原error沿原game catch/finally即時往外傳；不得等待診斷來延後或救原wait。

實際原順序game finally writer早於native.close；本task只在有owner的此接線將同一固定 capacity-live-diagnostics檔名交owner於drain後單次best-effort寫。不得先寫wx再覆寫或新增另一writer檔。既有直接/無owner caller須保原writer行為與既有tests；普通回傳型別與原成功判定不變。journeys.stop先停止新診斷工作，保原client/observer/native.close關閉操作與錯誤覆蓋語意；無論close成功失敗，finally必須await已登記UI/原response工作全部settle，再seal/write，pending0才報closed。late結果可丟棄，但promise仍要drain；不能以吞reject／不等待當成功，不能遺留背景task。無法settle走runner原cleanup deadline UNKNOWN，不能新增grace/假closed。writer/觀測錯誤不得替代原error或造成原成功案例FAIL；觀測欄位誠實UNAVAILABLE。

每actor最多一個失敗視圖、最多60，原512KiB全診斷cap保。新record建議<=2048B、總<=128KiB，實際若需更大請先以真欄位大小證明；上限不得由caller任意指定。超限誠實UNKNOWN/UNAVAILABLE，不截斷json假完成。新Source/helper及tests<=500行；現有game542與journeys577僅准owner建置/窄handoff/drain wiring例外，分別<=565/<=610；diagnostics494僅新增schema/保留map窄接線可<=525，理由是保既有有序ring與單一snapshot可審查。狀態/schema/新追蹤實作集中新helper；不可靠壓縮格式、拆無責任的碎片或廣泛重構。超界報Root精確必要性。

## TDD與交付

任務brief已含必要spec摘錄，不重讀全spec。先原exported/caller有效RED，再測counter failure、mode failure、正常兩wait與原trace/20秒不續期；原error identity、fail前0答案dispatch與callback throw隔離。真journeys.stop caller控制：UI pending直到fake browser close才reject、stop不在pending未settle時回傳closed、close失敗仍drain、writer在drain後僅一次；保持原error/cleanup優先序。回應來源正負：同源同session/page/generation、foreign/late/clone/替換/abort/close、browser received與DOM不一致、缺欄/未知view/Proxy/getter/敏感字串均不輸出、上限與overflow、NO added request/parse/click/poll、既有clients/gates正確close。這些fake controls只驗工具行為，不稱Native或provider證明。

必要affected既有Live/whole-site suite、full typecheck/lint、affected formatting/import/diff/static PASS；不跑全域pnpm acceptance、不重新跑產品完整phase。保全部原RED/FAIL/raw與版本，最終packet列Source freeze/行數/全部checks/Root baseline immutable核、Original9/prefix、M79/Native22packet無修改與closed qualification。Root唯一一輪review後worker freeze/idle，不commit/push/Cloud/run/Hosted。Root之後保存新exactSource並fresh full15；不能只跑一個40 case或重跑舊run。

對應AC-PERF-003只保原門檻，完整40/60與五API SLO仍待真新Native；本task不宣稱全站／Hosted／phase PASS。預算US150/noPaid/不碰Production，未建立VM23。
