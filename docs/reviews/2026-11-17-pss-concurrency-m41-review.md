# M41 固定四路完整 PSS 審查

ALLOW_TASK_LEVEL：Root 唯一一輪審查，兩項 P2 同輪清除，未解 findings0。接受工具資格；未宣稱40／60容量通過。

## 變更摘要與 AC

WB4c／AC-PERF-003 工具資格，base4c901f71ee210f9d400c2caa81b819e5af5e313e。原Node＋全部已核Chrome的完整PSS讀取，改為最多4worker／4submitted，完整pre／post身份與binary比較、1.5秒窗口／76attempt／20ms yield／outer30秒／3s7s freshness／資源caps與SLO保持。Clock read／last／elapsed／首terminal由共用RLock同步；失敗停止新admission，實體worker完整join才post／retry／return。

## 修改檔案

2Source：linux-host-sample.py（308行）與package-manifest單一entry。4tests：root_stability_driver.py、root_sampler_failure_driver.py、root_pss_concurrency_driver.py與whole-site-root-pss-concurrency.test.ts。其他43operator entries保持；sample／main／timing／positive wire原AST保持。產品、DB、依賴與workflow沒有變更。

## 命令與結果

- Actual sampler RED→GREEN，最高4inflight／完整精確PID，N1／20／60僅fake PID計畫，非60使用者。Root獨立final12controls PASS；worker final4files66PASS，原stability18／failure6PASS，較早其他affected6files89PASS，不混加數量。
- Root兩P2：failure check與submit非原子、serial比較使用HEAD而commit後失去原基準；共用短鎖與固定歷史base後皆清除。Worker自檢scheduler FileNotFound origin與shutdown物理收束也已補控制。Clock／window首terminal最高，其後scheduler，再普通planned-order read錯；不按完成順序洗綠。
- fulltype、global lint、globalformat、import、diff、static／AST／inverse全部0。初fixture序列假設、admission fixture等待、scheduler／shutdown RED與AST-v2 harness漏刪class／binding失敗均保；pin base最後只Python字串變更，重跑直接12controls與4／66，未重複無關全站檢查。
- Finalpacket 0bc4b0380d3849356b07cd3cbd9c561d6757f8bf444455c7422e51b7b2b3c14b；Rootreceipt 864c81799377e71c5c469a01554ddd7230e074072edd9a532dd3c47f61678fef。Root重核全部records與v1既有raw、六owned bytes、unowned actualGit、Native35十一／Native34四十六inputs、歷史raw與未變sample／main AST；worker另核Original7／真575959prefix／pkglock與exec/type。

## 風險與下一步

並行有最多4個latch前已admitted同scope讀取，相較serial早停可能多讀；全部錯誤拒絕sample。若第一Thread.start立即失敗，stdlib內部未回傳future可維持pending，但pool已shutdown且沒有owned thread可執行，原scheduler error直接拒絕，無retry／partial success；不宣稱每個內部Future都completed／cancelled。此為明列有界生命周期資格。

Root授權下一個新Source正常FF Native36，完整six-person→15legs、同一免費4CPU／16GiB profile，非同SHA rerun／零business probe。不以fake controls證明真Linux速度或Native35 OS根因。若未通過保留第一因，不放寬門檻。US$0／cap5；OriginalWIP／G8停止85／Hosted／Production／真信NONE。尚未整合Staging。
