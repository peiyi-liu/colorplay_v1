# Native24：實際訊息超限與更新鏈停在版本10

結論：INCONCLUSIVE，容量8/15PASS；60人完整遊戲未通過，不進Staging。Root唯一一輪Native審查完成，final `61e2233b4a7fadd8e666b1323916cc5f202241be1035ffff5e6f193b4fabc00e`。

## 實測與範圍

Exact Source `c94a624b02c7c861f5545e6e41c2d202e71cd056`／run44444541183／job135293372943／attempt1／VM cp-capacity-20261118-l24c62。Functional15PASS；anon3/10/20、fresh40/60（兩級真SLOPASS）、existing3/10/20全20題PASS。40人 wcr-261119-820726633bdd 第5題COUNTER39失敗，後6級未試。對應AC-PERF-003診斷，非AC或phase驗收通過。

40人entry59.879ms／login51.635ms，80個physical HTTP200、readback40、cohort40 closed/pending0。候選health VALID/reasons[]，browser PSS7540265984B<12GiB、Node1004097536B、backend4CPU/6GiB；PSI/swap/OOM0，eventloop P95峰352.059ms但既定duration guard0。不是外層程序timeout，parent10個complete/noCause/residue0/stderr0。

## 更新鏈與server實證

39名學生實際最後SDK callback／physical read／cache update版本均10（q4feedback）；Node已取得q5open/v11，UI39仍feedbackVISIBLE、counter/hint/error/waiting/loadingHIDDEN。四組active/queued pending皆空；39份trace皆PARTIAL，13份曾有scheduler failure，不能臆測其錯誤種類或宣稱完整逐筆從未收過11。此時沒有持續中的讀取，亦未採用11。

Root固定唯讀SQL實測tenant：users200／events100每秒／bytes100000每秒／channels100／joins100每秒／presence1000每秒／payload3000KiB。同Source/boot/owned容器原job窗口有1次MessagePerSecondRateLimitReached與2次UnableToBroadcastChanges:too_many_requests。固定上游code證明此分支拒發廣播；這是實際超限拒發，不是僅拿default或fanout估算當證據。日志投影PARTIAL：unknownFormat73／unclassifiedError20保留；沒有rawlog/secret輸出，也沒有唯一notification-id因果證明。

原journey failure154883.931ms < finally155276.193ms < collector UNKNOWN155571.126ms < signal155571.355ms。收尾才出現collector_unavailable，不能抹去，也不作之前卡題的原因。Root初檢查器沿用Native23『任何時刻皆無collector invalid』假設而失敗，原script保留；v2明確核對晚發UNKNOWN與上述順序，正式business結果仍INCONCLUSIVE，沒有放寬驗收。

## 證據與收尾

Artifact14494990929：ZIP49233952B／`cb21fad97f745f6f64b811c4515fab1b7876375d8fa002836467921475abbae5`；cipher49233814B／`1cd3c9bcd9e499ec8eeb8aebf3c09dda8888954cc9a350a277de536503a88e92`。真age4738檔236122089B，outer `d98b00bd5b2279015594f07987ff0bfce1ebf1661a604fc0068b96698c292f80`；cold4665檔／`d2c440b6398a0273c2c2326e87a5a7ef67927f84cb8b2117831ecb898362d27e`，8services stop、2DB/127tables/31roles、3vol檔案hash與portable metadata全核，未執行restore。Root重算53Source＋5kernel、Original9/prefix、4entry/4Live SSH-age parity；custody `3a5450a8a91ab5c0f869668d3e796919f245628d97c7a2b9fbc40bf24deec766`。

原hold03:04:17→03:14:17自然完成，job03:14:18failure，repo runners0。正常STOP僅一次／skipGracefalse；fresh Google24台strictSTOPPED、VM24 IP釋放，截圖已嵌入Codex。2400GB磁碟retain，刪除未授權；基本配置預留US50.0208非invoice／總US150/noPaid。Source不變、不重跑或restart舊VM。

## 下一步

在原Supabase/RLS架構內，先完整核對純進度訊息的Host/student用途，再作一個有界減少fanout修正；保學生可見資訊、phase與計分/獎勵/權限，不猜調quota/timeout或加poll。新SQL必新migration及正負向pgTAP，明確更新Staging原pending-one計畫；修後Root唯一review、新exact Source/fresh原full15。

完整單元覆蓋432files4973tests PASS，statements84.12/branches77.41/functions82.1/lines86.37%；log `9f17a5cb11629936dfb53a6a72514d5a846951b288ef3c2cccf71b2343d5e118`，不是GitHub requiredcheck或Phase8 gate。Staging唯讀已取全10Functions/47份file instances/24distinct user-source；與候選差異在cors/auth-login/content-media，無Hosted寫入。Staging head d92be82仍是候選ancestor，整合不預期conflict，但release exact-head九checks/owner gate/全部Functions及監控排程副作用仍保留。Production未碰。
