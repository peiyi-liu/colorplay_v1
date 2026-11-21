# M80 題目顯示診斷 — Root 唯一審查

結論：ACCEPTED；同一輪兩項 finding 已清除。此為診斷 task 完成，尚未通過完整 60 人 Local。

## 變更與範圍

原 PROMPT_VISIBLE 拆出 COUNTER／MODE_TEXT 的被動觀測；分別記錄 Node gate、既有瀏覽器回應與失敗時 DOM 的有界欄位。保持原兩個 locator、20 秒等待、原錯誤與答案操作；未修改產品 src、DB、依賴或既有驗收門檻。對應 AC-PERF-003 的診斷工作，不是該 AC 已通過。

## 審查與驗證

Root 同一輪 R1：停止後已發出請求的 body 仍追蹤至 closed，browser close 後迴圈 drain，actual journeys 的第二個延後 body 測試通過。R2：在讀欄位前拒絕自訂 prototype、function、array、Proxy 與 accessor，轉成 null-prototype 資料；Root 獨立舊 probe 曾執行 getter 1 次，修後 0 次、rows 0、UNAVAILABLE。兩項具有效 RED → GREEN。

67 個檔案／1,216 項測試通過；typecheck、lint、10 個 owned 檔案格式、import、AST、inverse、diff、static 通過。Root 逐一重算 140 份記錄及 10 檔 Source/test hash，獨立復原完整 v2 helper hash，直接核對 14,978 個保護輸入、Original 9 檔及舊 handoff prefix。

Final packet `3dafd6a0f4f556cf6ee84aa95ca5c5fc56cbd124db9fa7c2667f14d346a6e1d4`；freeze-v3 `66ecf84f40792a1e2bbce1e5c8105cb96832975125112b28cf1bbbab9a78d9ba`；Root review `cdfeb39462edc21452e16d2421be2a3eb93e6aa4f088c525900cd3f7c5fe836b`。實作僅 brief 的六 Source、四 tests；既有超過 500 行接線檔依 brief 的窄例外，新 helper 495 行、direct test 500 行。

## 限制與下一步

UI／回應的時間界線不是原子快照或 React Query cache 證據；Native22 第 5 題根因仍 UNKNOWN。下一步保存新 exact Source，fresh VM23 執行原 full15；不重跑舊失敗 run。全部 22 舊 VM 正常 STOPPED，VM23 仍是未建立草稿，基本配置預留 US$44.0208，下一台預估 US$3（不是帳單），總預算 US$150。全部通過後才進 Staging；Production 禁止。

Root 在上述保護核對與 clearance 後，只替雙根 M80 brief 加一個清單前空白行：原 8103 bytes／`11d43adbe0d225dcc94bad2dab99f2164f1ae05bcf142d19d66f7a07015cf8f9`，新 8104 bytes／`8380b03751748cbaff9aee99c094a07e7e4314b0263223d19521cb31a96b9bcf`。原 bytes 與檢查記錄保留；不得把此 Root 文件格式差異稱為 worker 改動或保護輸入現值全未變。
