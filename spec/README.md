# ColorPlay Spec Index

| 文件 | 內容 |
|---|---|
| `00-project-charter.md` | 產品定位、MVP 範圍、非目標、成功指標 |
| `01-user-roles-and-flows.md` | Student／Teacher 角色、完整路由、Assignments／ColorPlay Live 流程與錯誤狀態 |
| `02-system-architecture.md` | React feature boundaries、Supabase Query／RPC／Edge／Realtime、部署與交易 |
| `03-data-model-and-rls.md` | 資料表、版本、RLS 矩陣、secure functions |
| `04-security-and-privacy.md` | 威脅模型、反篡改、秘密、個資、輸入安全 |
| `05-game-mechanics.md` | Quiz Score、XP、Token、Level、排行榜、商店 |
| `06-content-and-question-bank.md` | 內容層級、題型、發布、XLSX 匯入與版本 |
| `07-ui-visual-system.md` | Flat Design、認知負荷、RWD、虛擬鍵盤、Dialog、Icon、狀態回饋與 accessibility |
| `08-testing-and-evidence.md` | Unit／DB／E2E／Visual、headed 與真實行動裝置證據規格 |
| `09-nonfunctional-requirements.md` | 效能、相容性、可靠性、備份、監控 |
| `10-migration-roadmap.md` | 從原型到正式平台的分階段路線 |
| `11-reference-standards.md` | 官方技術標準與研究導出 UI 規則的追蹤矩陣 |

驗收最終判準請讀：

- `../acceptance/ACCEPTANCE_CRITERIA.md`
- `../acceptance/EVIDENCE_TEMPLATE.md`

環境與遷移決策另見：

- `../docs/adr/0002-colorplay-new-integration-and-production-environments.md`
- `../docs/deployment/environment-matrix.md`
- `../docs/migration/colorplay-new-feature-parity.md`

各規格描述最終目標；尚未實作的 route／feature 以 `10-migration-roadmap.md` 的 owning phase 為準，不得因文件存在就宣稱功能完成。
