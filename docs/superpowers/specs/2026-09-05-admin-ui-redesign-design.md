# Admin UI：操作導向 audit 與 redesign 設計

日期：2026-09-05。狀態：owner 已核准設計 A、Task 1–7 完整實作及 Staging Web 部署。

## 1. 結論與範圍

建議採「安靜、可掃讀的營運控制台」：第一屏回答現在需要處理什麼、這次操作到了哪一步、下一個合法動作是什麼。保留現有 routes 與安全控制面，優先修正狀態語意，再調整資訊層級及互動。不要新增平台 KPI、流量圖或裝飾面板。

本輪 audit 固定於 HEAD、本機 origin/staging、唯讀遠端 `refs/heads/staging` 三者一致的 `2a37a0931ff838c7f16580d225ad02b99e21edda`；起始工作目錄乾淨、detached HEAD。已檢查 route、元件、CSS、前端 repository、對應 Edge／migration 與測試。這是程式與契約 audit，尚未做真實 browser 視覺或 Hosted 流程驗證。

Owner 本輪決定優先於舊文件：跨班級學生支援永久取消；Admin C 不得重新納入。第一個 Staging Admin 建立與 MFA 完成為 owner 提供的狀態，本輪未重驗。Admin B Hosted lifecycle 延後统一執行，AC-ADM-007 尚未宣稱通過。Recovery 網址修正由其他 session 負責，整合時保留其結果；PR #14 不在此範圍。本次已授權 Staging Web 部署，不含 Hosted DB migration、Admin B lifecycle 或 Production 操作。

主要設計依據：`ecc:frontend-design-direction`；資訊取捨採 `ecc:dashboard-builder` operator questions／刪除 vanity panels；互動細節採 `ecc:make-interfaces-feel-better`。L 級依 brainstorming 組織探索及取捨；依本輪委派先提供完整可審閱草案與分段計畫，未把草案當作核准規格。未使用 design-taste-frontend。

## 2. 已確認的缺口

| 優先 | 事實與程式來源（相對 repository root）                                                                                                                                           | 影響與改法                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 高   | `pages/admin-overview-page.tsx` 以首批 session 的 `revoked_at === null` 計數；API 已是 keyset pagination                                                                         | 不能称全站有效連線／管理員總數；未撤銷也不等於未過期。刪除該 KPI，改成前往特權連線的入口；若未來需要全量有效統計，另訂 server aggregate |
| 高   | 同頁以 operations／denials 陣列長度當摘要，未讀 truncation；健康 RPC 最多各 50 筆                                                                                                | 不得顯示成完整待辦數或平台健康。保留 server incidents 數字並說明各自範圍，清單明示「最近最多 50 筆」                                    |
| 高   | `components/admin-command-dialog.tsx` 對所有 ok／replayed 顯示「操作已完成」；`supabase/functions/admin-command/index.ts` 的 reset_admin_mfa 後段可留待 reconcile 仍回原 outcome | 按 command-specific result 區分受理、完成、等待對帳；不得以 HTTP 200／ok 證明 saga 全部完成                                             |
| 高   | 共用 dialog 只保存 stable code，丟棄 request／operation context 與 retryable；網路異常只顯示稍後重試                                                                             | 不明結果必須先查狀態或受控轉交；禁止逾時後生成新 key 自動再做一次                                                                       |
| 中   | `pages/admin-audit-page.tsx` 首頁 denial 一律提供重試，與後續頁 retryable 規則不一致                                                                                             | 統一 retryable 規則；保留篩選表單，決定性拒絕提供修改條件而非重送同一請求                                                               |
| 中   | 多個列表以 isError 提前回全頁錯誤；全域 QueryClient staleTime=30 秒、關閉 focus refresh，頁面缺少 dataUpdatedAt／背景刷新呈現                                                    | 區分首次失敗、追加失敗、背景刷新失敗；後兩者保留已知安全資料並標示過期，授權拒絕則立即隱藏資料                                          |
| 中   | overview／health 列表顯示 operation_type、state、current_step；teachers 只分 legalFollowUp，終態共用「完成或終止」                                                               | 使用封閉詞彙表繁中轉譯，區分 completed 與 compensated；不以同一成功色混合成功與已補償                                                   |
| 中   | `api/admin-client.ts` 的 adminRpc 丟出原始 error.message，通用 response 以型別斷言讀取；目前抽查頁面 catch 顯示固定文案                                                          | 尚未證明有原始錯誤 DOM 洩漏，但新共用狀態不可直接接 Error.message；transport 收斂 safe envelope 並 runtime validate                     |
| 中   | MFA challenge 遇 factor lookup 失敗进入通用錯誤分支，沒有明確重查入口                                                                                                            | 加入只重查 factor／重新驗證入口；錯誤 code 清理與 focus 恢復要一致，鎖定與隔離仍不得重試繞過                                            |
| 低   | Shell 導覽混用 Session／MENU；資料索引直接列英文 domain／resource；總覽與健康重複作業表                                                                                          | 統一繁中名稱及 breadcrumb；資料名稱來自安全子集映射；首頁只呈現摘要與明確目的地                                                         |

