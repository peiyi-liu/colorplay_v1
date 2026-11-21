# VM6 Live 結束流程失敗：Root 結果

## 結論

本輪 Source `e7063d63d4ed4ee6dff4af87db4ac2e6430fe46d`／run `44217510715`／job `134510925057`／push attempt 1：前 9 個功能階段 PASS，`live_finalized` FAIL，後 5 個功能階段及全部 15 個容量 legs 未執行。未取得 Local 40／60 人通過證據，M52 註冊 final gate 本輪未執行。保留原結果，不重跑舊 job。

## 已確認與待定位

M53 真機 sideband 的 Source、profile、boot、job hash 均對上；collection=OBSERVED、contextMatches=true、firstCause=null。父端 cancelled/timedOut/overflow 全 false，子程序自行 exit 1、signal=null、stdout 3050B、stderr 0B、residue 0。這只能證明本輪 functional 沒有父停止；VM5 舊取消原因仍 UNKNOWN，capacity sideband 本輪未執行。

`live_finalized` 約 124862ms 後失敗，教師 T1 pageOrdinal 8 的 APP_DOCUMENT GET requestOrdinal 2259 回 ERR_FAILED。三筆 unexpected 是該請求的 console／network／log 觀測，不能當作三個獨立請求。具體網址與失敗原因未持久化，正由同一 agent 唯讀對照既有 Live 流程；不猜 CORS、WebSocket、權限或伺服器根因。

原 producer cleanup=failed/resourcesClosed=false；外層 process-close 獨立證明 ownedResourcesClosed=true、剩餘程序 0、Source frozen，兩者層次不同。原結果仍 FAIL。

## 證據與邊界

artifact `14389367163`，ZIP 25093455B，SHA256 `63f6da645a657b4c90f8699f706b0af2975edf91ba597b59ca378bcf73738343`；cipher 25093317B，SHA256 `075f889e88c04351bfcd2ed4207ce7db1ed5013a1aff5b3064af688a93e36b58`。Root 真 age 解密核 490 files／155644637B，outer manifest `1c089dc73ed294f66584aac4af3c417982cafe03c9ad752db4f74229fb0ba660`；cold 455 files、8 個服務自然停止與角色證據、2 DB／127 tables census ORDER_ONLY equal、31 roles、3 volumes 的檔案 hash／portable metadata 均核對，未執行 restore。25 份 bootstrap logs 共 30940B 另存。

本機私有收據 `.git/gcp-vm6-root-first-review.json`；證據位於相鄰 runtime/gcp-vm6。磁碟清單實際可見六個 100GB 磁碟，f14b8c 只有 us-west1-a 一列，未見失敗 zone-b 的同名殘留；沒有刪除任何磁碟。六台的最大已配置基礎運算保留估算 US$10.136，另有磁碟/IP/流量/稅費，並非實際帳單。上限 US$150、不升級付費帳戶；Hosted／Production 寫入為 0。

GitHub job 於 01:59:14 UTC completed/failure，runner26 自動移除、repo 剩餘 0。Root 正常停止 VM6，Google Console 已確認停止（頁面仍顯示更新中），100GB 磁碟保留仍計費；停機截圖與 Root final 收據已保存。下一項為 M54 合併結束流程與文件傳輸診斷，同一 agent 離線實作、Root 唯一審查。Local 完整矩陣未過，不部署 Staging。
