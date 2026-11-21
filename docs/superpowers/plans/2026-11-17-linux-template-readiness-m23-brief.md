# M23 brief：公開郵件模板權限與業務前 Kong HTTP 實證

Root 統籌／唯一review，沿同worker；base **294b74807b03266e7a58087cda138a2ea5a3affd**。Owner已允Local多輪修正／測試，US$0／US$5 cap保持。此為已確認的Local公開資產權限相容性修補與before-business readiness；不改產品／郵件內容／OTP／Mailpit parser。

## 已知與未知

Native17 run43903195092/job133424987333/attempt1已completed/failure；前三functional stages通過，registration_recovery失敗。14細步新紀錄12個，mailbox_baseline／intent／form／basic_details／send_click各confirmed，otp_mail failed：OTP_PARSE／OTP_COUNT／polls2／baseline0／newMatches1／statusClassOK／recipientExacttrue／otpCount0。otp_verify尚未跑，15legs0。這證收到一封新正確收件人信件且Text沒有唯一6碼，**不證Text空、HTML存在或8碼**。實際Source與Auth runtime numeric設定皆6/3600。

Root真age核outer354files154342418B、inner321files，8stop/所有角色正向proof、DB2/127tables/31roles全值一致、3cold卷6178files130144479B＋runtime270files均核，6Auth完整保留，未restore。Final Rootreceipt **cc7aed1b609bede0c1a720741de5afb2960b65f1ee1da1197a7bcade044bdfbf**，joblog21947B/8af77369f9386b6d513789e523e5bde55508920ed8de97eb90ff2b7b9f43bf0b。Native16精確原因仍UNKNOWN，不回填。

Primary readonly23records/8localSource manifest85d1e003aa1ba37ea9768114fb556846dde80355e93b8f278d9a980abb7c8f38、reportd0476d2574fae0489c140cba89bb5a246142b67979f005ecc62b9944202225dc：Auth2.192.0/5acfdea只寄HTML，但Mailpit1.30.2/0fb1c79的enmime2.4.1會自動產Text，**HTML-only必Text空假說已否證**，禁止先改parser。CLI2.109.1/6d4c198把兩Source模板直接bind到Kong，Kong nginx8088提供/email/{magic_link,confirmation}.html；Auth取custom失敗且無cache會fallback只有link、無Token的default。這支持待驗機制，不是Native17直接403trace。

Root actual private boolean projection：兩GoTrue refs皆匹配CLI固定Kong8088路徑；兩destination各唯一bind、Source為copied template、hash匹配a77971d43a8aeeabdfac363f4af5fc82a0998dd05af954538529282953926ae8/306B。mount RW=true，不得稱readonly。原runtime-census template mode0600；file UID欄位未存，成功census／原read_file會require owner==job（profileowner1001），Kong host UID100由正向roleproof核。ACL/cap bypass未capture，不宣稱完整firstcause已定。**公開模板600與Kong reader不同UID是確定Source相容性風險**；先修此界面並以實際HTTP精確內容驗證。

## 唯一 Source ownership（6 paths）

1. scripts/concurrency/linux_project_inputs.py：只已釘公開 supabase/templates/email-otp.html，用exclusive初寫後FD安全fchmod0444；保owner=currentjob／regular／nlink1／no symlink／固定2references／hash／size。copied-input verifier只此literal whitelist接受精確0444，其他seed/config/JWK/journal仍0600，dirs0700，Original Source bytes/mode不改。不得chattr/ACL／整目錄chmod／任意public flag；444不是kernel immutable，只反覆Source與copied hash pin。
2. scripts/concurrency/linux_bootstrap_backend.py：純strict HTTP parser＋固定2template probe；本Source/job/nonce/inputproof與approved ownedKong pre/post ID/name/image/project/running/mount綁定，模板file fingerprint/hash/mode前後不變；成功後wx0600 template-readback-proof.json，只有固定state/booleans/bytes/SHA/closure。無任意URL/path/container/shell輸入。
3. scripts/concurrency/linux-local-bootstrap.py：在原readback stage、B.containers之後、ownership/READY之前呼叫probe；reuse既有error/command enums。不修改 generic NativeIO.run/bounded/terminalraw/_authorize_diagnostics：run原**options已支援maximum直接傳bounded，無需新參數。
4. tests/contracts/test_linux_project_inputs.py：真tempFS精確模板444／其他600、whitelist/path/link/owner/mode/hash/race拒絕，保原closure斷言。
5. tests/contracts/test_linux_local_bootstrap.py：必要Fixture補exactUID100 applet/HTTP/inspect，真bootstrap caller wrongreadback拒絕READY，原斷言保持。
6. tests/contracts/test_linux_template_readback.py（新增）：parser／probe的真export seams，合成外部process/filesystemports，不執行Docker/sudo或本機setuid。

