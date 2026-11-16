# M12：一次完整Local CLI設定／API簽章相容與安全診斷

Base e8e8e443c86cb8804574cc22d28d398cbe371335。User已授權自主多輪Local工具移植／唯一Root review／整站40基線60目標，之後再整合Staging；不是授權Production或Hosted設定／寄信。三次init修復後先停新增修補，已用完整Source盤點及actual官方函式重現，現在Root定界一次集中修補，避免猜第一個Native欄位。

## 證據與決策

run43804732717/job133092776902真CLI start成功返回，隨後BOOTSTRAP_STATUS_INVALID/stage:start／129.318s；沒有Root Auth JWKS/readback、business或容量。Cipher14198080765/1795B／ZIPd032c1f0bc2dd70f536ffe9a6624396ef386b9d1bedbc32b73d677b4a346977d，Root AEAD/full census5files2034B/source-job-request已驗；cipher027b567b75554cb6002d91ac781fae3690490687654a39efe1f397237545c95a、manifestf99a40e28fc0cb37af4eb93821016bd3a1b0f81f34be53418a28fa205e189375。無status raw/witness，first mismatch仍UNKNOWN，不回填推論。job已completed failure，log21605B/SHAe4686526800604a86a88fec3195a4f0beb66d561d8d1f68845d7117a8c7ce285。

CLI2.109.1固定commit6d4c19870ed213ba7f682f117d0345c8a40bfa94：兩次Python env完全相同保留；status欄名未改，API_URL正常fallback127.0.0.1:58321。actual Go1.25.11/Viper1.21.0/mapstructure2.5.0＋原Secret/hooks/同tags seam證實config沒有jwt_secret時，direct Viper env可讀、typed Secret.Value卻空；Source generateAPIKeys會用default。顯式欄位／env-reference則正確採相同fresh env。Root已核44records/7protected/5原文段，親跑原expected-match RED exit1＋matrix5rows exit0且逐row assert matches；diagnostic manifest10deaa6597a96e927327720cd04bf1ea21fecf8f93e9ec1ecabae5c261430b47，Root receipt3fc6c3dfb25b62b8725275931dc07c27137f717289fb21b66ad4f446a32cff34。這是actual field-binding seam，不是整個CLI/status，run6 first mismatch仍未知。

同Source custom signing path會以fresh ES256 JWK產anon/service role JWT，而舊B只HS256不相容；私有config雖可明列HS256 tokens優先，但custom JWKS不含oct，PostgREST只得此JWKS，不能只改角色token聲稱可用。Root選擇忠實固定CLI的ES256角色token並驗fresh owned EC signature，保留fresh HMAC設定讀回一致性；這項僅新Linux bootstrap API-token契約取代M4 brief的HS256假設，不改ES256 user signing、不放寬角色或fresh-key驗證。下游Root唯讀rg與local-runtime.ts已核按bytes hashes／roles pin，不寫死HS256；仍需真功能驗證，不宣稱端到端已PASS。

## Ownership與禁止範圍

同worker exact11paths，Root唯一review。你不是獨自作業，保護Root handoff／此brief／所有既有WIP，不revert、不開agent；保持unstaged/frozen交付，不commit/push/Native/服務/DB/API/Hosted/Rootprivate/G8。

1. Bootstrap四檔：scripts/concurrency/linux_bootstrap_backend.py、新scripts/concurrency/linux_status_contracts.py、scripts/concurrency/linux-local-bootstrap.py、scripts/concurrency/linux_suite_support.py。
2. Suite／operator三檔：scripts/concurrency/run-linux-local-suite.py、scripts/concurrency/linux-operator/calibrate-linux-runtime.py、scripts/concurrency/linux-operator/package-manifest.json（只calibrate entry rawhash/bytes）。不改linux_owned_process.py及原attach/cleanup/權限操作。
3. 測試四檔：tests/contracts/test_linux_local_bootstrap.py（Fixture必要相容）、tests/contracts/test_linux_signing_key.py（只把key-generation計數按exact NODE_JWK區分新增verify）、新tests/contracts/test_linux_status_contracts.py、新tests/contracts/test_linux_kernel_diagnostics.py。

不改產品/DB/migration/Functions/原config/template／ENV名稱或繼承策略／工具與image pins／M3/M5/M9/M10／原13helperclosure／private資料格式或業務AST／workflow／SLO/metrics/250ms barrier／任何CPU-memory-PSI/time/byte caps／原cgroup遷移/Root-LCA delegation/daemon設定。所有檔案<=500行；helper可分明確的status解析、Node固定crypto probe與strict安全schema，不做通用framework。

## 行為契約

