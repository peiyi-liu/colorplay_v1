# JRPG 像素風批次②「戰鬥＋寶箱結算」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/app/quiz/:sessionId`（回合制戰鬥）與 `…/result`（勝利結算）翻譯成 JRPG 像素夜景，含三拍特效、ATB 行動條、COMBO、寶箱確定性獎勵演出、升級 fanfare 與本次新解鎖成就——純表現層，行為零變更。

**Architecture:** CSS-first（owner 2026-07-31 拍板：幾何造型佔位，素材批再換裝）。沿用 P0 的 `--pixel-*` tokens 與批次①的 `.scene-night` 場景底座；新增 `BattleStage`（純裝飾演出元件）與 `LootReveal`（確定性寶箱結算元件），既有資料流（TanStack Query＋repository DI）完全不動。三拍時序直接掛在既有 submit 流程的狀態上：feedback 本來就只在伺服器回應後出現，故「回應前不得顯示對錯」由現有架構保證，本批只加演出層。

**Tech Stack:** React 18＋TypeScript、TanStack Query、react-router-dom、Vitest＋Testing Library、純 CSS（globals.css＋tokens.css）。

## Global Constraints

- **分支**：`feature/v2-major-update`。大更新期間**勿推 main、勿部署**；還原點 tag `v1-stable-20260730`。
- **行為零變更鐵律**：計分、finalize、`rules_version`、路由、API、repository 介面一律不動；只動表現層（className、裝飾 DOM、CSS、純派生函式）。
- **三拍鐵律（spec §4.4）**：按下→揮刀（樂觀演出）→伺服器判定→命中/MISS；回應抵達前不得顯示對錯；逾時＝魔物反擊（無揮刀拍）。
- **寶箱＝確定性獎勵演出**：獎勵數值全部來自伺服器已回傳的 `xpAwarded`/`tokensAwarded`/`totalScore`；**禁止任何隨機掉落**。
- **E2E 載重字串（9 個 spec 檔、35 處引用，一字不可改）**：`送出答案`、`我理解了，下一題`、`結算並查看結果`、`✓ 答對了`、`✕ 答錯了`、`⌛ 作答逾時`、`第 {N} / {M} 題`、`挑戰完成`、`總分 {N}`、`答對 {N} / {M} 題`、`+{N} XP`、`再玩一次`、`回章節`；CSS class **`.question-option` 必須保留**（`tests/e2e/helpers/quiz.ts:95` 直接點它）。RPG 風味一律用**額外**的裝飾節點（`aria-hidden`）疊加，不改既有文字。
- **色彩只用 tokens**（`src/styles/tokens.css`）：本批預期**零新增 token**（全部用既有 `--pixel-*` 家族）；若實作中確需新增，同一 commit 必須在 `src/styles/tokens.test.ts` 釘值。禁止 raw hex。
- **對比 4.5:1**：夜景文字用 `--pixel-window-ink`（≈12:1）／`--pixel-window-muted`（≈7.9:1）／`--pixel-gold`（≈5.1:1）；夜景錯誤字用 `--pixel-danger`（≈7.3:1）；金底按鈕文字用 `--pixel-night-deep`（≈5.6:1）。
- **動效**：只動 `transform`/`opacity`；`steps()` 緩動；150–300ms。降級雙通道：`@media (prefers-reduced-motion: reduce)` ＋ 既有全域 `[data-reduced-motion='true'] *`（globals.css:1146，app-shell 依 profile 設定）；JS 動畫（count-up）須自行檢查兩者。
- **工作區紀律**：平行 session 有未 commit 變更。**每次 commit 只 `git add` 該任務列出的檔案**；絕對不碰：`src/features/auth/pages/login-page.tsx`、`package.json`、`.gitignore`、`scripts/content/**`、`supabase/seeds/**`、`docs/content/**`。`.superpowers/` 已被 git-ignore，ledger 更新不入 commit。
- **hooks**：`eslint.config.js` 受 config-protection hook 保護不可改；任何情況下不得停用或繞過 hooks。
- **Commit 訊息**結尾加：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- **驗證指令**：`pnpm lint`、`pnpm typecheck`、`pnpm test`（vitest run；單檔：`pnpm test <path>`）。

---

### Task 1: 夜景戰鬥場景＋指令窗（QuestionCard 命令窗化）

**Files:**
- Modify: `src/features/quiz/pages/quiz-session.tsx:335`（root section className）
- Modify: `src/features/quiz/components/question-card.tsx:27,30`（兩個 className）
- Modify: `src/styles/globals.css`（檔尾 append 批次②區段）
- Test: `src/features/quiz/pages/quiz-session.test.tsx`、`src/features/quiz/components/question-card.test.tsx`

**Interfaces:**
- Consumes: 批次① `.scene-night`（globals.css:4772，夜空底＋星空＋chrome reset）、P0 tokens `--pixel-night`/`--pixel-night-deep`/`--pixel-gold`/`--pixel-window-frame`/`--pixel-window-ink`/`--pixel-window-muted`/`--pixel-shadow`/`--pixel-danger`/`--radius-pixel`/`--font-pixel-tc`/`--font-pixel-latin`、`.rpg-window` 框線配方（globals.css:4738）。
- Produces: `.battle-scene`（Task 2/3 的 CSS 掛載點）、`.command-window`、`.question-options--command`。DOM 結構與所有文字不變。

- [ ] **Step 1: 寫失敗測試（quiz-session：夜景 class＋載重字串保留）**

在 `src/features/quiz/pages/quiz-session.test.tsx` 的 `describe('QuizSessionPage')` 內新增（沿用該檔既有 `repositoryMock`/`session`/`question` helpers）：

```tsx
it('renders the battle night scene while preserving load-bearing strings', async () => {
  const mocks = repositoryMock();
  mocks.getSession.mockResolvedValue(session([question(1), question(2)]));
  renderQuiz(mocks.repository);

  const heading = await screen.findByRole('heading', { name: '色彩表示' });
  const runner = heading.closest('section');
  expect(runner).toHaveClass('quiz-runner', 'scene-night', 'battle-scene');
  expect(screen.getByText('第 1 / 2 題')).toBeVisible();
  expect(screen.getByRole('button', { name: '送出答案' })).toBeVisible();
});
```

（注意：既有 `question()` fixture 的 prompt 是 `第 N 題`，與 header 的 `第 1 / 2 題` 不同字串，不會撞。若 `getByText('第 1 / 2 題')` 因空白斷行失敗，改用 `screen.getByText((_, el) => el?.textContent === '第 1 / 2 題')`。）

在 `src/features/quiz/components/question-card.test.tsx` 新增：

```tsx
it('renders the command window grid while keeping the question-option class', () => {
  const { container } = render(
    <QuestionCard
      isPending={false}
      locked={false}
      onSelect={vi.fn()}
      onSubmit={vi.fn()}
      question={question}
      selectedOptionId={null}
    />,
  );

  expect(container.querySelector('form.question-card.command-window')).not.toBeNull();
  expect(
    container.querySelector('.question-options.question-options--command'),
  ).not.toBeNull();
  expect(container.querySelectorAll('.question-option')).toHaveLength(2);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test src/features/quiz/pages/quiz-session.test.tsx src/features/quiz/components/question-card.test.tsx`
Expected: 新增兩測試 FAIL（class 不存在），既有測試 PASS。

- [ ] **Step 3: 實作**

`quiz-session.tsx:335`：

```tsx
<section
  className="quiz-runner scene-night battle-scene"
  aria-labelledby="quiz-runner-title"
>
```

`question-card.tsx`：form 的 `className="question-card"` → `"question-card command-window"`；options div 的 `className="question-options"` → `"question-options question-options--command"`。

`globals.css` 檔尾 append（整批②共用一個註解區段，之後任務往下加）：

