# M58：容量 console 精確配對唯一審查

結論：ACCEPTED，Root唯一review一輪，Standards／Spec／Security各0 findings。這是工具修正與離線驗證通過；尚非40／60人Native PASS，Staging未部署。

## 變更與範圍

保留原console／pageerror／server>=500計數。只有同一genuine actor/page/observer/generation、同一原logout request、唯一PW原生403訊息與同CDP session Log.networkRequestId相符，且原strict body／註冊UI／後續login／readback與finalgate證明成立，才在原unexpectedErrors聚合點最多折抵一筆。WeakSet核對該ConsoleMessage確實曾被原raw listener計入，opaque WeakMap proof不接受JSON／clone。其他錯誤、缺證、重複、外來頁面、取消／pending／晚到保原失敗。

同一CDP session於Network.enable後Log.enable一次；失敗只拒折抵，不改原HTTP可用性。聚合結果封存後不追認晚到證據，stop仍保存原封存分項。閉集診斷分辨PW候選、network log、request匹配、原proof與unavailable，不持久化message／URL／requestId／body／秘密。沒有額外HTTP／body read／JSON.parse、retry或SLO／timeout放寬。

## AC與檔案

對應whole-site WB4／AC-AUTH-001、AC-SEC-005、AC-PERF-003的部分行為，非整項AC或phase驗收。六owned：新capacity-onboarding-console.ts（278行）、原capacity-request-observer.ts（473）、capacity-browser-runtime.ts（463）、capacity-journeys.ts（563，由既有579減少），及兩新console直接／caller tests（313／380）。journeys保留既有協調責任，只抽raw listeners與counts，不另做廣泛重構。

M56 helper、原497測試、M55 pure、產品／package／lock／workflow／operator45保持。Root核2307非owned tracked、173份歷史records、3個原Source逆向delta、Original7／575959B handoff prefix／package與lock、658產品檔案hash。

## 命令與結果

actual createCapacityJourneys／native browser／request observer／UI／finalgate，僅I/O與非目標依賴fake：原unexpectedErrors1對期待0形成有效RED；修正後positive與錯URL／ID／頁／duplicate／偽console／500／pageerror／body錯／缺Root gate／late proof等負向通過。最終36capacity檔483tests PASS；fulltype、global lint、global format、import、diff、static皆0。Root另跑產品222檔1771tests PASS／68.944秒；9個integration依既有Vitest設定排除，不冒稱已執行，也不與capacity重複加總。

packet .git/m58-onboarding-console/validation-final.json SHA65005a68ff48fac2cfb229da259b8a4fcc0bad1c25dc33d5dadc6357b6da41e9（64records／27checks／6freeze），Root真hash核。final freeze是source-freeze-final.json；helper7700b48316dcdf6705790198bc3f020540d13f1fb50f16f38a2994945a3a17a8，非早期v1/v2。Root .git/m58-root-review.json SHA28b7713f3d7702785ccde9c48d0a1504cd1c402a94d0045f33c70dd2cf6fe839。

## 資格與下一步

原RED、初type／兩次lint FAIL、一次apply_patch context mismatch均保；前478 PASS只屬早期版本，最後483才對final freeze。Root首次審查控制工具把Git symlink視為一般檔而停止；v2依Git語意核link target bytes成功，未動Source或Native。

VM9仍正式FAIL，不能由原sum40推論全部已知logout。下一exact app Source commit／normalFF隔離branch後fresh VM10／單次job，原15功能→15legs矩陣與failstop保持，不重跑VM9。VM10目前僅未提交草稿，九VM已stopped、retained disks仍計費，US150／noPaid／Hosted0／Production禁。M57尚無Source，待獨立operator branch恢復，不混被測app tree。