Local衍生config新增auth.jwt_secret='env(SUPABASE_AUTH_JWT_SECRET)'，明示fresh來源；原Source config與新key生成不變，Node生成仍一次、ES256 private key_ops仍sign/verify，runtime-secret exact schema不變。把實際產生的設定欄位值接到既有actual Viper seam再驗，不只測手寫例子。

status讀回仍要求固定API/DB loopback、fresh HMAC一致、anon/service distinct與各角色正確。兩API role JWT改為嚴格ES256＋expected fresh kid＋實際fresh EC公鑰驗簽（Node內建crypto，JWT ES256的P1363格式）；拒絕HS256/none/unknown、錯role/kid/foreign key/tampered signature/無法解析，不能只改alg assertion。原Auth public JWKS fresh-key readback仍是必要gate。若用固定Node verify expression，只讀本輪固定0600 key/status files，不把token/private JWK/secret放argv或stdout；caller前後hash核符，不接受任意路徑。無外部crypto依賴、無新金鑰／文件／服務的信任來源。Native command分類只可新增固定NODE_TOKEN_SIGNATURE_VERIFY enum，generation與verification明確區分。

拒絕前保存完整可安全計算的status proof，並透過bootstrap result/parent strict allowlist傳遞：固定schema、required字段presence/type、raw status SHA、API exact／fresh HMAC match／role token distinct、DB URL各條件、兩JWT parts count／alg閉集／roleMatch／ownedKidMatch／fresh-signature verdict。只有fixed booleans/counts/digests/enums；不印原值、raw claims/token、任意property名/exception文字。未驗證用UNKNOWN/NOT_RUN/null，不冒充false或0。offline status解析／verify可以完整觀察各條件，未通仍拒絕所有後續API/DB/business。producer報告不是authority，parent重新驗精確shape/types/enums/bounds後才公開。PRIVATE proof wx600，不覆寫；可以由現有requests/bootstrap result的cipher收錄，不改M8/v2 scope、M3/M5或把rawstatus直接公開。

把既有可取得的readback觀察固定化（container roles/loopback/backend-group、Auth fresh public JWKS、DB固定baseline aggregate counts），在各自guard之前留safe proof；失敗仍原順序停止，不為湊完整資料繞過前一個gate繼續API/SQL。容器ENV如需對照只允許已核本輪8 IDs/images/project下固定JWT-related whitelist，僅產fresh-secret match/JWKS public-key match/counts/digests，原值只memory且不公開；不讀無關容器/foreign PID或個人資料。無法在不擴寫privileged reads下取得的部分明列NOT_REACHED，不強行做新probe。

Kernel僅補診斷、不修條件式LCA假說：calibrate第一次run_child前只讀自身UID/euid/cgroup namespace、source/dest/LCA path SHA（不公開路徑）、是否root、procs uid/gid/mode及effective write-access booleans；不讀root/foreign PID清單、不chmod/chown/move額外process。原單次run_child/attach/cleanup完整不變；catch其原OSError只記fixed control phase＋errno閉集（EACCES/EPERM/ENOENT/EOPNOTSUPP/EBUSY/ESRCH/EINVAL/UNKNOWN），其他error不印str。不要只靠errno臆測OPEN或WRITE；不聲稱未知cleanup成功。calibrate blocked的安全結果由suite strict validator傳kernelOutcome到最終summary，避免profile建立後無M8 artifact又丟失原因。success原6 controls/Root review authority條件保持；不新增多次遷移、不假kernel proof。這是診斷已知未驗權限前提，非run6原因。

## TDD與交付

先對舊Source新增有效RED：Local衍生config缺明示來源、真ES256 API token與舊guard不相容、proof缺漏／parent不傳安全outcome；不以KeyError或缺測試helper作RED。最小修復GREEN，actual固定Viper seam採B實際欄位值通過。真Node fresh key＋角色JWT簽驗、foreign key/錯kid/role/tamper/alg各負向；Fixture外部Node端口可合成但必須與真crypto證據區分，不把mock當Native。

Kernel只public FS/process端口合成測fixed安全shape/errno/parent傳遞、原run_child呼叫一次與未觸權限操作；不是Native kernel證。M4/M7/M8/M9/M10/M11／suite相關Python regression＋lint/type/static/diff各一次。Rootsole review後才精確commit／新Source Local job；不GH rerun／blind retry。交11 raw hashes、完整logs/先前fail資格、protected原碼／manifest盤點packet，與逐項Native NOT_RUN／NOT_REACHED標註；不保大檔基線／不回讀截圖。

原G8/85 stopped資源及原root7protected／handoff575959B prefix不變；新增key都本輪memory/private Runtime，無Hosted mail/key／Production操作。成本仍US$0。Root將審查集中修改並跟到新Linux初始化／kernel／functional／15legs，不將source task綠升格容量PASS。