你不是獨自在codebase，不覆蓋他人／Root docs/handoff。其餘Source全保護：operator44/manifest/13helper closure、suite/workflow正常six-person→15legs、M3/M5/snapshot/export、M17–M22及原Auth/Mailpit/產品src/Functions/SQL/seed/template內容、工具/images/deps/lockfile、所有SLO/resources/budgets均保持。新task每owned file≤500；既有unowned auth-journey505明示例外保持。path或行數需擴先報。

## HTTP／權限實證

先固定Docker endpoint對**已核owned Kong exactID**執行exec --user100:65533 /bin/busybox --list，唯一exact nc applet必存在；missing拒絕，不安裝或fallback。再兩個固定exec -i --user100:65533 <KongID> /bin/busybox nc -w 2 127.0.0.1 8088，以stdin原始HTTP/1.0 GET、固定Host與Connection:close。只兩固定/email paths；無shell、proxy、DNS、redirect、自動retry／decompression／credential headers。實際讀檔的是Kong nginx，不能只cat或檢mode就READY。BusyBox官方nc -w契約已查，但本image applet仍需真--list證，不假稱已測。

回應總bound4096B、header≤2048B，strict CRLF/status200/single finite Content-Length=approved306B/body exactSHA。拒任何Location／Transfer-Encoding／Content-Encoding／interim／多length／short-extra／403／default／wrongSHA／overflow／unknown form。不保存或公開body；只能private memory驗固定public Source bytehash。--list可獨立≤16KiB，其他原單command2MiB cap不提高。

probe唯一shared subdeadline≤10秒含inspect/app-list/兩GET/write/prepost recheck，每command≤2秒且只剩餘時間；維持原bootstrap outer及CLIstart600/原closure allowance，不重設deadline。現bounded有timeout-1 guard，不能假稱2秒全供nc；cancel/late/unknownphysicalclose/nonzero/writer/identity/input變動立即止，不下一命令／READY。io.run正常返回才已實體close；任何未知不以已收body補成功。若現ports不足交精確問題，不透過延長budget／重試來繞過。

依CLI固定Refs與mount/filepin保模板載入鏈，實際proof綁bootstrapRequestSha/source/job/instanceNonce/inputproof、Kong image/id指紋；secret/Env/refURL/rawHTTP/body不print或放publiclog。readiness流量僅startup2個Local GET＋app-list/inspect，不列業務API SLO／capacity證據，不寄任何新信。

## 驗證／交付

先真copied-mode RED（原600不符合需要public444），再actual bootstrap/probe wrongHTTP/403必拒，修後真FS與synthetic200 wiring GREEN。測所有parser邊界、wrongid/image/mount/ref/job/nonce、stale/fingerprint/mode/content、missing applet、argv/data固定、UID/GID、nonzero/timeout/closeunknown/cancel/late/writerfailure不續；Source模板未變與其餘private600保持。真snapshot copy原444應仍被既有contract允許並輸出private600，**不改M3**；可直接真tempFS驗此既有鏈。Source-only fixture403不是Native17因果證據。

直接Python affected＋完整Python regression一次（先前183，增本項）；pnpm --config.verify-deps-before-run=false lint/typecheck；AST/import/EOF/diff/max500，保原RED／setup失敗、命令UTC/elapsed/exit/rawSHA。不重跑無關3785unit/build／162TS。freeze unstaged packet列6Sourcehash、所有unowned critical actualGit/operator44與廣泛non-docs保持。Root唯一一輪review前禁止stage/commit/push/Native／Docker／DB／proc／signal／Hosted API/mail/settings／讀Root private artifact/key。

接受後Root exact paths gated commit→核remote294b→正常FF新Source/newpush/attempt1，正常six-person→15legs，非PASS停升級、不GH rerun／重開0businessgate／跳OTP。只有新Native readback與真註冊可說實際改善；未驗40/60不得PASS。原WIP/G8停止85／既有Native16-17資料完整保留；Hosted／Production／真寄信NONE。

## Root 失敗留證補充（同6 paths，2026-11-17）

保success proof state READBACK_OBSERVED/NONE、非權威PASS。為避免HTTP403但nc exit0時僅剩泛用PROJECT_INPUT_INVALID，准同範圍best-effort wx0600固定 requests/bootstrap-template-readback-diagnostic.json；必先驗原bootstrapRequestSHA/source/job/nonce/path authority，stage限APPLET/INSPECT_BEFORE/MAGIC_LINK_HTTP/CONFIRMATION_HTTP/INSPECT_AFTER/FILE_CHECK/WRITE/DEADLINE及必要UNKNOWN，status限可實際確認100..599或null、reason閉集／安全bytes/hash/bool、state UNVERIFIED/executionAuthority NONE。禁止body/URL/Env/raw error，不mask原error、writerfail或unknown不續命令/READY。檔必在已授權requests，因原prebusiness export不收RUNTIME；沿原有界requests列舉，不改suite/M3/export、不加HTTP。加actual403安全status／writerfail原錯／prebusiness收錄資格控制，預算與6paths不變。success寫晚仍不READY，不將已落盤觀察提升權威。
