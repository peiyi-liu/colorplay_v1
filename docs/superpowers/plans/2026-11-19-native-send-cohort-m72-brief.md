# M72 — 12CPU 下的共同送出前準備與最後新鮮檢查

Root核准同一task1_implementer，Root唯一一輪review。base d2919dd46d4b6c84ac5bcd85cc293860eb472ca0。Owner已授權持續Local至60與Staging、US150、不升級付費；GCP實際CPU(allregions)全域0/12，16CPU方案客觀不可建立。M71只選既有16配置雖task接受，queued44343280274在runner0/未開始時已cancelled，無VM17。十六舊VM STOPPED/repo0；不可用改profile假裝16。

Native16功能15/容量4/15 PASS；truefresh60 send CDP251.44>250ms而INCONCLUSIVE。60 AuthCreated/ownershipKnown、尚未verify，healthVALID/parent無首因；相對VM15 click Node32.555/32.924ms相近、CDP144.828/251.44不同，未證網站失敗/M70或CPU飽和。原失敗和各時鐘不可重分類/混減。Root真age/cold核完，final1c99e835e155caf57c31c55a1465d1eb270e4a8489f9ba5ee07eb2a8b9d33d32與八inputs投影保。

## 唯一七owned paths

- .github/workflows/local-capacity-vm.yml
- scripts/concurrency/capacity-send-cohort.ts (new)
- scripts/concurrency/capacity-registration-ui.ts
- scripts/concurrency/capacity-registration.ts
- tests/contracts/whole-site-capacity-send-cohort.test.ts (new)
- tests/contracts/whole-site-capacity-registration-ui.test.ts
- tests/contracts/whole-site-capacity-registration.test.ts

workflow只把M71 selector16還原既有12、其餘bytes同；不改host contract/Native/backend。採用保守方案，不是純press：所有actualUi actors共同並行完成原visible wait/enabled/focus與DOM準備，全部allSettled成功後才release；burst每人保原新鮮完整readonly DOM predicate＋一次原生Enter。可證公開Playwright critical-path呼叫5→2（若計API邊界），不是時間/60通過保證。不可省最後fresh readiness、不能以準備後頁面不變當前提。

## 必須保持與失敗邊界

1. 每人15s從自己的準備開始到最後press完成，準備、全批等待與送出共用絕對deadline；不重開15s、不重試/延後逾時。clock非finite/倒退、abort/expired failclosed。release前同步核所有lease/actor/page/native tuple generation/current/期限；任何準備失敗或release前拒絕全批零press。release之後可能部分press已在途，保留原allSettled，不承諾交易式全送全不送。
2. 使用既有公開且同一可識別「傳送驗證碼」UI與原生press Enter，維持可信DOM click/真正CDP request timestamp、全部60同批、原request arm-first與監聽清理/全原M40診斷/native tuple/batch/scope/health/250ms/SLO不變。不能HTTP直呼/內部API/evaluate.click/DOM寫token/自造事件/預建Auth/交錯人數/抽樣重跑/關診斷以取巧。
3. 新helper只握有本cohort、一次性opaque lease/同actor object/page/文件世代與真來源綁定；不可從caller JSON重建。若保存ElementHandle須同元素、連線/可見/啟用/焦點/原predicate fresh重核，hidden/disabled/失焦/replace/navigation/generation drift拒絕，不在burst重新準備或聚焦。原有public current()不足以代替fresh DOM。opaque只是防工具誤用，不是產品Auth/權威證明。
4. actualUi物件與send函式identity須保持M40來源判斷可用，不能用wrapper ui換掉而令全部Native pairing UNOBSERVED。既有獨立actualUi.send直接使用方式維持原行為/原15s/原error identity；已prepared actor必須走一次性狀態，不能在reuse/closed時退回legacy再次送。custom fake ui仍可用既有介面，不冒稱真Native UI。
5. 擁有的handles/listeners/WeakMap entries須全部在prepare失敗、abort、release錯誤、成功後收束，不碰其他cohort；allSettled等完原自己工作。新cleanup不得掩蓋original exception identity；若沒有primary error但有實際未閉資源不能冒稱完整成功。不可動原registration ownership/OTP/mailbox/完整verify/complete/postLogin/readback/originalfinally，除最小共用準備與本helper收束接線。

## 診斷、行限與測試

準備階段不能新增不可定位黑箱：可在既有registration-observations report加入optional bounded安全準備摘要（schemaVersion/NON_AUTHORITY/NONE、固定phase/state/actorIndex/單一Node clock、首安全錯分類、allready/released/closed/pending），由owned ui.ts report schema與新helper共同定義；原report欄位與M40事件/counters全保。只enum/number/bool/null，不含URL/IDs/email/account/token/OTP/error message/stack；<=16KiB/最多60actor聚合。失敗與完整cleanup同樣可留摘要，不能只在成功factory return後有值。若不需新摘要但原固定診斷已足夠，明列映射給Root核；不得擴第八Source。

registration原504行，本Task准<=545，理由保原ownership與原finally/error identity同一主流程、只加共同準備與收束而不連帶重構；其他六<=500。若仍超界先報，不以刪assertion/縮排壓成一行。

先有效actual-caller行為RED，不能只缺export/import ERROR；保所有舊assertions/測試calls。fake Page/opaque native fake port可測，不開真browser/network/child/container/cloud。驗共同deadline/全準備失敗零press/全prepared後才arm與dispatch/原同一element與freshpredicate/失焦hidden disabled replace navigation跨page clone reuse closed/abort與handles釋放/原erroridentity/並行failure/40+60一次原生Enter與1request、5→2公開API trace。原standalone legacy/send/direct與customUi cases仍過。新摘要privacy/bytebound/failedprepare可見。

跑既有56files968 TS union+新增、不刪oldtest（workflow12的相關profile亦在原union），fulltype/lint/affectedformat/import/diff/Source freeze；Python/產品Source/81與1771結果保持，不重跑。Root baseline .git/m72-send-cohort/protected-root-baseline.json保所有非owned/non-doc tracked、M70九+105records/M71十六records/Original9prefix/M69四/Native13–16三十二inputs及Rootfinal/cold實際輸出。你不是唯一工作者，不得revert他人內容。worker不寫docs/Git/deps/runtime/網路/child/Cloud/Hosted，不准自行Native。Root負責brief/review/handoff，原FAIL/ERROR/RED不覆寫，本Task不等於capacity PASS。
