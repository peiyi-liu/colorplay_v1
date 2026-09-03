# ColorPlay Phase 0 環境與發布基礎設計

## 1. 文件控制

- 設計日期：2026-08-05（Asia/Taipei）
- 狀態：owner 已核准整體設計；正式 spec 待 owner 最終過目
- 專案：`peiyi-liu/colorplay_v1`
- 撰寫基線：`feature/v2-major-update` at `e5b0106`
- 權威現況入口：`docs/roadmap-colorplay-next.md`
- 既有架構決策：`docs/adr/0002-colorplay-new-integration-and-production-environments.md`

本文件取代 ADR 0002 與 2026-07-15 integration design 中已過時的「`main`
更新即由 Vercel 自動正式部署」假設，但不推翻「乾淨 Production、舊 hosted
project 清理後轉作 Staging、Repo migrations 為 schema 權威」三項核心決策。
後續 implementation plan 必須以版本化文件更新 ADR，不得回寫既有 migration
歷史來粉飾漂移。

本文件只授權後續撰寫 implementation plan。它不授權建立或刪除 hosted project、
修改 DNS、上傳秘密、重置 Supabase、部署、切換正式網域、刪除備份或修改產品碼。

## 2. 目標與非目標

### 2.1 目標

Phase 0 建立可重現、可稽核、可回滾且免費方案優先的發布基礎：

1. Local、Staging、Production 有獨立的前端、後端、資料與憑證。
2. Feature 先進 Staging，通過 gate 後才可建立 Production Candidate。
3. Production 必須人工核准並 promote 已驗收的同一 artifact。
4. Repository migrations 是唯一 schema 權威；Hosted Dashboard 不可成為隱性來源。
5. Production 有外部加密備份、30 天不可變保留、RPO 24 小時與 RTO 8 小時目標。
6. 發布、核准、smoke、回滾與備份都有不含秘密或個資的可驗證紀錄。

### 2.2 非目標

- 不在本 Phase 實作 Admin、內容版本、章節解鎖、Quiz、Live 或 JRPG 產品功能。
- 不把 Staging fixture、舊 Auth user、Quiz／Live 歷史或獎勵資料搬進 Production。
- 不承諾 Supabase Free Plan 提供 PITR 或供應商 SLA。
- 不引入付費 observability 平台作為 Phase 0 完成條件。
- 不自動執行資料庫 down migration。
- 不以 HTTP 200、Vercel `READY` 或單張截圖單獨宣稱發布成功。

## 3. 已查證現況與執行前再查證

2026-08-05 的唯讀查證：

- GitHub repository `peiyi-liu/colorplay_v1` 為 public、未封存，default branch
  為 `main`。
- Remote `main` 為 `24ee1ee9c03539e44c99dba5f36c13599cf434cd`；remote 尚無
  `staging` branch。
- Local 工作分支為 `feature/v2-major-update`；工作區含其他 session 的未提交 WIP，
  Phase 0 實作必須精確 stage，不得 stash、reset、切換或混入。
- GitHub 官方文件確認：public repository 在 GitHub Free 可使用 rulesets、protected
  branches、Environment required reviewers 與 environment secrets。
- Tracker 記錄的 hosted 現況包括一個仍服務 `colorplayapp.com` 的 Vercel project、
  一個 Supabase project `onkxnkzeixpezetkmocf`，以及尚未解析的
  `staging.colorplayapp.com`。這些 hosted facts 在任何實作前都必須再次唯讀查證。

相關官方能力來源：

- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets>
- <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>
- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>

若 repository 日後改為 private，或 GitHub／Vercel／Supabase 方案能力改變，release
workflow 必須 fail closed，先提出替代方案或方案升級決策，不得默默移除 required
reviewer、environment secret 或 branch protection。

## 4. 目標拓樸

