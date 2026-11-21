# 免費Linux profile M1：Root唯一審查結果

## 變更摘要

**ACCEPTED（task級）；同輪1項P2已修，未解0。** 新固定4CPU／標稱16GiB profile及Root獨立bytes／實際facts authority，串起functional、capacity與Root close；Linux PSS/RSS/PSI／backend cgroup分開記，原Mac reducer與門檻保持。

Root實證首筆sample可把Node PID誤填為browser而被判VALID；同worker只2paths補PID互斥與同start／不同start兩個回歸案例，RED→GREEN。Standards0；Spec初1／已解1／未解0；Product Security0。審查只有一輪，Root未委派第二reviewer。

## AC與完成界線

支持AC-PERF-003的延遲證據可信度；本M沒有執行正式AC-PERF驗收、真Linux kernel、60人容量或Hosted。M2 runtime接線與Root真sampler／process closure仍待完成。

## 修改檔案

11個source：新execution-profile、capacity-linux-health、capacity-receipt-health；既有config/local-runtime/functional-receipt與5個capacity scope/manifest/health/receipt/publication模組。3個新contracts，加Root批准2個既有test型別narrowing；exact16path／hash在worker V2與Root summary，無src／SQL／Functions／lock／workflow變更。最長486行。

## 命令與結果

Worker full lint／typecheck／scoped prettier／imports／git diff --check全0；whole-site contracts66files／781tests PASS14.92秒。Root獨立12files／128tests PASS（0.995秒），真public exports額外6controls全通過，保留原5PASS／1RED及同輪修正。

Root核16source、原46logs＋新16logs、兩份Root brief／addendum，精確2path delta移除後還原原source hashes；其餘14paths未變。舊Darwin reducer只正常化型別與validator名稱後source完全相同、validator body相同；absence序列化回歸綠。額外舊版VM bundle實驗setup失敗保留，不拿它當byte proof。

Worker V2 SHA256：`e92d5d501404f69dfac9cdc7008f0ebf4db230d5dd1096fb60c6f04d05c4ce75`。Root summary SHA256：`e57868ca6b02ac1ecbae1940c749ce2f4426ef363e4bed9ddedb5ad60682fd5e`。Base `ad25688aea1f4082b90b4e37009b365722673125`，審查時保持unstaged；Root另行精確stage/commit。

## 風險與下一步

免費4CPU／16GB主機能否承受60個真瀏覽器仍未知；M1只驗工具契約，缺Root authority／profile混鏈拒絕。後端OOM以backend_resource／INCONCLUSIVE呈現，不當作Chrome壓力或已確認產品缺陷。下一步M2 portable Python／helper／collector接線，再真環境校準；原G8及歷代收據不改判，Staging／Production無寫入，花費US$0。
