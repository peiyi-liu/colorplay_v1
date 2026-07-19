# ADR 0003: 班級代碼＋學號登入（GGAME 認證語意）

- Status: **Proposed（待 project owner 核准後才得實作）**
- Proposal date: 2026-07-19
- 相關：GGAME 認證入口（owner 於 UI Restyle phase 核准視覺、延後語意）、spec/04（安全與隱私）、ADR 0002（環境策略）

## Context

GGAME 參考稿的登入語意為「班級代碼＋學號/研究編號＋暱稱＋密碼」；現行實作為 Supabase Email/密碼。owner 已核准將欄位語意改為學號制，但此變更觸及信任邊界（身分即研究識別）、RLS 與帳號生命週期，依 AGENTS.md 需以 ADR 定案。

## Decision（提案）

1. **身分映射**：學號登入以「合成 Email」實作——`{學號小寫}@student.colorplay.internal`（保留 Supabase Auth 全部安全機制：bcrypt、session、rate limit）。學號格式 `^[A-Za-z]{2}\d{3,6}$`（如 CP045），前端正規化後組合；`@colorplay.internal` 網域永不收發郵件。
2. **註冊語意**：首次登入即註冊（GGAME「學生註冊登入」）——需班級代碼有效；Edge Function `student_sign_up` 以 service role 驗證班級代碼（沿用既有雜湊驗證）、建立 auth user（合成 Email）、寫入 `profiles.student_code`（unique）並自動入班。之後同學號＋密碼直接登入。
3. **暱稱**：僅作 `display_name`，可後改；不參與身分。
4. **教師端**：維持正式 Email/密碼（教師具管理權限，須可稽核聯絡）。登入頁「教師診斷端」頁籤不變。
5. **密碼政策**：最少 8 碼；忘記密碼由教師端「重設學生密碼」指令處理（Edge Function，教師僅能重設自己班級的學生；產生一次性密碼，首登強制改密）——學生無 Email 可收重設信。
6. **研究識別**：`student_code` 即研究編號；匯出管線改以 `student_code` 之雜湊做匿名鍵（取代 Email 衍生）。
7. **RLS**：不變（身分仍是 auth.uid()）；新增 `profiles.student_code` 欄之讀取限本人＋班級教師。

## 待 owner 拍板的決策點

- [ ] 學號格式與是否區分大小寫（提案：不區分，儲存小寫）。
- [ ] 首登即註冊 vs 教師預先開帳（提案：首登即註冊，需班級代碼）。
- [ ] 教師重設密碼流程是否需留存稽核事件（提案：需要，寫 audit 表）。
- [ ] 既有 Email 測試帳號的遷移／並存策略（提案：Staging 重置時一併淘汰）。

## Consequences

- 需要 1 個 migration（profiles.student_code＋audit）＋2 個 Edge Functions（sign-up／reset）＋登入頁欄位切換＋E2E 全面改寫登入 fixtures。
- 合成 Email 網域必須加入 Supabase Auth 的允許清單並停用確認信。
- 風險：學號猜測攻擊——以班級代碼作第一道門檻＋Auth rate limit；密碼重設走教師人工通道。

## Acceptance traceability（實作 phase 時展開）

AC-AUTH-*（更新）、AC-SEC-002/003、新增 AC-AUTH-STUDENT-01…（註冊/登入/重設/越權矩陣）。