| Environment | Git                 | Vercel                  | Domain                     | Supabase                      | Data                                         |
| ----------- | ------------------- | ----------------------- | -------------------------- | ----------------------------- | -------------------------------------------- |
| Local       | developer worktree  | Vite dev／preview       | loopback only              | Supabase CLI                  | deterministic synthetic fixtures             |
| Staging     | protected `staging` | `colorplay-staging-web` | `staging.colorplayapp.com` | permanent `colorplay-staging` | approved content＋fixture identities         |
| Production  | protected `main`    | `colorplay-web`         | `colorplayapp.com`         | clean `colorplay-production`  | approved content＋authorized real users only |

環境之間不得共享 Supabase URL／key、database password、Auth user、SMTP credential、
service credential、student record 或 backup credential。Vite browser bundle 只允許
`VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY` 兩個可公開值；`service_role`、
database password、SMTP secret、Vercel token、B2 key 與 backup encryption key 永不
使用 `VITE_`。

Production Candidate 必須建在 Production Vercel project 內的隔離 URL，才可在核准後
promote 同一 artifact。Candidate URL 在 gate 完成前必須受 deployment protection，且
smoke 僅讀取。Staging project 不得在 Production Candidate 已清除 fixture 後繼續公開
連向該 Candidate Supabase project。

## 5. Free Plan 兩席輪替與切換順序

Supabase Free Plan 兩個 hosted project slot 依下列順序輪替：

1. 保持目前 `colorplayapp.com` 與舊 Supabase project 不變。
2. 建立第二個乾淨 Supabase project 作為 Production Candidate。
3. 建立 `colorplay-staging-web`，暫時連 Candidate，掛上 Staging domain。
4. 從 migration zero 重播、建立 fixture identities、匯入核准內容並跑完整 Staging gate。
5. Gate 通過後先封鎖 Staging 對 Candidate 的公開寫入，再清空 Candidate。
6. 重新從 frozen repo SHA 重播 migrations，不建立 fixture，只匯入正式內容。
7. 以同一 Git SHA 與 Production public config 建立隔離的 Production web artifact。
8. 只做非寫入 smoke；owner 核准後 promote exact artifact 至 `colorplayapp.com`。
9. 驗證正式站後，舊 hosted project 才能進入另行核准的備份與清理程序。
10. 舊 project 乾淨重建為永久 Staging，重新建立 fixtures 並重跑 Staging gate。
11. 穩定後才把既有 Production Vercel project 改為不誤導的 `colorplay-web` 名稱。

任一時間不得有兩個公開網站寫入同一個 Supabase project。清空 Candidate、舊 project
reset、正式 alias promotion 與備份銷毀均為獨立 destructive gate，需要當次 owner
授權；本設計核准不等於預先授權。

## 6. Migration reconciliation 與乾淨重建

### 6.1 漂移盤點

Hosted reset 前凍結 repo SHA，收集並比較：

- Git migration filename 與 checksum；
- hosted migration ledger；
- migration-zero Local replay 產生的 schema；
- hosted schema；
- generated database types；
- Auth users／sessions、Storage objects、custom roles 與 extensions。

每項差異分類為：

1. semantic equivalent，但 version／filename 不同；
2. hosted-only 未追蹤；
3. repo-only 未套用；
4. Supabase-managed schema／extension 差異。

既有 migration 不改名、不改內容；不得只為讓 migration ledger 看起來全綠而執行
`migration repair`。Hosted-only 正式能力必須先形成 reviewed migration，否則 reset
gate 阻塞。

### 6.2 重建通過條件

- migration-zero Local reset 全綠；
- Staging migration list 與 frozen repo 完全一致；
- schema diff 在文件化的 provider-managed exclusions 後為空；
- 舊 Auth user／session／Storage object 全數不存在；
- Security Advisor 無 unresolved error，所有 warning 有 disposition 與授權測試；
- generated database types 無非預期差異；
- 只存在核准 fixture identities 與核准內容。