```css
/* ── 批次② JRPG 戰鬥與結算(spec §5 quiz/result 列;三拍鐵律 §4.4;
   CSS-first 幾何佔位,素材批換裝 §4.5) ── */

.battle-scene {
  display: grid;
  gap: var(--space-5);
}

.battle-scene .quiz-runner__header h1 {
  font-family: var(--font-pixel-tc);
  color: var(--pixel-window-ink);
}

.battle-scene .route-panel__eyebrow {
  color: var(--pixel-gold);
}

.battle-scene .quiz-map-panel__caption {
  color: var(--pixel-window-muted);
}

.battle-scene .quiz-runner__status p,
.battle-scene .quiz-countdown {
  color: var(--pixel-window-ink);
}

.battle-scene .quiz-runner__status {
  font-variant-numeric: tabular-nums;
}

.battle-scene > p[role='status'] {
  color: var(--pixel-window-muted);
}

.battle-scene .quiz-action-error {
  background: transparent;
  border: 2px solid var(--pixel-danger);
  border-radius: var(--radius-pixel);
}

.battle-scene .quiz-action-error p {
  color: var(--pixel-danger);
}

/* 指令窗:對話窗框線配方(同 .rpg-window,globals.css:4738) */
.command-window {
  background: var(--pixel-night);
  color: var(--pixel-window-ink);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
}

.command-window legend {
  color: var(--pixel-window-ink);
  font-size: 18px;
  line-height: 1.7;
}

.question-options--command {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .question-options--command {
    grid-template-columns: repeat(2, 1fr);
  }
}

.command-window .question-option {
  background: var(--pixel-night-deep);
  border: 2px solid var(--pixel-window-muted);
  border-radius: var(--radius-pixel);
  color: var(--pixel-window-ink);
  min-height: 44px;
}

.command-window .question-option__key {
  color: var(--pixel-gold);
  font-family: var(--font-pixel-latin);
  font-size: 12px;
}

.command-window .question-option[data-selected='true'] {
  border-color: var(--pixel-gold);
  background: var(--pixel-night);
}

.command-window .question-option[data-selected='true'] .question-option__key::before {
  content: '▶ ';
  color: var(--pixel-gold);
}

.command-window .question-option:has(input:focus-visible) {
  outline: 3px solid var(--pixel-gold);
  outline-offset: 2px;
}

.command-window .question-card__action .primary-action {
  background: var(--pixel-gold);
  color: var(--pixel-night-deep);
  border-radius: var(--radius-pixel);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
  font-family: var(--font-pixel-tc);
}
```

實作備註：(a) 既有 `.question-option` 基底樣式（globals.css:553 起，淺色底）由 `.command-window .question-option` 較高 specificity 覆蓋。(b) `.scene-night` 已負責頁底、星空與 input/link/focus chrome，`.battle-scene` 不重複定義背景。(c) 完成後 `pnpm dev` 開 `/app` 進一場挑戰目視：夜景生效、選項可讀、選中金框＋▶、狀態列與地圖說明文字可讀、錯誤訊息為 `--pixel-danger`。

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test src/features/quiz/pages/quiz-session.test.tsx src/features/quiz/components/question-card.test.tsx`
Expected: 全 PASS。再跑 `pnpm lint && pnpm typecheck`：乾淨。

- [ ] **Step 5: Commit（只 stage 本任務檔案）**

```bash
git add src/features/quiz/pages/quiz-session.tsx src/features/quiz/pages/quiz-session.test.tsx src/features/quiz/components/question-card.tsx src/features/quiz/components/question-card.test.tsx src/styles/globals.css
git commit -m "feat(quiz): night battle scene with command-window options

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: ATB 行動條（Countdown 擴充）

**Files:**
- Modify: `src/features/quiz/components/countdown.tsx`
- Modify: `src/features/quiz/pages/quiz-session.tsx:361-365`（傳入 `startedAt`）
- Modify: `src/styles/globals.css`（批次②區段內續加）
- Test: `src/features/quiz/components/countdown.test.tsx`

**Interfaces:**
- Consumes: `QuizQuestion.startedAt: string | null`（quiz-repository 既有欄位）；Task 1 的 `.battle-scene`。
- Produces: `Countdown` 新增 optional prop `startedAt?: string | null`（不傳＝行為與現狀完全相同，其他呼叫點免改）；文字輸出（`剩餘 N 秒`/`已作答`/`時間到`）與 `role="timer"` 不變。

- [ ] **Step 1: 寫失敗測試**

在 `src/features/quiz/components/countdown.test.tsx` 新增（沿用該檔既有 import；若尚未用 fake timers，補 `vi.useFakeTimers()`/`vi.useRealTimers()`）：

```tsx
it('renders the ATB fill scaled to remaining time when startedAt is given', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2099-07-14T12:00:10.000Z'));
  const { container } = render(
    <Countdown
      deadlineAt="2099-07-14T12:00:20.000Z"
      onExpire={() => undefined}
      paused={false}
      startedAt="2099-07-14T12:00:00.000Z"
    />,
  );

  const fill = container.querySelector('.atb__fill');
  expect(fill).not.toBeNull();
  expect(fill).toHaveStyle({ transform: 'scaleX(0.5)' });
  expect(screen.getByText('剩餘 10 秒')).toBeVisible();
  vi.useRealTimers();
});

it('omits the ATB track when startedAt is absent', () => {
  const { container } = render(
    <Countdown
      deadlineAt="2099-07-14T12:00:20.000Z"
      onExpire={() => undefined}
      paused={false}
    />,
  );

  expect(container.querySelector('.atb__track')).toBeNull();
  expect(container.querySelector('.quiz-countdown')).not.toBeNull();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test src/features/quiz/components/countdown.test.tsx`
Expected: 新增兩測試 FAIL（`.atb__fill` 不存在），既有測試 PASS。

- [ ] **Step 3: 實作 countdown.tsx**

```tsx
import { useEffect, useRef, useState } from 'react';

const remainingSeconds = (deadlineAt: string, now: number) =>
  Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000));

const atbFraction = (startedAt: string, deadlineAt: string, now: number) => {
  const start = new Date(startedAt).getTime();
  const deadline = new Date(deadlineAt).getTime();
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(deadline) ||
    deadline <= start
  ) {
    return 0;
  }
  return Math.min(1, Math.max(0, (deadline - now) / (deadline - start)));
};

export function Countdown({
  deadlineAt,
  onExpire,
  paused,
  startedAt,
}: Readonly<{
  deadlineAt: string;
  onExpire: () => void;
  paused: boolean;
  startedAt?: string | null;
}>) {
  const [now, setNow] = useState(Date.now);
  const expiredDeadline = useRef<string | null>(null);
  const seconds = remainingSeconds(deadlineAt, now);

  useEffect(() => {
    if (paused) return;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, [paused]);

  useEffect(() => {
    if (paused || seconds > 0 || expiredDeadline.current === deadlineAt) return;
    expiredDeadline.current = deadlineAt;
    onExpire();
  }, [deadlineAt, onExpire, paused, seconds]);

  return (
    <div className="atb">
      {startedAt ? (
        <div className="atb__track" aria-hidden="true">
          <div
            className="atb__fill"
            style={{
              transform: `scaleX(${String(atbFraction(startedAt, deadlineAt, now))})`,
            }}
          />
        </div>
      ) : null}
      <p className="quiz-countdown" role="timer" aria-live="off">
        {paused
          ? '已作答'
          : seconds === 0
            ? '時間到'
            : `剩餘 ${String(seconds)} 秒`}
      </p>
    </div>
  );
}
```

`quiz-session.tsx` Countdown 呼叫處加一行 prop：

```tsx
<Countdown
  deadlineAt={displayedQuestion.deadlineAt}
  onExpire={() => void submit(null)}
  paused={feedbackResult !== undefined}
  startedAt={displayedQuestion.startedAt}
/>
```

