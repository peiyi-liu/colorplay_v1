# HUD 導覽重組批 — 斷言授權清單（Task 1 盤點）

盤點基準：`feature/v2-major-update`（HEAD `4cce2d7`，唯讀 grep＋逐檔閱讀＋跑既有測試確認基線綠燈，不動產品碼／測試碼）。
格式：`檔:行｜斷言｜受影響 Task（2/3/4）｜處置（存活/開 MENU 後斷言/改直達路由/不碰-既知紅）`。**後續 task 只能動本清單內的行。**

跑基線確認（唯讀，未改任何檔）：

```
npx vitest run src/app/shell/hud-command-bar.test.tsx src/app/shell/app-shell.test.tsx
```

結果：2 files / 20 tests，全綠。

---

## 授權清單 — 單元測試

### `src/app/shell/hud-command-bar.test.tsx`（Task 2 file）

| 行號   | 斷言                                                                                | Task | 處置                                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 38     | `getByRole('navigation', { name: '主要導覽' })).toBeVisible()`                      | 2    | 存活——列上 nav landmark 仍在，只是子項從 7 減為 2（`學習大廳`/`Live 課堂`）。                                                                                                                                                                                                                                                                 |
| 39-49  | for 迴圈斷言 7 個標籤 `getByRole('link', { name: label })).toBeVisible()`           | 2    | **整條拆分**：2 項（`學習大廳`/`Live 課堂`）留列上直接斷言；5 項（`課後任務實戰`/`裝備商店`/`我的錯題`/`班級排行榜`/`成就徽章`）改「先 `userEvent.click(MENU)` 再於面板內 `getByRole('link')` 斷言」。計畫 Task 2 Step 1 已逐字給出替代測試（`within(bar).getAllByRole('link')).toHaveLength(2)` ＋開 MENU 後 `within(panelNav)` 5 項迴圈）。 |
| 54     | `getByRole('navigation', { name: '教師導覽' })).toBeVisible()`                      | 2    | 存活——同上，子項從 4 減為 2（`教師工作區`/`Live 主持`）。                                                                                                                                                                                                                                                                                     |
| 55-57  | for 迴圈斷言 4 個標籤可見                                                           | 2    | **整條拆分**：2 項留列上；2 項（`班級管理`/`教學分析`）改開 MENU 後於面板內斷言。計畫 Task 2 Step 1 已給出替代測試。                                                                                                                                                                                                                          |
| 60-70  | MENU 收使用者名與登出（`點擊 MENU`→`登出` 按鈕、`onSignOut` 委派）                  | 2    | 存活——新增的面板導覽區不影響 `hud-menu__user`/登出按鈕的既有斷言；`登出` 仍是唯一 `button` role（見 (c)）。                                                                                                                                                                                                                                   |
| 72-79  | Escape 關閉 MENU 並將焦點送回 MENU 切換鈕                                           | 2    | 存活——面板內容增加不影響 Escape/焦點機制（批⑤b 機制零改動，spec §1 明定）。                                                                                                                                                                                                                                                                   |
| 83-85  | `getByRole('link', { name: '班級管理' })).toHaveClass('hud-command__link--active')` | 2    | **改開 MENU 後斷言**——`班級管理` 移入面板，收合時查不到；面板內 active class 名稱改用計畫定義的 `hud-menu__nav-link--active`（非 `hud-command__link--active`），斷言需同步改。                                                                                                                                                                |
| 86-88  | `getByRole('link', { name: '教學分析' })).not.toHaveClass(...)`                     | 2    | 同上——**改開 MENU 後斷言**，class 名稱同步改 `hud-menu__nav-link--active`。                                                                                                                                                                                                                                                                   |
| 91-96  | MENU 面板收合時仍掛在 DOM 且 `hidden`，`aria-controls` 不懸空                       | 2    | 存活——面板結構機制不變，僅內容新增導覽區。                                                                                                                                                                                                                                                                                                    |
| 98-106 | 點擊面板外關閉 MENU；開啟時焦點移入面板                                             | 2    | 存活——同上，機制零改動。                                                                                                                                                                                                                                                                                                                      |

### `src/app/shell/app-shell.test.tsx`（Task 4 file——含 Task 2 造成的連帶斷裂，由 Task 4 一併修）

