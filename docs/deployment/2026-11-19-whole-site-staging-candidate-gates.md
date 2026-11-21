# 全站容量候選：Local 到 Staging 的精確放行條件

目前未達完整 Local 60 人 PASS，沒有合併、部署或 Hosted 測試寫入。本文件是既有 WB5 的具體候選準備，不能取代結果或 owner-approval。

## 目標與排除

- GitHub：peiyi-liu/colorplay_v1，base staging；隔離候選 branch codex/local-capacity-vm-20261118。允許 draft PR 啟動既有 CI、供審核；不表示允許略過保護分支或在容量未通過時部署。
- Staging Vercel：colorplay-staging-web / prj_Ovywu34q8URtgOQCtc5WwCNFz7oo；Staging Supabase：onkxnkzeixpezetkmocf。
- Production colorplay-web / prj_Jt8zXpZxQpcIW7ncSR2ALzDFE2Z7 及 Supabase xdjumzdqyexpyndanwkp 禁止操作。
- GCP US$150 總上限，不升級付費；既有停止 VM 與保留資料不重啟、不得未經批准永久刪除。下一輪使用同一已核准 12 CPU／32 GiB／browser 12 GiB 配置，不調高產品容量門檻或延長等待。

## 同版證據

候選必須先完成 Source／schema／tools／必要設計與 release 文件，再凍結 exact SHA。Root 是唯一 reviewer；所有實作 task 各保留一輪結論。完整 functional 15 stages 與 capacity 15 legs、fresh40/60 註冊、既有登入和完整20題遊戲、backend legs、原SLO與generator健康檢查均需對應同一 exact Source/profile。

M82 修改是作答／逾時進度改送 owning Host 的私人 topic。shared 入場人數／roster／phase 保持，Host 雙頻道 ACK 與同一生命週期須驗證。先以既有 draft PR Feature CI 執行真 clean Local DB 的 migrations／pgTAP／SDK integration。該 CI checkout 的實際 head／merge SHA 均記錄，不冒充已做 Native 容量測試。

九項 required checks：format、lint、typecheck、unit-coverage、production-build、local-database、chromium-e2e、credential-scan、owner-approval。不得 bypass。owner-approval 必須針對實際 open PR 的當前40字元 head，維持 staging-approval 環境人工 gate。舊 head／舊 green 不能挪用。

Native 全部通過後，結果存 Root review、handoff、私有 evidence 與 PR description；不得為補結果文件另做 doc-only commit，改掉已測 SHA。若實質改動 Source／artifact，標示新候選並重驗受影響項目，不追認舊 run；舊 failed gate 不自動 rerun。

## Migration lineage 與部署副作用

先前唯讀快照是 remote120/local121；M82 與教師總覽完成查詢 migration 後候選預期 local123。正式操作前必須重新唯讀取得 remote ledger、候選本機列表與 linked dry-run，確認 non-divergent。若 remote 未被其他工作推進，預期 pending 必須恰為以下三個，不能套用歷史「只允許一個 pending」的舊修補範圍：

1. 20261116000100_content_media_manifest_digest_index.sql
2. 20261119000100_live_host_answer_progress.sql
3. 20261121000100_teacher_overview_completion_lookup.sql

第一個 migration 移除 manifest digest 的全域唯一限制，改成非唯一查詢 index，讓不同授權上傳流程能各自保存內容相同、asset UUID 不同的資產；不放寬 immutable content／ownership／RLS。第二個 migration 新增非公開 schema 的 Host-only progress helper 與精確 receive policy，只重定向正常／逾時作答的兩個進度廣播 callsite；join／phase、計分與獎勵規則不變。第三個 migration 只將教師班級總覽的完成判斷改為 immutable finalize fact EXISTS，保留精熟、分析、日期與權限語意，不加索引；效能收益仍待真 DB／完整 Local 實測。三者皆須真 Local DB 與權限負向證據。

若集合、checksum、lineage 或實際 Staging head 不符就停止該寫入並查明，不執行 migration repair、db pull、Hosted reset，也不擅自改 ledger。這裡只定預期集合；當前 remote 狀態、dry-run 與最終 migration hashes 仍待同版查證。

現有 staging-deploy workflow 會部署全部十個 tracked Edge Functions，更新 monitoring／schedule 並做 artifact auth gate，再更新 web alias。因此正式部署批准須明確涵蓋這些既有 workflow 副作用，不可只稱「前端部署」。十個 Functions 為 admin-command、admin-mfa、admin-reconcile、admin-monitor-collect、auth-recover、student-register、auth-login、join-classroom、content-import、content-media。

已唯讀取得十個 Staging Function user-source，發現候選 cors（九個 Functions）及 auth-login／content-media 須依候選部署；這是 unreleased delta，不是完整部署 bundle／外部 package／import map 已驗證的結論。正式放行需重驗 exact artifact、public key fingerprint、環境 precedence 與 Staging target，FAIL／UNKNOWN 不得寫入或 alias。

## Hosted 容量驗證另外記錄

Local PASS 不等於 Hosted PASS。Staging 真郵件的 SMTP／OTP／Resend 限制與 shared NAT 行為、測試帳號數／信件數／資料保留／停止窗口要先具體化。使用者控制的收信地址已提供；尚未寄出 Staging 測試信，不因有地址就冒稱完成真郵件容量驗證。

2026-11-19 控制台唯讀重查：Staging token verification 是每 IP 每5分鐘30次、token refresh 150次、signup/signin 300次；同使用者寄信間隔60秒，IP forwarding 關閉。60人共用學校網路的 OTP 突發有設定層的限流風險，但尚未執行 Hosted 負載，不能宣稱已觀測 Hosted incident。每小時郵件欄位被工具遮蔽，不嘗試繞過；Resend方案／剩餘配額仍UNKNOWN。沒有改設定或寄信，必要變更要以具體項目另行批准，不能把提高限額當驗收完成。

目前 M57／M65／M69 的 Root admission bridge 仍未實作；這會限制 Hosted load 的正式執行授權，不是標準 Staging 整合／部署額外必須先建立新 runner 的理由。不把自填 JSON、Local fake ports、age custody 或設定改動轉換成容量 PASS。Hosted setting 變更及失敗 gate 重跑各維持具體、獨立授權。

全部最終狀態必須區分：task 實作通過、完整 Local 容量通過、Staging 已部署、Hosted 容量通過、人工裝置待驗；不得宣稱 Production ready。