Staging clean rebuild 不還原舊 profile、progress、Quiz Session、Live Session、Mistake
Item、mastery、XP、Token／金幣、inventory 或 reward。只有明列的 fixture accounts、
Staging Admin／Teacher 與正式內容可重新建立。

## 7. Auth、SMTP、DNS 與秘密隔離

### 7.1 Auth URL

- Local Site URL：`http://127.0.0.1:4173`；只允許 loopback `4173`／`5173`。
- Staging Site URL：`https://staging.colorplayapp.com`；只允許精確 callback 與
  `/reset-password` route。
- Production Site URL：`https://colorplayapp.com`；不允許 Local、Staging 或任意
  Vercel Preview origin。

Vercel Preview 不執行 sign-in link、OTP 或 password recovery gate。Hosted SMTP
credential 按環境分離，tracking 必須關閉以免改寫一次性 Auth link；SPF／DKIM、OTP
與 recovery 必須各自驗收。Admin TOTP 為獨立 factor，Email 不可 bypass。

### 7.2 DNS

Cloudflare 保持 authoritative nameserver。Staging domain 先加入 Vercel，再取得當下
精確 CNAME／TXT；先保存 DNS／TTL 快照，owner 核准精確 diff 後才建立 DNS-only
record。Vercel domain、TLS、HTTPS redirect、Staging marker 與無 Production redirect
全部通過後才算完成。Production promotion 不藉由改 nameserver 或重建 apex record。

### 7.3 Secret lifecycle

Infrastructure owner、emergency recovery custodian 與 release operator 使用分離帳號與
least privilege。Product Admin 不取得 GitHub、Vercel、Supabase、Cloudflare、SMTP 或
backup credentials。Secret 只存 provider secret store 或 encrypted recovery vault，
不得進 Git、Issue、chat、log、screenshot、artifact 或 browser bundle。

疑似外洩、錯環境使用、人員異動、裝置遺失、recovery package 使用或 trust boundary
變更時，立即撤銷舊 credential／session，依相依順序 rotate，重新部署受影響 artifact
並重跑 Auth、secret scan 與 connectivity gate。

## 8. 備份、B2 與還原

### 8.1 備份內容與目標

每日 isolated job 產生：

- database roles logical dump；
- schema-only dump；
- data-only dump；
- 每個 Supabase Storage object 的獨立副本；
- non-secret manifest：environment、project ref、repo SHA、migration range、UTC time、
  CLI version、bucket/object inventory、size 與 cryptographic checksum。

所有 artifact 在離開 controlled job 前先以 reviewed authenticated encryption 加密。
Decryption material 留在 recovery vault，不與 backup 共置。Bucket 為 private、US West、
無 public URL、anonymous listing、browser CORS 或 custom domain。

### 8.2 B2 權限與保留

- Writer key：bucket-scoped、`production/` prefix、write-only，不能 read／delete／admin。
- Recovery key：相同 scope、read-only，只用於 integrity／restore workflow。
- 每個 object 使用 30 天 Compliance Mode Object Lock。
- Lifecycle：`production/` object 在第 30 天 hidden，第 31 天才可刪除已過 lock 的版本。
- Primary account credential 永不進 CI；writer／recovery credentials 分開保管。

2026-08-05 的 owner gate 已證明 writer 只能在 prefix 內 upload，不能 outside-prefix、
read 或 delete；recovery key 能 list／download exact canary，不能 upload／delete。Canary
有 30 天 Compliance Mode evidence。真實 encrypted backup、容量實測、lifecycle 首次
執行與 restore drill 尚未完成。

### 8.3 目標與容量處置

- RPO：24 小時；最新有效 backup 不得老於 26 小時 monitoring threshold。
- RTO：8 小時操作目標，不宣稱 provider SLA。
- Rolling retention：30 天；季度 isolated Local restore，重大 release 前做 hosted
  Candidate restore rehearsal。
- Owner-configured capacity budget 在 70%／85%／95% 發出 info／warning／critical。
- 若 projected next backup 超出剩餘 budget，Production promotion 凍結並建立 incident；
  不刪除仍受 lock 的 backup、不靜默漏備份，也不自動降級成本機單點備份。