| 行號    | 斷言                                                                                                         | Task | 處置                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 147     | `queryByRole('link', { name: '教師工作區' })).toBeNull()`（學生視角）                                        | 4    | 存活——教師導覽本就不對學生渲染，與面板收合無關。                                                                                                                                                                                                |
| 148     | `queryByText(/教師端/u)).toBeNull()`（學生視角）                                                             | 4    | 存活——教師識別整段對學生不渲染；新文案「歡迎，…・教師端」仍含子字串「教師端」，但學生分支整段不存在，不影響本斷言。                                                                                                                             |
| 149-152 | `getByRole('link', { name: '裝備商店' })).toHaveAttribute('href', '/app/shop')`                              | 4    | **改開 MENU 後斷言**——`裝備商店` 移入學生面板 5 項之一。                                                                                                                                                                                        |
| 153-156 | `getByRole('link', { name: '班級排行榜' })).toHaveAttribute('href', '/app/leaderboard')`                     | 4    | **改開 MENU 後斷言**——同上，面板內。                                                                                                                                                                                                            |
| 157-161 | `getAllByRole('link', { name: '成就徽章' })).toHaveLength(1)` ＋ href 斷言                                   | 4    | **改開 MENU 後斷言**——同上，面板內。                                                                                                                                                                                                            |
| 173-175 | `Level 2` / `250 / 500 XP` / `250 Token` 文字可見                                                            | 4    | 存活——`EconomySummaryView` 文字內容不變，只是外層多包一層 `.hud-economy-group`；DOM 結構斷言用 `getByText`，不受包裹影響。                                                                                                                      |
| 176     | `mockedUseEconomySummary).toHaveBeenCalledOnce()`                                                            | 4    | 存活——學生端仍消費 `useEconomySummary`，呼叫路徑不變。                                                                                                                                                                                          |
| 179-207 | 登出狀態不查詢/不捏造經濟資料（含 `queryByRole('banner')).toBeNull()`）                                      | 4    | 存活——未登入時 `header`（`hud-top`）整段不渲染，與面板收合無關。                                                                                                                                                                                |
| 209-237 | 經濟資料載入中/失敗訊息，never fabricate `0 Token`                                                           | 4    | 存活——`AuthenticatedEconomySummary` 元件邏輯不變，只換父層包裹。                                                                                                                                                                                |
| 272-275 | `getByRole('link', { name: '教師工作區' })).toHaveAttribute('href', '/teacher')`                             | 4    | 存活——留列上，未移入面板。                                                                                                                                                                                                                      |
| 276-279 | `getByRole('link', { name: '班級管理' })).toHaveAttribute('href', '/teacher/classes')`                       | 4    | **改開 MENU 後斷言**——`班級管理` 移入教師面板 2 項之一。                                                                                                                                                                                        |
| 280-283 | `within(getByRole('banner')).getByText('teacher・教師端')`                                                   | 4    | **改文字斷言**——教師識別新增「歡迎，」前綴，字串改為 `'歡迎，teacher・教師端'`（原字串為子字串匹配用 exact getByText 會直接找不到，須整段換新字串）。                                                                                           |
| 295-298 | `getByRole('link', { name: '學習大廳' })).toHaveAttribute('href', '/app')`                                   | 4    | 存活——留列上，未移入面板。                                                                                                                                                                                                                      |
| 299-302 | `getByRole('link', { name: '課後任務實戰' })).toHaveAttribute('href', '/app/missions')`                      | 4    | **改開 MENU 後斷言**——移入學生面板。                                                                                                                                                                                                            |
| 303-306 | `getByRole('link', { name: '裝備商店' })).toHaveAttribute('href', '/app/shop')`（同 149-152 重複）           | 4    | **改開 MENU 後斷言**——同上。                                                                                                                                                                                                                    |
| 308-310 | `queryByRole('link', { name: '進入大廳'/'我的作業'/'教師後台' })).toBeNull()`                                | 4    | 存活——與本批無關的既刪功能守門斷言。                                                                                                                                                                                                            |
| 311     | `queryByText('色彩原理學習平台')).toBeNull()`                                                                | 4    | 存活——與本批無關。                                                                                                                                                                                                                              |
| 314-326 | `nav = getByRole('navigation', {name:'主要導覽'})`；`linkNames` 陣列 `toEqual([7 項])`                       | 4    | **整條改寫**——列上只剩 2 項，`linkNames` 陣列斷言須改為 `['學習大廳', 'Live 課堂']`（`toHaveLength(2)`）；原 7 項完整標籤/順序覆蓋率改由 Task 2 的 `hud-command-bar.test.tsx` 面板迴圈測試承接，此處不重複維護 7 項陣列，避免兩處來源真相打架。 |
| 327     | `queryByRole('link', { name: '學習進度' })).toBeNull()`                                                      | 4    | 存活——既刪功能守門，與本批無關。                                                                                                                                                                                                                |
| 328-331 | `getByRole('link', { name: '我的錯題' })).toHaveAttribute('href', '/app/mistakes')`                          | 4    | **改開 MENU 後斷言**——移入學生面板。                                                                                                                                                                                                            |
| 367     | `queryByRole('link', { name: '題庫管理' })).toBeNull()`                                                      | 4    | 存活——既刪功能守門，與本批無關。                                                                                                                                                                                                                |
| 368-371 | `getByRole('link', { name: 'Live 主持' })).toHaveAttribute('href', '/teacher/live')`                         | 4    | 存活——留列上，未移入面板。                                                                                                                                                                                                                      |
| 372-375 | `getByRole('link', { name: '班級管理' })).toHaveAttribute('href', '/teacher/classes')`（同 276-279）         | 4    | **改開 MENU 後斷言**——同上，面板內。                                                                                                                                                                                                            |
| 376-379 | `getByRole('link', { name: '教學分析' })).toHaveAttribute('href', '/teacher/analytics')`                     | 4    | **改開 MENU 後斷言**——移入教師面板。                                                                                                                                                                                                            |
| 380-383 | `getByRole('link', { name: '教師工作區' })).toHaveAttribute('href', '/teacher')`（同 272-275）               | 4    | 存活——留列上。                                                                                                                                                                                                                                  |
| 385     | `queryByText('教師管理權限已授權')).toBeNull()`                                                              | 4    | 存活——與本批無關。                                                                                                                                                                                                                              |
| 386-387 | `queryByRole('link', { name: '學習大廳'/'裝備商店' })).toBeNull()`（教師視角）                               | 4    | 存活——教師視角本就不渲染學生導覽，與面板收合無關。                                                                                                                                                                                              |
| 415-420 | `awaits signOut...`：`userEvent.click(MENU)` → `userEvent.click('登出')`                                     | 4    | 存活——與 (c) 同結論，`登出` 仍是唯一 `button` role。                                                                                                                                                                                            |
| 443-450 | `keeps the authenticated shell when signOut rejects`：同 MENU→登出 流程                                      | 4    | 存活。                                                                                                                                                                                                                                          |
| 522-533 | `allows account B to sign out...`：MENU→登出 流程＋fallback 登出鈕（`hud-menu__logout--fallback`，非面板內） | 4    | 存活——fallback 按鈕是 `isAuthenticatedProfile=false` 時另一條件式渲染的獨立按鈕，不在 `#hud-menu-panel` 內，不受面板重組影響。                                                                                                                  |

