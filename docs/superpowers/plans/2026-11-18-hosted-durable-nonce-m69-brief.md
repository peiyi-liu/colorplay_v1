# M69 — Root private durable nonce adapter（獨立 operator）

## 核准目標與責任

Root唯一review；同一task1_implementer實作。Owner已授權持續執行/審查並完成Staging整合；本Task只實作離線Root防重用adapter，不啟動Hosted窗口。operator base 6cdc66c9c609f187f7883ce19aeb30a39ae5ed5b，app候選31feebc03006b9e7f116bf7b0eb248a6ffa3293f正由Native15測試，不能改app Source。不得把operator SHA填進candidate/sourceRevision/webRevision或改SAME_SHA/ProtectedMerge tree規則。

僅新建四owned檔：scripts/concurrency/hosted-root-nonce.ts、hosted-root-nonce-contracts.ts、hosted-root-nonce.test.ts、hosted-root-nonce-contracts.test.ts。若檔名已存在先停報；不改M57/M65任何既有Source/test/schema，不加依賴/改設定。四檔可重新分配source/test helper，但不得擴paths。單檔<=500；若不能，先報具體需拆分而非自行超額。Root負責brief/review與handoff，worker不得改文件。

## 決策與契約

1. 實作供Root ports注入的reserveOnce(binding)，保持M57現存型別與RESERVED/ALREADY_RESERVED/UNKNOWN三值，不自行製造opaque reservation/USED或執行權。記錄不是deployment/Local15/15/Rootapproval/source authority，全部既有Root readbacks/RECHECK/consumeOnce保持。無runtime/mail/nonce remote adapter、無Hosted連線。factory能辨識store unavailable且不提供可執行port；不能宣稱無法落地任何byte以前即有跨processdurability。
2. 固定批准nonce先完成exclusive pre-arm fence，file+directory fsync後才可提供第一個活closure；只有這個closure能首次reserve。跨process/重開若fence已存在，一律不得恢復UNUSED/可首次reserve：完整record可ALREADY_RESERVED；partial/corrupt/不確定只能UNKNOWN。reserve任何已回UNKNOWN的活closure也永久拒再RESERVED。不得release/delete/reset/expiry重用、自動retry/recovery或overwrite原fence。
3. nonce的唯一鍵由固定批准nonce決定；不能用整個binding hash當唯一鍵，讓同nonce改binding逃過防重用。保存/重核完整安全binding，任何欄位不符都failclosed。schema沿用現存ReservationBinding，不擴strict正式欄位，工具版本/hash由Root獨立工具收據記錄。安全record不得放token/password/OTP/私鑰，也不對外發送。
4. canonical絕對private root與持有者/0700；regular no-symlink/O_NOFOLLOW/0600/nlink1/有界讀取/JSON重複key/未知欄位/資料型別全部拒絕。file/dir身份及讀寫前後核對，原record immutable。明列外部替換/刪除/磁碟rollback/惡意同UID、跨主機與實際斷電等保證邊界，不把TempFS測試說成硬體斷電證明。任何無法確認的狀態不回RESERVED。
5. Scope：純本機owned TempFS和受控owned child。可為race/crash測試spawn既有Node/tsx、只碰本次新tempdir/ownchild，bounded timeout/close cleanup，無真ColorPlay/Auth/browser/容器/其他process/網路。不得讀秘密，既有node_modules symlink只是重用，不能install或改deps。不得push/commit/VM/runner/Hosted/Production操作。

## 必要驗證（先有行為RED，再實作）

- 真private TempFS首次reserve一次/相同closure重入/同nonce不同binding/跨instance/跨process競爭至多一個RESERVED；重開絕不復活。M57 controller透過ports消費adapter的正向與UNKNOWN/ALREADY_RESERVED負向要有實際測試，不改舊assertion。
- 逐write/fsync/file+dir/reply邊界的受控錯誤與完整/partial/corrupt/permission/容量不足狀態；reply lost與受控子程序crash後重開，原fence/record保留。不同nonce在獨立新record可正常工作。fakeIO只作明確fault注入，需配真TempFS/真child測試，不能拿假process當durability證明。
- store symlink/ancestor symlink/mode/owner/nlink/oversize/duplicate key/unknown field/替換與binding漂移均failclosed；自己新temp資料可測完清除，不碰既有store或歷史Evidence。
- 現存Hosted union（M57/M65五檔231，依實際檔案discovery避免重複計數）+新測試；lint/typecheck/受影響format/import邊界/git diff check。完整raw stdout/stderr/exit與修正歷史留operator .git/m69-durable-nonce，immutable manifest hashes；不需全站843/1771重跑。

## 保護與交付

不是唯一codebase工作者，不得revert任何人的修改。M57/M65既有Source/tests、app全部Source、Native13/14/15 inputs、Root私有helpers/收據、Original WIP與G8 STOPPED85、所有歷史manifest不可改；Root另記protected baseline。只交四owned diff+私有測試packet；不得copy巨大baseline檔、讀legacy內容進report/review、改skip/assertion或放寬標準。Root唯一一輪review；task完成不等於Hosted/Staging/Phase PASS。
