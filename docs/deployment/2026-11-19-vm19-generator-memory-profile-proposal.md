# VM19 後續：32 GiB 主機的瀏覽器產生器配置提案

狀態：待 Owner 決定，未實作、未建立新 VM、未重跑。

VM19 exact Source ccc0d671c356e2fa7cb25f3f8bf61834ce537f2b／run44368068280：functional15、容量8/15通過。40人既有登入完整遊戲於約49秒由產生器PSS guard中止，未完成容量驗收，6組未執行。既有40/60首次註冊與3/10/20完整遊戲結果保留。

直接證據：40個進站／登入請求均HTTP200，entry67.041ms、submit134.072ms。browserPSS峰值6875154432B（約6.40GiB），超過固定6GiB持續10046.596ms；firstCollectorInvalid48962.627596→abort48962.733638→journeyFailure49015.516066（signalAborted=true）。無較早operationLifecycle firstInvalid。PSI/swap/OOM觀測皆0；這不能推成主機精確可用RAM，也不能排除尚未測完的產品問題。

## 建議選項

同樣12vCPU／32GiB的隔離GCP主機，新增獨立、不可由request任意調值的版本化profile，僅將該版本ownedChromium PSS上限由6GiB改12GiB，仍須持續10秒才中止。舊profile維持6GiB與原正負向測試，禁止跨版本guard混用。新profile須Root獨立核准、hash pin與真kernel校準。

後端固定4CPU／6GiB／8服務／swap0，NodeRSS2GiB；其餘PSI、OOM、swap、eventloop、collector freshness、原同步entry/send250ms、API SLO、真40/60並行、20題／報表與full15順序全保。不能以更少browsercontext／分批／假IP／mock／延長產品timeout取代。

12GiB是下一輪產生器工程配置，並非已證明60人實際耗用上限。按固定最低28GiB可見RAM粗預算：browser12+backend6+Node2=20GiB，尚餘至少8GiB給OS／其他owned工具；實際共享頁與其他程序仍由新一輪PSI/OOM/swap監測裁決，不保證下一輪通過。

## 替代選項

維持6GiB，先量測並減少產生器記憶體。優點是不改凍結guard；缺點是尚無已確認的計量重複或工具leak可修，39/59獨立學生的正常瀏覽器使用也可能超過6GiB，不能靠關安全功能或降低並行數求過。

## 授權及費用邊界

舊M1/M2/M51明定PSS6GiB且不得放寬；本提案因此先請Owner明確決定。核准後才界定實作檔案並RED/GREEN、唯一Root review，再保存全新exactSource（包含Root M75文件空白修正）並在全新VM執行一次full15。VM19不重跑、不回寫原結果。

沿用已授權US150總上限／不升級付費帳戶；下一台同規格3小時保守基本預留約US2.30，合計配置預留約US39.4208，非invoice且不含IP／egress／稅。現有19份磁碟仍保留，永久刪除仍待另外明確授權。Staging寫入0、Production禁止。