**淨結果**：`hud-command-bar.test.tsx` 10 條測試中 4 條（39-49/55-57/83-85/86-88）需改寫；`app-shell.test.tsx` 39 條斷言點中 11 條（149-161/276-279/280-283/299-306/314-326/328-331/372-379）需改寫，其餘存活。

---

## 授權清單 — e2e（綠 spec）

### 全域 grep：綠 spec 是否經 HUD 點擊「將移入面板的 7 個標籤」

```
grep -rn "name: '課後任務實戰'\|name: '我的錯題'\|name: '班級排行榜'\|name: '成就徽章'\|name: '裝備商店'\|name: '班級管理'\|name: '教學分析'" tests/e2e --include="*.ts"
```

命中檔案（含放寬引號比對後複驗）：`learning-experience.spec.ts`、`ui-restyle.spec.ts`、`game-economy.spec.ts`、`achievements.spec.ts`、`tests/e2e/helpers/classrooms.ts`（僅註解，非斷言）、`tests/e2e/helpers/mission.ts`（僅註解，非斷言）。**這四支 spec 全部是既知紅清單成員**（`assignments-live/live-advanced/achievements/game-economy/learning-experience/session-lifecycle/shared-device/ui-restyle`）。

| spec:行                               | 內容                                                                                        | 既知紅 | 處置                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| `game-economy.spec.ts:98,149`         | `page.getByRole('link', { name: '裝備商店' }).click()`                                      | 是     | **不碰**（既知紅）                          |
| `achievements.spec.ts:85`             | `page.getByRole('link', { name: '成就徽章' }).click()`                                      | 是     | **不碰**（既知紅）                          |
| `learning-experience.spec.ts:202,230` | `getByRole('heading', { name: '我的錯題' })`／`getByRole('link', { name: '返回我的錯題' })` | 是     | **不碰**（既知紅；非 HUD 點擊，屬頁內元素） |
| `ui-restyle.spec.ts:82`               | 純註解「// 3. 課後任務實戰」                                                                | 是     | **不碰**（既知紅；非斷言，假陽性）          |

