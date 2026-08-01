# Task 10 報告：Gate 全電池＋ledger 結批 — GameStage Shell Batch

**結論：BLOCKED — Step 1 靜態電池 `pnpm lint` 在 base 100% 乾淨的前提下，於本批 tip（6c788c3）新增 8 個 lint error，且以獨立乾淨 git worktree 雙向覆核（base e0334fa 對照 6c788c3），逐行 `git blame` 證實全部 8 個 error 皆源自本批 commit `0a324fb`（Task 4：portrait rotate-hint soft banner）。這是可歸因於本批的靜態電池失敗，依 brief 規定 STOP、不代為修正產品碼，Step 2–5（e2e／真跑視覺互動／對比／reduced-motion）未執行。**

## Step 1: 靜態電池

| 檢查 | 結果 | 備註 |
|---|---|---|
| `pnpm exec vitest run` | **PASS** | 119 test files / 812 tests all green（與素材批結批基準 812 一致；本批未淨增測試檔案，因既有 spec 就地擴充） |
| `pnpm typecheck`（`tsc -b --pretty false`） | **PASS** | 無輸出、exit 0 |
| `npx prettier --check`（`src/app/shell/**` `src/app/router/title-page*` `src/styles/tokens.css` `src/styles/tokens.test.ts` `tests/e2e/app-shell.visual.spec.ts` `tests/e2e/helpers/auth.ts`） | **PASS** | "All matched files use Prettier code style!" |
| `pnpm lint`（`eslint . --max-warnings 0`） | **FAIL** | 8 errors（詳下） |

### lint 失敗詳情與歸因

於目前 working tree（`feature/v2-major-update`，含另一 session 未 commit 的無關 WIP 檔）跑 `pnpm lint`：

```
src/app/shell/app-shell.test.tsx
  39:31  error  This assertion is unnecessary since the receiver accepts the original type of the expression  @typescript-eslint/no-unnecessary-type-assertion

src/app/shell/rotate-banner.test.tsx
  20:29  error  This assertion is unnecessary since the receiver accepts the original type of the expression                        @typescript-eslint/no-unnecessary-type-assertion
  25:33  error  Returning a void expression from an arrow function shorthand is forbidden. Please add braces to the arrow function  @typescript-eslint/no-confusing-void-expression

src/test/setup.ts
  18:5   error  This assertion is unnecessary since the receiver accepts the original type of the expression  @typescript-eslint/no-unnecessary-type-assertion
  19:31  error  Unexpected empty method 'addEventListener'                                                    @typescript-eslint/no-empty-function
  20:26  error  Unexpected empty method 'addListener'                                                         @typescript-eslint/no-empty-function
  25:34  error  Unexpected empty method 'removeEventListener'                                                 @typescript-eslint/no-empty-function
  26:29  error  Unexpected empty method 'removeListener'                                                      @typescript-eslint/no-empty-function

✖ 8 problems (8 errors, 0 warnings)
```

**歸因驗證方法**（比照素材批 gate 對 known-red 的雙 worktree 對照法）：

1. `git worktree add <scratch>/wt-6c788c3 6c788c3`（本批 tip，乾淨、無其他 session 的 WIP 汙染）→ `pnpm install --frozen-lockfile` → `pnpm lint` → **逐字重現同一 8 個 error**（僅路徑前綴不同）。排除「working tree 另一 session 的無關改動導致」的可能性。
2. `git worktree add <scratch>/wt-base e0334fa`（本批 base）→ `pnpm install --frozen-lockfile`（`typescript-eslint 8.63.0` 版本與 tip 一致，排除依賴版本漂移）→ `pnpm lint` → **exit 0，0 error**。base 對這三個檔案（含 `src/test/setup.ts`）完全乾淨。
3. `git blame` 逐行核對三個檔案裡被標記的行號：
   - `src/app/shell/app-shell.test.tsx:39` → `0a324fb`
   - `src/app/shell/rotate-banner.test.tsx:20,25` → `0a324fb`
   - `src/test/setup.ts:18-26`（`window.matchMedia` polyfill 整段）→ `0a324fb`

三個檔案的 8 行全部歸屬同一 commit **`0a324fb feat(shell): portrait rotate-hint soft banner with session dismiss`**，落在本批範圍 `51363cf..6c788c3` 內。`src/test/setup.ts` 雖非「shell 目錄」檔案，但 `git diff` 證實這段 `matchMedia` polyfill（含 4 個空 method + 1 個型別斷言）是該 commit 新增，非既有殘留——base 版本完全沒有這段代碼。

**結論：8 個 lint error 100% 可歸因於本批（Task 4, `0a324fb`），非既有債務、非本批未觸碰的既有紅。** ESLint config（`eslint.config.js`）本身在 base..tip 之間未變動，排除規則變嚴的干擾。

## Step 2–6：未執行

依 brief「若任一電池對本批可歸因的缺陷 FAIL：STOP、以具體細節回報 BLOCKED，不得代為修正產品碼」，Step 1 已確立可歸因失敗，故 Step 2（e2e 電池）、Step 3（真跑視覺/互動三情境）、Step 4（對比電池）、Step 5（雙通道 reduced-motion＋console）**未執行**。Step 6（ledger 結批）改記錄 BLOCKED 狀態與此發現，而非完整結批。

