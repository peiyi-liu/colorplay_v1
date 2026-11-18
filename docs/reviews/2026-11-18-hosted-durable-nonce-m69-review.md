# M69 — Root private durable nonce：同輪接受

結論：Task級接受，一輪Root唯一review的P2已修，無未解finding。這是WB5 Hosted fail-closed先決工具；不是Hosted窗口、Staging/Phase驗收或部署批准。

## 變更與範圍

獨立operator base6cdc66c9c609f187f7883ce19aeb30a39ae5ed5b新增四檔，app候選31fe不變。hosted-root-nonce.ts329行，contracts149、兩test414/336；無M57/M65既有Source/test/schema、設定或依賴宣告修改。

固定nonce唯一鍵的immutable intent先O_EXCL/file+dirfsync，才提供首次活closure；再寫完整安全binding與record。reservation UNKNOWN在活closure先latch、跨process已有fence只能UNKNOWN/ALREADY_RESERVED，無release/expiry/reset/自動恢復。arming前任何byte皆無法落地時不提供port，也不虛構跨process保證。opaque RESERVED/RECHECK/USED仍由原M57控制。

canonical private root/0700、regular0600/nlink1/NOFOLLOW、有界實際bytes、duplicate-key/descriptor/proxy/type/metadata前後核對。nonce/approval或完整binding漂移拒絕；檔案不是deployment、Local前級或Root approval authority，operator toolchain SHA/hash獨立於app source/webRevision。

## 一輪review與修復

Root實際exported encodeNonceRecord輸入own toJSON callback，v1執行一次；現factory schema-cloned固定records未暴露該路徑，不誇大為已發生的Hosted攻擊。唯一P2要求序列化以前拒絕所有非JSON primitive；同輪補兩回歸，Root同命令實測callback0/rejectedtrue。原test11401bytes prefix與contracts局部inverse還原v1hash，另外兩Source不變。原v1 manifest/75records與初FAIL均保。

## 實際驗證

Hosted7files264PASS＝原五檔231＋新33；最後type/lint/affectedformat/import/diff/static全0。原三setup ERROR為0tests，不算RED；有效factory-active-first 1行為RED→GREEN，P2兩行為RED→GREEN。目錄nlink的APFS實測變動只資格此TempFS情境，dir pin使用dev/ino/uid/mode、regular file持續強制nlink1。

真owned Node兩程序競爭至多一次reserve、兩個明確SIGKILL crash控制及reply-lost/各write/file-sync/dir-sync/open/close故障、schema/FS/替換/owner負向、M57實際controller ports互通均覆蓋；所有owned child callback閉合。非真斷電或容量證明。

Root手讀四檔與同輪delta，直接核109records/42checks、2304operator protected/2029app非docs bytes、196history、Original9+575959prefix、Native13/14/15共24inputs。tsc經原node_modules symlink會寫兩個generated tsbuildinfo，未install，沒有宣稱全部依賴cache bytes不變。

## 證據與未完成

packet fd25860e93725bd7f8d64cb0993b3bab4448125fac76f4d6eb7c4a9893a9d2cf；Root final 7a9bcb1995849dc46a9f51aa387af5bd3ca12381819fd1f12cd83ffcb2a6fb81。私人raw證據不進Git。

持久Root store實際路徑/儲存資格、真deployment/protected-merge adapters、Hosted browser/OTP relay/批准窗口/清理政策仍未完成。OS/FS誠實與可信private root為前提，惡意同UID/root、資料刪除/rollback/clone、跨主機與硬體斷電不在本Task保證。app31fe Native15目前僅5/15，不能接上Hosted執行。無App/Auth/browser/cloud/Hosted/Git修改，Production禁止。