來源前綴：表中 `pages/`、`components/`、`api/` 皆位於 `src/features/admin/`。CSS 位於 `src/styles/globals.css` Admin 區段。稽核頁「RPC 尚未簽發 cursor」註解已過時：`20260809000200_admin_pagination_row_key.sql` 已實作 cursor，不應把舊註解列為 API 缺口。

## 3. 每頁 operator audit 與設計

下表狀態為 redesign 目標；共同載入、刷新、denial、逾時規則見第 6 節。角色皆為現有角色，沒有新權限。

| 頁面／操作角色                                              | 核心問題、優先資訊                                                                    | 可執行動作與風險                                                                                               | 空／載入／失敗／成功                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/admin`，privileged Admin                                  | 是否有安全異常需要處理？先呈現 server incidents 與待處理摘要，標示查詢時間／截斷      | 到健康頁查看作業、到連線頁檢查存取；不在首頁新增第二套命令入口                                                 | 無待處理≠整个平台健康；各查詢獨立載入／失敗，成功顯示有範圍的摘要                                                             |
| `/admin/teachers`，帳號營運 Admin                           | 找到哪位教師、是否可操作？帳號／名稱／作業狀態優先，聯絡資料保持遮罩                  | 搜尋、狀態篩選、更多、查看、新增；pending 不得重建帳號                                                         | 區分未建立任何教師與篩選無結果；建立顯示受理／狀態查詢／明確終態，成功刷新列表失敗不能宣稱建立失敗                            |
| `/admin/teachers/:teacherId`，帳號營運 Admin                | 此帳號現況與可執行命令？帳號、姓名、遮罩聯絡 Email、server available_commands         | 編輯、明確確認清空 Email、重設、受控揭露；高影響重設不能與普通編輯同級                                         | 查無／拒絕獨立；讀取失敗可重查；完成、補償、待對帳分開。密碼依第 8 節保留受控交付                                             |
| `/admin/access/admins`，安全 Admin                          | 哪個身分需要停用、恢復或重設 MFA？狀態與識別、阻擋原因優先                            | 現有 lifecycle 命令；保留最後有效 Admin 保護，確認框固定目標                                                   | 無資料不代表可建立任意 admin；載入更多保留舊列；被拒顯示理由；MFA 重設先顯示受理並查證後續                                    |
| `/admin/access/invitations`，安全 Admin                     | 邀請發給誰、是否仍有效？遮罩對象／狀態／到期優先                                      | 發出、撤銷、更多；不新增自動重發／寄信                                                                         | 區分空列表、發出中、未確認結果、已建立／replayed；一次性 token 依第 8 節保留受控交付                                          |
| `/admin/access/sessions`，安全 Admin                        | 哪個裝置連線需撤銷？装置、最後活動、撤銷／到期資料                                    | 查看細節、撤銷；不能把未撤銷當權威有效狀態                                                                     | 無列、首載、更多錯誤、成功撤銷各有原位說明；撤銷自己後依 server state 退出，不能留成功畫面冒充仍有權限                        |
| `/admin/data`，授權資料查核 Admin                           | 哪個安全資料來源可查？七個 domain、繁中資源名稱與唯讀用途                             | 只搜尋本機安全目錄／進資源；不得包進完整 catalog、forbidden 名稱或新跨班學生支援入口                           | 靜態 catalog 無網路載入；搜尋無結果可清除條件，不能把無匹配說成 DB 空；生成或解析失敗 fail closed                             |
| `/admin/data/:domain/:resource`，授權資料查核 Admin         | 找到哪幾筆資料？資源名稱、已套用條件、結果、分頁範圍                                  | catalog 允許的篩選／排序、更多、明細、單欄揭露；不新增 export／bulk edit                                       | 無結果可清除條件；首次失敗、追加失敗分開；成功不顯示 total 推算，cursor 原樣帶回                                              |
| `/admin/data/:domain/:resource/:rowKey`，授權資料查核 Admin | 是否為正確一筆、能看到哪些欄位？breadcrumb、可見欄位、遮罩                            | 返回查詢、允許欄位揭露；opaque row token 僅原契約導航，不當診斷碼展示                                          | 位址無效、資源拒絕、查無各明示；揭露 null≠尚未揭露；replay 不重送明文，關閉回遮罩                                             |
| `/admin/audit`，安全稽核 Admin                              | 誰在何時做什麼、結果如何？時間／操作／結果優先，actor 等細節次之                      | 既有時間、actor、action、target type、result 篩選；查看已去識別細節／更多；無匯出                              | 無符合紀錄不表示無事件；保留條件；typed denial 遵守 retryable；request ID 顯示可複製，不能假造尚無的 request ID server filter |
| `/admin/health`，安全 Admin／需 OOB 的 owner                | 哪個作業卡住、能做什麼？server action_kind、作業狀態／更新時間／下次重試優先，ID 次之 | 僅 reconcile／manual_retry 提供相應命令；pending 等待、owner_oob 提供回報指引。教師對帳不變成 browser 自助執行 | 無進行作業不宣稱服務整體正常；部分成功／等待／stuck 各分明；受理後刷新、未確認不能顯示已修復                                  |
| `/admin/invitations/accept`，已登入受邀者，pre-privileged   | 邀請是否接受、下一步如何取得存取？邀請輸入與單一接受動作                              | 接受後 profile refresh 再進 enroll；不能提前查 Admin 控制資料                                                  | 空輸入可驗證；錯誤邀請統一文案不洩存在性；網路未知不自動重送；成功與 refresh 失敗分開，網址修正不在本輪                       |
| `/admin/mfa/enroll`，pending MFA Admin                      | 如何綁定、下一步驗證？步驟與驗證欄位                                                  | 既有 begin／confirm；QR／secret 依第 8 節保留受控設定                                                          | 請求設定中、生成失敗可明確重試、鎖定不可繞過、確認成功後到 challenge；不把設定資料放入診斷                                    |
| `/admin/mfa/challenge`，待重新驗證 Admin                    | 為什麼需要驗證、完成後回哪裡？短說明、驗證碼欄、原目標                                | factor 查詢、challenge，成功等待 session refresh 再導航                                                        | factor 查詢中與查無不同；錯碼可改、鎖定／隔離終止；失聯保留重查入口；TOTP 不回填到 URL／cache／回報碼                         |

## 4. 設計方向與取捨

| 選項                                  | 優點                                               | 成本／缺點                                                             | 建議                       |
| ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------- |
| A 保留 routes，重排操作資訊與共用狀態 | 可沿用安全契約和測試；教師營運容易找到；可分段交付 | 安全作業仍有獨立健康頁                                                 | 採此方案                   |
| B 把所有工作集中成新作業工作台        | 單一入口統一追查                                   | 現有 API 無通用 operation lookup／全量待辦；需新後端契約與額外安全驗證 | 本輪不採，先不擴充後端平台 |
| C 只調色彩、卡片與間距                | 變更小                                             | 仍會誤報完成與有效數量，不能滿足本輪目標                               | 排除                       |

Purpose：反覆查核帳號與安全作業。Audience：少數 privileged Admin，不是學生或一般教師。Tone：安靜、務實、中等資訊密度。識別細節：每個操作都有固定位置的「目前狀態 → 下一步」區塊；追蹤碼在次要位置，長值可折行／複製。

使用既有 neutral surface、text、border、primary tokens 與 Noto Sans TC；primary 用在頁面主要工作，警示只用於真實待處理或破壞性動作。標題約 24–28px、正文 16px、次要資料不小於 14px，數字 tabular-nums。一般表格以線分隔；不做卡片套卡片、巨型 hero、裝飾圖或新增品牌色系。MFA 頁也回歸清晰表單，保留安全流程。

## 5. 資訊架構與版面

保留所有 canonical routes。導覽順序：安全總覽、教師帳號、身分與存取（管理員／邀請／特權連線）、資料查核（資料瀏覽／稽核紀錄）、系統健康。Teacher 升為獨立常用入口；安全總覽保留為 `/admin`，避免改登入目的地。

```text
管理控制台導覽       頁面名稱                         主要動作
                    breadcrumb／資料用途
                    最近成功取得時間｜刷新中／可能過期｜重新整理
                    待處理狀態：發生什麼 → 可做什麼
                    搜尋與已套用条件
                    清單（識別 → 狀態 → 次要資料 → 動作）
                    已載入範圍／載入更多