## 建議修法（僅供修復者參考，未套用）

- `app-shell.test.tsx:39` / `rotate-banner.test.tsx:20`：`as unknown as MediaQueryList` 斷言在目前 mock 物件形狀下已被 TS 判定為多餘——可能是 mock 物件已完整符合 `MediaQueryList` 的可推斷型別，或應改用更窄的型別／移除 `unknown` 中介層。需視個案改為直接賦值或改窄 mock 型別，不建議整段刪除斷言前先確認 `MediaQueryList` 介面的必要欄位仍受型別檢查保護。
- `rotate-banner.test.tsx:25`：`listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent))` 改成 `listeners.forEach((cb) => { cb({ matches: next } as MediaQueryListEvent); })`（加大括號即可，ESLint 訊息本身已指出修法）。
- `src/test/setup.ts:19,20,25,26`：四個空 method（`addEventListener`/`addListener`/`removeEventListener`/`removeListener`）觸發 `no-empty-function`——可加 eslint-disable 註解說明「polyfill 刻意留空」，或改用 `() => undefined` 之類慣例寫法（視專案既有慣例決定，本次未替 setup.ts 找到同類 no-op 前例可比照）。
- 4 個 error 可被 `eslint --fix` 自動修（型別斷言/空函式類），其餘（void-expression）需手動加括號。

## 環境備註

- 執行時 working tree（`feature/v2-major-update`）另有一組非本批、非本 session 的未 commit 變更（`.gitignore`／`package.json`(`content:*` scripts)／`docs/content/*`／`scripts/content/import-fixes.json`／`src/features/auth/pages/login-page.tsx`／`supabase/seeds/content-*.sql`），研判為題庫 SSOT 管線的平行 session WIP。已核實這些檔案不在本次 `pnpm lint` 的錯誤清單內、不影響本次歸因結論，且完全未觸碰。
- Gate 過程建立的兩個暫時 git worktree（`wt-6c788c3`／`wt-base`）已於診斷完成後 `git worktree remove --force` 清除，未留痕。
- 未建立 `artifacts/design-audit/stage-shell/gate/` 證據（因 Step 3/4 真跑電池未執行）。

## Commit

僅 `.superpowers/sdd/progress.md`（`git add -f`），訊息
`docs(sdd): close game stage shell batch with gate results`。

## Gate fix wave 1

修復 8 個 lint error（全部源自 `0a324fb`），逐項：

- `src/app/shell/app-shell.test.tsx:39`（`no-unnecessary-type-assertion`）— `vi.fn().mockReturnValue({...} as unknown as MediaQueryList)` 移除 `as unknown as MediaQueryList`。`vi.fn()` 無型別參數，`mockReturnValue` 對傳入值本無型別約束，斷言純屬多餘，直接傳原物件字面量即可，行為不變。
- `src/app/shell/rotate-banner.test.tsx:20`（`no-unnecessary-type-assertion`）— 同理，`vi.fn().mockReturnValue(media as unknown as MediaQueryList)` 移除斷言，改為 `vi.fn().mockReturnValue(media)`。
- `src/app/shell/rotate-banner.test.tsx:25`（`no-confusing-void-expression`）— `listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent))` 改為加大括號的區塊：`listeners.forEach((cb) => { cb({ matches: next } as MediaQueryListEvent); })`。純語法調整，行為不變。
- `src/test/setup.ts:18`（`no-unnecessary-type-assertion`）— `window.matchMedia = (query: string) => ({...}) as unknown as MediaQueryList` 移除尾端斷言；物件字面量透過 `window.matchMedia` 屬性型別做 contextual typing 即可通過型別檢查，斷言多餘。
- `src/test/setup.ts:19,20,25,26`（4×`no-empty-function`）— 四個空 method（`addEventListener`/`addListener`/`removeEventListener`/`removeListener`）改用專案既有 no-op 慣例 `() => undefined`（同慣例見 `src/app/boundaries/root-error-boundary.test.tsx:12`、`src/features/quiz/components/countdown.test.tsx:56` 等多處），未使用 eslint-disable。

**修復後電池結果**：

```
$ pnpm lint
$ eslint . --max-warnings 0
（exit 0，無輸出）

$ pnpm typecheck
$ tsc -b --pretty false
（exit 0，無輸出）

$ npx prettier --check <3 個修改檔案>
All matched files use Prettier code style!

$ pnpm exec vitest run src/app/shell src/styles
Test Files  5 passed (5)
     Tests  85 passed (85)

$ pnpm exec vitest run
Test Files  119 passed (119)
     Tests  812 passed (812)
```

三個檔案（`app-shell.test.tsx`、`rotate-banner.test.tsx`、`setup.ts`）皆為修復測試基礎設施/測試碼本身，未觸碰 `rotate-banner.tsx` 或其他產品碼；測試斷言的行為（matchMedia mock 的呼叫序列、事件觸發、UI 斷言）與修復前完全一致。
