# M56 onboarding 官方modern契約審查

結論：ACCEPTED_SOURCE_ONLY；Root唯一一輪review、actionable findings0。新增官方modern錯誤格式分支，原VM8／VM7仍INCONCLUSIVE，不追認原body或60人PASS；尚未執行此Source的Native或Hosted。

## 變更與對應

WB4d工具修正，部分對應AC-AUTH-001、AC-SEC-005、AC-PERF-003。原嚴legacy error_code／code:number403／msg保留；新增獨立strict modern，僅兩必要canonical keys：code精確session_not_found、message string<=2048。任意順序可，mixed／未知欄位／duplicate／escaped／錯碼／user_not_found及其他403仍拒。單次既有body read＋JSON.parse，按key家族只呼叫對應strict schema.safeParse一次。原owned lease、request tuple、CDP byte accounting、post-registration login與Root proof、撤銷／pending／late／discount／health／SLO皆保持。

依據官方Auth2.192.0 commit5acfdea63bc033b79cfb0ebb08a1d4696d942aac確有雙格式、安裝SDK auth-js2.110.2預設API-version2024-01-01及VM8實際code/message TOKEN_SEEN拒絕。官方Source證明契約缺口，不是原actor0 wire body值已觀測；完整實測結論見VM8報告。

## 檔案與核准metadata hunk

三owned paths：capacity-onboarding-logout.ts（364行）、新whole-site-capacity-onboarding-modern-contract.test.ts（325行）、whole-site-capacity-onboarding-body-diagnostics.test.ts（332行）。最後一檔只在message先／error_code後mixed case的標題與一個presence期望：看到第二key才能判mixed，因此error_code由UNOBSERVED改TOKEN_SEEN，仍LEXER／KEY_UNKNOWN／top-level UNOBSERVED／拒折抵。其他assertions精確inverse可還原；原497行test raw與M55 pure helper／固定enum不動。modern的codeValue OTHER、errorCodeValue ABSENT保持M55既有語義，無raw body／任意值輸出。

## 驗證

真actual exported factory兩個modern順序最初2 assertion RED（finalize0≠1）保留；新增actual request observer/CDP fakeport控制證明HTTP403 counter先1，完整後續登入後finalize才折抵成0且單body read。容量tests34files434PASS；其後僅新test的tuple／callback braces等價style修正，原lint4錯誤保留，freeze-v2最終直接3files130PASS＋typecheck/lint/globalformat/import/diff/static exit0。434是test-only style前的完整檢查，不宣稱凍結後重跑434，不把重跑數量相加。

Root獨立220組M55 exact47f2812 legacy／原拒絕／lifecycle parity皆同；另132組modern正負向、exact tuple／錯status／generation／缺登入／取消／pending控制皆PASS。Root首次baseline載入器因M55新增relative import、require錨點不對而在任何case前失敗；只修private loader錨點、核pure dependency與M55 byte相同後220通過，未修改產品或Native。

worker packet.git/m56-onboarding-modern-contract/validation-final.json SHA9ef746356ce573cd577adac52029f13c5292f9afff8c725dd6b1cd3f039dd840，36records／15checks已逐hash核；freeze-v2 SHA92f1252443679b34dc461f3f4bd27684b57d063eb5c697ea14bf6492c572db82。Root .git/m56-root-review.json SHAbe748854574d4cad9e6528195e142d52ca6a5f49e3910bea761ae7ce6b648f0e、root-protection-review.json；2303非owned tracked、operator45、歷史packet、Original七文件／真575959B handoff prefix／package／lock保持。

## 風險與下一動作

這是新格式精確契約，不是一般403白名單。VM8實際原code值仍UNOBSERVED，需要exact新Source的fresh VM新job才知實際是否可接受。八舊VM均已stopped、runner0／保磁碟；VM9只offline name-only adapter八fake PASS，未Create。下一正常FF推隔離VMbranch，維持Vercel opt-out與原全矩陣／failstop；不重跑舊job、不動Hosted／Production。US150、不升paid；WB5尚需獨立Hosted移植與確切資料窗口。