**綠 spec 掃描結果：0 支。** 沒有任何非既知紅的 e2e spec 經由底部 HUD 點擊這 7 個標籤導覽——`classroom-leaderboard.spec.ts`（唯一有機會碰 `班級排行榜` 流程的綠 spec）改用 `page.goto(\`/app/leaderboard/${classroomId}\`)`直達（見`classroom-leaderboard.spec.ts:199,233`），不經 HUD 點擊。

### `主要導覽`／`教師導覽` landmark 斷言（綠 spec）

| spec:行                               | 斷言                                                                           | 處置                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `classroom-leaderboard.spec.ts:56,73` | `page.getByRole('navigation', { name: '主要導覽'/'教師導覽' })).toBeVisible()` | 存活——nav landmark 本身仍渲染，只是子項從 7/4 減為 2；斷言不檢查子項數量，不受影響。 |
| `learning-experience.spec.ts:55`      | 同上 `主要導覽`                                                                | 既知紅，不碰。                                                                       |
| `assignments-live.spec.ts:39,58`      | 同上                                                                           | 既知紅，不碰。                                                                       |

### `signOutViaHud` 呼叫端（綠 spec）

| spec                     | 是否使用 `signOutViaHud` | 處置                                              |
| ------------------------ | ------------------------ | ------------------------------------------------- |
| `shared-device.spec.ts`  | 是                       | 既知紅，不碰（在既知紅清單內）。                  |
| `auth-account.spec.ts`   | 是                       | 存活——見 (c)，helper 機制不受面板新增導覽區影響。 |
| `playable-slice.spec.ts` | 是                       | 存活——同上。                                      |
| `ui-restyle.spec.ts`     | 是                       | 既知紅，不碰。                                    |

**結論：Task 3 不需要對任何綠 e2e spec 做「點擊已移入面板連結」的前置 `openHudMenu` 改寫**（因為沒有綠 spec 這樣做）；Task 3 的實際工作是（1）新增 `openHudMenu` helper 供未來/既知紅 spec 重寫時使用（2）確認 `signOutViaHud` 相容（已確認相容，見 (c)）（3）視覺快照重拍（見 (f)，結論是 0 張需重拍，但仍建議照計畫跑一次 `--update-snapshots` 驗證零 diff 作為證據）。

---

## (a)-(g) 必答

**(a) 單元測試逐條處置**

見上方兩張表。摘要：

- `hud-command-bar.test.tsx`：4 條標籤/active 測試需改「先 `userEvent.click(MENU)` 再斷言面板內 link」；6 條（MENU 開關/Escape/click-outside/hidden 屬性）存活不動。計畫 Task 2 Step 1 已逐字給出取代測試碼，可直接沿用。
- `app-shell.test.tsx`：11 條斷言點需改「開 MENU 後於面板內斷言」或改字串（教師歡迎識別文案），28 條存活。314-326 的 7 項陣列斷言建議整條改寫為 2 項陣列，7/5 項完整覆蓋交給 `hud-command-bar.test.tsx` 承接，避免兩處重複維護同一份標籤清單造成未來修改遺漏。

