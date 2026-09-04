# JRPG Pixel Batch-3「地圖與回饋」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/app/missions` 改造為日景羊皮紙世界地圖（章節＝大陸、軟鎖四態節點、玩家標記）、`/app/chapters/:id` 改造為冷色地城樓層（子主題＝樓層、火把進度、樓層卡＝對話窗）、並讓三色精靈（CSS-first 幾何佔位）進駐戰鬥與精熟任務的回饋列擔任講解導師——**純表現層，行為零變更**。

**Architecture:** 沿用 P0／批①②的場景系統（`--pixel-*` tokens＋scene class 只鋪背景不設容器色）。新增 `SpiritAvatar` ui 元件（幾何精靈＋確定性 seed→紅/藍/綠指派）、`.scene-day` 世界地圖版型、`.scene-dungeon` 地城版型。四態節點直接映射 `get_learning_progress` 既有 `status` 欄位（`useLearningProgress(null)`，零後端）。

**Tech Stack:** React 19 + TypeScript、CSS（globals.css＋tokens.css）、Vitest + Testing Library、Playwright（gate 驗證）。

**Base commit:** `1d2d27e`（批②終點）。Branch: `feature/v2-major-update`（勿推 main、勿部署）。

## Global Constraints

- **行為零變更鐵律**：計分、finalize、`rules_version`、路由、API、`get_learning_progress`、RPC/RLS 一律不動；只動表現層（JSX 結構與 CSS）。允許的唯二資料層動作：MissionSelectPage **呼叫既有** `useLearningProgress(null)`（既有 hook、既有 RPC、null 參數為既有支援路徑 learning-repository.ts:277-281），與 DI 用 optional prop（批② Task 5 先例）。
- **色彩只用 tokens**：本批**不新增任何 token**（精靈用 `--coral-700`/`--cobalt-600`/`--cobalt-700`/`--jade-600`/`--jade-700`；場景用既有 `--pixel-*`）；`src/styles/tokens.css` 與 `tokens.test.ts` 均不動。diff 中不得出現 raw hex（tokens.css 以外）。
- **對比 4.5:1**：羊皮紙淺底上金字一律 `--pixel-gold-deep`；夜底金字用 `--pixel-gold`；gate 以 getComputedStyle 實測 **rendered 配對**（非 token 配對）。
- **動效**：只動 transform/opacity；`steps()`；150–300ms；無限循環動畫必須同時寫 `@media (prefers-reduced-motion: reduce)` 與 `[data-reduced-motion='true']` 兩條顯式 `animation: none`（先例 globals.css:1142 `.live-streak-badge`）；一次性動畫由全域 `[data-reduced-motion='true'] *`（globals.css:1146）縮時即可。
- **場景外溢防護（批②教訓，結構性規則）**：scene class（`.scene-day`/`.scene-dungeon`）**只鋪 background，禁止設容器級 `color`**。淺底文字用預設墨色繼承；深底文字逐一在「該深色面」的具體選擇器上設色。與既有 `element+class` 選擇器（如 `.mission-select__item p`＝0,1,1）競爭時，覆蓋選擇器至少寫到 (0,2,1)，不得依賴檔案順序。
- **載重字串／選擇器一字不可改**（見下節清單）。
- **CSS-first 幾何佔位**（owner 0731 拍板 A）：精靈、節點、火把全部純 CSS 幾何；素材批統一換裝，故各造型收在單一 class 群、換裝時只動 CSS。
- **commit 紀律**：工作區有平行 session 未 commit 變更（`scripts/content/*`、`supabase/seeds/*`、`src/features/auth/pages/login-page.tsx`、`docs/content/*`、`package.json`、`.gitignore` 等）——每次 commit **只 `git add` 本任務列出的檔案**，禁止 `git add -A`／`git add .`。commit 訊息結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- `eslint.config.js` 受 config-protection hook 保護不可改；任何情況下不得停用或繞過 hooks；GateGuard 要求陳述事實時照做。
- e2e 全電池有 18 個範圍外失敗（平行 session content seed 漂移）＋ quiz-runner webkit 既有 flake——**勿當基線**；gate 只跑本批目標 spec（Task 5 列表）。

## 載重字串與選擇器（不可變更）

| 來源                                                                                                 | 內容                                                                                                                                                                                     | 約束                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| tests/e2e/ui-restyle.spec.ts:84-87、tests/e2e/helpers/mission.ts:12                                  | button accessible name `展開小節任務`；點擊後 URL `/app/missions/{uuid}`                                                                                                                 | 按鈕文字與 role=button 不可變                                                                                              |
| tests/e2e/quiz-runner.spec.ts:44、tests/e2e/playable-slice.spec.ts:81                                | `.feedback-card > p` 且 `.last()` 為解說文                                                                                                                                               | 解說 `<p>{result.explanation}</p>` 必須維持 `.feedback-card` **直接子節點**且為**最後一個 p**；新增列用 `<div>` 不用 `<p>` |
| 多個 spec（achievements/assignments-live/classroom-leaderboard/game-economy/quiz-runner/live-smoke） | heading `✓ 答對了`／`✕ 答錯了`／`⌛ 作答逾時`；button `我理解了，下一題`／`結算並查看結果`                                                                                               | FeedbackCard h2 與按鈕文字不可變；mission resolved 卡的 h2 `✓ 答對了` 同樣不可變                                           |
| tests/e2e/learning-experience.spec.ts:96-123                                                         | heading 含章節標題（h1 `Chapter {sortOrder}：{title}` 子字串匹配）；`getByLabel('章節進度')` 內含 `複習完成 X / Y`；article name=卡標題；button `完成複習`；status `已完成複習`；img alt | ChapterDetailPage 的 h1 格式、`aria-label="章節進度"`、reviewText 格式、按鈕/status 文字不可變                             |
| src/features/learning/pages/chapter-detail-page.test.tsx:165-192                                     | 同上＋`學習中`、`精熟程度`、`59.5%`、progressbar（MasteryRing role）、`重試`、error 文案                                                                                                 | statusLabels 四文案、MasteryRing role=progressbar＋aria-label `精熟程度` 不可變                                            |
| src/features/learning/pages/mission-page.test.tsx:87-120                                             | `送出答案`、`索取第 1 層提示`、`第 2 / 5 關`、`本關已嘗試 1 次`、`階段任務挑戰完成！`                                                                                                    | MissionPage 作答區文字不可變（本批不動作答區）                                                                             |
| tests/e2e/chapter-select.spec.ts                                                                     | `/app` 大廳的 `開始挑戰`／`鎖定中`／`敬請期待`                                                                                                                                           | 本批**不碰** lobby；chapter-detail 的 `開始挑戰` link 文字也不可變                                                         |
| src/features/learning/pages/mission-page.tsx:32,47,48,53,55,66,84,93,143,145                         | `課後任務實戰`、SectionHeader description、`目前沒有可挑戰的章節。`、`${chapter.title} 小節` aria-label、`無法開始精熟任務，請稍後重試。`                                                | MissionSelectPage 既有文字全保留                                                                                           |

