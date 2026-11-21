# M12 Local CLI相容與安全診斷唯一審查

結論：ACCEPTED_FOR_NEW_NATIVE_LOCAL_ATTEMPT。Root唯一一輪review：Standards 0、Spec初交1個P2／同輪cleared、剩餘0。Base `e8e8e443c86cb8804574cc22d28d398cbe371335`；v1 packet `a31b7cbc5efde0294c04f3192fcf6552e2fbdfffaadff34c58e2adb04a904f23`；v2 `64fab49ad2dcc05727670065aa56fed587cf7656703d6550372d52c01daf4a2b`；Root summary `ec3c3395b829bfefa7038efef3b7b1a4cfaa335faa8d16a59da8bd9d33443723`。

## 變更與規格

11個核准工具/test檔案，依M12 brief完成：Local衍生config明示fresh JWT secret環境來源；API角色JWT以本輪owned EC key／kid／ES256／正確角色／真P1363驗簽，保留API/DB loopback、fresh HMAC一致與Auth fresh public JWKS gate。僅新Linux bootstrap API-token契約取代M4舊HS256假設，無產品或Hosted設定修改。

status與後續已達readback保存固定schema安全觀察；parent獨立驗型別／enum／bounds，未達NOT_REACHED、未知保留null/UNKNOWN。Kernel只讀自身source/dest/LCA權限metadata並留原OSError errno/control phase，cleanup UNKNOWN；原OwnedInventory/attach/cleanup/權限、6 controls與authority條件不變。Manifest只calibrate entry，SHA `d189b5d9e5f849d290b1e3db05ca74775d21ef8376f26aaaf0a7788e474a8cb5`。M3/M5／toolchain/imagepins／SLO、timing、barrier、caps、業務AST與原config/template均未改。

AC：M12為核准工具初始化契約；產品AC未新增，沒有phase或容量PASS聲稱。

## 證據與唯一finding

固定CLI2.109.1的[Secret配置](https://github.com/supabase/cli/blob/6d4c19870ed213ba7f682f117d0345c8a40bfa94/apps/cli-go/pkg/config/secret.go)與實際Viper1.21.0 field seam：未宣告parent欄位時env可直接讀但typed Secret空；明示欄位可採fresh env。Root核44records／7protected／5原文段，親跑RED及逐row positive controls，receipt `3fc6c3dfb25b62b8725275931dc07c27137f717289fb21b66ad4f446a32cff34`；actual B-derived欄位→相同seam valueMatch true。這不是完整CLI/status，run6 first mismatch仍UNKNOWN，未回填。

[同版API key生成](https://github.com/supabase/cli/blob/6d4c19870ed213ba7f682f117d0345c8a40bfa94/apps/cli-go/pkg/config/apikeys.go)使用custom ES256 key。ECDSA/time令start/status token bytes不保證相同；固定Kong legacy JWT為passthrough，不新增錯誤byte equality gate。wire仍待Native，無額外privileged ENV read。

初交P2：parent能接受database PASS但16項全None／錯count。Root合成control確實RED，同輪三檔修正：共用EXPECTED_BASELINE、PASS必須16項true int exact values，非PASS保留unknown/實際差值。Root親驗canonical PASS可收、None/wrong PASS拒、UNKNOWN None可收，receipt `3fd814f1571790edde14d49bc6191d595ba9621379f102b1f3cc2b97843c81e9`；其餘8檔/18protected未變，沒有第二輪review。

## 驗證與限制

Root逐hash核11source/51v1-records/12v2-records/18protected；獨立44 tests：status8/.875s、kernel4/.044s、bootstrap17/1.195s、signing6/1.709s、projectinputs9/.840s全PASS。命令 `python3 -B -m unittest discover -s tests/contracts -p <suite> -v`。真Node crypto正向與foreign/tamper/kid/role/HS256/none/unknown負向綠；私有files前後pin，無token/private key argv/stdout。Worker113/9.275s，lint/type/static/import/EOF/diff綠，JSON format綠。

兩個kernel synthetic harness setup FAIL保留，只修外部stat／fake stage端口，不當產品RED。Fixture crypto/kernel是合成端口；真Node/Go證據另列。舊Mac cleanup PermissionError未修且本輪未重現。修後Native/kernel/functional/15容量仍NOT_RUN或NOT_VERIFIED，retention UNVERIFIED、費用US$0、Hosted NONE。

原目錄WIP、7protected、handoff前575959B、G8/85資源保持。下一步精確14paths commit，核test branch exact e8後正常快轉新Source Local run，不GH rerun、不更新main/staging/Production。Staging d92／120history／1 pending index的唯讀prep不是release gate或部署授權。