**(b) 綠 e2e 逐支處置**

**0 支綠 e2e spec 受影響。** 經全域 grep＋逐檔複驗，會經由底部 HUD 點擊「7 個移入面板標籤」的 e2e spec 全部落在既知紅清單內（`game-economy.spec.ts`/`achievements.spec.ts`/`learning-experience.spec.ts`/`ui-restyle.spec.ts`），全部標記「不碰」。唯一命中 `班級排行榜` 相關流程的綠 spec（`classroom-leaderboard.spec.ts`）本來就用 `page.goto` 直達班級排行榜頁面，不經 HUD 點擊，零影響。`主要導覽`/`教師導覽` landmark 可見性斷言（`classroom-leaderboard.spec.ts:56,73`）不受面板收合影響（landmark 仍渲染，只是子項變少）。Task 3 因此不需要修改任何綠 spec 的導覽流程；Task 3 的工作範圍縮小為新增 `openHudMenu` helper（供既知紅 spec 未來重寫使用）＋視覺快照複驗（結論見 (f)：0 張需重拍）。

**(c) `signOutViaHud` 穩定性**

`signOutViaHud`（`tests/e2e/helpers/auth.ts:44-47`）實作：

```ts
export async function signOutViaHud(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'MENU' }).click();
  await page.getByRole('button', { name: '登出' }).click();
}
```

加入面板導覽區後仍穩定，理由：計畫 Task 2 的面板導覽項一律用 `NavLink`（渲染為 `role="link"`），與 `登出` 按鈕（`role="button"`）不同 role，`getByRole('button', { name: '登出' })` 不會與新增的導覽項衝突，selector 依然唯一。單元測試 `app-shell.test.tsx:415-420/443-450/522-533` 三處既有的「`userEvent.click(MENU)` → `userEvent.click('登出')`」流程與 `signOutViaHud` 邏輯同構，可作為此結論的既有測試佐證。**結論：不需要加固，helper 原樣沿用。**

**(d) `useBlookInventory`/`BlookArt` 簽名抄錄**

`src/features/inventory/hooks/use-blook-inventory.ts`：

```ts
export const inventoryQueryKey = ['inventory', 'blooks'] as const;

export function useBlookInventory(
  repository?: InventoryRepository,
): UseQueryResult<BlookInventory, InventoryRepositoryError>;
```

`src/features/inventory/types.ts`（`BlookInventory`/`BlookInventoryItem` 形狀，`useBlookInventory` 的 `data` 型別）：

```ts
export type BlookInventoryItem = Readonly<{
  id: string;
  stableCode: string;
  name: string;
  emoji: string;
  costTokens: number;
  owned: boolean;
  equipped: boolean;
}>;

export type BlookInventory = Readonly<{
  tokenBalance: number;
  activeBlookId: string;
  items: readonly BlookInventoryItem[];
}>;
```

`src/components/ui/blook-art.tsx:443-451`：

```ts
export function BlookArt({
  stableCode,
  emoji,
  size = 64,
  label,
}: {
  stableCode: string;
  emoji?: string | undefined;
  size?: number;
  label?: string | undefined;
});
```

Task 4 消費法（計畫已定案，與此抄錄簽名一致）：`inventory.data?.items.find((item) => item.equipped)`，找到就 `<BlookArt emoji={equipped.emoji} size={26} stableCode={equipped.stableCode} />`，找不到 fallback hero 精靈（CSS 背景）。

**(e) `AuthenticatedEconomySummary` 現行 render 位置與測試斷言**

`src/app/shell/app-shell.tsx:13-31` 定義 `AuthenticatedEconomySummary`（loading/error/success 三態，success 回傳 `<EconomySummaryView summary={economy.data} />`）。渲染點在 `app-shell.tsx:98-99`：

```tsx
{isAuthenticatedProfile ? (
  <header className="hud-top">
    <AuthenticatedEconomySummary />
    {isTeacher ? (
      <span className="hud-top__identity">
        <Icon name="lock-open" size={14} />
        {profile.data?.displayName}・教師端
      </span>
    ) : null}
    ...
```