- Owner 必須在下一個 RPO deadline 前核准擴充 B2、替代的 offsite encrypted target，
  或其他可維持同等保護的方案。

備份成功必須同時滿足 artifact 完整、checksum 正確、加密包可在 verification
environment 開啟及 manifest 對得上來源 inventory。失敗不以「upload command exit 0」
冒充成功。

## 9. GitHub CI、branch 與人工閘門

### 9.1 Branch／tag rulesets

`staging`、`main` 與 `prod-*` tags 使用 active rulesets：

- 禁止 force push 與 deletion；
- Feature 只能以 Pull Request 進 `staging`；
- unique required checks 必須全綠；
- merge 前需要 owner review；
- `main` 只接受已通過 Staging deployment 的同一 SHA；
- Production tag 只由 release workflow 建立，指向已 promote SHA。

自動化 actor 與 owner 不得取得常態 bypass。緊急 bypass 若無法避免，必須有 incident、
fresh MFA、reason 與事後 review。若 PR 建立者與 owner 是同一 GitHub identity，GitHub
不接受 self-review；實作前必須指定另一個具 read access 的 reviewer 或以 owner
核准的 fail-closed dispatch gate 取代，不得把 approval requirement 設成表面存在。

### 9.2 Feature CI

現有 `.github/workflows/ci.yml` 的能力拆為名稱唯一、可被 ruleset 精確要求的 jobs：

1. format；
2. lint；
3. typecheck；
4. stack-independent unit coverage；
5. production build；
6. migration-zero Local Supabase＋pgTAP／integration；
7. Chromium E2E against built preview；
8. source／bundle／artifact credential scan。

CI 使用 synthetic browser-public config 起初始 build，真實 Local Supabase E2E 只讀取
CLI 產生的 local values。Artifacts 先 secret scan，成功才上傳。PR CI 不使用 hosted
Staging／Production secret，也不觸碰 hosted state。

### 9.3 Staging gate

合併 `staging` 後自動部署 `staging.colorplayapp.com`，然後執行：

- read-only environment／domain smoke；
- affected Phase acceptance；
- Chromium、Firefox、WebKit；
- 1280×720、812×375、375×812 與該 Phase 另列 viewport；
- RLS cross-tenant negative tests；
- console／required network error zero；
- human real-device acceptance（release 前必須補齊，不得用模擬器冒充）。

Fixture writes 只允許 Staging 的專用 fixture accounts。Production account、student.one
或任何真實學生資料不得用於 Staging acceptance。

## 10. Production Candidate 與 exact artifact promotion

1. 只接受已通過 Staging gate 的 Git SHA。
2. 用 frozen lockfile、Production public config 與 Production Vercel project 建立
   isolated Candidate artifact。
3. Candidate domain 受 protection；gate 只做 non-mutating smoke。
4. Release evidence 先綁 Git SHA、deployment ID、migration range、Supabase ref 與 gate
   run links。
5. Promotion job references GitHub `production` Environment，等待 owner required review。
6. Approval 後只調整 Vercel production alias／promote exact deployment；不得 rebuild。
7. Post-deploy smoke 通過後，`main` 才 fast-forward／update 至相同 Git SHA，且不觸發
   另一個 Production build。Promotion 前必須先證明該 update 可 fast-forward。
8. SHA parity 成功後才建立 protected Production tag 與 GitHub Release。
9. 若 smoke、`main`、deployment source SHA 或 release record 任一不一致，release fail
   closed；alias 回滾且不建立成功 tag。

Candidate deploy credential 與 alias-promotion credential 必須分權。Promotion credential
只在 GitHub Production Environment approval 後解封。若 Vercel 當下 token scope 無法
限制 Candidate actor 不操作 Production alias，Candidate build 本身也必須使用 protected
environment／owner approval；不得把全權 Production token 放在一般 repository secret。

