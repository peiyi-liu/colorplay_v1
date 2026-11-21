# M45 完整 Linux VM 離線移植審查

ALLOW_OFFLINE_VM_PORT_ONLY：Root 唯一一輪審查接受，未解 finding 0。這是工具 task 完成，真 VM／40–60 人容量／Staging 尚未驗收。

## 變更與對應 AC

對應 WB4c／AC-PERF-003 的容量工具準備，base 49402116b542473b2665211bd7404ff7f51249fd。新增獨立 LINUX_VM_16CPU_32G_V1，嚴格綁定16 CPU／16個不重複 affinity／nominal32GiB／實際28–32GiB／host quota16或unlimited／ancestor memory至少28GiB；舊 free tuple與原TS接受範圍保持。後端仍4CPU／6GiB／8services／swap0，全部資源、freshness、250ms barrier與效能門檻不變。

## 修改檔案與理由

22 Source＋14 tests（完整路徑與hash在私有交付索引）：profile／health／bootstrap／suite／operator／snapshot依賴接線，以及新workflow與精確Vercel branch optout。新共用 linux_host_contract.py 76行，整合固定硬體與branch／workflow-ref／push／confirmation mapping；45 package entries、14 closure files、10 scope helpers均保hash。execution-profile-runtime只以strict observed schema取代discriminated union不支援的pick；每次仍比對完整觀測與profile。

新 branch codex/local-capacity-vm-20261118、workflow local-capacity-vm.yml、唯一runner label colorplay-local-vm-20261118-a61f29；真ephemeral／UID1001與API job/runner identity需於執行前另核，環境字串不是平台證明。paid admission75分鐘／job150分鐘，比原free240／330更緊；原free workflow bytes完全相同。唯一504行例外為root-helper-contracts.ts：base已502，本次只新增library name及strict scope欄各1行，避免無關重構；其餘owned均≤500行。

## 命令與結果

Worker final 13 TS files／174 tests通過（包含8項VM fake controls與6項原sampler controls，不另加總）；Linux86、snapshot19、prebusiness export14、preparation8各組通過。full typecheck／lint／format／import／diff／static exit0。原schema RED、union.pick import/type、fixture wiring/count、lint等失敗全部保留，沒有skip或刪assertions。

Root讀完整Source及test delta，獨立43項硬體tuple／邊界／branch-workflow交叉控制PASS；核84records／36owned當前hash、2227未改Git檔、operator45與原36未改entries、M42原59records／Native36十inputs、Original7／原交接prefix／package-lock。唯一非阻擋comment已同輪改為明確區分free與paid時間預算；之後static／diff重核，未改行為。沒有新增第二reviewer或第二輪review。

Worker packet SHA256：4f104bd0df43bed1f14383071d6053d0965e004b1ac0973edfc242248f0c6978；Root receipt SHA256：8cb55cdc2916e870d91212a61d49ee351fcdab36e65c5ac7c1d7dcea06328d90，私有 .git/m45-root-review.json。

## 限制與下一步

DigitalOcean已受理owner核准的單台16vCPU／32GB／最多3h申請#13013994，UI預計24h內回覆；目前只有受理，未核准account tier。尚未建付費VM、新SSH/runner access或執行kernel／容量。費用上限仍US$5，先前Sandbox compute約US$0.0636724為估算、實際帳單未核；不將promo或outer timer稱為供應商硬spend cap。

下一步先核對該案件結果，額度可用後依private VM runbook核actual quote／啟動與清理權限／真ephemeral runner／kernel前置，再同一固定Source完整functional→15 legs一次fail-stop與encrypted cold custody。現在只本機固定commit，不push、Native37、Hosted或Production；G8停止85與Original WIP保留。Staging仍BLOCKED_LOCAL，60人結果NOT_VERIFIED。