現況：**學生與教師都無條件渲染 `AuthenticatedEconomySummary`**（教師目前也看得到經濟數字，只是額外多顯示 `hud-top__identity` 徽章）。Task 4 要做的改動是把這行改成 `isTeacher ? <教師歡迎識別> : <div className="hud-economy-group"><StudentHudAvatar /><AuthenticatedEconomySummary /></div>`，讓教師端不再消費 `useEconomySummary`。相關測試斷言：`app-shell.test.tsx:164-177`（學生端經濟摘要顯示，存活）、`272-284`（教師端目前的 `教師工作區`/`班級管理` href＋`banner` 內 `'teacher・教師端'` 文字，後者需改字串見 (a) 280-283 列）。

**(f) 視覺快照受影響清單**

`tests/e2e/app-shell.visual.spec.ts-snapshots/` 目前 9 張快照，**全部前綴 `login-`**（`login-1440x900/320x812/375x812/768x1024/812x375 × chromium-darwin/linux`，`1440x900` 僅 darwin/linux 各一，其餘視窗各兩平台）。對照 `app-shell.visual.spec.ts` 原始碼：唯一使用 `toHaveScreenshot` 的測試（第 108 行）只跑 `/login` 路由（`viewports` 迴圈固定 `page.goto('/login')`），其餘測試（`foundation routes`/`skip link`/`reduced motion`）都只跑 `page.screenshot()`（純截圖存證，非 `toHaveScreenshot` 像素比對）或根本不截圖。

而 `HudCommandBar`／`hud-top` 只在 `isAuthenticatedProfile` 為真時渲染（`app-shell.tsx:97,133-134,142`）；`/login` 路由未登入，`isAuthenticatedProfile` 恆為 false，HUD 完全不出現在畫面上。

**結論：0 張快照需要重拍。** 本批的視覺變更（列上導覽減量、面板導覽新增、頂部經濟群組／頭像框、教師歡迎識別）全部發生在已登入畫面，現有 9 張快照的取樣範圍（僅未登入 `/login`）完全碰不到。Task 3 Step 3 仍建議照計畫跑一次 `--update-snapshots` 再跑一次比對，作為「零 diff」的可驗證證據，但預期輸出是 0 檔案變更。

**(g) `.hud-menu__panel` 底色 token 定案**

`src/styles/globals.css:1435-1447`：

```css
.hud-menu__panel {
  position: absolute;
  z-index: 60;
  right: 0;
  bottom: calc(100% + var(--space-2));
  min-width: 200px;
  border: 3px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night-deep);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
  color: var(--pixel-parchment);
  padding: var(--space-3);
}
```

底色 = `var(--pixel-night-deep)`（`src/styles/tokens.css:218`，`#10142e`，夜景頁底）——**深色面板**。對照計畫 Task 2 Step 3 的條件式 CSS 草稿（「下為夜色面板預設，若 (g) 判定淺底則字色改…」），本盤點判定為**夜色面板**，故計畫草稿的預設分支（`.hud-menu__nav-link { color: var(--pixel-window-ink); }`／`.hud-menu__nav-link--active { color: var(--pixel-gold); }`）**成立，不需切換到淺底分支**。

換算 `tokens.css` 實際色值複驗對比：

- 預設字：`--pixel-window-ink #f4f1e4` on `--pixel-night-deep #10142e` ≈ **15.8:1**（遠高於 4.5:1）。
- active 字：`--pixel-gold #b8862f` on `--pixel-night-deep #10142e` ≈ **5.6:1**（達標，但餘裕不像預設字大——Task 5 gate 的 rendered 對比實測仍需覆蓋此組合，勿只信手算）。

**定案：面板導覽字色沿用計畫草稿——預設 `var(--pixel-window-ink)`、active `var(--pixel-gold)`，背景維持既有 `var(--pixel-night-deep)` 不動。**

---

## 既知紅清單（本批不碰，僅列出供交叉核對）

`assignments-live.spec.ts` / `live-advanced.spec.ts` / `achievements.spec.ts` / `game-economy.spec.ts` / `learning-experience.spec.ts` / `session-lifecycle.spec.ts` / `shared-device.spec.ts` / `ui-restyle.spec.ts`（含 `assignments-live-expected-failures.ts` 等同批 fixture/expected-failure 檔）。
