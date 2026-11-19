# M81 Live 更新鏈診斷 — Root 唯一審查

結論：ACCEPTED；同一輪 R1 已清除。此為診斷 task 完成，尚未通過完整 60 人 Local。

## 變更與範圍

六 Source、五 tests：在原 Native 純資料 opt-in 下，記錄 SDK 收到的公開版本、handler 實際分支、scheduler、physical read/coordinator 與 exact query cache 更新；沿用 M80 原失敗時 evaluate、close/drain 與唯一 writer。沒有新網路讀取、poll、retry、timer、timeout 或產品規則調整。對應 AC-PERF-003 的診斷工作，並非該 AC 已通過。新 helper295 行、hook285行；只有既有 M80 observation 窄接線依 brief 上限525行，其餘皆≤500。

## 審查與驗證

Root 同一輪 R1：SDK_CALLBACK 原本缺少版本，且 SDK_STATUS 可能覆寫最後收件。現透過安全 own-data descriptor 讀原 message.payload.state_version，保持原 message/status/error 轉送；status 只計數、不覆寫最後 SDK 收件，巢狀 getter 0 次、malformed 明確 UNAVAILABLE。有效3項 RED → focused6檔68項 GREEN。

最終同版97檔1,449項 PASS；typecheck、lint、11檔格式、import、diff、static、5個原 Source inverse AST 與3個原 test完整前綴皆通過。Root 逐一重算212份記錄／77項檢查、11檔Source/test hash，獨立核對20,018個保護輸入、Original9檔／handoff prefix，並直接重建8檔byte inverse。原有 subscribe error漏傳的2項回歸、metadata型別失敗與工具失敗完整保留。另一次歷史 union出現既有 live-pages fixture競態；原版隔離與新版窄測各12PASS，最後整組PASS。未改該原測試或斷言，也未宣稱已證明該次排程細節。

Packet `0c153d74a8c35b89ed0bd31a9a9d7288c5dfebf5acf262cbcff5a8f98d7d155e`；freeze `94aaa0d73832a14b354b631e47a50f1c3956bbfd09730d57f5bce9722e2cca1a`；Root review `9e3d6ef99045a52391d6158025f6da1f807e70d539ef2607534df3747a3a1adf`。

Root 同輪另審私有 server 唯讀 helper：固定 owned Local 容器/source/boot/pins、重用原 exact-byte 唯讀 psql，只投影七個 tenant numeric fields 與原窗口閉集錯誤名／count／timing；不保存 raw log、tenant row或秘密，不接受任意 SQL/path/target，不啟動DB、不改limits。29個離線案例通過，尚未在遠端執行。兩個 transport 測試工具設定失敗及原檔保留，runtime transport未因此變動。

## 限制與下一步

79-number projection≤768B；原 row2048B／questionObservation128KiB／Live512KiB上限保留，量測最壞495B／1461B／87833B。固定head/tail溢出標PARTIAL，並非完整事件逐筆紀錄；成功actor內部trace可UNOBSERVED。M80停止後失值資格保，UI/cache不是原子快照，Node與browser時間不可當同一時鐘。這些資料均 NON_AUTHORITY，不能當執行許可或平台證明。

Native23根因與effective tenant／quota incident仍UNKNOWN。下一步保存精確新Source，fresh VM24 執行原full15（含60人），對照產品鏈與server安全數值／閉集錯誤；不猜修limits、不重跑舊run。23舊VM正常STOPPED/repo runners0，VM24未建立；基本預留US47.0208、下一台planned50.0208並非invoice，總預算US150/noPaid。全部通過後才進Staging，Production禁止。
