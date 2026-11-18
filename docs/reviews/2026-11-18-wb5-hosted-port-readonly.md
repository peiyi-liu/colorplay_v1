# WB5 Hosted 工具移植唯讀盤點

結論：現有Local suite不能只換URL指向Staging。這份是同一implementer的Source-only impact map，非code review／Hosted實測／權限授予；沒有修改Source、網路或測試操作。Root目前仍跑M55 fresh VM8／run44234070950，Local60未完成。

1. Hosted admission：hosted-config／hosted-provenance已有固定Staging ref、fingerprints、Source/artifact/protected-merge、actor/window/retention純guards，但沒有執行入口呼叫validateHostedConfig。回值executionAuthority NONE，不是runner；需Root freshness、單用nonce原子reserve、前級Local收據與artifact/Edge/migration對齊之ReadyLease。既有capacity scope不含完整functional六身份／Admin bootstrap，須另明授scope。
2. Runtime/browser：現有config/capacity-scope/local-runtime/nativeBrowser綁loopback、WeakSet、Linux profile及Local Root helpers。可重用UI定位、repositories、barrier/SLO與journal，但需獨立Hosted runtime、functional/capacity入口與受控transport／oracle ports；不得放寬原Local guards，不能以八個Local containers/cgroup冒當Hosted服務健康。
3. 真郵件：現有Mailpit及@colorplay.test需要獨立hosted-mailbox capability，綁controlled recipient、baseline/newness、唯一OTP／Recovery URL、deadline/abort/私有custody。CI→Root Gmail relay尚未接通，不能跳OTP或假成功；Owner提供信箱並不等於SMTP quota／真到信延遲已證實。
4. Fixtures/oracle/retention：Local admin.createUser、空Auth與固定migration/table census不能套到Hosted。需固定Staging、owned marker、當批前後counts、same-subject/越權證明、Root-only secrets及帳號／留存窗口。Local6+40+60＝106規劃不是106Hosted身份寫入授權；ledger/media/audit不unsafe-delete清零。
5. Workflow/provenance：需分離operator SHA與app/deployment SHA，獨立Hosted workflow；Hosted credentials不能進兩個Local-only workflows。新carrier branch首次push前先精確Vercel opt-out。真Auth版本／限額、SMTP／Resend plan、同IP burst與可得Hosted metrics均須當次驗證；舊snapshot不是本輪PASS／FAIL。

建議有界順序：admission/operator＋fakeIO契約 → controlled-mail／fixtures／readback → functional／15legs adapter及獨立workflow。保250ms entry/send、原SLO及failstop，不先改Hosted限額或產品；產品修補仍需實證與Root唯一review。執行前依WB5呈確切candidate、migration/Functions/monitoring、帳號數、資料政策與窗口，維持exact-head owner-approval。Production禁止。
