# 官方參考標準與研究規則追蹤

Codex 遇到框架、平台、安全或 accessibility 行為不確定時，優先查閱原廠文件，不以部落格摘要取代：

- React documentation and release notes: https://react.dev/
- Vite guide: https://vite.dev/guide/
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase local development and CLI: https://supabase.com/docs/guides/local-development
- Playwright screenshots: https://playwright.dev/docs/screenshots
- Playwright trace viewer: https://playwright.dev/docs/trace-viewer
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI-ARIA Authoring Practices — Dialog Modal Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- MDN Visual Viewport API: https://developer.mozilla.org/docs/Web/API/Visual_Viewport_API
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/

## 研究導出的教育 UI 規則

下列規則是專案負責人提供的研究整理，已轉換為產品規格與驗收契約。它們在本專案內具有強制效力；若要寫入論文、研究報告或對外出版物，仍需由研究者補上原始文獻的完整作者、年份、篇名與頁碼，不能把本規格包當作原始文獻引用。

| Reference ID | 研究整理主題 | 對應規格 | 對應驗收 |
|---|---|---|---|
| REF-EDU-UI-001 | Flat Design、視覺降載、減少外在認知負荷 | UI-FLAT-001～004、UI-ACTION-001～004 | AC-UI-008、AC-UI-009 |
| REF-EDU-UI-002 | 問句與按鈕自然配對、行動裝置虛擬鍵盤防呆 | UI-MAP-001～004、UI-KBD-001～004 | AC-UI-009、AC-UI-010 |
| REF-EDU-UI-003 | Dialog 明確離開指示與操作一致性 | UI-DIALOG-001～008 | AC-UI-011、AC-UI-012 |
| REF-EDU-UI-004 | Icon 隱喻符合學習情境，避免 SOS 緊急誤導 | UI-ICON-001～005 | AC-UI-013 |
| REF-EDU-UI-005 | 系統狀態可視性、進度與點選回饋 | UI-STATUS-001～003、UI-STATE-001～006 | AC-UI-014、AC-UI-015 |

## 版本原則

- 初始化專案時鎖定當時穩定且無已知 Critical/High 漏洞的版本。
- 不在本規格硬寫容易過期的 exact package version；以 lockfile、Renovate/Dependabot 與安全更新流程管理。
- Major upgrade 必須先在 staging 跑完整 acceptance。
- External standard 若更新造成規格衝突，先建立 ADR，不得由 agent 靜默改寫驗收門檻。
