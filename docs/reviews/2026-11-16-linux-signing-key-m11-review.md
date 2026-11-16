# M11 Local簽章金鑰唯一審查

結論：ACCEPTED_FOR_NEW_NATIVE_LOCAL_ATTEMPT。Root唯一review；Standards 0／Spec 0／工具blocker 0。Base `d97e6babbb055e24cef7e536eae65478a124ac13`；worker packet `124800e5781682ce75a01e65c6af8478d1a32861bf1180c6f6a5a9f9a97b611b`；Root summary `990c329a3639a84c78aeeb589f91348bc267dbc7d49025146aca7e82614709f5`。

## 變更與規格

3個核准檔案：linux_bootstrap_backend.py、test_linux_local_bootstrap.py、新test_linux_signing_key.py。fresh ES256 private JWK明確key_ops=['sign','verify']，生成後檢查單一key／9欄／EC-P256-ES256-sig／UUIDv4 kid／canonical32-byte座標與私鑰欄位；錯誤於signing-keys與runtime-secret發布及CLI start前拒絕，沿既有BOOTSTRAP_JWKS_INVALID。Fixture僅同步合法結構；不改原key/Hosted金鑰、生成隨機性、CLI命令／ENV、產品、migration、Functions、M3/M5/M9/M10、operator manifest／workflow或容量limits。

AC：依核准M11 brief的工具初始化契約；沒有新增產品AC／phase驗收聲稱。整站40基線／60目標仍待真Native測試。

## 根因與重現

run43802274350的已驗密文顯示121 migrations＋4 seeds後Auth unhealthy/no signing key found。官方Auth v2.192.0固定commit的[GetSigningJwk](https://github.com/supabase/auth/blob/5acfdea63bc033b79cfb0ebb08a1d4696d942aac/internal/conf/jwk.go#L127)要求private key_ops含sign；custom keys沒有default補值。[CLI固定Source](https://github.com/supabase/cli/blob/6d4c19870ed213ba7f682f117d0345c8a40bfa94/apps/cli-go/pkg/config/config.go#L1110)載入custom JSON並保留操作欄位。原生成器缺ops；原生crypto sign/verify有效不足以讓Auth選用。

Root核固定官方Go1.25.11／Auth原go.mod-go.sum／jwx2.1.0、24檔diagnostic manifest及7原文types/functions段；frozen generator對git d97 literal相同。Root親跑舊生成器expected-success exit1／5 controls exit0，receipt1643be95827c9768a1fcfb323b7ecca8b265f0874b7c19d14056480003d3a593；修後actualSource→相同函式seam exit0／selected／VALID。這是官方函式seam，不是完整Auth或Native Linux startup；所有keys只新合成memory/stdin。

## 測試與風險

Root核3source／34records／17protected hash。獨立命令 `python3 -B -m unittest discover -s tests/contracts -p <test-file> -v`：signing_key 6 PASS／2.231s、local_bootstrap 17 PASS／1.847s、project_inputs 9 PASS／1.201s。Worker101 PASS／8.386s，lint/typecheck/static/diff全0。Root原目錄7protected／handoff前575959B核符；G8/85 stopped資源與產品WIP保留。

保留首Go build VCS/Xcode setup FAIL、原Node/Go RED；Node早期負向assertion對舊READY用code索引產生KeyError不當有效RED，第一actualNode缺ops及exactGo RED有效，最終負向用get。舊Mac cleanup PermissionError未修，這次未重現；Fixture座標僅structural，crypto／selector另證。修後NativeAuth／functional／15容量legs尚NOT_RUN，retention UNVERIFIED、Hosted NONE、費用US$0。下一步只正常快轉測試branch做一個新Source Local run，不GH rerun、不碰main/staging/Production。
