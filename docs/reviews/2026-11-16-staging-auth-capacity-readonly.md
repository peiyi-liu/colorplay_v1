# Staging Auth／SMTP 容量前置唯讀診斷

結論：**WB5 尚不能依 Local 成果宣稱60人共用教室網路可用**。目前存在同IP突發限流門檻；只提高每5分鐘額度不能視為修好。此為唯讀設定、實際health版本與官方程式碼的離線重現，**不是已觀測到Staging60人失敗**。Local修復與驗證繼續，沒有新增Hosted測試或設定變更。

## 當下實證

2026-11-16，固定Staging ref `onkxnkzeixpezetkmocf` 的管理頁面：custom SMTP已啟用、Host `smtp.resend.com`、Port465、sender name ColorPlay；token refresh150／OTP verify30／signup-signin300，單位皆requests/5min/IP；同user寄信最小間隔60s、IP forwarding關閉。寄信每小時額度、sender address被介面遮蔽，維持UNKNOWN；SMTP帳密未讀，Resend帳號方案／剩餘量未讀。

一次公開key Auth health GET200顯示GoTrue `v2.197.0`，public key只記SHA `287e53db8aa9e39769d1063303af8595c4cee0be211ffd4c34427e1890c1d0ae`。沒有登入、註冊、寄信、load、APIkey或Hosted設定修改；Production操作0。

## 已證程式碼與離線控制

官方對應tag commit `4eee58f296d9698a1c2c0ae14d7a0b379c7622d3`，精確Blob SHA核。其 [Token／Verify limiter](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/apilimiter/apilimiter.go#L197) 與 [Signup constructor](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/apilimiter/apilimiter.go#L358) 的burst固定30；rate欄位控制補充速率。[官方限流文件](https://supabase.com/docs/guides/auth/rate-limits)也區分這兩者。

Root使用原驗證Go1.25.11、固定Auth2.192 module/sum及actual upstream constructor＋tollbooth5.1.1／x/time0.9.0：同key的40次允30／拒10；60次Signup300、Verify30、Token150皆允30／拒30；只改rate至3000的對照仍允30／拒30；60個不同純記憶體key皆允60。各burst80–145微秒。兩版constructor原bytes與這兩個依賴版本相同，**沒有編譯完整2.197/Go1.27服務，也沒有向Hosted送這些請求**。

## 推論與仍未知

同NAT或Edge代理匯聚的Auth流量可能受此上限影響。當前auth-login password grant使用publishable apikey，沒有轉送客戶端IP；實際HostedIP聚合／內部部署策略仍未取證，不從程式碼倒填真實壓測結果。Local缺少rate-limit header的旁路與寬鬆Mailpit只能作Local資格，不能替代Hosted。

SMTP已設定不代表60封投遞已驗；仍需核發信額度、Resend方案及實際投遞。不可用假IP、跳OTP、預建fresh帳號或測試側錯峰來製造PASS。

## WB5待具體決策與下一步

在Local完整functional／15legs及exact candidate準備後，提出能審核的Hosted窗口、帳號／資料保留與limit處理方案。供應商是否可支援burst≥60需另查證；產品若採有界等待／排程，需先明列UI效果與原同步測試契約差異，不能隱性改標準。未有合法具體方案前不做Hosted負載或調額度，不把新增資源／設定當容量PASS。

Private receipt `.git/staging-auth-capacity-readonly/readonly-findings.json` SHA `3d8c5f8ce2a508797771b53c2577d6cf207ec6fd9ac1f8f5896c56bb811956fb`；UI純唯讀，Source／Hosted mutations0、主機US$0。下一步仍完成M16正常停機與冷備份驗證，再進Local全站容量。
