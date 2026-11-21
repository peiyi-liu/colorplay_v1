# M33 取樣排程窄修審查

Task級接受；Root唯一一輪review，0 findings。WB4／AC-PERF-003前置，不是容量或phase PASS。

## 變更與目的

host/resource保留原1000/5000ms目標，以原collect startedAt同時記lastStarted，下一次delay扣掉已花時間；逾期用原timer排下一次，不重疊、不累積catch-up隊列。避免較長取樣結束後再空等完整period。原sample started/completed、3s/7s freshness、reducer、notify、firstLoop/eventloop tick、pending/stop與M32 first-event保持。

## 範圍與審查

精確4檔：collector190行，新cadence test231行、原collector test394行、既有diagnostic-caller488行。後者僅核准的單一fake-clock case，保diagnostic-before-callback／host_stale／timer0並加pending0；不為假fixture放寬Source。Root移除last-start記錄與新delay並canonical格式化後，可精確還原base collector全部bytes，證沒有其他Source語義變更。

## 測試

actual collector有效RED7cases／4FAIL→focused18PASS；final capacity29files247tests與fulltype/full lint＋fixture後changedlint/globalformat/import/diff/static全0。Root獨立3files35tests／1.62s PASS。包含正常1s/5s、非零成本、單次overrun後serial續採、跨kind平行、stop/abort/late全收束及太長sample仍UNKNOWN。原初GREEN的fake monotonic資料錯誤、原246PASS/1FAIL的未授fixture資格全保留；未刪安全assertion，不重跑無關functional635／產品build。

## 證據與保護

packet .git/m33-capacity-sample-cadence/validation.json SHA39c9d88469855e59abe8caa39bf7a00d7a64b5c004d39bccffec200dfb19003d／38records16checks；Root .git/m33-root-review.json SHA2eb1b957d95856b66451e07b768999df2b1e5418cc31add7b1442d3b162d7844及 .git/m33-root-inverse.json。Root核4files、2205unowned actualGit blobs/symlinkbytes、operator44／Original7trueprefix+package-lock、388歷史records，並錨M32v2原75與v1原55raw不變。Native27 finalfailure與完整cold已保留，Root136f4140decbe5378c36d31e89d555d27804657b092181eb8ac97c1f381c45af。

## 限制與下一步

本輪已證collector stale先發取消，修正completion+delay的排程hazard；長sample或其他效能問題仍可能使3s guard失敗，不能保證60人通過，不能回填Native26/19 cause。Root exact7paths commit/clean、fresh special remote c695dc8，正常新Source Native28 pushattempt1六人→15legs，非PASS即停並完整保留，不GHrerun/0business。40／60未run，US$0/cap5，HostedProduction真寄信NONE。
