# M24：Functional health 安全診斷唯一 Root review

**ACCEPTED_SAFE_DIAGNOSTICS_PENDING_NATIVE**。Root唯一一輪，初兩個P2已同輪修正，未解0。base3bc4466eb22929ffc449355aab723f30ab8b5611；對應WB4／AC-PERF-003前置觀測，非容量或phase PASS。

## 變更與修改檔案

exact8Source/tests：新增functional-health-diagnostics.ts與直接tests；functional-health.ts、business-diagnostics.ts、functional-journeys.ts；原health／business／recovery三個contracts tests。新閉集schema／有界collector將原unexpected、pageErrors、unmatchedConsole、unprovenNetworkLogs、pendingErrors分開並保總和。原counter增量、37個原if條件、endpoint/resourceCode與expected分類保持，只新增不可用時收緊available。

最多256events，記step／page與request ordinal／閉集branch及endpoint family／status與network code；公開approved artifact精確位置只留ordinal/line/column作hint。無rawURL／message／stack／body／帳號／Env／token／低熵錯誤hash；未知固定UNKNOWN／OTHER，無raw fallback。沿原600/wx stage、before-close與cleanup journal落盤，writer／abort／late／overflow不PASS，失敗操作原error identity保持。before snapshot同步取health/details，避免關閉期間時點不一致。

## 唯一審查與驗證

Root兩個獨立actual controls初確認：dispose後saved loadingFinished成功200經forget未封fence；OBSERVED/null components仍被schema與actual stage接受。只補forget touch與OBSERVED非null guard，保UNAVAILABLE/null fallback，新增三個actual/schema controls RED→GREEN；Root逆向兩個精確helper變更重算v1 raw SHA吻合，其餘5owned raw不變，另外兩tests追加。這是同輪修正核驗，沒有第二review或產品修補。

Worker最終39files507tests、全域lint／typecheck／format／import／static／diff全0；Root4files56tests（1.16s）與上述兩獨立before/after controls通過。v1 packet原52records保留且全SHA核，final74records／8Source／latest brief全核；1792unowned actualGit blob與operator44核符，原7protected與handoff575959bytes prefix保持。初RED、typed fixture／lint／type資格修正均留存，未skip、刪斷言或放寬timeout。

三個有理由行數例外：health559≤560，就近instrument保判定；pure protocol508≤510，補必要shape/fence而保同模組；journeys501，保同步before snapshot。其餘≤500，無第9檔或擠行。符合AGENTS超500須明示理由。

v1 packet45f80aab47855eaa680e16e76f0902bb5e3aef9d0bd1f245974feeec643891b3；final ed9b73eefd06848f078053851d9e57b5ef3504b442125e8eab724399e0d8185d。Rootreceipt f30621a6e13cee362dc8260cf1b8487a7eb833efb12944184d240dc9d5c5f202。

## 限制與下一步

Native18前14stages實際PASS但最後health unexpected1 FAIL，具體事件仍UNKNOWN，不用合成控制推測根因或回填。final Native18 custody72ffbc4e…保6Auth及全部DB/volumes/media，未restore。M24只觀測工具接受，新診斷尚未真Linux執行。

Root只exact11paths（8Source/tests＋brief／本report／handoff）cachedcheck／commit／clean，核specialremote仍3bc後正常FF；新Source／push／attempt1正常six-person→15legs，不GH rerun／0business gate。任何非PASS停升級、保資料。原WIP／G8停止85／主機US$0與US$5 cap／Hosted／Production／真寄信NONE保持，40/60未驗。