## File Structure

- Create: `src/components/ui/spirit-avatar.tsx` — SpiritAvatar 元件＋`spiritForSeed`＋`spiritLabels`（三色精靈唯一定義點）
- Create: `src/components/ui/spirit-avatar.test.tsx`
- Create: `src/features/learning/lib/progress-status.ts` — `statusLabels`＋`ChapterStatus`（從 chapter-detail-page 抽出，供世界地圖共用）
- Modify: `src/features/quiz/components/feedback-card.tsx` — optional `mentorSeed` prop＋導師列
- Modify: `src/features/quiz/components/feedback-card.test.tsx`
- Modify: `src/features/quiz/pages/quiz-session.tsx:439` — 傳 `mentorSeed`
- Modify: `src/features/learning/pages/mission-page.tsx` — MissionPage resolved 卡導師列（Task 2）；MissionSelectPage 世界地圖（Task 3）
- Modify: `src/features/learning/pages/mission-page.test.tsx`
- Modify: `src/features/learning/pages/chapter-detail-page.tsx` — 引用 lib statusLabels＋re-export（Task 3）；地城樓層結構＋火把（Task 4）
- Modify: `src/features/learning/pages/chapter-detail-page.test.tsx`
- Modify: `src/styles/globals.css` — 精靈／導師列／世界地圖／地城 CSS
- Modify: `CONTEXT.md` — Tri-Spirits 詞條補元件指標（Task 1）
- 不動：`src/styles/tokens.css`、`tokens.test.ts`、`src/features/learning/api/*`、`src/features/quiz/api/*`、路由、`login-page.tsx`（平行 session 檔案）

---

### Task 1: SpiritAvatar 三色精靈元件

**Files:**

- Create: `src/components/ui/spirit-avatar.tsx`
- Create: `src/components/ui/spirit-avatar.test.tsx`
- Modify: `src/styles/globals.css`（附在 `.rpg-window__muted` 區塊之後，globals.css:4767 附近）
- Modify: `CONTEXT.md`（Tri-Spirits 詞條，第 62-65 行）

**Interfaces:**

- Consumes: 既有 tokens（`--coral-700`、`--cobalt-600`、`--jade-600`、`--pixel-window-frame`、`--pixel-shadow`、`--radius-pixel`）
- Produces（Task 2、3 依賴，簽名逐字使用）:
  - `export type SpiritVariant = 'blue' | 'green' | 'red'`
  - `export function spiritForSeed(seed: string): SpiritVariant` — 同 seed 恆同輸出
  - `export const spiritLabels: Readonly<Record<SpiritVariant, string>>` — 值為 `紅精靈導師`/`藍精靈導師`/`綠精靈導師`
  - `export function SpiritAvatar(props: Readonly<{ variant: SpiritVariant }>)` — 渲染 `aria-hidden="true"` 的 `.spirit-avatar.spirit-avatar--{variant}`

- [ ] **Step 1: 寫失敗測試**

`src/components/ui/spirit-avatar.test.tsx`：

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SpiritAvatar, spiritForSeed, spiritLabels } from './spirit-avatar';

describe('spiritForSeed', () => {
  it('maps the same seed to the same variant every time', () => {
    const first = spiritForSeed('色彩體系與應用');
    expect(spiritForSeed('色彩體系與應用')).toBe(first);
    expect(['red', 'blue', 'green']).toContain(first);
  });

  it('resolves a mentor label for any seed', () => {
    for (const seed of ['光與色', '數位色彩', '配色原理', '']) {
      expect(spiritLabels[spiritForSeed(seed)]).toMatch(/^[紅藍綠]精靈導師$/u);
    }
  });
});