## 11. Release record

每次 Production promotion attempt 都留下 GitHub Deployment result；只有 post-deploy
smoke 與 `main` SHA parity 成功後，才建立 protected tag `prod-YYYYMMDD-HHMM` 指向正式
SHA 並建立 GitHub Release。失敗 attempt 標記 failure，但不得建立成功 tag。Release 附：

- `release-record.json`；
- record checksum；
- human-readable summary。

JSON 至少包含 Git SHA、Vercel deployment ID、Production Supabase ref、migration range、
Staging／Production gate run、owner approval identity／UTC timestamp、post-deploy smoke、
previous healthy deployment ID 與 record schema version。GitHub Deployment history 保存
Environment approval。Record 不含 secret、Email、Student／Teacher data、token value 或
完整 response body。

Repo 只保存 schema、template、generator 與 verifier。Promotion 後不為補 release 文件
再 commit `main`，避免 `main` 超前 deployed SHA。

## 12. Smoke、監控與回滾

### 12.1 Immediate smoke

Promotion 後唯讀驗證：

- DNS answer、TLS certificate 與 HTTP→HTTPS；
- homepage／PRESS START 與 Login rendering；
- JS／CSS asset load；
- public health／configuration call；
- Production 無 Staging marker、無 redirect to Staging；
- required console／network error 為零。

不得登入 test account、建立資料、送 Quiz／Live answer 或修改正式狀態。Critical failure
重試後必須連續三次失敗才分類為 failed release，避免單次短暫網路錯誤造成 alias
抖動。

### 12.2 Rollback

Confirmed failed release 由 workflow 把 alias 還原到 release record 指定的 previous
healthy deployment，並通知 owner。自動 rollback 僅限 web artifact；database migration
不得自動 down。所有 release migration 必須讓 previous web artifact 仍可運作。

疑似 data corruption、authorization regression 或 security incident 時停止自動化，
freeze Production promotion，保留 sanitized evidence，依另行 review 的 recovery runbook
處理。Backup restore 不是一般 frontend rollback。

### 12.3 Scheduled monitoring

- 發布後 30 分鐘內提高唯讀 sampling；之後 Production／Staging 每 30 分鐘檢查。
- Persistent failure 建立 GitHub Issue 並通知 owner。
- 每日檢查 newest B2 backup age、checksum、Object Lock、lifecycle metadata 與容量。
- Vercel／Supabase／B2 native alerts 是補充，不是唯一 authority。
- Monitor 不保存完整 HTML、API payload、Auth token 或 PII。

## 13. 人工與自動化責任

### 13.1 可自動／由 agent 唯讀查證

- Git／GitHub repo visibility、branches、rulesets 與 workflow result；
- Vercel project／deployment／domain status；
- Supabase project metadata、migration／schema diff、Security Advisor；
- DNS／TLS／HTTP；
- Local reset、tests、artifact checksum、B2 metadata／capacity；
- release record generation／verification與 read-only smoke。

### 13.2 必須由人類或逐次 owner 核准

- provider MFA、recovery code 與 account ownership；
- Production Environment required review；
- destructive reset、project deletion、backup destruction；
- Cloudflare DNS exact diff；
- secret／SMTP value 的首次輸入或 rotation confirmation；
- Production promotion 與 incident recovery decision；
- 真實裝置視覺／觸控驗收；
- 涉及付款、方案升級或跨境資料處理的決定。

Agent 可準備精確操作值與驗證，但不得要求 owner 把 secret 貼進 chat、commit、Issue
或 screenshot。

## 14. Gate 與驗收矩陣

