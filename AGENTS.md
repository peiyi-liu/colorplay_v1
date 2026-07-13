# ColorPlay AGENTS.md

> 本檔案是 Codex、Superpowers 與所有自動化開發代理進入本專案後的第一讀取入口。它不是完整產品規格，而是「專案地圖、規則索引與工作契約」。

## 1. 專案摘要

ColorPlay 是一個以瀏覽器執行的遊戲式教學平台，第一個正式教學領域為「技術型高中設計群－色彩原理」。平台從既有的單一 HTML 原型重新架構為 React + TypeScript + Supabase 的正式可部署系統。

核心價值：

- 學生可進行課後複習、限時答題、錯題補救、獲得 XP／代幣、解鎖頭像與查看排行榜。
- 教師可管理章節、複習卡、題庫、班級、作答資料與學習診斷。
- 研究者可匯出可追溯、不可由前端任意竄改的學習歷程資料。
- 所有正式成績、獎勵、權限與排行榜結果必須由後端可信邏輯決定。

既有原型只作為 UX 與需求參考，不得直接當作正式安全架構。建議將原始檔放置於 `legacy/colorplay-prototype.html`，且預設只讀。

## 2. 強制閱讀順序

開始任何功能、修正或重構前，依序閱讀：

1. `AGENTS.md`
2. `spec/00-project-charter.md`
3. 與任務直接相關的 `spec/*.md`
4. `acceptance/ACCEPTANCE_CRITERIA.md`
5. `acceptance/EVIDENCE_TEMPLATE.md`
6. 現有實作、測試與最近提交紀錄

涉及跨領域變更時，至少同時閱讀：

- 架構或 API：`spec/02-system-architecture.md`
- 資料表或權限：`spec/03-data-model-and-rls.md`
- 登入、安全、個資：`spec/04-security-and-privacy.md`
- 分數、XP、代幣、排行榜：`spec/05-game-mechanics.md`
- 題庫與匯入：`spec/06-content-and-question-bank.md`
- UI／RWD／視覺：`spec/07-ui-visual-system.md`
- 測試與證據：`spec/08-testing-and-evidence.md`
- 效能與可用性：`spec/09-nonfunctional-requirements.md`

## 3. 文件優先級

需求衝突時依下列順序處理：

1. `acceptance/ACCEPTANCE_CRITERIA.md`：是否可驗收的最終判準
2. `spec/*.md`：產品、架構、資料、安全、遊戲與視覺規格
3. `AGENTS.md`：代理工作規則與專案導航
4. 已核准的 ADR（Architecture Decision Record）
5. 程式碼註解與既有實作

不得自行選擇較容易的解釋。若規格真的矛盾，停止該範圍實作，建立 ADR 或規格修正提案，明確列出衝突、影響與推薦決策。

## 4. 固定技術方向

除非有核准 ADR，不得更換以下核心技術：

- Frontend：React + TypeScript + Vite
- Styling：Tailwind CSS，設計 token 定義於 CSS variables
- Routing：React Router
- Server state：TanStack Query
- Form：React Hook Form + Zod
- Client-only ephemeral state：Zustand；不得用它取代伺服器真實資料
- Backend：Supabase Auth、PostgreSQL、Row Level Security、Storage、Edge Functions／Database Functions
- Unit／Integration：Vitest + React Testing Library
- E2E／Visual evidence：Playwright
- Database／RLS tests：Supabase CLI + pgTAP 或等價 SQL assertions
- Package manager：pnpm

不得引入 Angular、Vue、Next.js、Firebase 或另一套資料庫來「順手解決」局部問題。

## 5. 可信邊界：非談判規則

瀏覽器、React state、DOM、localStorage、IndexedDB、計時器與任何前端輸入都視為不可信。

### 前端允許做的事

- 顯示介面、暫存尚未提交的操作、呼叫 API、呈現後端回傳結果。
- 保存非關鍵偏好，例如主題、動畫偏好、最近開啟頁面。