describe('SpiritAvatar', () => {
  it('renders a decorative pixel figure with the variant class', () => {
    const { container } = render(<SpiritAvatar variant="green" />);
    const avatar = container.querySelector('.spirit-avatar');
    expect(avatar).not.toBeNull();
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveClass('spirit-avatar--green');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/components/ui/spirit-avatar.test.tsx`
Expected: FAIL（Cannot find module './spirit-avatar'）

- [ ] **Step 3: 最小實作**

`src/components/ui/spirit-avatar.tsx`：

```tsx
export type SpiritVariant = 'blue' | 'green' | 'red';

const variantOrder: readonly SpiritVariant[] = ['red', 'blue', 'green'];

/** 三色精靈名銜(CONTEXT.md Tri-Spirits;決議 3 NPC 導師)。 */
export const spiritLabels: Readonly<Record<SpiritVariant, string>> = {
  blue: '藍精靈導師',
  green: '綠精靈導師',
  red: '紅精靈導師',
};

/** 依 seed(章節/小節標題)確定性指派講解精靈;同 seed 恆同精靈。 */
export function spiritForSeed(seed: string): SpiritVariant {
  let sum = 0;
  for (const ch of seed) sum = (sum + (ch.codePointAt(0) ?? 0)) % 3;
  return variantOrder[sum] ?? 'red';
}

/** CSS-first 幾何精靈佔位(owner 0731 拍板 A;素材批換 sprite 圖)。 */
export function SpiritAvatar({
  variant,
}: Readonly<{ variant: SpiritVariant }>) {
  return (
    <span
      aria-hidden="true"
      className={`spirit-avatar spirit-avatar--${variant}`}
    >
      <span className="spirit-avatar__body" />
      <span className="spirit-avatar__eyes" />
    </span>
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/components/ui/spirit-avatar.test.tsx`
Expected: PASS 3/3

- [ ] **Step 5: CSS（globals.css，插在 `.rpg-window__muted` 規則之後、`── 批次① JRPG 場景底座` 註解之前）**

```css
/* ── 三色精靈(決議 3;CSS-first 幾何佔位,素材批換裝;元件 src/components/ui/spirit-avatar.tsx) ── */
.spirit-avatar {
  position: relative;
  display: inline-block;
  flex: none;
  width: 32px;
  height: 32px;
  animation: spirit-idle 0.3s steps(2, jump-none) infinite alternate;
}

.spirit-avatar__body {
  position: absolute;
  inset: 6px 4px 0;
  border-radius: var(--radius-pixel);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
}

/* 頭頂配件:同基底＋小配件差異(決議 3;紅=尖角/藍=方帽/綠=斜葉)。 */
.spirit-avatar__body::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 8px;
  width: 8px;
  height: 6px;
  background: inherit;
}

.spirit-avatar__eyes {
  position: absolute;
  top: 15px;
  left: 10px;
  width: 4px;
  height: 4px;
  background: var(--pixel-window-frame);
  box-shadow: 8px 0 0 var(--pixel-window-frame);
}

.spirit-avatar--red .spirit-avatar__body {
  background: var(--coral-700);
}

.spirit-avatar--blue .spirit-avatar__body {
  background: var(--cobalt-600);
}

.spirit-avatar--green .spirit-avatar__body {
  background: var(--jade-600);
}

.spirit-avatar--red .spirit-avatar__body::before {
  clip-path: polygon(50% 0, 0 100%, 100% 100%);
}

.spirit-avatar--green .spirit-avatar__body::before {
  clip-path: polygon(0 100%, 100% 0, 100% 100%);
}

@keyframes spirit-idle {
  from {
    transform: translateY(0);
  }

  to {
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spirit-avatar {
    animation: none;
  }
}

[data-reduced-motion='true'] .spirit-avatar {
  animation: none;
}
```

（藍精靈不加 clip-path＝方帽，維持零圓角鐵律；不使用曲線 border-radius。）

- [ ] **Step 6: CONTEXT.md Tri-Spirits 詞條（62-65 行）補一行元件指標**

在 `_Avoid_: mascot, tutor, guide（指這組角色時）` 之前加：

```markdown
元件：`src/components/ui/spirit-avatar.tsx`（`SpiritAvatar`＋`spiritForSeed` 確定性指派）。
```

- [ ] **Step 7: 驗證與 commit**

Run: `pnpm vitest run src/components/ui/spirit-avatar.test.tsx && pnpm lint && pnpm typecheck`
Expected: 全綠

```bash
git add src/components/ui/spirit-avatar.tsx src/components/ui/spirit-avatar.test.tsx src/styles/globals.css CONTEXT.md
git commit -m "feat(ui): tri-spirit avatar with deterministic seed mapping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 回饋列接入三色精靈（FeedbackCard＋Mission resolved 卡）

**Files:**

- Modify: `src/features/quiz/components/feedback-card.tsx`
- Modify: `src/features/quiz/components/feedback-card.test.tsx`
- Modify: `src/features/quiz/pages/quiz-session.tsx`（FeedbackCard 呼叫點，約 439 行）
- Modify: `src/features/learning/pages/mission-page.tsx`（MissionPage 的 resolved aside，約 123-207 行）
- Modify: `src/styles/globals.css`（導師列 CSS，附在 `.feedback-card__score` 區塊後，約 660 行）

**Interfaces:**

- Consumes: Task 1 的 `SpiritAvatar`、`spiritForSeed`、`spiritLabels`、`SpiritVariant`
- Produces: `FeedbackCard` 新 optional prop `mentorSeed?: string`（不傳＝現狀零變化）

**鐵律提醒**：`✓ 答對了`／`✕ 答錯了`／`⌛ 作答逾時` h2、`我理解了，下一題`／`結算並查看結果` 按鈕、解說 `<p>` 為 `.feedback-card` 直接子節點且為最後一個 `<p>`——導師列必須用 `<div>`。

- [ ] **Step 1: 寫失敗測試（feedback-card.test.tsx 新增，沿用該檔既有 render 慣例）**

```tsx
const mentorResult: QuizFeedbackResult = {
  answerStatus: 'correct',
  correctOptionId: 'opt-1',
  correctOptionText: '黃色',
  explanation: 'RGB 中紅光與綠光等量混合會得到黃色。',
  scoreDelta: 100,
  selectedOptionId: 'opt-1',
  totalScore: 100,
};

it('renders the tri-spirit mentor row when mentorSeed is provided', () => {
  render(
    <FeedbackCard
      isLastQuestion={false}
      isPending={false}
      mentorSeed="色彩體系與應用"
      onContinue={() => undefined}
      result={mentorResult}
    />,
  );
  expect(screen.getByText(/^[紅藍綠]精靈導師$/u)).toBeInTheDocument();
});

it('keeps the explanation as the last direct-child paragraph', () => {
  const { container } = render(
    <FeedbackCard
      isLastQuestion={false}
      isPending={false}
      mentorSeed="色彩體系與應用"
      onContinue={() => undefined}
      result={mentorResult}
    />,
  );
  const paragraphs = container.querySelectorAll('.feedback-card > p');
  expect(paragraphs[paragraphs.length - 1]).toHaveTextContent(
    mentorResult.explanation,
  );
});

it('renders no mentor row without mentorSeed', () => {
  const { container } = render(
    <FeedbackCard
      isLastQuestion={false}
      isPending={false}
      onContinue={() => undefined}
      result={mentorResult}
    />,
  );
  expect(container.querySelector('.feedback-card__mentor')).toBeNull();
});
```

（`QuizFeedbackResult` 已由 feedback-card.tsx 匯出；import 沿用該測試檔既有寫法。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/features/quiz/components/feedback-card.test.tsx`
Expected: 新增 3 例中前 2 例 FAIL（mentor row 不存在）

- [ ] **Step 3: 實作 FeedbackCard**

feedback-card.tsx——新增 import 與 prop，並在解說 `<p>` 之前插入導師列：

```tsx
import {
  SpiritAvatar,
  spiritForSeed,
  spiritLabels,
} from '../../../components/ui/spirit-avatar';
```

props 增加 `mentorSeed?: string`（放進既有 Readonly<{...}>），元件內：

```tsx
const mentor = mentorSeed === undefined ? undefined : spiritForSeed(mentorSeed);
```

在 `{result.answerStatus === 'correct' ? null : (…正確答案…)}` 與 `<p>{result.explanation}</p>` 之間插入：

```tsx
{
  mentor ? (
    <div className="feedback-card__mentor">
      <SpiritAvatar variant={mentor} />
      <span
        className={`feedback-card__mentor-name feedback-card__mentor-name--${mentor}`}
      >
        {spiritLabels[mentor]}
      </span>
    </div>
  ) : null;
}
```

- [ ] **Step 4: quiz-session 傳 seed（決議 3：一章一位導師＝各管一個講解領域的零後端近似；章節即現有內容的領域粒度）**

quiz-session.tsx 的 `<FeedbackCard` 呼叫點（約 439 行）加一行 prop：

```tsx
mentorSeed={session.chapterTitle}
```

（`session.chapterTitle` 已在同一 render scope 使用於 370 行 h1。）

- [ ] **Step 5: MissionPage resolved 卡**

mission-page.tsx——`resolved` state 型別加 `mentorSeed`（123-125 行）：

```tsx
const [resolved, setResolved] = useState<
  | Readonly<{ explanation: string; isLast: boolean; mentorSeed: string }>
  | undefined
>();
```

onSuccess 內 setResolved（244-247 行）改為：

```tsx
setResolved({
  explanation: result.explanation,
  isLast: mastery.position === mastery.questionCount,
  mentorSeed: mastery.question?.subtopicTitle ?? mastery.chapterTitle,
});
```

resolved aside 內、h2 之後（190 行後）插入（import 同 Step 3）：

```tsx
<div className="feedback-card__mentor">
  <SpiritAvatar variant={spiritForSeed(resolved.mentorSeed)} />
  <span
    className={`feedback-card__mentor-name feedback-card__mentor-name--${spiritForSeed(resolved.mentorSeed)}`}
  >
    {spiritLabels[spiritForSeed(resolved.mentorSeed)]}
  </span>
</div>
```

- [ ] **Step 6: CSS（globals.css，`.feedback-card__score` 區塊後）**

```css
/* 回饋列講解精靈(決議 3:紅/藍/綠導師)。名銜用 700 深階,
   回饋卡為淺底(--color-surface),深階字色保 4.5:1。 */
.feedback-card__mentor {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.feedback-card__mentor-name {
  font-size: var(--font-size-supporting);
  font-weight: 800;
}

.feedback-card__mentor-name--red {
  color: var(--coral-700);
}

.feedback-card__mentor-name--blue {
  color: var(--cobalt-700);
}

.feedback-card__mentor-name--green {
  color: var(--jade-700);
}
```

- [ ] **Step 7: mission 回饋測試（mission-page.test.tsx 新增一例，沿用既有 MissionPage harness 與 repository stub）**

```tsx
it('shows a tri-spirit mentor on the correct-answer feedback card', async () => {
  // 沿用檔內既有 render + 答題流程:選正確選項→送出→出現「✓ 答對了」
  // 後追加斷言:
  expect(await screen.findByText(/^[紅藍綠]精靈導師$/u)).toBeInTheDocument();
});
```

（若既有 stub 的 submitMasteryAttempt 未涵蓋 `isCorrect: true` 路徑，擴充 stub 回傳 `{ isCorrect: true, explanation: '解析文' }`——只改測試檔。）

- [ ] **Step 8: 驗證與 commit**

Run: `pnpm vitest run src/features/quiz/components/feedback-card.test.tsx src/features/learning/pages/mission-page.test.tsx src/features/quiz/pages/quiz-session.test.tsx && pnpm lint && pnpm typecheck`
Expected: 全綠（quiz-session.test 不傳 mentorSeed 也必須綠＝back-compat）

```bash
git add src/features/quiz/components/feedback-card.tsx src/features/quiz/components/feedback-card.test.tsx src/features/quiz/pages/quiz-session.tsx src/features/learning/pages/mission-page.tsx src/features/learning/pages/mission-page.test.tsx src/styles/globals.css
git commit -m "feat(quiz): tri-spirit mentor row on battle and mission feedback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 世界地圖（MissionSelectPage＝章節大陸＋軟鎖四態）

**Files:**

- Create: `src/features/learning/lib/progress-status.ts`
- Modify: `src/features/learning/pages/chapter-detail-page.tsx`（20-27 行的 statusLabels 改為 import＋re-export）
- Modify: `src/features/learning/pages/mission-page.tsx`（MissionSelectPage，20-103 行）
- Modify: `src/features/learning/pages/mission-page.test.tsx`
- Modify: `src/styles/globals.css`（`.mission-select` 區塊 3334-3383 行就地改寫＋新增節點 CSS）

**Interfaces:**

- Consumes: 既有 `useLearningProgress(null, repo)`（use-learning.ts:56）、`LearningProgressRow`／`LearningRepository`（learning-repository.ts:181/219）、chapter 物件的 `id`/`title`/`sortOrder`/`isPlayable`/`subtopicTitles`/`description`
- Produces:
  - `src/features/learning/lib/progress-status.ts`: `export type ChapterStatus = LearningProgressRow['status']`；`export const statusLabels: Readonly<Record<ChapterStatus, string>>`（值不變：進步中/學習中/已精熟/尚未開始）
  - `chapter-detail-page.tsx` 繼續 `export { statusLabels }`（consumer：classroom-progress-section.tsx:4，不動它）
  - `MissionSelectPage` 新 optional prop `learningRepository?: LearningRepository`（DI 專用）

- [ ] **Step 1: 抽出 statusLabels**

`src/features/learning/lib/progress-status.ts`：

```ts
import type { LearningProgressRow } from '../api/learning-repository';

export type ChapterStatus = LearningProgressRow['status'];

/** 四態文案(決議 1 軟鎖:永遠可點,僅視覺引導)。 */
export const statusLabels: Readonly<Record<ChapterStatus, string>> = {
  developing: '進步中',
  learning: '學習中',
  mastered: '已精熟',
  not_started: '尚未開始',
};
```

chapter-detail-page.tsx 20-27 行改為：

```ts
import { statusLabels, type ChapterStatus } from '../lib/progress-status';

export { statusLabels };
```

（檔內其餘 `ChapterStatus` 用法不變。）

Run: `pnpm vitest run src/features/learning/pages/chapter-detail-page.test.tsx && pnpm typecheck`
Expected: 全綠（純搬移）

- [ ] **Step 2: 寫失敗測試（mission-page.test.tsx 新增 describe；LearningRepository stub 必須完整實作 8 個方法——批② Task 5 教訓：預設 stub 拒答避免打到真 client）**

```tsx
import type {
  LearningProgressRow,
  LearningRepository,
} from '../api/learning-repository';

const progressRow = (
  chapterId: string,
  status: LearningProgressRow['status'],
): LearningProgressRow => ({
  accuracy: null,
  chapterId,
  coverage: null,
  mastery: null,
  reviewCompleted: 0,
  reviewTotal: null,
  rulesVersion: 'v1',
  scope: 'chapter',
  status,
  subtopicId: null,
});

const learningStub = (
  rows: readonly LearningProgressRow[],
): LearningRepository => ({
  completeReviewCard: () => Promise.reject(new Error('unused')),
  getClassroomProgress: () => Promise.reject(new Error('unused')),
  getLearningProgress: () => Promise.resolve(rows),
  listChapterReview: () => Promise.reject(new Error('unused')),
  listMistakes: () => Promise.reject(new Error('unused')),
  listReviewProgress: () => Promise.reject(new Error('unused')),
  requestHint: () => Promise.reject(new Error('unused')),
  startRemediation: () => Promise.reject(new Error('unused')),
});

describe('MissionSelectPage world map', () => {
  it('maps chapter progress onto four-state nodes with the hero on the first unmastered chapter', async () => {
    // 沿用檔內既有 usePublishedChapters mock(至少兩個 playable 章節;
    // chapter id 依該 mock 實值釘,首章給 mastered、次章給 learning)。
    render(
      <MissionSelectPage
        learningRepository={learningStub([
          progressRow('chapter-1', 'mastered'),
          progressRow('chapter-2', 'learning'),
        ])}
      />,
      // 檔內既有 wrapper(QueryClientProvider/Router)照用
    );
    expect(await screen.findByText('已精熟')).toBeInTheDocument();
    expect(screen.getByText('學習中・目前位置')).toBeInTheDocument();
    expect(document.querySelector('.map-node--mastered')).not.toBeNull();
    expect(
      document.querySelector('.map-node--learning .map-node__hero'),
    ).not.toBeNull();
  });

  it('degrades to not_started nodes when progress is unavailable', async () => {
    render(
      <MissionSelectPage
        learningRepository={{
          ...learningStub([]),
          getLearningProgress: () => Promise.reject(new Error('down')),
        }}
      />,
    );
    // 章節列表照常渲染,節點退灰霧,不新增 alert
    expect(
      await screen.findAllByRole('button', { name: '展開小節任務' }),
    ).not.toHaveLength(0);
    expect(document.querySelector('.map-node--not_started')).not.toBeNull();
  });
});
```

Run: `pnpm vitest run src/features/learning/pages/mission-page.test.tsx`
Expected: 新增 2 例 FAIL

- [ ] **Step 3: 實作 MissionSelectPage**

mission-page.tsx 新增 imports：

```tsx
import type { LearningRepository } from '../api/learning-repository';
import { useLearningProgress } from '../hooks/use-learning';
import { statusLabels, type ChapterStatus } from '../lib/progress-status';
```

簽名與資料（**progress 不得加入 isPending/isError 阻擋——降級渲染**）：

```tsx
export function MissionSelectPage({
  learningRepository,
  repository,
}: Readonly<{
  learningRepository?: LearningRepository;
  repository?: MasteryRepository;
}>) {
  const chapters = usePublishedChapters();
  // 決議 1:四態直接映射 get_learning_progress 的 status(null=全章節,零後端)。
  // 讀不到就全部退灰霧,不阻擋、不報錯(軟鎖=純視覺引導)。
  const progress = useLearningProgress(null, learningRepository);
  // …既有 start/navigate/startError/isPending/isError 分支原樣…

  const chapterStatuses = new Map<string, ChapterStatus>(
    (progress.data ?? [])
      .filter((row) => row.scope === 'chapter')
      .map((row) => [row.chapterId, row.status]),
  );
  const statusOf = (chapterId: string): ChapterStatus =>
    chapterStatuses.get(chapterId) ?? 'not_started';
  const heroChapterId = playable.find(
    (chapter) => statusOf(chapter.id) !== 'mastered',
  )?.id;
```

section 與 Card（42-44 行）：

```tsx
<section
  aria-labelledby="mission-select-title"
  className="mission-select scene-day"
>
  <Card className="world-map-panel" padding="lg">
```

li 內容（58-96 行）——在既有 `<div>` 前插入節點徽章、`<h2>` 後插入狀態文案；**h2 文字、subtopics、button 一字不動**：

```tsx
{
  playable.map((chapter) => {
    const status = statusOf(chapter.id);
    const isHero = chapter.id === heroChapterId;
    return (
      <li className="mission-select__item" key={chapter.id}>
        <span aria-hidden="true" className={`map-node map-node--${status}`}>
          <span className="map-node__number">{chapter.sortOrder}</span>
          {isHero ? <span className="map-node__hero" /> : null}
        </span>
        <div>
          <h2>{chapter.title}</h2>
          <p className={`map-node-status map-node-status--${status}`}>
            {statusLabels[status]}
            {isHero ? '・目前位置' : null}
          </p>
          {/* owner 0730 #5 小節列與 description fallback 原樣保留 */}
          {/* …既有 subtopicTitles / description 區塊原樣… */}
        </div>
        {/* …既有 button 原樣(展開小節任務)… */}
      </li>
    );
  });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/features/learning/pages/mission-page.test.tsx`
Expected: PASS（含既有 MissionPage 例）

- [ ] **Step 5: CSS**

(a) 就地改寫 `.mission-select__item`（globals.css:3347-3359）的外觀三行——其餘 flex 屬性不動：

```css
/* 批③:世界地圖大陸卡=羊皮紙+金深框(0729 暖黃框裁定由 JRPG spec §1 取代)。 */
border: 2px solid var(--pixel-gold-deep);
border-radius: var(--radius-pixel);
background: var(--pixel-parchment);
```

(b) 新增區塊（`.mission-select__subtopics li + li` 之後）：

```css
/* ── 批③ 世界地圖(/app/missions;決議 1 軟鎖四態+決議 2 兩層地圖) ──
   scene-day 只鋪羊皮紙背景(globals.css:4809),禁容器級 color(批②教訓)。 */
.scene-day.mission-select {
  padding: 24px 16px 48px;
}

.scene-day .world-map-panel {
  background: var(--pixel-parchment-card);
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
}

.scene-day .world-map-panel .ui-section-header__title {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
}

/* 航路:節點間垂直虛線。 */
.scene-day .mission-select__list {
  position: relative;
}

.scene-day .mission-select__list::before {
  content: '';
  position: absolute;
  top: 24px;
  bottom: 24px;
  left: 44px;
  border-left: 3px dashed var(--pixel-gold-deep);
  opacity: 0.5;
}

.scene-day .mission-select__item {
  position: relative;
}

/* 大陸節點徽章(48px 方章+章節編號)。 */
.map-node {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 3px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
}

.map-node__number {
  font-family: var(--font-pixel-latin);
  font-size: 16px;
  color: var(--pixel-gold-deep);
}

/* 決議 1 四態:not_started=灰霧/learning=微光/developing=全亮/mastered=金色。 */
.map-node--not_started {
  border-color: var(--slate-300);
  background: var(--slate-100);
  opacity: 0.7;
}

.map-node--not_started .map-node__number {
  color: var(--ink-700);
}

.map-node--learning {
  box-shadow:
    0 0 0 3px var(--pixel-gold),
    3px 3px 0 var(--pixel-shadow);
}

.map-node--developing {
  border-color: var(--cobalt-600);
}

.map-node--developing .map-node__number {
  color: var(--cobalt-700);
}

.map-node--mastered {
  background: var(--pixel-gold);
}

.map-node--mastered .map-node__number {
  color: var(--pixel-night);
}

/* 玩家標記:站在目前推薦節點上(決議 2 玩家 sprite;佔位=旗標,素材批換裝)。 */
.map-node__hero {
  position: absolute;
  top: -16px;
  right: -10px;
  width: 14px;
  height: 14px;
  border: 2px solid var(--pixel-window-frame);
  background: var(--coral-700);
  box-shadow: 2px 2px 0 var(--pixel-shadow);
  animation: hero-bob 0.3s steps(2, jump-none) infinite alternate;
}

@keyframes hero-bob {
  from {
    transform: translateY(0);
  }

  to {
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-node__hero {
    animation: none;
  }
}

[data-reduced-motion='true'] .map-node__hero {
  animation: none;
}

/* 狀態文案:與 .mission-select__item p(0,1,1)同場競爭,
   一律用 (0,2,1) 壓過,不依賴檔案順序(批②specificity 教訓)。 */
.mission-select__item p.map-node-status {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-supporting);
  font-weight: 800;
}

.mission-select__item p.map-node-status--not_started {
  color: var(--ink-700);
}

.mission-select__item p.map-node-status--learning {
  color: var(--pixel-gold-deep);
}

.mission-select__item p.map-node-status--developing {
  color: var(--cobalt-700);
}

.mission-select__item p.map-node-status--mastered {
  color: var(--pixel-gold-deep);
}
```

- [ ] **Step 6: 驗證與 commit**

Run: `pnpm vitest run src/features/learning && pnpm lint && pnpm typecheck`
Expected: 全綠

```bash
git add src/features/learning/lib/progress-status.ts src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/mission-page.tsx src/features/learning/pages/mission-page.test.tsx src/styles/globals.css
git commit -m "feat(learning): world-map continent nodes with soft-lock four states

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 地城樓層（ChapterDetailPage＝冷色地城＋火把進度＋樓層對話窗）

**Files:**

- Modify: `src/features/learning/pages/chapter-detail-page.tsx`
- Modify: `src/features/learning/pages/chapter-detail-page.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**

- Consumes: 既有 `reviewCompleted`/`reviewTotal` 區域變數（chapter-detail-page.tsx:331-332）、既有版型 class
- Produces: 無對外介面（純頁內表現）

**深色面設色清單（批②教訓：逐一列舉，缺一即 gate 擋）**——本頁淺色面（review-accordion、review-card、status pill、`開始挑戰` 按鈕、ProgressBar、`完成複習` 按鈕）靠「不設容器色」自然保持墨字；深色面逐條顯式設色：

| 元素                                         | 現值（globals.css 行）                      | 地城覆蓋                                                                   |
| -------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `.route-panel__eyebrow`                      | 既有淺底墨色                                | `--pixel-gold`（夜底金）                                                   |
| `.chapter-detail__title` h1                  | 繼承墨色 (3798)                             | `--pixel-window-ink`＋`--font-pixel-tc`                                    |
| `.chapter-detail__review-progress-label`     | `--color-muted` (3875)                      | `--pixel-window-muted`                                                     |
| `.chapter-detail__review-progress-value`     | `--color-text` (3881)                       | `--pixel-window-ink`                                                       |
| `.chapter-detail__mastery-label`             | `--color-muted` (3920)                      | `--pixel-window-muted`                                                     |
| `.chapter-detail__mastery-value`             | `--color-text` (3926)                       | `--pixel-window-ink`                                                       |
| `.chapter-status-pill--success`              | **透明底** color-mix＋emerald-700 字 (3822) | 底改實色 `--pixel-parchment-card`（透明底疊夜底＝深字不可讀，批②同構缺陷） |
| `.chapter-status-pill--primary`              | **透明底** color-mix＋ink-900 字 (3828)     | 底改實色 `--pixel-parchment-card`                                          |
| `.chapter-status-pill--neutral`              | slate-100 底＋color-muted 字 (3834)         | 字改 `--ink-700`（muted 於 slate-100 底貼線）                              |
| `.chapter-detail__subtopic` 樓層卡           | `--paper` 白卡黃框 (3937)                   | 夜窗：`--pixel-night` 底＋rpg-window 邊框配方                              |
| `.chapter-detail__subtopic-title`            | `--ink-700` (3949)                          | `--pixel-window-ink`                                                       |
| `.chapter-detail__subtopic-progress`         | `--color-muted` (3972)                      | `--pixel-window-ink`（子 span 繼承）                                       |
| 空狀態 `<p>`（section 直接子，325 行）       | 繼承墨色                                    | `--pixel-window-ink`                                                       |
| `<p role="alert">`（section 直接子，405 行） | 繼承墨色                                    | `--pixel-danger`                                                           |
| `.chapter-detail__subtopic-tag`（小節 chip） | 淺黃實底 ink-900 字 (3956)                  | 保留（自帶淺底）——gate 實測                                                |
| `.mastery-ring__track`                       | `--border-subtle`（淺色，夜底可見）         | 保留——gate 截圖確認                                                        |
| `.review-accordion`                          | 既有白卡                                    | 底改 `--pixel-parchment-card`＋框 `--pixel-gold-deep`（墨字自然繼承）      |

- [ ] **Step 1: 寫失敗測試（chapter-detail-page.test.tsx 新增；先讀該檔 fixture 的 subtopic reviewCompleted/reviewTotal 實值，下方 3 與 1 若與 fixture 不符則以 fixture 實值釘）**

```tsx
it('renders dungeon floor torches matching subtopic review progress', () => {
  // 沿用檔內既有成功 render harness(165 行那組 fixture)後:
  const torches = document.querySelectorAll('.floor-torch');
  expect(torches).toHaveLength(3); // = fixture 小節 reviewTotal
  expect(document.querySelectorAll('.floor-torch--lit')).toHaveLength(1); // = reviewCompleted
  expect(
    document.querySelector('.chapter-dungeon.scene-dungeon'),
  ).not.toBeNull();
});
```

Run: `pnpm vitest run src/features/learning/pages/chapter-detail-page.test.tsx`
Expected: 新例 FAIL

- [ ] **Step 2: JSX 改動（chapter-detail-page.tsx）**

(a) 261-265 行 section class 改為地城場景（aria-labelledby 不動）：

```tsx
<section
  aria-labelledby="chapter-detail-title"
  className="chapter-dungeon scene-dungeon"
>
```

（loading／error／not-found 三個早退 branch 維持 `route-panel` 淺色，不掛場景。）

(b) 檔內新增純函式（`subtopicRow` 之後）：

```tsx
// 火把數顯示進度(spec §5 地城樓層):最多畫 10 支,亮的支數依完成比例四捨五入。
export const torchStates = (
  completed: number,
  total: number | null,
): readonly boolean[] => {
  if (total === null || total <= 0) return [];
  const shown = Math.min(total, 10);
  const lit = Math.min(shown, Math.round((completed / total) * shown));
  return Array.from({ length: shown }, (_, index) => index < lit);
};
```

(c) 小節樓層 h2（339-342 行）之後插入火把列（`reviewCompleted`/`reviewTotal` 變數既有於 331-332 行）：

```tsx
{
  torchStates(reviewCompleted, reviewTotal).length > 0 ? (
    <span aria-hidden="true" className="floor-torches">
      {torchStates(reviewCompleted, reviewTotal).map((lit, index) => (
        <span
          className={lit ? 'floor-torch floor-torch--lit' : 'floor-torch'}
          key={index}
        />
      ))}
    </span>
  ) : null;
}
```

（文字節點 `已學習`／`複習 X / Y`／`精熟 X%`、`小節` tag 原樣保留。）

- [ ] **Step 3: 跑測試確認通過**

Run: `pnpm vitest run src/features/learning/pages/chapter-detail-page.test.tsx`
Expected: 全綠（既有例＋新例）

- [ ] **Step 4: CSS（globals.css，新增於世界地圖區塊之後）**

```css
/* ── 批③ 地城樓層(/app/chapters/:id;決議 2:日景→地城冷色轉場) ──
   scene-dungeon 只鋪底色不設 color;深色面逐條設色(批②外溢教訓)。 */
.scene-dungeon {
  background: var(--pixel-night-deep);
  padding: 24px 16px 64px;
  animation: dungeon-enter 240ms steps(4, jump-none);
}

@keyframes dungeon-enter {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-dungeon {
    animation: none;
  }
}

.chapter-dungeon {
  width: min(100%, 900px);
  margin-inline: auto;
}

/* 入口門楣:夜窗雙線框(配方同 .rpg-window,globals.css:4740)。 */
.chapter-dungeon > header {
  background: var(--pixel-night);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  padding: 20px 24px;
}

.chapter-dungeon .route-panel__eyebrow {
  color: var(--pixel-gold);
}

.chapter-dungeon .chapter-detail__title {
  font-family: var(--font-pixel-tc);
  color: var(--pixel-window-ink);
}

.chapter-dungeon .chapter-detail__review-progress-label,
.chapter-dungeon .chapter-detail__mastery-label {
  color: var(--pixel-window-muted);
}

.chapter-dungeon .chapter-detail__review-progress-value,
.chapter-dungeon .chapter-detail__mastery-value {
  color: var(--pixel-window-ink);
}

/* 透明底 pill 疊夜底字不可讀(批②同構缺陷)→ 改實色淺底。 */
.chapter-dungeon .chapter-status-pill--success,
.chapter-dungeon .chapter-status-pill--primary {
  background: var(--pixel-parchment-card);
}

.chapter-dungeon .chapter-status-pill--neutral {
  color: var(--ink-700);
}

/* 樓層卡=對話窗(spec §5)。不用 .rpg-window class:它帶容器級 color,
   會外溢進樓層內的淺色複習卡(批②教訓);改逐條設色。 */
.chapter-dungeon .chapter-detail__subtopic {
  background: var(--pixel-night);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  margin-top: var(--space-6);
  padding: 20px 22px;
}

.chapter-dungeon .chapter-detail__subtopic-title {
  color: var(--pixel-window-ink);
}

.chapter-dungeon .chapter-detail__subtopic-progress {
  color: var(--pixel-window-ink);
}

/* 樓層內複習卡維持淺底墨字(長文可讀性;批②勝利回顧卡先例)。 */
.chapter-dungeon .review-accordion {
  background: var(--pixel-parchment-card);
  border: 2px solid var(--pixel-gold-deep);
}

/* 空狀態與錯誤列直接坐夜底。 */
.chapter-dungeon > p {
  color: var(--pixel-window-ink);
}

.chapter-dungeon > p[role='alert'] {
  color: var(--pixel-danger);
}

/* 火把:亮=金/暗=muted(spec §5 火把數顯示進度;幾何佔位,素材批換裝)。 */
.floor-torches {
  display: inline-flex;
  gap: 6px;
  margin-left: var(--space-2);
}

.floor-torch {
  width: 8px;
  height: 14px;
  background: var(--pixel-window-muted);
  clip-path: polygon(
    50% 0,
    100% 40%,
    75% 40%,
    75% 100%,
    25% 100%,
    25% 40%,
    0 40%
  );
  opacity: 0.45;
}

.floor-torch--lit {
  background: var(--pixel-gold);
  opacity: 1;
  animation: torch-flicker 0.3s steps(2, jump-none) infinite alternate;
}

@keyframes torch-flicker {
  from {
    opacity: 1;
  }

  to {
    opacity: 0.75;
  }
}

@media (prefers-reduced-motion: reduce) {
  .floor-torch--lit {
    animation: none;
  }
}

[data-reduced-motion='true'] .floor-torch--lit {
  animation: none;
}
```

- [ ] **Step 5: 逐面自查**

依「深色面設色清單」逐列核對；特別確認：pill 三態、`開始挑戰` 按鈕、review-accordion 標題列、`完成複習` 按鈕、`已完成複習` status、375px 寬 header 換行不溢出、`chapter-detail__title-row` 內 `開始挑戰` 在夜窗上仍為實底按鈕。

- [ ] **Step 6: 驗證與 commit**

Run: `pnpm vitest run src/features/learning && pnpm lint && pnpm typecheck`
Expected: 全綠

```bash
git add src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/chapter-detail-page.test.tsx src/styles/globals.css
git commit -m "feat(learning): dungeon-floor chapter detail with torch progress

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Batch Gate（驗證與證據）

**Files:**

- Create: `artifacts/design-audit/batch3/`（截圖與對比實測報告）
- Modify: `.superpowers/sdd/progress.md`（batch-3 紀錄；**此檔有平行 session 未 commit 變更，只 append 本批段落、不整檔重排**）

**Interfaces:**

- Consumes: Tasks 1-4 全部 commit
- Produces: gate PASS/FAIL 報告＋證據

- [ ] **Step 1: 靜態全套**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run`
Expected: lint 0 err、typecheck pass、unit 全綠（≥783 基線＋本批新增）

- [ ] **Step 2: raw hex 與 token 檢查**

Run: `git diff 1d2d27e..HEAD -- src/ ':!src/styles/tokens.css' | grep -E '^\+.*#[0-9a-fA-F]{3,8}\b'`
Expected: 無輸出＝新增程式碼零 raw hex

Run: `git diff 1d2d27e..HEAD -- src/styles/tokens.css src/styles/tokens.test.ts`
Expected: 空（本批不動 tokens）

- [ ] **Step 3: 載重字串完整性（逐檔與 `git show 1d2d27e:<file>` 比對計數，不得減少）**

```bash
for s in 展開小節任務 課後任務實戰 目前沒有可挑戰的章節; do echo "$s:"; grep -c "$s" src/features/learning/pages/mission-page.tsx; git show 1d2d27e:src/features/learning/pages/mission-page.tsx | grep -c "$s"; done
for s in "✓ 答對了" "我理解了，下一題" "結算並查看結果"; do echo "$s:"; grep -c "$s" src/features/quiz/components/feedback-card.tsx; git show 1d2d27e:src/features/quiz/components/feedback-card.tsx | grep -c "$s"; done
for s in 章節複習 複習完成 完成複習 已完成複習 章節進度 開始挑戰; do echo "$s:"; grep -c "$s" src/features/learning/pages/chapter-detail-page.tsx; git show 1d2d27e:src/features/learning/pages/chapter-detail-page.tsx | grep -c "$s"; done
```

Expected: 每組前後計數一致

- [ ] **Step 4: 目標 e2e（不跑全電池；18 個範圍外失敗與 webkit flake 為既知，勿計入）**

Run（沿用批② gate 的本機 e2e 啟動方式，參考 `scripts/test-e2e-local.sh` 與 batch2 gate 報告）:

```bash
npx playwright test tests/e2e/chapter-select.spec.ts tests/e2e/ui-restyle.spec.ts tests/e2e/learning-experience.spec.ts tests/e2e/quiz-runner.spec.ts tests/e2e/playable-slice.spec.ts --project=chromium
npx playwright test tests/e2e/quiz-runner.spec.ts --project=firefox
```

Expected: 全綠（若 learning-experience 因 content seed 漂移紅，須以 stash 前後對照證明失敗與本批 diff 無關並記錄，不得默默放行）

- [ ] **Step 5: 截圖證據（1280×720＋375×812）→ `artifacts/design-audit/batch3/`**

必拍 6 張：`missions-desktop.png`、`missions-375.png`、`chapter-detail-desktop.png`、`chapter-detail-375.png`、`quiz-feedback-spirit.png`（戰鬥回饋含導師列）、`mission-feedback-spirit.png`（精熟回饋含導師列）。逐張人工檢視：四態節點可辨、hero 標記在位、火把列成形、樓層窗雙線框、無溢出、無白底白字。

- [ ] **Step 6: rendered 對比實測（getComputedStyle 配對，非 token 配對）→ `artifacts/design-audit/batch3/contrast.md`**

全部 ≥4.5:1：

- 世界地圖：狀態文案四態 × item 底；`map-node__number` 四態 × 各自徽章底；item 內 h2/小節列 × item 底；SectionHeader 標題/描述 × world-map-panel 底。
- 地城：eyebrow × header 底；h1 × header 底；pill 三態字 × pill 實底；review-progress label/value × header 底；subtopic h2/progress 列 × 樓層窗底；accordion 標題 × accordion 底；`完成複習` 按鈕字 × 按鈕底；空狀態 p 與 alert p × 頁底。
- 回饋列：三色導師名銜 × feedback-card 底（量三個 variant）。

- [ ] **Step 7: console 乾淨**

/app/missions 與 /app/chapters/:id 完整載入各一次，console error＝0、pageerror＝0。

- [ ] **Step 8: 記錄與 commit**

`.superpowers/sdd/progress.md` append batch-3 段落（任務 SHA、gate 結果、對比數值範圍、e2e 現況）。

```bash
git add artifacts/design-audit/batch3 .superpowers/sdd/progress.md
git commit -m "test(gate): batch-3 map-and-feedback gate evidence

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 風險與備註

- **statusLabels 搬移**：consumer 只有 `classroom-progress-section.tsx:4`（走 chapter-detail-page re-export，不受影響）；Task 3 Step 1 單獨驗證。
- **`.mission-select__item` 邊框改動**會取代 0729「暖黃框」裁定——JRPG spec §1 已明載取代 0728/0730 視覺裁定，屬預期。
- **MissionPage（`/app/missions/:sessionId`）整頁不在本批範圍**（spec §5 無此路由條目），只動其 resolved 回饋卡；`quiz-map-panel`／作答區原樣。
- **教師端、lobby（/app）、quiz 戰鬥頁版型**：零接觸（quiz-session 只加一個 prop）。
- 素材批換裝點：`.spirit-avatar*`、`.map-node*`、`.floor-torch*` 三組 class 即是換裝介面，屆時只動 CSS。
- Deferred（不做）：世界地圖插畫底圖（素材批）、精靈進標題畫面/頒獎台（批⑤）、鍵盤方向鍵節點導航增強（既有 tab 順序已可及）、`torchStates` 匯出僅供測試（若 lint 嫌 unused export，改由測試直接 import 頁面模組）。
