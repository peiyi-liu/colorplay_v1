# M52 onboarding logout Root 唯一審查

## 結論

ALLOW：有證據的單筆註冊後 local logout403/session_not_found 可精確分類；原註冊 gate／Root readback／250ms／資源與安全 guards 不變。這是 WB4c 工具修正，對應 AC-AUTH-001／AC-PERF-003 測試支援範圍，不宣稱完整 AC、Local60、Hosted或 phase 驗收通過。base0270cac80871a0bde3039f05acee03d7c2969e3a。

## 變更與同輪 finding

6 owned paths：capacity-request-observer、capacity-browser-runtime、capacity-registration-ui、capacity-registration-final-diagnostics、新 capacity-onboarding-logout、對應 focused test。實體 factory-owned actor/context/page/observer lease、註冊成功generation、唯一精確logout POST/scope local、403/session_not_found、bounded4KiB完整CDP body、UI登出與後續登入邊界齊備後，僅在原Root readback成功路徑的finalgate前分類一筆；原raw HTTP counter保留，expected事件另記。未知/其他403、重複/redirect/late/取消等保失敗；無新增HTTP、重試、session或teardown等待。

Root初review唯一P2：raw literal-key regex無法阻止escaped duplicate key被JSON.parse last-wins覆蓋，兩反例實際finalize1/預期0。已同輪以完整JSON string-token掃描、canonical/unique欄位資格在parse前拒絕；有效RED2→GREEN，msg中像key的escaped文字正向保留。P2 CLOSED，未解finding0，未另派reviewer或新增review輪。正常dispose可保已證歷史expected分類，真正late協議矛盾撤銷單筆折抵；非清理就忽略未知錯誤。

## 驗證與保護

v2 packet2d6943d8bfc3d00dae1f34e0e1dfaf7da567faa50905929044e461be9de7f01a，101records43checks全hash核；v1 d9e573cd…/61records保原不動。worker有效initialRED與P2 RED保留，52focused、delta5files89tests、type/lint/globalformat/import/diff/static最終exit0。初setup RED誤unicode解碼exit0、lint/style/parser及inverse工具FAIL均保，不算有效RED或初次全綠。

Root獨立重跑7files104tests PASS（3.95s），新exported helper＋actual factory/UI/counter/clone/其他403等19controls與原predicate45controls共64PASS，無真browser/HTTP。6檔hash同freeze-v2，helper325/test497、其餘445/459/202/337，均≤500；其他4檔相對v1完全不變，helper/test inverse精確v1。Root另核2279非owned Git檔、operator45、history121rows、Original7+true575959prefix+package/lock、M51 startup/adapter，均不動。原registration.ts全byte未變。

## 尚未完成與下一步

VM4真run仍INCONCLUSIVE，不回填PASS；本次只離線工具證據。Root接著exact10paths提交、fresh新Source attempt1，VM5草稿e83f26/us-west1-b同N2 IceLake12CPU32GB/100GBbalanced、3hSTOP+1m/noSA/Ops/HTTP，原完整矩陣保留。必須真40與60矩陣及實際加密cold custody後才進Staging；不復活舊Local、不升paid、US150總額、Production禁止。
