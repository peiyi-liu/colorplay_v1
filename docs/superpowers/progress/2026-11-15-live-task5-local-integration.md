# Task5 Local 整合與 source 復原結果

## 摘要

Task1–5 在本報告限定的 Local 範圍通過。被測 source 為 `f6fb3775cc49e3d21862236ae0da8b78f1b343f3`，base 為 `d92be82ba188c3bf6618f1d70cd92f63a4eabfac`；root 為唯一 reviewer，Standards／Spec／Security findings 0。正式 source 凍結期間完成真 build、教師UI、學生 viewport、controlled recovery、一次 scoped gate 與 fresh hybrid 階梯；本次收尾只有新增本報告，未改被測96檔 bytes。

權威安全彙整與全部持久 primary 路徑／hash：[final-validation-summary.json](/Users/guanyucheng/.codex/visualizations/2026/11/12/01a1ce8a-3274-7cd1-821e-b0ae34d1d062/live-recovery-runtime/final-validation-summary.json)，SHA256 `3ac938f21d3265eada95962c1f032d35a3a1b0b2653d8c4f0a80a39cead78069`。以下 Local 結果均由 root 執行及獨立核對，實作者只彙整。

## AC

Task5 對應 AC-UI-009／014／015、AC-LIVE-001／003／007；復原與有限重連另關聯 AC-LIVE-002／005／006／008。這些結論只涵蓋本次工具／產品改動與 Local 證據，不等同正式 phase 驗收。AC-LIVE-012、真人裝置、校園網路、真實WiFi中斷與Hosted驗證未完成。

## 檔案與變更

Task5 主要涉及 `teacher-live-page.tsx` 的同turn建立防重、必填班級／單元、summary／單一primary；保留預設20秒與合法5–120秒。`live-projector-hud.tsx`／`student-live-status-bar.tsx` 使用「已加入 X 人」而非在線推論，教師只顯示自身連線並沿用Task4恢復控制。`live-projector-lobby-responsive.css` 僅開放lobby小視窗排版，其他phase投影警告保留。

工具入口 `scripts/live/verify-local.sh`／`verify-local.ts` 逐級核對fresh SHA、App marker、profile、actors、前級收據、generator、cleanup及PASS；`capacity-process-diagnostics.ts`／`run-capacity.ts` 保留安全child exit與passive fatal sidecar，不吞fatal／不偽造清理；`staging-capacity-browser.ts` 即時觀察auth計時promise拒絕，原caller仍能取得拒絕。未放寬20秒／800ms／deadline／outsider／health門檻。

96檔由持久journal限定source操作重建（23既有／73新增），root逐檔核對full blob／SHA256／bytes及50個歷史prefix全部吻合；46檔無獨立歷史prefix，依來源body／操作與fresh檢查支撐。完整逐檔表在候選 `.git/source-recovery/final-integrity.json`。原Task3報告明標`REPLACED_WITH_RECOVERY_NOTICE`；未恢復原d358 Git identity或遺失primary證據。

## 命令與結果

Node24.18.0、pnpm使用`--config.verify-deps-before-run=false`；fresh full lint／typecheck／scopedPrettier／diff-check／`bash -n scripts/live/verify-local.sh`均exit0。受影響命令為 `vitest run src/features/live tests/contracts/live-*.test.ts tests/contracts/staging-capacity-*.test.ts tests/contracts/browser-health.test.ts src/lib/supabase/browser-client.test.ts --maxWorkers=2`：57files／616tests PASS23.12秒；root另獨立3files／55tests PASS1.67秒。依賴只在clone overlay唯讀重用既有安裝與fflate0.8.2，未修改root依賴或新增deps。

root真build571files，marker綁f6，private scan確認service keys與teacher password不存在。教師UI首run `9d6376` FAIL為root復原腳本漏歷史stable locator，pending文案改變後等待失配；精準清理留下的1activity，原FAIL保留。修正root腳本後 `e3a358` PASS13秒／11checks：creation與lobby共6個320／390／1280樣本、reduced motion、真same-turn雙click只建1activity＋1session且後端20秒、empty／start／exit／自身connection；1context／0students，獨立SQL clean。

學生viewport `579bf5` PASS32秒：3actors／3rounds各2unique、p95 17／9／9ms；320／390共6樣本可見、無overflow、reduced motion、0額外HTTP，strict health／outsider／cleanup通過。controlled recovery `3529a9` PASS34秒：3contexts＋額外Host頁，lobby auto／question_open auto／feedback manual雙click；session／question／deadline／myAnswer／myFeedback／version保留且DB／RPC不增；雙Host真1success＋1STATE_CONFLICT、version與position各前進一次，3rounds各2unique、outsider／health／獨立cleanup通過。預期Host400＝1，新增close／fault豁免＝0；這是controlled channel fault，非真WiFi中斷。

唯一scoped `live:verify:local` run `3bfe38` PASS160秒，執行一次8steps（lint／typecheck／tests＋以下5個fresh legs）。表中p95依三round列出，單位ms；每leg皆3rounds各N−1unique且快照一致、strict health／outsider／generator／harness cleanup verified、typed child exit0與passive正常exit。

| Profile／actors | 三round answer p95（ms） | 結果 |
| --------------- | ------------------------ | ---- |
| browser3        | 19／23／21               | PASS |
| protocol3       | 8／6／5                  | PASS |
| protocol10      | 18／12／13               | PASS |
| protocol20      | 28／24／21               | PASS |
| protocol40      | 58／61／50               | PASS |

fresh同source hybrid前級鏈亦全過；每run root另做獨立SQL清理核對。hybrid40＝1Host＋39students，其中3browser contexts＋37SDK students，另有不計total的outsider；不代表40個browser或40台裝置。

| Actors／run suffix | 秒  | 三round answer p95（ms） | 結果 |
| ------------------ | --- | ------------------------ | ---- |
| 3／42f0c6          | 32  | 21／22／13               | PASS |
| 10／1e5c34         | 32  | 46／31／32               | PASS |
| 20／51de74         | 35  | 114／53／60              | PASS |
| 40／78afd3         | 38  | 154／118／94             | PASS |

gate是每leg harness verified＋root最後獨立SQL readback，未宣稱root每leg另查。最終Auth／profile／teacher各1；student／class／activity／session／participant／answers／identity limiter／active Live RPC皆0，IP limiter1保留，13個owned run locks為0。primary持久副本全部exact-copy／hash／0600驗過。root精確PID停止preview、專用VM已STOPPED；舊project10containers及全部volume保留，default設定／context未改，無DB reset。

## 風險與限制

原Task3 20人偶發FAIL、Task4未知console FAIL、Task5首次child提前終止均保留UNKNOWN；fresh PASS不證明原根因已修。QR為`NOT_PRESENT_IN_BASELINE`，沒有新增QR／deep-link。原Git identity／primary收據遺失的限制不因新候選成功消失；本次無Hosted、真人裝置、校園或真WiFi／正式phase驗收。

已知流程事件：root診斷工具曾誤輸出內嵌Local Kong設定，包含Local TLS測試私鑰；未讀Hosted設定／key。這是process incident，非產品code finding。環境已停，後續不可直接重用這些測試key，必須新建隔離Local project與金鑰；此要求不表示授權Hosted rotation。任何後續真實執行都須重新綁定exact source／artifact／marker，本次文件commit不追認為另一次容量測試。
