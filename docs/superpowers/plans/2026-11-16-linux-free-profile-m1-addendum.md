# Linux免費profile M1：test helper allowlist追加

Root核准在原brief（SHA256 `95b748d2f85e0bdc16241b2c3e37190f6db52e1a9a9ac53e5e4a24911a9d070f`）之外增加唯一test-only path `tests/contracts/helpers/whole-site-capacity.ts`。原brief不覆寫，其他ownership／禁止事項不變。

原因：新Linux health union使既有helper的寬CapacityReceipt回傳型別失去已知Darwin health的narrowing，既有test/runner fixture直接取Darwin欄位因此typecheck失敗。Root已核讀實際helper；只准completeCapacityReceipt回傳同一真Darwin snapshot，例如`{ ...receipt, health: health.snapshot(2) }`或共享同一snapshot變數。所有資料值與序列化保持，不修改既有assert或加假Linux欄位。

現在allowlist為11source＋3newtests＋1existing test helper；這是已授權Linux工具移植的必要型別相容調整，不是產品或驗收範圍變更。保持unstaged供Root唯一一輪review。

Root後續核准追加`tests/contracts/whole-site-capacity-receipt.test.ts`一個Darwin narrowing guard，僅保原critical_pressure測試對真Darwin欄位的mutations／所有assert不變；不能把finalizer回傳型別謊報為Darwin。上述helper可明確標示Darwin|null回傳型別，保留原nullable契約與既有missing-proof checks。現在總allowlist為11source＋3newtests＋2existing test paths＝16，原brief不覆寫、其他ownership與禁止事項不變。
