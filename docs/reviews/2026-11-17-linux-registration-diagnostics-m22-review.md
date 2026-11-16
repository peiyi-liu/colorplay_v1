# M22：註冊細步與安全信箱診斷唯一 Root review

**ACCEPTED_REGISTRATION_DIAGNOSTICS_PENDING_NEW_SOURCE**。Root唯一一輪，Standards／Spec／Security各0 findings；base68b87006e36f2bc57b4dd94b3d30f46078b3812e。對應WB4／AC-PERF-003前置功能診斷，非註冊修復或容量／phase PASS。

## 變更與範圍

exact5Source：auth-journey的register14細步與login optional admit；auth-recovery-diagnostics獨立registration family；mailpit純in-memory安全snapshot；新actualcaller test與既有mailpit test追加。保原guards／public AUTH_FAILED與MAIL_FAILED／Page及HTTP動作／30輪1秒poll／全部timeout/SLO；舊Recovery六body、其他auth body與原mailpit五測試不變。跨await取消後不啟動下一登入動作，不冒稱可撤回已發click。

started須落盤才action、confirmed writer失敗不PASS，failed writer不遮蔽原error；固定phase/elapsed/code/errorType與mail reason/count/statusClass/recipientExact/otpCount，不記URL/body/mailID/地址/OTP/帳密/raw error或低熵digest。新28事件使用原private0700/0600/wx journal；現有加密匯出自然收錄。

## 驗證

Worker11files/162tests、lint/typecheck/format/import/static/diff全0；Root重跑2files/51tests（Vitest1.27s）與29獨立schema/privacy/writer/abort/transport控制PASS。核61records全SHA、5Source、77protected actualGit、operator44；worker另1917unowned tracked non-docs保持。行為RED、fixture setup／lint／parser／static資格失敗均保留，沒有skip、刪assertion或放寬原功能／timeout。

Packet b202f9f40d776b06e50cf6a8ca0ed9d09046d825629e6003670f0527a83ccc6b；Rootsummaryc024b41e9b0b4d8fa0eb619d719eb87f7b00fc3c5638bf5c644e26affa27c429。auth-journey505行為Root已明示唯一例外：完整14細步與既有helper必要admit保持同檔API／可讀性，不為5行擴module或擠行；符合AGENTS超500須說明，其他Source≤500。

## 限制與下一步

Native16實際registration_recovery FAIL、6Auth保留，原因仍UNKNOWN；完整custody final1f2efd5bac3877775554287e4ec00b362fc175083ff29aa91c1f42a39ab72ba7，不回填。新診斷尚未真Linux執行。Root初「HTTP status可能殘留成功」假設被實際scopedFetch synthetic503/504控制否證，非Source finding；statusClass包含該wrapper合成回應，不可直接歸因上游伺服器。

Root exact8paths gated cachedcheck0/commit/clean，核remote仍68b後正常FF專用branch，一個新Source/push/attempt1正常six-person→15legs；非PASS停升級、不GH rerun／跳OTP／0business gate。原WIP／G8停止85與全部資料保護，主機US$0／US$5 cap、40/60尚未驗、Hosted／Production／真寄信0。