### 前端禁止做的事

- 決定正確答案、最終分數、XP、代幣、等級、購買結果或排行榜排名。
- 持有 Supabase `service_role`、資料庫密碼或其他高權限秘密。
- 在取得題目時收到 `correct_answer`、正確選項索引、教師私密註記。
- 直接寫入錢包餘額、排行榜、最終成績或審計紀錄。
- 只靠隱藏按鈕保護教師功能。

所有敏感狀態變更必須經由受 RLS、RPC 或 Edge Function 保護的後端流程，並以資料庫交易完成。

## 6. 預期專案結構

```text
colorplay/
├─ AGENTS.md
├─ README.md
├─ package.json
├─ pnpm-lock.yaml
├─ .env.example
├─ src/
│  ├─ app/                 # router、providers、全域錯誤邊界
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ learning/
│  │  ├─ quiz/
│  │  ├─ rewards/
│  │  ├─ leaderboard/
│  │  ├─ profile/
│  │  └─ teacher/
│  ├─ components/          # 跨 feature 的通用元件
│  ├─ lib/                 # supabase client、query client、logger
│  ├─ styles/              # tokens、globals
│  └─ types/               # 產生型 DB types 與跨域型別
├─ supabase/
│  ├─ migrations/
│  ├─ functions/
│  ├─ seed.sql
│  └─ tests/
├─ tests/
│  ├─ e2e/
│  ├─ visual/
│  ├─ fixtures/
│  └─ acceptance/
├─ artifacts/
│  └─ acceptance/          # 驗收證據；CI 可清理但 release 必須封存
├─ spec/
├─ acceptance/
├─ docs/
│  ├─ adr/
│  └─ superpowers/
└─ legacy/
   └─ colorplay-prototype.html
```

以 feature 為切分單位，不得把所有頁面、hooks、API 與型別集中在單一巨型資料夾。單檔超過 300 行時應先檢查責任是否混雜；超過 500 行需在 PR 說明理由或拆分。

## 7. Superpowers 與 Codex 工作流程

任何新功能或行為變更：