```

桌面 ≥1024px 保留側欄但收斂至約 224px；小螢幕為具 aria-expanded 的「開啟導覽」，換頁收起，單一 main。教師／邀請／管理員列可在窄版變成有相同標籤的堆疊資料列；generic data／audit 仍保留有名稱、可鍵盤聚焦的局部橫向表格，不讓整頁溢位。次要 ID 置於 details，primary action 44px 以上，不在顯示 pending 時變寬。

Dialog 固定顯示目標、動作後果、必要理由、結果區與關閉控制。超過 10 秒可以「關閉視窗，稍後查看狀態」，明說關閉不會撤銷已送出的作業；原請求狀態由非秘密 operation controller 接手。不得在未建立安全狀態保留機制前直接解除 pending lock。鍵盤 focus trap／restore、Escape 不連帶關 sidebar、reduced motion、200% zoom 納入驗證；只對 color／background／opacity 做短 transition，不對整列表縮放。

## 6. 全鏈路狀態契約

| 狀態               | 顯示與下一步                                         | 可信來源／限制                                                                                                |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 首次讀取           | 保留標題與工具列位置、局部 loading、aria-busy        | 不能顯示 0 代替未知                                                                                           |
| 刷新               | 舊資料可讀、正在更新、最近成功取得時間               | dataUpdatedAt 是 client 取得時間，不是 DB 更新時間                                                            |
| 過期／刷新失敗     | 原位說明目前為上次結果、手動刷新；敏感動作前重取目標 | 30 秒沿用現有 staleTime 作 UX 提示，不能推算授權有效期；授權／資源拒絕不保留受保護畫面                        |
| 追加資料失敗       | 保留先前列，獨立顯示未載入部分及合法重試             | typed denial 與 transport failure 都要測；不把快取舊列說成完整結果                                            |
| 送出中             | 100ms 內鎖定重複送出，300ms 內有回饋                 | 重試關閉；idempotency 與 receipt 最終由 server 決定                                                           |
| 超過 10 秒         | 「尚未收到最終結果」＋查狀態／停止等待               | 只是等待逾時，不能聲稱操作失敗或取消。讀取可取消；mutation abort 不能當 rollback                              |
| 確定完成           | 原位置顯示具體結果，再刷新相關 query                 | 僅 command terminal result；replayed 表示先前結果，禁止重現一次性內容                                         |
| 已受理／部分完成   | 「已受理，仍待處理」或 server-confirmed 部分狀態     | 不做假的百分比；只轉譯 allowlisted state／current_step                                                        |
| 可重試拒絕         | 固定安全文案、有效 request ID、重試動作              | server retryable=true 且符合 command-specific follow-up；不能只凭 code 猜                                     |
| 不可重試拒絕       | 說明修正條件／重新驗證／交由 owner                   | 缺 retryable 的 denial 預設不可重試；不得以新 UUID 自動繞過衝突                                               |
| 未知結果／網路失敗 | 「尚無法確認結果」，查詢狀態而非再做一次             | 教師使用原 command+requestId 呼叫 admin_get_teacher_operation；只在 retry_same_request 時人工沿用原輸入和 key |
| 待對帳             | 操作類型、時間、safe operation ID 與合法目的地       | health 依 action_kind，教師 health_reconciliation 仍可能 owner_oob；不得宣稱點擊即修復                        |
| 鎖定／stale／隔離  | 同頁安全提示或現有 challenge return intent           | 不把前端時鐘或 hidden button 當授權；不自動重送 mutation                                                      |

通用安全命令目前沒有已查證可用的全量 request-id operation lookup。對已回傳 operation ID 者可在 health 最近清單定位；未找到（可能截斷）、沒有 ID 或跨頁刷新丟失上下文時，顯示「尚無法確認」，交由 owner 依現有稽核／runbook 查證。禁止推論「查不到＝未受理」。若 owner 要求所有命令都可自助 reconcile，需另批後端契約 task。

新增 safe response normalization：固定 code/message mapping；驗證 request_id／operation_id 為 UUID；未知 state 顯示「狀態尚無法辨識」並禁用推測動作。無 ID 就不顯示，不生成假的 server request ID。client idempotency key 若需呈現必須另外標「本次操作識別碼」。只複製已驗證的非秘密 ID，不複製 response JSON／headers／stack／args。既有 cursor／row_token／receipt credential 不屬於可呈現診斷碼。

UI 狀態僅存在當前 Admin session 的記憶體，登出／身分切換／權限失效清除；不新增 localStorage／URL 診斷參數。非秘密作業摘要可以跨 dialog 保留，但重送所需 personal args 僅暫存在原操作控制器；controller 已失效時不得只憑 ID 猜輸入重送。fresh TOTP、authorization receipt、canonical hash、RLS／RPC／Edge 保持後端權威。

## 7. 驗證與完成邊界

本輪執行 `pnpm exec vitest run src/features/admin --reporter=dot`：28 files／267 tests PASS。pnpm 首次使用由本機快取還原 lockfile 依賴，未下載套件。結果只證明現有單元基線；未跑 Hosted、DB reset、真實 browser 或 phase gate。

實作測試新增：非終態 ok 不顯示完成、逾時後延遲成功不重送、不可重試 denial、first／next-page transport failure、背景刷新失敗保留安全列、權限失效清除、截斷非總數、compensated 非成功、safe ID 驗證／複製失敗、秘密不進 status／toast／cache／URL、重驗證 return intent。既有 267 tests 按行為更新，不刪 assertion 避開失敗。

對應 AC：AC-ADM-001／002／004／005／006；建立及補償語意沿用 AC-ADM-003；互動適用 AC-UI-009／011／014／015。AC-UI-010／012 真實裝置證據仍待人工；AC-ADM-007 Hosted gate 延後，與本 UI task 完成分列。

## 8. Owner 已確認的憑證顯示邊界

2026-09-05 owner 回覆「是」，確認保留既有一次性教師密碼交付、管理員邀請 token，以及 MFA QR／設定 secret／驗證碼輸入的受控流程。禁止秘密顯示的要求適用於一般狀態、錯誤、追蹤與診斷資訊；不取消上述既有流程。

狀態元件永不接收秘密。受控交付沿用既有 ephemeral state、關閉／複製後清除及 replay 不重現明文的契約；秘密不得進入一般 toast、query cache、URL/history、log、analytics 或回報碼。service-role、內部合成 Email 等禁止暴露邊界不擴張。

憑證範圍問題已解除，不需再次詢問；本次回覆確認此項契約語意，後續 owner 已核准整體設計 A、Task 1–7 實作與 Staging Web 部署。