`globals.css` 批次②區段續加：

```css
/* ATB 行動條(spec §5:行動條倒數;paused 時 tick 停止=條凍結) */
.atb {
  display: grid;
  gap: var(--space-1);
  justify-items: end;
}

.atb__track {
  width: 160px;
  height: 10px;
  background: var(--pixel-night-deep);
  border: 2px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  overflow: hidden;
}

.atb__fill {
  height: 100%;
  background: var(--pixel-gold);
  transform-origin: left;
  transition: transform 250ms steps(4);
}

@media (prefers-reduced-motion: reduce) {
  .atb__fill {
    transition: none;
  }
}
```

（`[data-reduced-motion='true'] *` 全域規則已涵蓋 server-backed 降級。）

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test src/features/quiz/components/countdown.test.tsx src/features/quiz/pages/quiz-session.test.tsx && pnpm lint && pnpm typecheck`
Expected: 全 PASS、lint/typecheck 乾淨。

- [ ] **Step 5: Commit**

```bash
git add src/features/quiz/components/countdown.tsx src/features/quiz/components/countdown.test.tsx src/features/quiz/pages/quiz-session.tsx src/styles/globals.css
git commit -m "feat(quiz): ATB action bar on the battle countdown

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 魔物舞台＋三拍特效＋COMBO＋回饋對話窗

**Files:**
- Create: `src/features/quiz/lib/combo.ts`、`src/features/quiz/lib/combo.test.ts`
- Create: `src/features/quiz/components/battle-stage.tsx`、`src/features/quiz/components/battle-stage.test.tsx`
- Modify: `src/features/quiz/pages/quiz-session.tsx`（attacking 狀態＋phase 派生＋渲染 BattleStage）
- Modify: `src/features/quiz/components/feedback-card.tsx`（裝飾 flair）
- Modify: `src/styles/globals.css`
- Test: `src/features/quiz/pages/quiz-session.test.tsx`

**Interfaces:**
- Consumes: `QuizQuestion.answerStatus: 'correct' | 'incorrect' | 'timeout' | null`；`QuizFeedbackResult.answerStatus`；quiz-session 既有 `submit()`（quiz-session.tsx:193）與 `feedbackResult` 派生。
- Produces:
  - `comboCount(questions: readonly QuizQuestion[]): number`（純函式）
  - `type BattlePhase = 'idle' | 'attacking' | 'hit' | 'miss' | 'enemyStrike'`
  - `BattleStage({ comboCount, phase }: Readonly<{ comboCount: number; phase: BattlePhase }>)`（整體 `aria-hidden`，純裝飾）
  - FeedbackCard 文字與按鈕完全不變，只加 `aria-hidden` flair。

- [ ] **Step 1: 寫失敗測試（純函式＋元件）**

`src/features/quiz/lib/combo.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import type { QuizQuestion } from '../api/quiz-repository';
import { comboCount } from './combo';

const answered = (
  position: number,
  answerStatus: QuizQuestion['answerStatus'],
): QuizQuestion => ({
  answerStatus,
  correctOptionId: null,
  deadlineAt: '2026-07-14T12:00:20.000Z',
  explanation: null,
  options: [],
  position,
  prompt: `Q${String(position)}`,
  scoreDelta: null,
  selectedOptionId: null,
  sessionQuestionId: `q-${String(position)}`,
  stableCode: `3-1-${String(position).padStart(2, '0')}`,
  startedAt: null,
  version: 1,
});

describe('comboCount', () => {
  it('returns 0 for an empty or unanswered list', () => {
    expect(comboCount([])).toBe(0);
    expect(comboCount([answered(1, null)])).toBe(0);
  });

  it('counts consecutive correct answers from the last break', () => {
    expect(
      comboCount([
        answered(1, 'correct'),
        answered(2, 'correct'),
        answered(3, 'correct'),
      ]),
    ).toBe(3);
    expect(
      comboCount([
        answered(1, 'correct'),
        answered(2, 'incorrect'),
        answered(3, 'correct'),
      ]),
    ).toBe(1);
    expect(comboCount([answered(1, 'correct'), answered(2, 'timeout')])).toBe(0);
  });

  it('stops at the first unanswered question', () => {
    expect(
      comboCount([answered(1, 'correct'), answered(2, null), answered(3, 'correct')]),
    ).toBe(1);
  });
});
```

`src/features/quiz/components/battle-stage.test.tsx`：

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BattleStage } from './battle-stage';

