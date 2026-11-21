# M52 — 註冊後已失效 session 的 local logout 辨識

Root 統籌／唯一審查，同一 implementer。base0270cac80871a0bde3039f05acee03d7c2969e3a。此為既有全站60人Local核准計畫內的有界工具修正，不改產品Auth/RLS，不部署。

## 確定事實與未通過結果

VM4固定N2/IceLake12CPU32GB run44196367479/job134438781467/attempt1：functional15及anon3/10/20 PASS；fresh40 INCONCLUSIVE，40 sent/verified/completed/Authcreated，entry67.09ms/send213.971ms。M50原finalgate actor0 unexpectedHttpErrors1，HTTP403/phase null/UNKNOWN；其餘39因原短路未觀測，不能倒填。
Root以固定hostkey/boot/source及exact容器id/name/image核，兩容器State.Running=false，唯讀2026-11-17T23:19:53Z至23:20:40Z日誌：Auth精確40筆POST /logout、403、session_not_found；Kong精確40筆POST /auth/v1/logout?scope=local、403，無其他HTTP>=400。去識別化投影.git/gcp-vm4-owned-auth-log-projection.json；原日誌不印出。Source映射：成功completeStudentRegistration後auth.signOut→/login，scope local；實裝auth-js2.110.2固定logout?scope=local並將401/403/404視為可完成本地登出。M50 classifier對任何query回UNKNOWN、observer對所有>=400計數，造成此次工具判定阻擋。這不是Hosted驗證，不把舊run改PASS。

## 唯一修改範圍

准在既有capacity-request-observer.ts、capacity-browser-runtime.ts、capacity-registration-ui.ts、capacity-registration-final-diagnostics.ts與對應focused contracts內加入明確onboarding logout lifecycle辨識；必要一個小型純state/helper及其test，全部新檔≤500行。不得改capacity-registration.ts原成功gate/Rootreadback/矩陣、operator45、kernel/manifest、workflow、產品src/supabase或依賴。

僅限同owned actor/page，成功registration_complete實體response後、原UI登出導航/login完成邊界前、唯一sameAPI origin POST exact /auth/v1/logout、唯一scope=local query、403且session_not_found的預期登出；不得全面忽略403或以path-only白名單。若需讀response body，僅用現有CDP/Playwright在記憶體做bounded closed-schema判讀，僅允許固定error_code分類，不輸出/落地rawbody/msg/JWT/headers/query；讀取失敗或未知一律原unexpected/failclosed。SDK容許其他401/404不是本次擴張授權，不添加未證例外。

所有錯誤origin/path/query/method、非註冊期、未成功register、重複logout、其他code/status、提前/過期/跨actor或失敗/取消/UI邊界、後續登入失敗均保留原失敗結果。必須留下bounded expected-event計數/閉集事件證據，不能消失不見；原後續post_registration_login及same-subject Root student/profile/membership readback仍必須通過。不得增加或重試任何實體HTTP，不改各API/entry/send/SLO/health/timeouts/資源上限，不容許先ignore再用未保證的later success合理化。

如現有介面無法安全表達上述時序或code，先向Root列必要最小介面/檔案與取捨，勿放寬條件。先以Source設計具體化，不能為符合brief創造不存在的證據。

## 驗證與保護

TDD產品行為式工具改動：保留真正RED與GREEN，正向唯一預期事件+後續成功、全部上述負向、所有既有observer/runtime/diagnostics contracts；lint/typecheck/format/import/diff必要檢查。禁止skip/deleteassertion/重寫expected迎合錯誤。每筆記錄命令/exit/檔sha，凍結交Root一次review，不另派reviewer。你不是唯一在codebase的人，保留Root docs WIP及全部他人修改。

保護M49/M50/M51私有packets、既有VM1–4/Native36/G8停止85、Original7文件+575959真prefix+package/lock與全部非ownedGit檔；Root新增brief/report/handoff列為Rootowned排除。禁止commit/push/Cloud/Native/Hosted/credentials，禁止復活舊Local。本輪只離線實作。Root接受後另exact新Source/fresh attempt1驗證，仍US150、不升paid、不碰Production、Local gate未完成不部署Staging。
