# M37 同批 metadata 驗證與分段診斷審查

結論：ALLOW_TASK_LEVEL。Root 唯一一輪 review，0 findings；尚未完成40／60人容量驗收。

## 變更與範圍

WB4c／AC-PERF-003工具資格：兩個固定metadata同批allSettled，完整收束並依原profile優先序核准後才讀原13helper。正常仍15fresh reads、完整hash／authority／owner與pre/post驗證；不cache、不提前consume sample。初始載入與preflight等其餘body未變。

新增PROFILE_META／CLOSURE_META／HELPER_BATCH只走現有Node PHASE、原clock／caps／journal；callback失敗不改operation或原exception。capacity僅兩處verify callback接線，contracts僅閉集phase enum增加。Root逆向raw核與base一致。

exact3Source＋3tests，所有新檔<=500行；既有capacity-runtime 537行不變，既有runtime test由556至562行為Root核准的窄fixture例外<=570。兩fixture改認較早的HELPER_BATCH失敗，同時新增原PRE/POST FAILED事件斷言，原throw／accounting／execute-count保持。其他44operator、M35全8／M36未授權6、collector／freshness／M36採樣／產品／DB／依賴／workflow／exporter未變。

## 驗證與證據

兩actual Source RED→GREEN；worker直接4files83PASS與affected37files394PASS。Root獨立4files67PASS、wall2161ms，選用diagnostics-runtime而非worker的diagnostics批次，兩者不混加。metadata雙起動／失敗全收束／原exception優先與identity／完整15read／post變更拒／callbackthrow／實際caller pre/post journal／custom無native witness等控制通過。final fulltype／lint／globalformat／import-only／diff／static全0。

原fixture81/83紅、初type／lint與中間格式括號失敗raw與資格保留。Root核46records、6hash、701unique歷史／854引用、2222unowned Git blob/type/exec、Original7／真handoff prefix／package-lock、Native31指定6coldJSON。Root Source邊界核對保持原測試prefix與其餘caller body。

Final packet：`945ec8afd0cb2d5d19158c714f6db8fe10aa8e1f84a7c9049ec1ffff04552800`；Root receipt：`3ac9297b9fc08a9958a5d12ce355a248e0f239849268c42bd070408112fafd66`。原始證據留private `.git/m37-profile-verification/` 與Root receipts。

## 限制與下一步

3waves→2waves是Source結構改善，未證Native31具體FS／CPU／排程底因，也不保證解40／60。Native31已final/fullcold：功能15PASS、anon3/10/20PASS、fresh40INCONCLUSIVE且zero sends，其他11legs含60未run。

Root下一步exact9paths commit/clean、fresh specialremote b036123後正常FF，新Source Native32 pushattempt1完整六人功能→15legs。不得GitHub rerun／零業務探測。US$0／cap5、OriginalWIP、G8停止85、所有冷封存保持，Hosted／Production／真信NONE；Staging尚未整合。
