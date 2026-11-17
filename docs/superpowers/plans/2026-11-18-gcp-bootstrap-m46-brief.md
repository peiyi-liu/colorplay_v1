# M46 新 GCE VM 的離線 bootstrap 準備

Root 核准既有 implementer 一個有界操作工具任務，Root 唯一 review；M45 Source9a7ea08893b974d50981559c9f10983efd492848保持。Owner 已啟用 GCP trial，最新總支出上限 US$150（取代5），並授權能用則接完整60人Local直到現有Staging整合部署；Production仍禁止。API enable／新security access action-time確認目前PENDING，本task不依賴回答。

## Ownership與禁止

只在 RECOVERY/.git/m46-gcp-bootstrap/ 寫 bootstrap-vm.py（<=280行）、test-bootstrap.py（<=220行）、README.md、commands/results/index JSON與必要private logs。不得修改tracked Source/tests/manifest/workflow/docs/handoff，Root擁有docs；你不是獨自在codebase，不回退他人。無Cloud/API/metadata真查詢／services／apt／runner實行／credential／commit/push／Original/G8操作。只離線語法與fake ports控制；不用第二reviewer。

## 固定目標

新GCE instance僅 project project-2cb97613-9124-4f2a-bef、name cp-capacity-20261118-6d9a14。Ubuntu24.04 x64 rootstartup，16CPU／affinity16／MemTotal28–32GiB，PID1 systemd／cgroup2 cpu,memory,pids／memoryPSI readable／pidfd／ownPSS／swap0；不符合即在任何system mutation前停。只讀metadata 169.254.169.254固定兩path computeMetadata/v1/project/project-id、computeMetadata/v1/instance/name，Metadata-Flavor:Google、無proxy、3s／boundedbody，絕不讀service-account token。

建立一次private root-owned /var/lib/colorplay-capacity-bootstrap，既有則拒重跑（失敗原log保）。所有子命令argv固定或嚴格既有path，boundedtimeout、rawlog600，safe stage/code輸出，無任意cmd／token/env dumps。只供之後Root核准的新VM：signed Ubuntu apt update/install docker.io git curl python3 sudo ca-certificates及officialrunner deps，不apt upgrade／新增第三方repo／裝node或gcloud。Docker start後核systemd cgroup-v2與zero containers／volumes；不使用任何既有data。

建立runner user cp-capacity exact UID1001。若1001有其他user即停；若guestagent已建cp-capacity為其他UID，只在其home=/home/cp-capacity、1001未占且無該user活process時用正常usermod轉UID（不killprocess／不掃其他home）。其他現存user不改。sudoers專用新檔 /etc/sudoers.d/colorplay-capacity-runner，0440、cp-capacity NOPASSWD於此新disposableVM，visudo驗；docker group僅此user。這是新測試VM的預期權限，不能改主機或其他雲端資源。

預先核定official GitHub runner v2.338.2：archive228071396B／SHA256 baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40；URL https://github.com/actions/runner/releases/download/v2.338.2/actions-runner-linux-x64-2.338.2.tar.gz，release API asset digest＋official release body checksum已Root雙核，receipt .git/vm-runner-vendor-pin.json。有限HTTPSdownload只該vendorurl與其官方release CDN redirect；先核size/hash再解到全新 /home/cp-capacity/actions-runner，vendor可信archive可用標準tar extraction，不做過度新archiveframework。僅執行official bin/installdependencies.sh，不config/register/run/auto-update。chown僅新runnerdir，無大範圍home recursion。

完結receipt表示 PREPARED_NOT_REGISTERED、exactname/project／rootboot hash／CPU/mem／PID1／Dockerdriver-v2／runnerarchivehash／UID1001／free disk。可輸出host ed25519 public key與SHA256 fingerprint供Root經authenticated serialconsole核後pin known_hosts；絕不讀host/private SSH key、userprivatekey、env或cloud/GitHubsecrets。不得以StrictHostKeyChecking=no建議Root登入。Registration另由Root取short-lived token，--ephemeral／--no-default-labels／--disableupdate／唯一label colorplay-local-vm-20261118-a61f29，no secret argv/log；本script完全不收token。

## 驗證交付

actual pure admission/plan與fake executor：wrongname/project/CPU/mem/systemd/cgroup/PSI/swap在mutation前拒；UIDcollision／既有dir／下載size/hash錯／apt或Docker失敗保持fail-stop不跑後段；positive正確orderedfixedcommands到prepared、不註冊／啟runner。只測重要行為，不為每個常量寫形式測試。保初FAIL／exactfileshash／commands+exit，簡潔packet與knownpending。預估10–15分鐘，若目標過度複雜先精簡，避免新平台又造大型工具系統。
