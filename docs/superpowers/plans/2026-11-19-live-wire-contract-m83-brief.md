# M83：真 Realtime 訊息 metadata 與 CI 驗收契約閉合

## 授權與已確認實證

依使用者已授權的全站／Live完整60人Local修正，通過後整合Staging；US$150總上限、不升級付費、Production禁止。Base exact Source 12b12b5911b008f56f806ea402a336d94bfbd9ae／tree fd36f6cee28fdbbd29027ea3d09b0103859a6afe，PR74維持draft。相同worker實作，Root統籌且唯一reviewer，只一輪review。

首次真Feature CI44461673434（attempt1）已完整結束：format／credential-scan／typecheck／production-build／lint五綠；local-database、unit-coverage、chromium-e2e三紅。Root保存原logs，不重跑該run。原Native排隊44461593121仍未執行即取消；沒有VM25或Hosted變更。

真pgTAP僅兩個fail：032 test17還要求answer aggregate在shared（0 vs1）；130 test13要求stored payload恰四鍵。Root從已核Native24 cold postgres.dump的TOC只抽realtime.send DDL（未restore／未啟DB），845B、SHA3067fbb06e594eb88ea76892f7aa826f03d32840f8858aa67912ee663f4c23e8，見.git/m83-wire-diagnosis/realtime-send-from-vm24.sql／actual-send-ddl.json。實際函式在payload無id時以gen_random_uuid新增payload.id，並將同generated_id寫realtime.messages.id；有id則不覆寫。固定replication會保留payload，SDK不移除此欄。產品目前exact4也會拒合法wire，不能只改assert求綠。

Chromium27PASS／2FAIL／2既有環境選擇skip：Live smoke等不到本題解析與上述拒真進度相容，原test維持重驗；auth-account:135錯等nickname。已採用app-shell:298的recovery固定public Outlet不顯HUD，reset-page scoped form status在ready／非submitting時為空，invalid分支沒有form，更新密碼button只在ready啟用。這是舊驗收等待點，不先改Auth產品。

unit4files的失敗是CI未建/private/tmp及shallow checkout缺歷史兩commits。Root已核49402116b542473b2665211bd7404ff7f51249fd及4c901f71ee210f9d400c2caa81b819e5af5e313e皆為12b祖先；Root另負責ci.yml的S級環境修正：只unit job fetch-depth0及安全建立private tmp，不改測試、baseline fallback、門檻或產品。

## Worker ownership：僅六檔

你不是唯一在codebase工作者，不得revert他人修改。只允許以下六檔；其餘Source／SQL／profiles／Linuxpackage/core5／workflow／Rootdocs／Original／M57/65/69都不可改。不可commit/push、Cloud/Hosted或啟舊Colima／G8／VM。新的私有proof只在.git/m83-wire-contract/，Root baseline唯讀。

1. src/features/live/lib/live-session-topics.ts
2. src/features/live/lib/live-session-topics.test.ts
3. supabase/tests/130_live_host_answer_progress.test.sql
4. supabase/tests/032_live_pause.test.sql
5. tests/integration/live-host-progress-realtime.integration.test.ts
6. tests/e2e/auth-account.spec.ts

六檔均≤500行，不壓格式、不複製大型baseline。無需新增migration、dependency、RPC、generated types或產品UI。

## 五項嚴式契約

1. 保留四個業務鍵與原number/state/session驗證，只接受四鍵，或四鍵加唯一optional id。id存在時必須是36字元合法UUID字串；null、number、畸形UUID、其他extra鍵或accessor仍拒。只為平台transport metadata；不得用它授權、排序、計數、去重或作cache key。原message identity與四鍵舊caller相容，原同組retry／cleanup／雙ACK／monotonic coordinator不改。
2. 有效TDD須經實際createLiveSessionTopics caller，以真DDL的五鍵wire證明原Source拒合法進度，修後收件與connected保持。至少20題五鍵／四鍵相容、malformed id與未知鍵／getter負向；保R1 late throw、role cleanup、明確拒絕與retrybudget全組。setup/import失敗不可算RED。
3. 130真pgTAP嚴核stored payload恰五鍵、id UUID且等於該row.id，並驗原四個業務值／normal、timeout、idempotency、shared phase／roster及所有RLS正負向不降。032把原count=1改核Host progress，另核shared無中途aggregate；保pause/resume／streak與其他所有assertion，不改歷史migration。
4. 真SDK同樣嚴核五鍵與UUID，保Host真收件／兩合法進度／無forged／健康channel與sticky explicitpermission拒絕。send無ACK只是transport觀測，權限真證據結合pgTAP；原R1 track error語意不改。不得新增Source skip／mock backend／提高等待或限額。真DB/SDK仍待下一new Source的完整CI，不假稱已跑。
5. auth-account只將錯nickname/HUD等待替換為固定form[data-interaction-group="reset-password"]內status的toHaveText('')，沿原20秒；保原更新密碼toBeEnabled、route、密碼更新、登出與新密碼登入等全部assertions。invalid無form不能被全域空status誤判。不改Auth/AppShell產品，也不動live-smoke原assertion或7.5秒。

## 交付與 gate

先有效RED→focused GREEN，最後同版一次受影響union、typecheck/lint/owned format/import/diff與必要static/inverse，freeze六檔bytes/hash/linecap。保所有失敗，stage新工作僅這六檔；Root會同輪唯一review並核完整protected current bytes。已有歷史Git可核，不猜重建未commit的snapshot；非必要工具失敗三次即停止、標UNKNOWN，不耗時間編造逆向成功。

Root的CI環境設定、規格對transport id的註解、brief/review/handoff另管，worker不可改。CI scope/timeout/required checks不降。Root在全修凍結後更新同一draft PR的新head，自動新attempt1 CI；不rerun舊failed job。只有真Local DB／SDK與必要CI綠才可freshVM／原full15／60人，全部通過後才protected Staging。AC-PERF-003仍待完整容量，不是本task離線PASS。
