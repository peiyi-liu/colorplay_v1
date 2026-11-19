# VM23：M80 題號診斷有效，完整 Local 仍未通過

結論：INCONCLUSIVE。Root 唯一一輪實際證據審查完成；功能 15 階段及容量 8／15 組通過，40 人完整遊戲卡在第 5 題，後 6 組未執行。此結果不能進入 Staging 發佈。

## 變更與驗證範圍

Source `9eb3bf3020c3bc5edd6fb950f0870d51f8577b42`，run `44430482237`／job `135246284885`／attempt 1。新 VM23 `cp-capacity-20261118-k23b51`／`6562612926397807456`／europe-west6-b，12 CPU／32 GiB、固定 12 GiB browser PSS 配置，原 250ms、20s Live 等待、API SLO、backend 4 CPU／6 GiB 皆保留。AC-PERF-003 尚未通過。

fresh 40／60 人註冊皆含 SLO 通過；3／10／20 人完整遊戲各 20 題通過，小組效能樣本不足不當作 SLO PASS。40 人進站 66.017ms／登入 39.386ms，80 次實際 HTTP 200、40 個 readback、cohort 40 handles 全閉合／pending 0。

## 第一個失敗與證據限制

39／39 學生的 M80 診斷均為 COUNTER FAILED／UI OBSERVED／closed true／pending 0；伺服器 Node gate 已為第 5 題 open／version 11，但 browser 最新既有公開 HTTP body 為第 4 題 feedback／version 10；實際 UI feedback 可見、題號與投影提示隱藏，無 error/loading/waiting。first actor 9／ordinal 3665／156025.935928ms，signal false，早於 finally／abort；前 4 題 confirmed。這是不同觀測層，不能冒稱直接讀過 React Query cache，或已證明唯一產品根因。

health VALID／無 reasons；browser PSS 7383403520 bytes < 12 GiB、Node RSS 1051897856、backend 4 CPU／6 GiB，PSI／swap／OOM 皆 0。event-loop p95 最大 235.799ms，既有 guard duration 0。4 個操作生命週期 invalid 0，10 個 parent 收尾完整、無 firstCause／residue／stderr。Live ring 為 PARTIAL，保留 firstFailure，沒有冒稱完整事件追蹤。

Root 只讀程式追查未見固定四題／四次上限；收到新版 callback 後應排 authoritative read，但尚缺廣播到達、callback、排程與 physical-read settle 的完整因果證據。每答 aggregate broadcast 造成每題理論 1640 份 fanout，不是 quota 超限證明。固定 Realtime v2.112.6 的有效 tenant 限額與同窗口閉集 error/drop 計數仍 UNKNOWN，不猜預設值、不先調高限制或加入高頻 polling。

## 實際 custody 與清理

artifact 14487623898；ZIP 49390035 bytes／`42362f15a65b8cca7922ac173889b1ec691d7f049f0ed6956f1e289f8d27f8bd`；cipher 49389897 bytes／`64d9b193e0dfb06286da1e1680525a0f027bc97e2445fdef9695cb5eada80942`。真 age 驗證 4740 files／238034364 bytes；outer manifest `83670bffe8376f1f6afe3b6fa853a5dd4b2aca99da1f06e42ee6146bddd245e2`。cold 4667 files／`d78b41a75112174d3529d87867293daf49206715177d1e9bbb29e853887757e8`；8 services 已停、2 DB／127 tables／31 roles、3 volumes 全檔案 hash 與 portable metadata 符合，未執行 restore。

Root 重新計算全 functional／capacity chain、43 Source＋5 kernel Gitshow、Original 9 檔與 handoff prefix，4 entry＋4 Live SSH 與 age byte/hash 對等。custody receipt `6c7ee7d54cf39f664feca907fe8056132dcae1d12403e6e4dcfed2843fb98126`。25 份 bootstrap logs／31092 bytes 另保留。

原 hold 01:08:15 → 01:18:16 UTC 自然完成；job 01:18:19 failure／repo runner 0 後，正常 STOP 一次、skipGrace false。Google fresh inventory 全 23 台 strict STOPPED、對外 IP 釋放；刪除 0、restart 0。磁碟共 2300 GB 保留且持續計費，永久清理申請仍待授權。基本配置保守預留 US$47.0208 不是帳單，預算 US$150／未升級付費帳戶。

## 發佈預檢與下一步

完整單元預檢初次 3 files／5 failures 為缺少 locked Chromium；隔離安裝官方 browser 後，3 檔 focused 通過，再一次完整 430 files／4936 tests PASS；statements 83.91%、branches 76.96%、functions 81.92%、lines 86.22%，門檻未改、初失敗保留。這不是 GitHub required check。

下一步先讀固定 Realtime 版本來源，合併上下游最小完整診斷，Root 再發有界 M81 brief 與唯一 review；不重跑原失敗 run。Staging 寫入 0，Production 操作 0。Root final `3da3f7e200e726307a5e80483ce83ebb2fc12764be01a934d3146b481c129caa`。
