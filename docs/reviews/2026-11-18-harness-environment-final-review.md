# Harness 環境檢查結案（M43–M44）

結論：目前 provision 的 Harness Sandbox 不符合既有容量工具前置條件；沒有執行網站容量測試，也不能據此判斷網站 40／60 人容量。

## 觀測與處置

唯一 session 01a1ea8a-837c-7282-94bf-b3ab0f298573，配置 none／16CPU／32GB；M42 first CGROUP unavailable。M43 一次 readonly 定位證實 CPU16／affinity16／Ubuntu24.04，own cgroup 空、沒有 cgroup mounts／controllers 路徑；M44 一次不同 readonly probe 證實 kernel 列有 cgroup2，但 PID1 非 systemd、無 systemd binaries，memory PSI 不可讀。沒有 mount、安裝 Docker、寫入 sys/proc 或放寬 guard。這些事實只判定目前環境，不能推定 kernel 編譯選項或所有 Sandbox 永遠不可行。

## 結果與保全

三次原始 result／exact probe 均已下載與核 hash。Root final private receipt `.git/harness-environment-root-final-review.json` SHA256 76d1740ba6937be71b8683873e96114f74e821664cff072fc188c3f502b1ccb1，77 records；M43 worker probe 一輪 Root 審查無未解 finding，M44 為固定唯讀操作。1 個新 session、1 個新 config 已移除，兩份 API list 均為空；刪除既有資源 0，網站 fixtures 0。Token 只保留於私有設定，不寫入 repo／guest／argv／報告。

## 費用與授權

累計保守 active 上界 227.401324 秒，依 published full allocation US$1.008/hr 計算 compute 約 US$0.0636724；實際帳單未確認，storage／egress 不含於此估算。Owner 隨後明確允許實際扣款，總額仍 US$5；下一階段先離線移植與審查，再開完整 Linux VM，以約 US$0.50/hr、最多 3 小時為預算計畫，並保留稅費與清理餘裕。不是供應商硬 spend cap。

## 下一範圍與限制

M45 只離線支援獨立 16CPU／32GiB profile 與真 ephemeral GitHub self-hosted job，Root 唯一審查。UI catalog c-16 顯示 US$336/mo（US$0.50/hr），但當次檢視各區仍 disabled，實際供應 UNKNOWN；不因報價宣稱可啟動。沒有付費 VM、沒有 Native37、沒有 Staging／Production／外部信件。Original WIP、停止的 G8 85 fixtures 與歷史 cold evidence 保持。
