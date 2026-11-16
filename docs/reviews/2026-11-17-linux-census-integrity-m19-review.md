# M19：嚴格資料盤點比較與失敗證據唯一 Root review

結果：**ACCEPTED_SOURCE_ONLY_ZERO_BUSINESS_NATIVE_PENDING**。Root唯一一輪，Standards／Spec／Security各0 findings。下一新Source仍零business，尚未證明完整冷備份或40/60容量。

## 變更與對應 AC

只排序每個已核database的table-record arrays；保留全部table identity、count、digest及clusterRoles。exact shape／scope、ASCII identifiers、nonnegative int與lowercase64hex驗證，拒bool／重複／未知欄位，input不變。after取得後立刻wx600保存，再保存安全delta，完整canonical值不等或invalid仍拒，DBstop／cold volumes不執行。只修已證Source表示順序與after留存缺口，不縮小資料比較範圍。

對應WB4工具／AC-PERF-003準備部分。資料範圍／SQL／權限／snapshot設計、停止與dump/volume/runtime策略、時間與資源額度皆不改。排序修正依[PostgreSQL17 aggregate order契約](https://www.postgresql.org/docs/17/functions-aggregate.html)；不以pg_dump本身一致性取代原quiescence gate。

## 檔案與固定點

Base bcc23094772240a497b679a472890db31b438846；brief991b9c195e7862366889456a512d8809aa7290ea25bc27e7690b6c0144556215。Exact4：new local_database_census.py／test_local_database_census.py、snapshot-local-evidence.py及test_snapshot_local_evidence.py；行數96/282/132/369。

Packet .git/m19-census-integrity/m19-validation.json SHAb798459644309b7de4f1b4113a5f7397447104f6aca340793cd777561970f9a0。Root核4Source／25records／63protected actualGit bytes／operator44，NativeIO及M17/M18 helpers/tests全bytes保持；worker另核1,916 unowned tracked non-docs bytes。Root核原7protected與handoff575959Bprefix保持。

## 命令與結果

Worker純7＋wrapper19＝26直接tests、完整Python173 PASS，lint/typecheck/static/import/EOF/diff全0。Root另26tests PASS/1.556s，35獨立controls全PASS：排列不變性／不改input／跨DB同identity、count/hash/roles/set漂移、對稱壞型別／重複／缺欄／額外欄與scope、真Native13 before形狀與合成排列、actual wrapper failure保存與writer-after-close失敗。AST核pure module僅標準計算imports、無I/O或signal；wrapper其他所有function原bytes相同。

Root summary .git/m19-root-review.json SHAe88b7d772604b019bd805ff48457b0bd7ad7f1743dfa8c4c11f686801295d00e。兩個behavior RED保留。初lint/type漏用既有deps-check旗標，pnpm registry lookup／非TTY移除中止的setup失敗已留存；以既有M18命令旗標重跑綠，未安裝、未改依賴／lockfile。不重跑無關3,785產品單元／build。

## 風險與下一步

Native13沒有after，所以其真正差異仍UNKNOWN；真before非排序與合成排列控制不構成重建after或回填PASS。背景cron/net只有可能性，沒有本輪寫入證據。新控制只證metadata表示與失敗分支，不是新Native SQL或容量證據。

Root下一exact7paths gated commit/check0/clean，核specialremote仍bcc2309再正常FF新Source attempt1。diagnosticOnly1、0fixtures/functional/15legs保持；須完整冷備份真驗與Root逐檔核後才另恢復business。原WIP/G8/85保持停止保留；主機US$0，Hosted寫入／Production／寄信0。
