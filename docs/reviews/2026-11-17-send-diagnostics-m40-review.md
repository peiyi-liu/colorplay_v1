# M40 真 UI send 被動診斷審查

ALLOW_TASK_LEVEL：Root 唯一一輪審查，四項 P2 同輪清除，未解 findings0。只接受工具診斷，不宣稱已修 Native34 原因或40／60容量PASS。

## 變更摘要與 AC

對應 WB4c／AC-PERF-003 工具資格。Base11b1d6891bcfa4bb8084090ca81fb6d212295c8b。新增每actor Node dispatch／ARM generation／click bounds／原匹配CDP回呼，以及exact送出button的page-local trustedclick buffer。所有資料NON_AUTHORITY；default native actor/page/context/observer封閉tuple與ticket精確配對，requestId只留記憶體。原send同批arm/map/全settle後才read/cleanup；三時鐘獨立，DOM同document anchor與Node安裝前後bounds僅給不確定區間，不硬套epoch。

## 修改檔案

7Source：capacity-registration（514行）、registration-ui190、browser-runtime331、request-observer343、journeys579；新capacity-send-diagnostics421／capacity-send-dom290。7tests含既有registration/UI/browser/request/journeys五檔與兩新focused。既有超500之registration/journeys限adapter接線，原分檔保留；新helpers均小於500。總diff約1612行，先交摘要後Root按Source與focused tests分段審，不讀產生型/legacy/lock/artifact內容。

## 命令與結果

- actualUi Source RED→GREEN；同輪四P2為未send卻假settled、DOM無同document anchor、foreign同index actor混淆、actual tsx序列化callback依賴page不存在的__name。Root實際publicprobe／serializedcallback VM與worker有效反例均已清除，未改原operation/Erroridentity。
- worker affected9files87PASS；final focused3files42PASS；Root獨立2newfiles34PASS/2.46s(wall3019.038ms)，數量不混加。最後DOM只有contextual type annotation，Root另重算完整TypeScript輸出JS同readiness版本9064B/c0bd4ae01cba96aebfa4f12764f4a8bf31a3c6ec1f3530e1951f5a1948c2162b，current serialized VM也通過，無額外browser重跑。
- controlled default native readiness第一次9ms prePID失敗原因未觀測，不追認為缺binary。Root另用pinned官方headless-shell1255私有補齊，GCdisabled且old355cache bytes/modes全同；第二且最後一次1browser/1context/3.829s成功，trustedclick／defaulttuple／clone拒／ARM-cancel-drain／listener-handle-pending關閉／PID已退出。zero真OTP/Auth/DB/外部HTTP業務請求，所以整體diagnostic UNOBSERVED，非Native容量PASS。
- final fulltype/global lint/globalformat/import/diff/static全0。初type/fixtures/style/unbound/void/Rootbriefformat/inverse harness失敗原log保；另有一次transcript-only缺braceformat exit2，不冒稱有獨立rawlog。v1raw42records+manifest全保，final100records39commands全hash核。

## 保護與風險

Root核14files、同輪4delta/其他10raw同、兩Source逆向還原v1、2232unowned actualGit/type/exec of2243HEAD、operator44、919unique歷史1128引用、Native34既定46coldinputs、Original7/真575959prefix/pkglock。產品/DB/deps/workflow/exporter/樣本計算/並行/coldnav/250ms/3s7s/PSS完整identity/prepost authority/caps/SLO均保持；診斷仍可能增加測試工具開銷，整輪須標instrumented。

Finalpacket1a42b450cc2a1e30657f7ce8be81cc73371f63263d793ca26770d3062e158013；Rootreceiptd26125754cca385c0d9bb5c56af4b450784472e96572c211d3224885c3d023b6；Rootproofb28ad3e450d8453913f0a491d378dfbdb432cb54b1d29b034a79f91cfdf81c59。下一步Rootexact17paths commit/clean、freshspecialremote精確11b1d68後正常FF新Source Native35完整six-person→15legs，非同SHA rerun／零business probe。Native34 fullcold／OriginalWIP／G8停止85／US$0cap5／HostedProduction真信NONE保。
