# Known issues（已知且已登記的例外）

> 這份檔案記錄「知道、但目前刻意不修」的問題。每一筆都要寫明**為什麼不修**、
> **什麼條件下要修**、以及**誰的裁定**。沒有登記在這裡的紅燈一律視為真實失敗，
> 不得在報告中宣稱「已知問題」帶過。

---

## KI-001：Task 4 遺留的 21 條 ESLint 錯誤

- **狀態**：已登記，暫不修復（owner 裁定，2026-08-18）
- **影響指令**：`pnpm lint`（`eslint . --max-warnings 0`）exit 1

### 內容

| 檔案                                             | 條數 | 規則                                                                       |
| ------------------------------------------------ | ---- | -------------------------------------------------------------------------- |
| `scripts/admin/compare-catalog-inventory.mjs`    | 8    | `no-undef`（`process`、`console`）                                         |
| `scripts/admin/generate-sensitivity-catalog.mjs` | 3    | `no-undef`（`console`）                                                    |
| `tests/contracts/phase1-admin-catalog.test.ts`   | 10   | `@typescript-eslint/no-unsafe-*`、`no-unnecessary-boolean-literal-compare` |

全部是**格式與型別嚴謹度**問題：兩支 `.mjs` 是 Node 腳本，但 ESLint 設定沒有為
它們宣告 Node globals；contract test 讀取產生的 JSON 時是 `any`。**沒有任何一條
是安全漏洞**，也不影響這些腳本的實際行為（`admin:catalog:check` 與
`admin:catalog:inventory` 兩道 CI gate 目前都是綠的）。

### 為什麼不現在修

owner 在 Task 13 與 Task 13A 期間明確要求：**不得為了讓畫面全綠而修改
`scripts/admin/*.mjs` 或 `tests/contracts/phase1-admin-catalog.test.ts`**。這條
規則的用意是防止「用修掉警告來假裝問題解決」，並把這些檔案的變更維持在它們
自己的 task 範圍內，避免混進不相干的 diff。

2026-08-18 owner 裁定：維持不修，改以本條目白紙黑字登記，讓 Phase 1 的
Definition of Done 不會因為一句「lint 綠」而說謊。

### 解除條件

Phase 1 gate（Task 15）要求 lint 綠。屆時二選一，需要 owner 拍板：

1. 解除上述禁令，在一個獨立的 S 級任務裡修掉這 21 條（為 `.mjs` 加 Node globals
   宣告、為 contract test 補型別）。
2. 明確把本條目列為 Phase 1 gate 的已核准例外，並在 gate 報告中引用。

在其中一項完成之前，任何「lint 全綠」的宣稱都必須同時指向本條目。
