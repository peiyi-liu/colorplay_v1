# M55 onboarding body 診斷審查

結論：ACCEPTED_SOURCE_ONLY。Root唯一一輪審查完成，未解finding 0；既有VM7 INCONCLUSIVE不回填，尚無Local60／Staging驗收或部署。

## 變更摘要

只在既有單次body read／canonical lexer／JSON.parse／原strict schema路徑附NON_AUTHORITY閉集診斷：stage與首因、top-level kind、十個公開key的presence/type、未識別key計數，以及code/error_code固定MATCH分類。TOKEN_SEEN不當top-level或值證明；原lexer早退後其餘UNOBSERVED，觀測故障UNAVAILABLE。無raw body、訊息、任意key/value、帳號或token輸出；原guard／次數／順序／CODE撤銷／lease／discount／PASS不變。

## 對應與範圍

WB4d工具診斷，部分對應AC-AUTH-001、AC-SEC-005、AC-PERF-003；不是容量PASS。四Source/test paths：capacity-onboarding-logout.ts（350行）、新capacity-onboarding-body-diagnostics.ts（218行）、新whole-site-capacity-onboarding-body-diagnostics.test.ts（332行）、既有whole-site-capacity-runtime.test.ts（562行未增行）。最後一檔只修三個計時fixture literal，未拆既有大檔以保修改最小；原497行onboarding test整檔byte保持。

## 命令與結果

最終`pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/whole-site-capacity*.test.ts`：33files／388tests PASS；原／新onboarding focused84 PASS、runtime21 PASS。typecheck、lint、global format:check、import-only、git diff --check與static全部exit0。Root以be38歷史Source僅記憶體載入，對20類synthetic body×11種正常／取消／重複／晚到／pending／拒絕lifecycle共220組actual factory比對；原snapshot（扣新metadata）、finalize、discount、bodyRead數皆相同。兩個synthetic92B控制不代表VM7原body。

完整packet `.git/m55-onboarding-body-diagnostics/validation-final.json` SHA89bb34230ac4898605288578313b09032877453b9b468cfd7d11d9e96b0b9cb6，53records／23checks已逐hash核。final freeze-v2 SHA b42f0789b0a17293696e09b090713d91b30ad78f8380a94d2205aeae65617079。Root final220對應最後Source hashes；`.git/m55-root-review.json`及root-protection-review.json保留review。

## 審查結果與保護

一項既有P2 fixture已閉合：舊expect按15次read，但be38原closure已14helper＋2metadata＝16次；Root獨立重現21項中1FAIL，核六依賴／fixture與be38 byte相同，准同case130→132、330→332、30→32。inverse patch精確還原，全部其他assertions／runtime／IO／closure不變。新增診斷無其他actionable finding。

初2RED、11個privacy字面衝突FAIL、初capacity387PASS／1FAIL、type／lint／Rootbrief formatFAIL、private static Rootdoc typoFAIL及重複import log拒寫資格全部保留，沒有追認初次全綠。新metadata改用unrecognizedKeyCount與固定MATCH，保原隱私regex，不隱藏欄位。2298個非owned tracked檔、45operator、M52其他檔／M53／M54與產品維持；Original七文件、真575959B handoff prefix、package／lock核保持。

## 風險與下一動作

VM7 actor0原92B wire body不存在持久化證據，其parser subreason仍UNKNOWN；server aggregate logs不能補原body。這項不擴session_not_found schema或任何403例外。下一exact新Source normalFF到隔離VM branch，另fresh VM／job執行原functional15＋15legs；不重跑舊job、不動Hosted／Production。七舊VM已stopped保磁碟；總US150、不升paid，VM8尚未建立。