describe('BattleStage', () => {
  it('is decoration-only and reflects the phase as a class', () => {
    const { container } = render(<BattleStage comboCount={0} phase="idle" />);
    const stage = container.querySelector('.battle-stage');
    expect(stage).toHaveAttribute('aria-hidden', 'true');
    expect(stage).toHaveClass('battle-stage--idle');
    expect(container.querySelector('.battle-stage__slash')).toBeNull();
  });

  it('shows the slash only while attacking, before any verdict exists', () => {
    const { container } = render(<BattleStage comboCount={0} phase="attacking" />);
    expect(container.querySelector('.battle-stage__slash')).not.toBeNull();
    expect(container.textContent).not.toContain('MISS');
  });

  it('labels miss and enemy strike phases', () => {
    const miss = render(<BattleStage comboCount={0} phase="miss" />);
    expect(miss.container.textContent).toContain('MISS');
    const strike = render(<BattleStage comboCount={0} phase="enemyStrike" />);
    expect(strike.container.textContent).toContain('魔物反擊！');
  });

  it('shows COMBO only from 2 up', () => {
    const one = render(<BattleStage comboCount={1} phase="idle" />);
    expect(one.container.textContent).not.toContain('COMBO');
    const three = render(<BattleStage comboCount={3} phase="hit" />);
    expect(three.container.textContent).toContain('COMBO ×3');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test src/features/quiz/lib/combo.test.ts src/features/quiz/components/battle-stage.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 combo.ts 與 battle-stage.tsx**

`src/features/quiz/lib/combo.ts`：

```ts
import type { QuizQuestion } from '../api/quiz-repository';

/** 連續答對計數:從頭累積,答錯/逾時歸零,遇未作答題即停(純表現層派生,不觸計分) */
export const comboCount = (questions: readonly QuizQuestion[]): number => {
  let count = 0;
  for (const question of questions) {
    if (question.answerStatus === null) break;
    count = question.answerStatus === 'correct' ? count + 1 : 0;
  }
  return count;
};
```

`src/features/quiz/components/battle-stage.tsx`：

```tsx
export type BattlePhase = 'idle' | 'attacking' | 'hit' | 'miss' | 'enemyStrike';

const phaseClass: Record<BattlePhase, string> = {
  attacking: 'battle-stage--attacking',
  enemyStrike: 'battle-stage--enemy-strike',
  hit: 'battle-stage--hit',
  idle: 'battle-stage--idle',
  miss: 'battle-stage--miss',
};

/** 戰鬥舞台:純裝飾演出。三拍時序由 phase 驅動,verdict 只能來自伺服器回應後的
    feedbackResult——此元件不含任何判定邏輯(spec §4.4)。幾何魔物為 CSS-first
    佔位,素材批換裝(spec §4.5)。 */
export function BattleStage({
  comboCount,
  phase,
}: Readonly<{ comboCount: number; phase: BattlePhase }>) {
  return (
    <div aria-hidden="true" className={`battle-stage ${phaseClass[phase]}`}>
      <div className="battle-stage__monster">
        <span className="battle-monster__body" />
        <span className="battle-monster__eye battle-monster__eye--left" />
        <span className="battle-monster__eye battle-monster__eye--right" />
      </div>
      {phase === 'attacking' ? <span className="battle-stage__slash" /> : null}
      {phase === 'miss' ? (
        <span className="battle-stage__label battle-stage__label--latin">
          MISS
        </span>
      ) : null}
      {phase === 'enemyStrike' ? (
        <span className="battle-stage__label battle-stage__label--strike">
          魔物反擊！
        </span>
      ) : null}
      {comboCount >= 2 ? (
        <span className="battle-stage__combo">COMBO ×{comboCount}</span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test src/features/quiz/lib/combo.test.ts src/features/quiz/components/battle-stage.test.tsx`
Expected: PASS。

- [ ] **Step 5: 寫失敗測試（quiz-session 三拍時序）**

在 `quiz-session.test.tsx` 新增兩測試（沿用既有 helpers 與 `incorrectResult`；若既有測試點選項用不同寫法，跟隨該檔慣例）：

```tsx
it('keeps the verdict hidden while the strike is in flight (three-beat rule)', async () => {
  const mocks = repositoryMock();
  mocks.getSession.mockResolvedValue(session([question(1)]));
  let releaseSubmit: (value: QuizAnswerResult) => void = () => undefined;
  mocks.submitAnswer.mockImplementation(
    () =>
      new Promise<QuizAnswerResult>((resolve) => {
        releaseSubmit = resolve;
      }),
  );
  renderQuiz(mocks.repository);

  await userEvent.click(await screen.findByRole('radio', { name: 'CMYK' }));
  await userEvent.click(screen.getByRole('button', { name: '送出答案' }));

  await waitFor(() => {
    expect(document.querySelector('.battle-stage--attacking')).not.toBeNull();
  });
  expect(
    screen.queryByRole('heading', { name: /答對了|答錯了|作答逾時/u }),
  ).toBeNull();

  mocks.getSession.mockResolvedValue(
    session([
      question(1, {
        answerStatus: 'incorrect',
        correctOptionId: '33000000-0000-0000-0000-000000000001',
        explanation: 'RGB 使用三色光。',
        scoreDelta: 0,
        selectedOptionId: '33000000-0000-0000-0000-000000000002',
        startedAt: null,
      }),
    ]),
  );
  releaseSubmit(incorrectResult);

  expect(
    await screen.findByRole('heading', { name: '✕ 答錯了' }),
  ).toBeVisible();
  expect(document.querySelector('.battle-stage--miss')).not.toBeNull();
  expect(document.querySelector('.battle-stage--attacking')).toBeNull();
});

it('plays the enemy strike, not a player slash, on timeout', async () => {
  const mocks = repositoryMock();
  mocks.getSession.mockResolvedValue(
    session([
      question(1, {
        deadlineAt: '2020-01-01T00:00:10.000Z',
        startedAt: '2020-01-01T00:00:00.000Z',
      }),
    ]),
  );
  let releaseSubmit: (value: QuizAnswerResult) => void = () => undefined;
  mocks.submitAnswer.mockImplementation(
    () =>
      new Promise<QuizAnswerResult>((resolve) => {
        releaseSubmit = resolve;
      }),
  );
  renderQuiz(mocks.repository);

  await waitFor(() => {
    expect(mocks.submitAnswer).toHaveBeenCalledWith(
      '32000000-0000-0000-0000-000000000001',
      null,
      expect.any(String),
    );
  });
  expect(document.querySelector('.battle-stage--attacking')).toBeNull();

  mocks.getSession.mockResolvedValue(
    session([
      question(1, {
        answerStatus: 'timeout',
        correctOptionId: '33000000-0000-0000-0000-000000000001',
        deadlineAt: '2020-01-01T00:00:10.000Z',
        explanation: 'RGB 使用三色光。',
        scoreDelta: 0,
        selectedOptionId: null,
        startedAt: null,
      }),
    ]),
  );
  releaseSubmit({
    ...incorrectResult,
    answerStatus: 'timeout',
    selectedOptionId: null,
  });

  expect(
    await screen.findByRole('heading', { name: '⌛ 作答逾時' }),
  ).toBeVisible();
  expect(document.querySelector('.battle-stage--enemy-strike')).not.toBeNull();
});
```

Run: `pnpm test src/features/quiz/pages/quiz-session.test.tsx`
Expected: 兩新測試 FAIL（`.battle-stage` 不存在）。

- [ ] **Step 6: 實作 quiz-session 接線與 FeedbackCard flair**

`quiz-session.tsx`：

1. import：`import { BattleStage, type BattlePhase } from '../components/battle-stage';`、`import { comboCount } from '../lib/combo';`
2. state（`actionError` 旁）：`const [attacking, setAttacking] = useState(false);`
3. `submit()` 內：`setActionError(undefined);` 之後加 `if (selectedId !== null) setAttacking(true);`；`finally` 區塊改為：

```tsx
    } finally {
      submissionStarted.current = false;
      setAttacking(false);
    }
```

4. phase 派生（`displayedQuestion` 派生區之後）：

```tsx
  const battlePhase: BattlePhase = feedbackResult
    ? feedbackResult.answerStatus === 'correct'
      ? 'hit'
      : feedbackResult.answerStatus === 'incorrect'
        ? 'miss'
        : 'enemyStrike'
    : attacking
      ? 'attacking'
      : 'idle';
```

5. 渲染：`</header>` 與 remediation 提示之間插入：

```tsx
      <BattleStage
        comboCount={comboCount(session.questions)}
        phase={battlePhase}
      />
```

`feedback-card.tsx`：heading 前加裝飾 flair（文字、按鈕、結構一律不動）：

```tsx
const verdictFlair = {
  correct: 'HIT!',
  incorrect: 'MISS',
  timeout: '魔物反擊！',
} as const;
```

```tsx
      <span aria-hidden="true" className="feedback-card__flair">
        {verdictFlair[result.answerStatus]}
      </span>
      <h2 id="quiz-feedback-title">{feedbackHeading[result.answerStatus]}</h2>
```

`globals.css` 批次②區段續加：

```css
/* 戰鬥舞台:三拍演出(揮刀=樂觀,命中/MISS/反擊=伺服器判定後) */
.battle-stage {
  position: relative;
  display: grid;
  justify-items: center;
  align-content: center;
  min-height: 160px;
}

.battle-stage__monster {
  position: relative;
  width: 96px;
  height: 96px;
}

.battle-monster__body {
  position: absolute;
  inset: 0;
  background: var(--pixel-window-muted);
  clip-path: polygon(
    15% 100%, 15% 55%, 25% 35%, 40% 22%, 60% 22%, 75% 35%, 85% 55%, 85% 100%
  );
}

.battle-monster__eye {
  position: absolute;
  top: 48%;
  width: 10px;
  height: 14px;
  background: var(--pixel-night-deep);
}

.battle-monster__eye--left {
  left: 33%;
}

.battle-monster__eye--right {
  right: 33%;
}

@keyframes battle-idle-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(4px);
  }
}

.battle-stage--idle .battle-stage__monster {
  animation: battle-idle-bob 1.2s steps(2) infinite;
}

@keyframes battle-slash {
  from {
    transform: translate(-56px, -56px) rotate(45deg);
    opacity: 1;
  }
  to {
    transform: translate(56px, 56px) rotate(45deg);
    opacity: 0;
  }
}

.battle-stage__slash {
  position: absolute;
  width: 8px;
  height: 72px;
  background: var(--pixel-window-frame);
  animation: battle-slash 250ms steps(3) infinite;
}

@keyframes battle-hit-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  33% {
    transform: translateX(-6px);
  }
  66% {
    transform: translateX(6px);
  }
}

.battle-stage--hit .battle-stage__monster {
  animation: battle-hit-shake 200ms steps(2) 2;
}

.battle-stage--hit .battle-monster__body {
  opacity: 0.6;
}

@keyframes battle-lunge {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(14px) scale(1.08);
  }
}

.battle-stage--enemy-strike .battle-stage__monster {
  animation: battle-lunge 300ms steps(3) 1;
}

@keyframes battle-label-pop {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.battle-stage__label {
  position: absolute;
  top: 8px;
  font-family: var(--font-pixel-tc);
  font-size: 18px;
  color: var(--pixel-window-muted);
  animation: battle-label-pop 200ms steps(3) both;
}

.battle-stage__label--latin {
  font-family: var(--font-pixel-latin);
}

.battle-stage__label--strike {
  color: var(--pixel-danger);
}

.battle-stage__combo {
  position: absolute;
  top: 8px;
  right: 8px;
  font-family: var(--font-pixel-latin);
  font-size: 14px;
  color: var(--pixel-gold);
}

/* 回饋卡=夜景對話窗(文字與按鈕不變,僅換皮+flair) */
.battle-scene .feedback-card {
  background: var(--pixel-night);
  color: var(--pixel-window-ink);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
}

.battle-scene .feedback-card h2,
.battle-scene .feedback-card p {
  color: var(--pixel-window-ink);
}

.battle-scene .feedback-card--correct h2 {
  color: var(--pixel-gold);
}

.battle-scene .feedback-card--incorrect h2,
.battle-scene .feedback-card--timeout h2 {
  color: var(--pixel-danger);
}

.feedback-card__flair {
  display: block;
  font-family: var(--font-pixel-latin);
  font-size: 13px;
  letter-spacing: 0.1em;
  color: var(--pixel-gold);
}

.battle-scene .feedback-card__score {
  color: var(--pixel-gold);
}

@media (prefers-reduced-motion: reduce) {
  .battle-stage--idle .battle-stage__monster,
  .battle-stage__slash,
  .battle-stage--hit .battle-stage__monster,
  .battle-stage--enemy-strike .battle-stage__monster,
  .battle-stage__label {
    animation: none;
  }
}
```

（reduced-motion 下 MISS/魔物反擊/COMBO 文字仍靜態顯示＝spec §4.4 的純文字回饋降級；`[data-reduced-motion='true'] *` 全域規則另行涵蓋 server-backed 開關。）

- [ ] **Step 7: 跑測試確認通過**

Run: `pnpm test src/features/quiz && pnpm lint && pnpm typecheck`
Expected: quiz feature 全綠、lint/typecheck 乾淨。再 `pnpm dev` 目視一輪：閒置魔物浮動→按下送出見揮刀→回應後命中閃爍/MISS/反擊、COMBO ×N 於連對 2 起顯示、回饋窗為夜景對話窗。

- [ ] **Step 8: Commit**

```bash
git add src/features/quiz/lib/combo.ts src/features/quiz/lib/combo.test.ts src/features/quiz/components/battle-stage.tsx src/features/quiz/components/battle-stage.test.tsx src/features/quiz/pages/quiz-session.tsx src/features/quiz/pages/quiz-session.test.tsx src/features/quiz/components/feedback-card.tsx src/styles/globals.css
git commit -m "feat(quiz): battle stage with three-beat strike, combo counter, and dialog feedback window

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 勝利結算：VICTORY＋寶箱 Loot Reveal

**Files:**
- Create: `src/features/quiz/components/loot-reveal.tsx`、`src/features/quiz/components/loot-reveal.test.tsx`
- Modify: `src/features/quiz/pages/quiz-result.tsx`
- Modify: `src/styles/globals.css`
- Test: `src/features/quiz/pages/quiz-result.test.tsx`

**Interfaces:**
- Consumes: `QuizSession.totalScore/correctCount/questionCount/xpAwarded/tokensAwarded`（伺服器已回傳值——確定性，無隨機）；`.scene-night`。
- Produces: `LootReveal({ correctCount, questionCount, tokensAwarded, totalScore, xpAwarded }: Readonly<{ correctCount: number; questionCount: number; tokensAwarded: number; totalScore: number; xpAwarded: number }>)`——渲染寶箱＋`.quiz-result__totals`（**四行文字格式與現狀一字不差**）。Task 5 消費 `.victory-scene` 區段。

- [ ] **Step 1: 測試前置——結算頁測試全面釘住 reduced-motion**

count-up 與寶箱動畫必須在測試中確定性呈現最終值。在 `quiz-result.test.tsx` 的 `describe('QuizResultPage')` 頂部加：

```tsx
beforeEach(() => {
  document.documentElement.dataset.reducedMotion = 'true';
});

afterEach(() => {
  delete document.documentElement.dataset.reducedMotion;
});
```

（import 補 `beforeEach, afterEach`。既有四個測試的字串斷言因此維持有效——reduced 路徑直接渲染最終值。）

- [ ] **Step 2: 寫失敗測試**

`src/features/quiz/components/loot-reveal.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LootReveal } from './loot-reveal';

describe('LootReveal', () => {
  beforeEach(() => {
    document.documentElement.dataset.reducedMotion = 'true';
  });

  afterEach(() => {
    delete document.documentElement.dataset.reducedMotion;
  });

  it('reveals the exact server-authoritative totals with an open chest', () => {
    const { container } = render(
      <LootReveal
        correctCount={5}
        questionCount={10}
        tokensAwarded={250}
        totalScore={750}
        xpAwarded={750}
      />,
    );

    expect(container.querySelector('.loot-reveal')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(container.querySelector('.loot-chest')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByText('總分 750')).toBeVisible();
    expect(screen.getByText('答對 5 / 10 題')).toBeVisible();
    expect(screen.getByText('+750 XP')).toBeVisible();
    expect(screen.getByText('+250 Token')).toBeVisible();
  });
});
```

`quiz-result.test.tsx` 新增：

```tsx
it('renders the night victory scene with a decorative banner and loot chest', async () => {
  renderResult(repository(vi.fn().mockResolvedValue(completedSession)));

  expect(
    await screen.findByRole('heading', { name: '挑戰完成 🎉' }),
  ).toBeVisible();
  const section = document.querySelector('section.quiz-result');
  expect(section).toHaveClass('scene-night', 'victory-scene');
  const banner = document.querySelector('.victory-banner');
  expect(banner).toHaveAttribute('aria-hidden', 'true');
  expect(banner).toHaveTextContent('VICTORY');
  expect(document.querySelector('.loot-chest')).not.toBeNull();
  expect(screen.getByText('總分 150')).toBeVisible();
  expect(screen.getByText('+750 XP')).toBeVisible();
});
```

Run: `pnpm test src/features/quiz/components/loot-reveal.test.tsx src/features/quiz/pages/quiz-result.test.tsx`
Expected: 新測試 FAIL（模組/class 不存在），既有四測試 PASS（Step 1 已保護）。

- [ ] **Step 3: 實作 loot-reveal.tsx**

```tsx
import { useEffect, useState } from 'react';

const prefersReducedMotion = () =>
  document.documentElement.dataset.reducedMotion === 'true' ||
  (typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const canAnimate = () =>
  typeof window.requestAnimationFrame === 'function' && !prefersReducedMotion();

const useCountUp = (target: number, durationMs: number) => {
  const [value, setValue] = useState(() => (canAnimate() ? 0 : target));

  useEffect(() => {
    if (!canAnimate()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * ratio));
      if (ratio < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [durationMs, target]);

  return value;
};

/** 寶箱結算:確定性獎勵演出——數值全來自伺服器回傳,禁止隨機(spec §5 result 列)。
    開箱與滾動皆在 600ms 內完成;reduced-motion 直接呈現最終值。 */
export function LootReveal({
  correctCount,
  questionCount,
  tokensAwarded,
  totalScore,
  xpAwarded,
}: Readonly<{
  correctCount: number;
  questionCount: number;
  tokensAwarded: number;
  totalScore: number;
  xpAwarded: number;
}>) {
  const [open, setOpen] = useState(() => !canAnimate());
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setOpen(true);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);
  const score = useCountUp(totalScore, 600);
  const xp = useCountUp(xpAwarded, 600);
  const tokens = useCountUp(tokensAwarded, 600);

  return (
    <div className="loot-reveal" data-open={open ? 'true' : 'false'}>
      <div className="loot-chest" aria-hidden="true">
        <span className="loot-chest__lid" />
        <span className="loot-chest__base" />
      </div>
      <div className="quiz-result__totals" aria-label="挑戰結果摘要">
        <p>總分 {String(score)}</p>
        <p>
          答對 {String(correctCount)} / {String(questionCount)} 題
        </p>
        <p>+{String(xp)} XP</p>
        <p>+{String(tokens)} Token</p>
      </div>
    </div>
  );
}
```

（`答對 N / M 題` 不做 count-up——正確題數滾動無演出價值，直接顯示最終值最穩。`總分/XP/Token` 滾動 600ms 內結束，遠短於 Playwright 預設重試窗，e2e `getByText('+750 XP')` 不受影響。）

- [ ] **Step 4: 實作 quiz-result.tsx 場景與寶箱**

1. import：`import { LootReveal } from '../components/loot-reveal';`
2. root section：

```tsx
<section
  className="quiz-result scene-night victory-scene"
  aria-labelledby="quiz-result-title"
>
```

3. header 內第一行（eyebrow 之前）插入：

```tsx
        <p aria-hidden="true" className="victory-banner">
          VICTORY
        </p>
```

4. 既有 `<div className="quiz-result__totals" aria-label="挑戰結果摘要">…四個 <p>…</div>` 整塊替換為：

```tsx
        <LootReveal
          correctCount={session.correctCount}
          questionCount={session.questionCount}
          tokensAwarded={session.tokensAwarded}
          totalScore={session.totalScore}
          xpAwarded={session.xpAwarded}
        />
```

（decay／remediation 條件區塊與逐題回顧、行動列一律不動。）

`globals.css` 批次②區段續加：

```css
/* 勝利結算:夜景+VICTORY+寶箱(確定性演出) */
.victory-scene {
  display: grid;
  gap: var(--space-6);
}

.victory-banner {
  margin: 0;
  font-family: var(--font-pixel-latin);
  font-size: clamp(28px, 6vw, 44px);
  letter-spacing: 0.12em;
  text-align: center;
  color: var(--pixel-gold);
  text-shadow: 4px 4px 0 var(--pixel-shadow);
  animation: battle-label-pop 300ms steps(4) both;
}

.victory-scene .quiz-result__summary h1,
.victory-scene .quiz-result__summary > div[role='status'] p {
  color: var(--pixel-window-ink);
}

.victory-scene .route-panel__eyebrow {
  color: var(--pixel-gold);
}

.victory-scene .quiz-result__decay {
  color: var(--pixel-window-muted);
}

.victory-scene .quiz-result__summary a {
  color: var(--pixel-gold);
}

.loot-reveal {
  display: grid;
  gap: var(--space-4);
  justify-items: center;
}

.loot-chest {
  position: relative;
  width: 72px;
  height: 56px;
}

.loot-chest__base {
  position: absolute;
  inset: 22px 0 0;
  background: var(--pixel-gold);
  border: 3px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
}

.loot-chest__lid {
  position: absolute;
  inset: 0 0 auto;
  height: 26px;
  background: var(--pixel-gold);
  border: 3px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  transform-origin: bottom left;
  transition: transform 300ms steps(3);
}

.loot-reveal[data-open='true'] .loot-chest__lid {
  transform: translateY(-12px) rotate(-16deg);
}

.victory-scene .quiz-result__totals p {
  color: var(--pixel-window-ink);
  font-variant-numeric: tabular-nums;
}

.victory-scene .result-question {
  border: 2px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
}

.victory-scene .quiz-result__actions .secondary-action {
  color: var(--pixel-window-ink);
}

@media (prefers-reduced-motion: reduce) {
  .victory-banner {
    animation: none;
  }

  .loot-chest__lid {
    transition: none;
  }
}
```

（`.result-question` 既有淺色卡底（globals.css:731 `--color-surface`）保留＝夜景上的羊皮紙回顧卡，內文沿用既有深色 ink，對比不變。）

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm test src/features/quiz && pnpm lint && pnpm typecheck`
Expected: 全綠。`pnpm dev` 完成一場挑戰目視：VICTORY 落下、寶箱 300ms 開蓋、數字滾動 600ms 停在伺服器值、回顧卡為夜景上的淺色卡、`再玩一次／回章節` 可讀。

- [ ] **Step 6: Commit**

```bash
git add src/features/quiz/components/loot-reveal.tsx src/features/quiz/components/loot-reveal.test.tsx src/features/quiz/pages/quiz-result.tsx src/features/quiz/pages/quiz-result.test.tsx src/styles/globals.css
git commit -m "feat(quiz): victory night scene with deterministic loot chest reveal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 升級 fanfare＋本次新解鎖成就

**Files:**
- Create: `src/features/quiz/lib/reward-derivations.ts`、`src/features/quiz/lib/reward-derivations.test.ts`
- Modify: `src/features/quiz/pages/quiz-session.tsx:238-242`（navigate state 加 `fromFinalize`）
- Modify: `src/features/quiz/pages/quiz-result.tsx`
- Modify: `src/styles/globals.css`
- Test: `src/features/quiz/pages/quiz-result.test.tsx`

**Interfaces:**
- Consumes: `useEconomySummary(repository?: EconomyRepository)`（src/features/rewards/hooks/use-economy-summary.ts，回傳 `EconomySummary { totalXp, level, xpPerLevel: 500, … }`）；`useAchievements(repository?: AchievementRepository)`（src/features/achievements/hooks/use-achievements.ts，回傳 `AchievementCatalog { items }`，item 含 `state/unlockedAt/stableCode/displayName/description/badgeKey`）；`QuizSession.completedAt`；achievements 解鎖與 finalize 同交易（Phase 2），時間戳相等，故 `>=` 篩選成立。
- Produces:
  - `crossedLevelBoundary(totalXp: number, xpAwarded: number, xpPerLevel: number): boolean`
  - `unlockedSince(items: readonly AchievementCatalogItem[], sinceIso: string): readonly AchievementCatalogItem[]`
  - `QuizResultPage` 新增 optional props `achievementRepository?: AchievementRepository; economyRepository?: EconomyRepository`（沿用既有 DI 模式；不傳＝瀏覽器 client）。
- **已知限制（記錄於計畫，不視為缺陷）**：fanfare 僅在 `location.state.fromFinalize` 時計算（結算直達才有意義，重訪不顯示）；`unlockedSince` 理論上會納入 completedAt 之後、瀏覽 result 前由其他事件解鎖的成就——機率極低且屬正向誤差，接受。

- [ ] **Step 1: 寫失敗測試（純函式）**

`src/features/quiz/lib/reward-derivations.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import type { AchievementCatalogItem } from '../../achievements/types';
import { crossedLevelBoundary, unlockedSince } from './reward-derivations';

const item = (
  overrides: Partial<AchievementCatalogItem>,
): AchievementCatalogItem => ({
  badgeKey: 'first_quiz',
  description: '完成第一場挑戰',
  displayName: '初出茅廬',
  progress: 1,
  stableCode: 'first_quiz',
  state: 'unlocked',
  target: 1,
  unlockedAt: '2026-07-31T01:00:00.000Z',
  ...overrides,
});

describe('crossedLevelBoundary', () => {
  it('detects a crossing when this award pushes total past a 500 boundary', () => {
    expect(crossedLevelBoundary(750, 750, 500)).toBe(true);
    expect(crossedLevelBoundary(500, 100, 500)).toBe(true);
  });

  it('returns false without a crossing or without an award', () => {
    expect(crossedLevelBoundary(400, 100, 500)).toBe(false);
    expect(crossedLevelBoundary(750, 0, 500)).toBe(false);
    expect(crossedLevelBoundary(750, 750, 0)).toBe(false);
  });
});

describe('unlockedSince', () => {
  it('keeps only unlocked items at or after the boundary', () => {
    const kept = item({ stableCode: 'kept' });
    const older = item({
      stableCode: 'older',
      unlockedAt: '2026-07-30T00:00:00.000Z',
    });
    const locked = item({
      stableCode: 'locked',
      state: 'in_progress',
      unlockedAt: null,
    });
    expect(
      unlockedSince([kept, older, locked], '2026-07-31T01:00:00.000Z'),
    ).toEqual([kept]);
  });

  it('returns nothing for an invalid boundary', () => {
    expect(unlockedSince([item({})], 'not-a-date')).toEqual([]);
  });
});
```

Run: `pnpm test src/features/quiz/lib/reward-derivations.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 2: 實作 reward-derivations.ts**

```ts
import type { AchievementCatalogItem } from '../../achievements/types';

/** 純表現層:本次 xpAwarded 是否使總 XP 跨越等級門檻(xpPerLevel 取自 EconomySummary,
    伺服器已入帳,此處只做展示判斷,不觸任何計分/finalize) */
export const crossedLevelBoundary = (
  totalXp: number,
  xpAwarded: number,
  xpPerLevel: number,
): boolean =>
  xpAwarded > 0 &&
  xpPerLevel > 0 &&
  Math.floor((totalXp - xpAwarded) / xpPerLevel) < Math.floor(totalXp / xpPerLevel);

/** 本次新解鎖成就:unlockedAt 不早於 session 完成時間(finalize 同交易,時間戳相等) */
export const unlockedSince = (
  items: readonly AchievementCatalogItem[],
  sinceIso: string,
): readonly AchievementCatalogItem[] => {
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return [];
  return items.filter(
    (candidate) =>
      candidate.state === 'unlocked' &&
      candidate.unlockedAt !== null &&
      Date.parse(candidate.unlockedAt) >= since,
  );
};
```

Run: `pnpm test src/features/quiz/lib/reward-derivations.test.ts` → PASS。

- [ ] **Step 3: 寫失敗測試（result 頁整合）**

先確認 state 讀者相容：`grep -rn "assignmentAttempt" src --include='*.tsx'`——現有讀者以 `state?.assignmentAttempt` 取值，物件展開後鍵仍在，不受影響（若發現其他讀法，回報再調整）。

`quiz-result.test.tsx`：`renderResult` 擴充為可注入 repos 與 router state：

```tsx
function renderResult(
  mockRepository: QuizRepository,
  extras: Readonly<{
    achievementRepository?: AchievementRepository;
    economyRepository?: EconomyRepository;
    state?: Record<string, unknown>;
  }> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: (
          <QuizResultPage
            achievementRepository={extras.achievementRepository}
            economyRepository={extras.economyRepository}
            repository={mockRepository}
          />
        ),
        path: '/app/quiz/:sessionId/result',
      },
    ],
    {
      initialEntries: [
        {
          pathname: `/app/quiz/${sessionId}/result`,
          state: extras.state ?? null,
        },
      ],
    },
  );
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(<RouterProvider router={router} />, { wrapper: Wrapper });
}
```

（import 補 `type AchievementCatalog, type AchievementRepository` 自 `../../achievements/types`、`type EconomyRepository, type EconomySummary` 自 `../../rewards/types`。既有測試呼叫 `renderResult(repo)` 不受影響。）

新增 fixtures 與三測試：

```tsx
const economySummary = {
  currentLevelXp: 250,
  level: 2,
  tokenBalance: 250,
  totalXp: 750,
  walletReconciled: true,
  xpPerLevel: 500,
} satisfies EconomySummary;

const catalog = (items: AchievementCatalog['items']): AchievementCatalog => ({
  items,
  totalCount: items.length,
  unlockedCount: items.filter(({ state }) => state === 'unlocked').length,
});

it('celebrates a level up only when arriving fresh from finalize', async () => {
  renderResult(repository(vi.fn().mockResolvedValue(completedSession)), {
    economyRepository: { getSummary: vi.fn().mockResolvedValue(economySummary) },
    state: { fromFinalize: true },
  });

  expect(await screen.findByText(/LEVEL UP/u)).toBeVisible();
  expect(screen.getByText(/Lv\.2/u)).toBeVisible();
});

it('stays silent about levels when revisiting the result page', async () => {
  renderResult(repository(vi.fn().mockResolvedValue(completedSession)), {
    economyRepository: { getSummary: vi.fn().mockResolvedValue(economySummary) },
  });

  await screen.findByRole('heading', { name: '挑戰完成 🎉' });
  expect(screen.queryByText(/LEVEL UP/u)).toBeNull();
});

it('lists only achievements unlocked by this session', async () => {
  renderResult(repository(vi.fn().mockResolvedValue(completedSession)), {
    achievementRepository: {
      getCatalog: vi.fn().mockResolvedValue(
        catalog([
          {
            badgeKey: 'first_quiz',
            description: '完成第一場挑戰',
            displayName: '初出茅廬',
            progress: 1,
            stableCode: 'first_quiz',
            state: 'unlocked',
            target: 1,
            unlockedAt: completedSession.completedAt,
          },
          {
            badgeKey: 'older',
            description: '更早解鎖',
            displayName: '昔日榮光',
            progress: 1,
            stableCode: 'older',
            state: 'unlocked',
            target: 1,
            unlockedAt: '2026-07-01T00:00:00.000Z',
          },
        ]),
      ),
    },
  });

  expect(await screen.findByText('本次新解鎖成就')).toBeVisible();
  expect(screen.getByText('初出茅廬')).toBeVisible();
  expect(screen.queryByText('昔日榮光')).toBeNull();
});
```

（`completedSession.completedAt` 為 `'2026-07-14T12:05:00.000Z'`，非 null，直接可用。）

Run: `pnpm test src/features/quiz/pages/quiz-result.test.tsx`
Expected: 三新測試 FAIL。

- [ ] **Step 4: 實作**

`quiz-session.tsx` finalize 導向（238-242）改為：

```tsx
        void navigate(`/app/quiz/${session.sessionId}/result`, {
          state: {
            fromFinalize: true,
            ...(finalResult.assignmentAttempt
              ? { assignmentAttempt: finalResult.assignmentAttempt }
              : {}),
          },
        });
```

`quiz-result.tsx`：

1. imports：

```tsx
import { Link, useLocation, useParams } from 'react-router-dom';

import { useAchievements } from '../../achievements/hooks/use-achievements';
import { type AchievementRepository } from '../../achievements/types';
import { useEconomySummary } from '../../rewards/hooks/use-economy-summary';
import { type EconomyRepository } from '../../rewards/types';
import { crossedLevelBoundary, unlockedSince } from '../lib/reward-derivations';
```

2. props 與 hooks（hooks 必須無條件呼叫，放在早期 return 之前）：

```tsx
export function QuizResultPage({
  achievementRepository,
  economyRepository,
  repository: suppliedRepository,
}: Readonly<{
  achievementRepository?: AchievementRepository;
  economyRepository?: EconomyRepository;
  repository?: QuizRepository;
}>) {
  const { sessionId } = useParams();
  const location = useLocation();
  const fromFinalize = Boolean(
    (location.state as { fromFinalize?: boolean } | null)?.fromFinalize,
  );
  const economyQuery = useEconomySummary(economyRepository);
  const achievementsQuery = useAchievements(achievementRepository);
  // …既有 repository/sessionQuery 不動…
```

3. 成功分支內派生（catalog／summary 載入失敗或載入中＝直接不顯示慶祝區，不阻擋結果頁）：

```tsx
  const newAchievements =
    achievementsQuery.data && session.completedAt
      ? unlockedSince(achievementsQuery.data.items, session.completedAt)
      : [];
  const leveledUp =
    fromFinalize && economyQuery.data
      ? crossedLevelBoundary(
          economyQuery.data.totalXp,
          session.xpAwarded,
          economyQuery.data.xpPerLevel,
        )
      : false;
```

4. `LootReveal` 之後、decay 區塊之前插入 fanfare：

```tsx
        {leveledUp && economyQuery.data ? (
          <p className="level-up-fanfare" role="status">
            LEVEL UP！等級提升至 Lv.{String(economyQuery.data.level)}
          </p>
        ) : null}
```

5. `</header>` 之後、逐題回顧之前插入成就區：

```tsx
      {newAchievements.length > 0 ? (
        <section
          className="quiz-result__achievements"
          aria-labelledby="quiz-result-achievements-title"
        >
          <h2 id="quiz-result-achievements-title">本次新解鎖成就</h2>
          <ul>
            {newAchievements.map((item) => (
              <li className="achievement-loot" key={item.stableCode}>
                <span aria-hidden="true" className="achievement-loot__badge" />
                <div>
                  <strong>{item.displayName}</strong>
                  <p>{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
```

`globals.css` 批次②區段續加：

```css
/* 升級 fanfare 與本次新解鎖成就 */
@keyframes fanfare-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}

.level-up-fanfare {
  margin: 0;
  text-align: center;
  font-family: var(--font-pixel-tc);
  font-size: 20px;
  color: var(--pixel-gold);
  animation: fanfare-pulse 300ms steps(2) 3;
}

.quiz-result__achievements {
  background: var(--pixel-night);
  color: var(--pixel-window-ink);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  padding: 20px 24px;
}

.quiz-result__achievements h2 {
  margin: 0 0 var(--space-3);
  font-family: var(--font-pixel-tc);
  font-size: 18px;
  color: var(--pixel-gold);
}

.quiz-result__achievements ul {
  display: grid;
  gap: var(--space-3);
  list-style: none;
  margin: 0;
  padding: 0;
}

.achievement-loot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.achievement-loot__badge {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  background: var(--pixel-gold);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
}

.achievement-loot p {
  margin: 0;
  color: var(--pixel-window-muted);
  font-size: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .level-up-fanfare {
    animation: none;
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm test src/features/quiz && pnpm lint && pnpm typecheck`
Expected: 全綠。

- [ ] **Step 6: Commit**

```bash
git add src/features/quiz/lib/reward-derivations.ts src/features/quiz/lib/reward-derivations.test.ts src/features/quiz/pages/quiz-session.tsx src/features/quiz/pages/quiz-result.tsx src/features/quiz/pages/quiz-result.test.tsx src/styles/globals.css
git commit -m "feat(quiz): level-up fanfare and newly unlocked achievements on the victory screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 批次② Gate（驗證＋截圖＋ledger）

**Files:**
- No production files（僅驗證；若發現缺陷，修復另立 commit 並記錄）
- Update（不入 commit，`.superpowers/` 已 git-ignore）：`.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: Tasks 1–5 全部 commit；`scripts/design-audit/capture-screens.mjs`（含 `quiz`/`quizFeedback`/`quizResult` 三路由與 `start-quiz`/`finish-quiz` setup）；本機 Supabase stack。
- Produces: gate 判定＋截圖證據＋ledger 紀錄；供批終審（opus whole-batch review）使用的範圍 `58c9a7a..HEAD`。

- [ ] **Step 1: 全量靜態與單元電池**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint 0 錯誤、typecheck 乾淨、單元全綠（基準 760+，本批新增約 15 測試）。

- [ ] **Step 2: raw hex 與 token 紀律掃描**

```bash
git diff 58c9a7a..HEAD -- src | grep -E '^\+' | grep -oE '#[0-9a-fA-F]{3,8}\b' | sort -u
```

Expected: 無輸出（本批零新 token、零 raw hex）。再確認 `git diff 58c9a7a..HEAD --stat` 只含本批檔案（quiz feature、globals.css、計畫文件）。

- [ ] **Step 3: 載重字串完整性掃描**

```bash
grep -rn "送出答案" src/features/quiz/components/question-card.tsx && \
grep -rn "我理解了，下一題\|結算並查看結果" src/features/quiz/components/feedback-card.tsx && \
grep -rn "✓ 答對了\|✕ 答錯了\|⌛ 作答逾時" src/features/quiz/components/feedback-card.tsx && \
grep -rn "挑戰完成" src/features/quiz/pages/quiz-result.tsx && \
grep -rn "question-option\b" src/features/quiz/components/question-card.tsx
```

Expected: 每條都命中。

- [ ] **Step 4: E2E 抽驗（quiz 主旅程）**

依 batch-1 gate 慣例啟動本機 stack 後，跑至少 `tests/e2e/quiz-runner.spec.ts`（時間允許則 `bash scripts/test-e2e-local.sh` 全電池）。
Expected: quiz-runner PASS。**注意**：平行 session 有未 commit 的 `supabase/seeds/content-*.sql` 變更；若失敗根因追到 content seed 漂移（非本批檔案），記錄於 ledger、不追修、不碰其檔案，以單元＋截圖＋字串掃描補強證據。

- [ ] **Step 5: design-audit 截圖與 375px 驗證**

以 batch-1 Task 5 同一程序（dev server＋local Supabase）執行 `scripts/design-audit/capture-screens.mjs`，取 `quiz`/`quizFeedback`/`quizResult` 三畫面，桌機＋375px（腳本既有窄幅模式）。逐張目視檢查：
- 夜景生效、無水平溢出、星空不吃掉可讀性；
- 指令窗選項、選中金框＋▶、ATB 條、COMBO、揮刀→判定時序（quizFeedback 截圖應已顯示對話窗回饋）；
- 結算頁 VICTORY／寶箱開啟後狀態／四行總計／成就區（若該 setup 流程有解鎖）；
- console 0 error。

- [ ] **Step 6: 對比抽查**

在截圖或 DevTools 對以下配對逐一確認 ≥4.5:1（tokens 註解已預計算，此步為實測抽查）：night 底 × window-ink／window-muted／gold／danger；gold 底 × night-deep（送出按鈕）；淺色回顧卡內既有 ink。

- [ ] **Step 7: Ledger 更新與批終審交接**

在 `.superpowers/sdd/progress.md` 追加 `## JRPG Pixel Batch-2` 區段：每 task 一行（commit、spec、quality），gate 結果與證據路徑。隨後依 subagent-driven-development 流程發起批終審（review 範圍 `58c9a7a..HEAD`），終審 APPROVED 才收批。

---

## Self-Review 紀錄（計畫作者自查）

1. **Spec 覆蓋**：§5 quiz 列（魔物置中✓Task 3、指令窗四格✓Task 1、三拍✓Task 3、行動條✓Task 2、COMBO✓Task 3）；§5 result 列（VICTORY✓Task 4、寶箱確定性✓Task 4、EXP/G 滾動✓Task 4、升級 fanfare✓Task 5、新解鎖成就✓Task 5）；§4.4（steps()、150–300ms、reduced-motion、三拍、只動 transform/opacity）分散於各 CSS 步驟；逾時＝魔物反擊✓Task 3。音效 chiptune 化（§4.4）**不在本批**——沿用既有無音效狀態，音訊架構留待批次⑤（spec §7）。
2. **Placeholder 掃描**：無 TBD/TODO；所有測試與實作皆給完整程式碼；兩處「跟隨該檔慣例」均已附可直接使用的具體寫法作為預設。
3. **型別一致性**：`BattlePhase` 五值在 Task 3 定義與消費一致；`LootReveal`/`BattleStage` props 與呼叫處一致；`crossedLevelBoundary(totalXp, xpAwarded, xpPerLevel)` 參數順序在測試與實作一致；`Countdown.startedAt?: string | null` 與 `QuizQuestion.startedAt: string | null` 相容。