| Gate                | 必須通過                                                                 | 失敗結果                    |
| ------------------- | ------------------------------------------------------------------------ | --------------------------- |
| Local migration     | zero replay、pgTAP、schema/types diff                                    | 不得碰 hosted               |
| Backup readiness    | encrypted set、manifest、checksum、read verification、Object Lock        | 不得 reset old project      |
| Staging rebuild     | clean identities/storage、exact migrations、Security Advisor disposition | 不得接 Staging domain       |
| Feature PR          | required CI jobs＋owner review                                           | 不得 merge `staging`        |
| Staging deployment  | hosted smoke＋Phase gate＋cross-browser/RWD                              | 不得建 Production Candidate |
| Production data     | no fixtures、formal content only、Auth/RLS/security gates                | 不得 deploy Candidate       |
| Candidate           | exact SHA/config、protected URL、non-mutating smoke、record binding      | 不得要求 promotion approval |
| Production approval | GitHub required reviewer＋exact deployment ID                            | 不得 promote                |
| Post-deploy         | three-sample smoke、SHA parity、release record                           | fail→web rollback／incident |
| Backup operations   | newest valid set ≤26h、capacity under budget                             | freeze promotion＋incident  |

Phase 0 完成證據只證明環境與發布基礎可用，不代表 Phase 1–6 產品功能或 Production
內容已完成。

## 15. 錯誤處理與 fail-closed 規則

- API／CLI 讀取失敗：標記 unknown，不把 cached 狀態當 current fact。
- Required check 缺失或名稱衝突：ruleset 阻擋，不手動假綠。
- Artifact SHA 不符：丟棄 Candidate，從 approved SHA 重建並重跑 gate。
- Hosted migration drift：停止 reset／promotion，分類後以 forward migration 解決。
- Backup 超過 RPO 或 projected capacity 不足：incident＋freeze promotion。
- DNS／TLS 未 ready：Staging／Production domain 不進下一 gate。
- Smoke transient failure：依 retry policy；三次 critical failure 才自動 web rollback。
- Rollback artifact 與現行 schema 不相容：停止 automation，進 incident recovery。
- Secret scan finding：只回報類型與位置，不輸出 secret value；rotate 後重跑。
- Provider plan capability 消失：停止 workflow，提出替代 control 或方案決策。

## 16. Implementation plan 必須產出的元件

1. 更新 ADR 0002 與 environment／release runbooks。
2. GitHub `staging`／`main` branch rulesets、`prod-*` tag ruleset。
3. `staging`、`production-candidate`（若需要）與 `production` Environments。
4. 重構且 job 名唯一的 Feature CI workflow。
5. Staging deploy＋hosted gate workflow。
6. Production Candidate build、record binding、manual promote、SHA parity workflow。
7. Release record JSON schema、generator、checksum verifier 與 GitHub Release publisher。
8. Read-only smoke／scheduled monitor／web rollback scripts。
9. Migration inventory／checksum／schema diff／clean replay scripts與 runbook。
10. Encrypted DB＋Storage backup、B2 upload、integrity／capacity monitor與 restore runbook。
11. Cloudflare／Vercel domain、Supabase Auth URL／SMTP 的 owner 操作清單。
12. Sanitized evidence schema，不允許 secret／PII／完整 response body。

每個 hosted mutation task 前必須再次顯示 exact target、current state、proposed change、
rollback 與 owner authorization。Implementation plan 需把可逆設定、不可逆 reset、domain
promotion 與 backup deletion 分成不同 task／commit，不得包成一鍵大腳本。

## 17. 明確排除與後續順序

本 spec 不授權：

- push、deploy、DNS mutation、Supabase reset／delete；
- 把舊 Production data 還原到新 Staging 或 Production；
- 關閉 CI／RLS／hooks／secret scan；
- 自動 database down migration；
- 以 local disk 取代 offsite backup；
- 因免費額度不足而靜默縮短 30 天 lock／retention；
- 在正式站用 fixture account 做寫入 smoke；
- product code、Admin、Content、Learning、Live 或 JRPG 功能變更。

Owner 最終核准本 spec 後，下一步使用 `superpowers:writing-plans` 產生 Phase 0
implementation plan。Plan review 完成前仍不得開始實作或 hosted mutation。