1. 先使用 Superpowers `brainstorming`，確認範圍、非目標與方案取捨。
2. 將核准設計寫入 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`。
3. 使用 `writing-plans` 建立 `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`。
4. 以 `using-git-worktrees` 建立隔離工作區。
5. 實作採 TDD：先失敗測試，再最小實作，再重構。
6. 完成前執行 `verification-before-completion`。
7. 重大功能需 `requesting-code-review`。

不得在沒有設計與實作計畫時直接大幅生成程式碼。純文字修正、規格修正或明確的小型 typo 可例外，但仍須執行相關驗證。

## 8. 必須提供的 npm scripts

專案建立後，`package.json` 至少必須提供：

```text
pnpm dev
pnpm build
pnpm preview
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:db
pnpm test:e2e
pnpm test:visual
pnpm acceptance
```

`pnpm acceptance` 必須執行真實 Supabase 測試環境、headed browser 證據流程與驗收 manifest 產生器；不得只把既有 unit tests 換名稱。

## 9. 程式與資料規範

- TypeScript `strict: true`。
- 不得使用未說明的 `any`、`@ts-ignore`、停用 ESLint 規則或跳過測試。
- API 與資料庫型別以 Supabase schema 產生型別為基礎；不得手工複製後長期漂移。
- 所有資料庫變更都必須有 migration；禁止只在 Dashboard 手動改 schema。
- 所有 public schema table 必須啟用 RLS，且預設拒絕。
- 所有 RLS policy 必須有正向與越權負向測試。
- UI 文案使用繁體中文；程式 identifiers、資料庫欄位與檔名使用英文。
- 日期與時間儲存為 UTC；顯示依使用者時區，預設 `Asia/Taipei`。
- 金額／代幣／XP 使用整數，不使用浮點數。
- 每個 mutation 必須考慮重送與 idempotency。

## 10. UI 與認知負荷強制規則

所有學生端 UI 實作必須遵守 `spec/07-ui-visual-system.md`，尤其包括：

- 採扁平化 2D 視覺，禁止 3D、浮雕、斜角、玻璃擬態、多層陰影與無功能持續動畫成為核心操作語言。
- 每個學生核心任務畫面只有 1 個 primary action；同一 interaction group 內同等高權重 action 最多 2 個。
- 問句、輸入與負責提交的按鈕必須位於同一 form/card/dialog/fieldset，不得被排行、獎勵或無關內容分隔。
- 能以選擇、掃描、邀請碼或 profile 資料完成時，不要求學生重複輸入文字。
- 行動裝置軟體鍵盤顯示時，focused input 與 primary action 都必須可見且可操作；不得要求先關閉鍵盤。
- Dialog 必須有明確關閉或繼續指示；Back 優先關閉最上層 Dialog，不得無提示中斷 Quiz。
- 一般學習求助不得使用 `SOS` 或緊急救援圖示；重要 action 必須有可見文字標籤。
- 章節、關卡、題號／總題數、Quiz 狀態與必要分數必須持續可見。
- Focus、selected、pending、disabled、success、error 均需可感知，且正誤不能只靠顏色。

驗收依 `AC-UI-008` 至 `AC-UI-015` 執行。`AC-UI-010` 與 `AC-UI-012` 要求真實行動裝置證據；desktop resize、device emulation 或 headless screenshot 不能單獨取代。

缺少真實 viewport 截圖、操作 sequence、headed browser 或規定的 real-device evidence 時，不得宣稱 UI 完成。

## 11. 測試與證據底線

功能「通過」必須同時具備：

- lint、typecheck、unit、integration、DB／RLS、E2E 均通過。
- 驗收環境使用真實 Supabase local 或 staging，不得 mock application API。
- 核心頁面有 375×812、768×1024、1440×900 真實運行截圖。
- 核心流程有有序截圖、影片或 Playwright trace 證據。
- 至少一次 Playwright headed run；headless CI 結果不能單獨作為 UI 驗收證據。
- Console error、unhandled rejection、非預期 5xx 均為 0。
- 證據目錄與 manifest 符合 `acceptance/EVIDENCE_TEMPLATE.md`。

若缺少任何強制證據，代理只能回報「尚未驗收」，不能宣稱完成。

## 12. 禁止的蒙混方式

- 使用假 API、硬編碼資料或 mock leaderboard 截圖宣稱正式功能完成。
- 只展示 happy path，不測越權、逾時、重送、空資料與錯誤狀態。
- 以「頁面能開」取代流程驗證。
- 只附 terminal log，不附真實畫面。
- 以 headless screenshot 冒充使用者可見的 headed 驗收。
- 以 desktop viewport 縮小高度冒充真實手機軟體鍵盤。
- 只提供 Dialog 關閉後畫面，沒有開啟、操作與返回 sequence。
- 以 SOS／警報圖示表達一般學習求助。
- 在前端 bundle 中放入答案、教師密碼、service role 或其他秘密。
- 將失敗測試改成 skip、降低門檻或刪除 assertion 來取得綠燈。
- 未更新規格就私自改變 XP、代幣、計時、等級或排行榜規則。

## 13. Definition of Done

一項工作只有在以下皆成立時才算完成：

1. 對應規格與驗收 ID 已列出。
2. 實作沒有超出核准範圍。
3. 新增／修改行為已有自動測試。
4. 安全與 RLS 負向測試通過。
5. UI 具備真實瀏覽器證據。
6. 文件、migration、seed、型別同步更新。
7. 所有驗證命令與結果寫入證據 manifest。
8. 沒有未解決的 Critical／High 安全問題。

## 14. 代理回報格式

完成工作時，回報必須包含：

- 變更摘要
- 對應規格／驗收 ID
- 修改檔案
- 執行過的命令與結果
- 證據路徑
- 尚未完成、未驗證或存在風險的項目

不得只回答「已完成」或「測試通過」。
