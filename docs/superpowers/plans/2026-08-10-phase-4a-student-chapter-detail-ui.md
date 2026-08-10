# Phase 4A：學生端章節體驗 UI Surface Implementation Plan

> **長度說明**：本文件超過 500 行。已移除所有可由現有原始碼直接讀出的完整檔案拷貝（MODIFY 檔案一律用「相對於下方『現有介面對照』的差異」描述，不重貼未變更部分）；保留的是：3 個全新檔案的完整程式碼（無既有版本可參照）、型別契約、TDD 測試矩陣、以及新增的瀏覽器驗證基礎設施（repo 內尚無先例可壓縮）。這些是本輪 remediation 明確要求保留的必要內容。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `chapter-detail-page.tsx` 從目前的 ad-hoc 條件判斷（`locked`／stale-lock 兩種情境都直接 `Navigate` 離開頁面）改成明確的 7 態 typed discriminated view-model，locked/content-preparing 有獨立呈現與無障礙標記，套用 Codédex 式深色扁平卡片視覺，並補齊捲動/鍵盤/螢幕閱讀器/reduced-motion 要求與真實 Chromium 驗證。

**Architecture：** 新增一個純函式 adapter（`deriveChapterDetailViewModel` + `deriveMasteryDisplay`），把既有四個 query hook（`useStudentChapterMap`／`useChapterReview`／`useLearningProgress`／`useReviewProgressRows`）的回傳值收斂成單一 `ChapterDetailViewModel` discriminated union。**adapter 是純模組**：輸入只有 plain data／boolean，輸出不含任何 callback（不含 `onRetry`），重試改用 `retryTarget` 資料標記，由頁面殼層（shell）在 render seam 決定實際呼叫哪個 refetch。頁面拆成 `ChapterDetailPage`（hook-wired shell，負責資料流與 mutation）與 `ChapterDetailPageView`（純 presentational，只吃 `viewModel` + 幾個 callback prop）——這個切分同時滿足「adapter 不持有 callback」與「需要不依賴 Supabase 的瀏覽器驗證入口」兩個需求：測試/開發用 harness 可以直接掛載 `ChapterDetailPageView`，不必經過任何 hook。

**Tech Stack：** React 19、TypeScript、TanStack Query（既有 hook 不動）、Vitest + Testing Library、Playwright（新增一組 scoped Chromium 驗證，不依賴 Local Supabase）、既有 `GamePager`／`ProgressBar` 元件。無新依賴套件。

**Spec：** `docs/superpowers/specs/2026-08-10-phase-4a-student-chapter-detail-ui-design.md`（owner approved 2026-08-10）

**Status：** Owner approved：2026-08-10 ／ Codex plan review completed ／ Authorized for Phase 4A implementation

**本輪 remediation 摘要（相對於上一版計畫的關鍵變更）：**

1. 3 個 task 全部收斂為全綠 commit（0 skip、0 預期外失敗），不再有「先刪媒體/火把、下個 task 補回」的模式；Task 6/7 合併。
2. Mastery contract 改為 `legacy-recorded` / `not-attempted-current-version` / `unavailable-until-backend-contract` / `versioned` 四態，不再用單一數字冒充跨版本最高分或目前版本分數；production adapter 現況只吃得到 `LearningProgressRow` 的單一 `mastery`+`rulesVersion`，因此**只能**回傳 `legacy-recorded`（有效數值時，誠實標示為「目前記錄精熟度」＋規則版本，不稱最高、不稱目前內容版本分數、不標記 merged）或 `unavailable-until-backend-contract`（數值缺失、progress row 缺失、或版本語意無法確認時，一律歸這一態，不得推論成任何形式的「尚未測驗」）；`not-attempted-current-version` 與 `versioned` 只有測試 fixture 能建構，需要後端明確提供 active content version、以及 highest/current 正式契約時才會被 production 觸發。
3. Adapter 輸出移除 `onRetry: () => void`，改用 `retryTarget: ChapterDetailRetryTarget | null`，實際 refetch 呼叫留在 `ChapterDetailPage` shell。
4. `locked` blocker 文案改用固定 code→copy 對照表（非新推導），不顯示 raw code。
5. CSS 改在既有 `.chapter-dungeon`／`.review-accordion`／`.floor-torch` 區塊內就地擴充，不在檔尾疊新區塊；只用已確認存在的 token。
6. 新增不依賴 Local Supabase 的 dev-only Chromium 驗證 harness，涵蓋 320/375/1024/1440px。
7. Implementation 需要在專屬 worktree（`phase4a/chapter-detail-ui`）內進行；本次 remediation（改寫這份文件）本身不建立 worktree。
8. 全部 3 個 task 完成、驗證全綠後，只跑一次 code review（不逐 task review）。

## Global Constraints

- **範圍只有 `/app/chapters/:chapterId`（`chapter-detail-page.tsx`）**。不得觸碰 `/app`、`/app/missions`、教師端、Live、任何 `supabase/` migration、RPC 或 `scripts/content/*`。
- **七態固定為**：`loading`／`locked`／`content-preparing`／`content-readiness-error`／`error`／`in-progress`／`completed`。不新增第 8 態，不保留獨立的 `empty` 狀態。
- **內容已發布但缺必要卡片/題目 → `content-readiness-error`**，不是 `empty`，不是正常渲染。
- **`locked` 顯示 server-issued unmet conditions**——直接使用 `StudentChapterMapEntry.blockers`（`ChapterAccessBlocker[]`）；文案透過**固定** code→copy 對照表產生，不顯示 raw `code` 字串，不由前端推導新的 unmet condition。
- **`locked` 與 `content-preparing` 圖示、文案、accessible name 都要不同**——不得共用同一個元件變數只換文字。
- **題目/選項等文字內容不得水平捲動，必須換行，且 primary action 保持可見**；只有既有的 `GamePager` 分頁軌道容器可以有自己的內部捲動邏輯。
- **`document`/根容器不得出現水平 overflow**——320/375/1024/1440px 為驗證基準（Task 3 用真實 Chromium 驗證，不採信 jsdom `scrollWidth`）。
- **每個畫面只有一個 primary action**。
- **精熟度顯示是誠實的四態契約**（見上方摘要第 2 點）：`legacy-recorded`（production 現況唯一會顯示數字的狀態——主要文字「目前記錄精熟度 {value}%」、次要文字「規則版本 {rulesVersion}；跨版本比較尚待資料更新」，不得出現「最高」「目前內容版本」「已合併」字樣）、`not-attempted-current-version`（顯示「目前版本尚未測驗」＋ current content version identifier，只有後端明確提供 active content version 並證明該版本無有效嘗試時才能使用，現有 production adapter 不得產生）、`unavailable-until-backend-contract`（顯示「精熟度資料暫時無法確認」，不顯示 0%、不顯示「尚未測驗」，因為現況無法證明）、`versioned`（顯示跨版本最高＋目前版本最新，相同時合併，current 為 not-attempted 時顯示「目前版本尚未測驗」，只有後端提供 highest/current 正式契約時才能使用，現有 production adapter 不得產生）。0% 不得作為缺值的預設呈現。
- **Adapter 是純模組**：`deriveChapterDetailViewModel`／`deriveMasteryDisplay` 的輸入輸出都不含 function／callback。`error` 態只帶 `errorCode`／`retryable`／`retryTarget`（資料），實際 retry 呼叫在 `ChapterDetailPage` shell 組裝。
- **Fixture 邊界**：test-only fixtures 只能存在於 `*.test.ts(x)`、`*.test-fixtures.ts` 或明確標示 `*.harness.tsx` 的 dev/test-only 檔案；**production route（`chapter-detail-page.tsx` 本身）不得 import 任何 fixture**。2A/3A 尚未完成時，正式 route 只能使用既有真實 repository/hook 資料，或誠實呈現 `content-preparing`/`error`/`locked`，不得偽造假資料掩蓋。
- **UI surface 完成不代表 feature complete**——本 plan 每個 task 的 commit message 與最終 DoD 都不得宣稱「章節體驗功能完成」，只能宣稱「UI surface 完成」。
- **全部 3 個 task 完成、所有驗證全綠後，只啟動一位有效 reviewer、跑一次 code review**——不逐 task 分別啟動 reviewer，也不用三軸 reviewer。若該輪 review 有 findings，修復後只重跑 scoped 驗證命令，不再啟動第二次 review。
- **TDD 只用於有行為的產品程式碼**；純 CSS/視覺 token 變更不要求假的 RED-GREEN，改用「跑一次驗證指令確認」。
- **不使用完整 `pnpm acceptance`**；不要求 Phase 8 release proof；不宣稱真實裝置或 Phase 8 evidence——Task 3 的 Chromium 驗證是 scoped、dev-only harness 上的驗證，不是 hosted/真實裝置證據。
- **不使用 local Supabase port 54322，不執行 DB/Docker/hosted 指令**（含 Task 3 的瀏覽器驗證——harness 完全不連 Supabase，只吃 in-memory fixture）。
- **Implementation 必須在專屬 worktree 內進行**（見下方「Pre-Execution」一節）。本次 remediation（改寫這份 plan 文件本身）不建立 worktree，不建立分支，不 commit 產品程式碼。

---

## Pre-Execution：Worktree 建立時機（僅供未來 implementation 執行者使用；本輪 remediation 不執行）

Plan 經 owner／reviewer 核准、確定要開始 Task 1 之前，執行者依序：

1. **盤點目前狀態**（不預設，執行前先跑）：
   ```bash
   git status --short --untracked-files=all
   git branch --show-current
   git log -1 --oneline
   ```
   記錄目前分支（預期 `feature/v2-major-update`）、HEAD SHA、working tree 是否乾淨。若有非本 plan 相關的未提交變更，先與使用者確認是否要保留/暫存，不得覆蓋。
2. **建立專屬 worktree**：`phase4a/chapter-detail-ui`，base 為上一步記錄的 HEAD。使用 Claude Code 的 `EnterWorktree` 工具（`name: "phase4a/chapter-detail-ui"`）；若在非 Claude Code 環境，等效於：
   ```bash
   git worktree add .worktrees/phase4a-chapter-detail-ui -b phase4a/chapter-detail-ui
   ```
3. 全部 3 個 task 都在這個 worktree 內執行、commit。worktree 內同樣禁止 Local Supabase／DB／Docker／hosted 操作。
4. Task 3 的 Chromium 驗證使用 `pnpm dev`（純前端 Vite dev server，不連任何後端服務），符合此限制。

---

## 現有介面對照（供每個 task 直接引用，不必回頭翻原始碼）

```typescript
// src/features/learning/api/chapter-map.ts（既有，不修改）
export type ChapterAccessState =
  'content_unavailable' | 'locked' | 'available' | 'completed';
export type ChapterProgressStatus =
  'not_started' | 'learning' | 'developing' | 'mastered';
export type ChapterAccessBlocker = Readonly<{
  chapterId: string;
  chapterTitle: string;
  code: 'CONTENT_UNAVAILABLE' | 'PREREQUISITE_REVIEW' | 'PREREQUISITE_MASTERY';
  current: number | null;
  required: number | null;
}>;
export type StudentChapterMapEntry = Readonly<{
  accessState: ChapterAccessState;
  blockers: readonly ChapterAccessBlocker[];
  chapterId: string;
  description: string;
  mastery: number | null;
  progressStatus: ChapterProgressStatus;
  reviewCompleted: number;
  reviewTotal: number | null;
  sortOrder: number;
  stableCode: string;
  templateId: string | null;
  templateQuestionCount: number | null;
  title: string;
}>;

// src/features/learning/api/learning-repository.ts（既有，不修改）
export type LearningErrorCode =
  | 'CHAPTER_LOCKED' | 'HINT_CLOSED' | 'HINT_SEQUENCE' | 'HINT_UNAVAILABLE'
  | 'INVALID_RESPONSE' | 'REMEDIATION_NOTHING_OPEN' | 'REVIEW_CARD_NOT_FOUND'
  | 'UNAVAILABLE';
export class LearningError extends Error {
  readonly code: LearningErrorCode;
}
export type ReviewCardView = Readonly<{
  cardId: string; content: string; groupLabel: string;
  media: readonly Readonly<{ altText: string; assetPath: string }>[];
  requiresRecompletion: boolean; sortOrder: number; title: string; version: number;
}>;
export type ChapterReviewSection = Readonly<{
  sectionId: string; sortOrder: number; stableCode: string;
  subtopics: readonly Readonly<{
    cards: readonly ReviewCardView[]; sortOrder: number; stableCode: string;
    subtopicId: string; title: string;
  }>[];
  title: string;
}>;
export type ReviewCompletionRow = Readonly<{ cardVersion: number; reviewCardId: string }>;
export type LearningProgressRow = Readonly<{
  accuracy: number | null; chapterId: string; coverage: number | null;
  mastery: number | null; reviewCompleted: number; reviewTotal: number | null;
  rulesVersion: string; scope: 'chapter' | 'subtopic';
  status: 'not_started' | 'learning' | 'developing' | 'mastered';
  subtopicId: string | null;
}>;

// src/features/learning/lib/progress-status.ts（既有，不修改）
export type ChapterStatus = LearningProgressRow['status'];
export const statusLabels: Readonly<Record<ChapterStatus, string>>; // 學習中/進步中/已精熟/尚未開始

// src/features/learning/hooks/use-chapter-map.ts、use-learning.ts（既有，不修改）
useStudentChapterMap(suppliedClient?): UseQueryResult<StudentChapterMap, LearningError>;
useChapterReview(chapterId, repository?, accessConfirmed = true): UseQueryResult<readonly ChapterReviewSection[], LearningError>;
useLearningProgress(chapterId, repository?): UseQueryResult<readonly LearningProgressRow[], LearningError>;
useReviewProgressRows(repository?): UseQueryResult<readonly ReviewCompletionRow[], LearningError>;
useCompleteReviewCard(chapterId, repository?): UseMutationResult<void, LearningError, { requestId: string; reviewCardId: string }>;
```

**目前 `chapter-detail-page.tsx` 的既有行為**（Task 2 的 MODIFY 基準，完整全文已在規劃期讀過，此處只記錄本 plan 會動到的關鍵點）：

- `statusTone: Record<ChapterStatus, 'success'|'primary'|'neutral'>`、`percentText`、`reviewText`、`reviewPercent`、`subtopicRow`：純函式，**原樣保留**，`chapter-detail-page.tsx` 頂部不變。
- `isCardCompleted(card, completions)`：目前定義在 `chapter-detail-page.tsx` 並被匯出、被既有測試直接匯入測試。**本 plan 把它搬到 `chapter-detail-adapter.ts`**（同一份邏輯，adapter 內部建構 `ChapterDetailCardView.completed` 時也呼叫它，避免重複實作兩份判斷）。
- `MasteryRing`、`CardMedia`、`ReviewCardItem`、`torchStates`：**原樣保留**在 `chapter-detail-page.tsx`，只有 `ReviewCardItem` 的 `card` prop 型別從 `ReviewCardView` 緊縮為 `ChapterDetailCardView`（它本來就只讀 `cardId`/`title`/`groupLabel`/`content`/`media`，從未讀取 `version`/`requiresRecompletion`/`sortOrder`，型別緊縮不改變任何 JSX 或邏輯）。
- 目前 `ChapterDetailPage` 元件在 `!accessConfirmed || accessRevoked` 與 `review.isError && review.error.code === 'CHAPTER_LOCKED'` 兩種情況下都 `<Navigate replace to={lockedMapHref} />`；`accessRevoked` 是一個 `useState(false)`，由 `complete.mutate` 的 `onError` 在偵測到 `CHAPTER_LOCKED` 時設為 `true`。**本 plan 把這兩條路徑都改成頁內渲染 `locked` state，並移除 `accessRevoked` 這個 local state**（改用直接 `void chapterMap.refetch()` 讓伺服器真相自然流入 view-model，不需要一個額外的 boolean 旗標）。
- 「fails closed and retries only the map when access is unavailable」測試對應 `chapterMap.isError`；重試只呼叫 `chapterMap.refetch()`。
- 一般 `review.isError || progress.isError || completions.isError`（非 CHAPTER_LOCKED）目前一律顯示通用重試錯誤，重試呼叫 `review.refetch()` + `progress.refetch()`（**不含** `completions.refetch()`——這是既有行為，本 plan 原樣保留）。
- `!chapter`（章節不在地圖清單）目前顯示「找不到這個章節，或內容尚未發布。」+ 一個「回學習地圖」`Link`（無測試覆蓋，但本 plan 保留這個逃生出口，併入新的 `ErrorState` 元件內的 `CHAPTER_NOT_FOUND` 分支）。

---

### Task 1：typed view-model + 純函式 adapter + test-only fixtures + unit tests

**Files:**

- Create: `src/features/learning/pages/chapter-detail-view-model.ts`
- Create: `src/features/learning/pages/chapter-detail-page.test-fixtures.ts`
- Create: `src/features/learning/pages/chapter-detail-adapter.ts`
- Create: `src/features/learning/pages/chapter-detail-adapter.test.ts`

**Interfaces:**

- Consumes：既有 `StudentChapterMapEntry`／`ChapterAccessBlocker`／`ChapterReviewSection`／`LearningProgressRow`／`ReviewCompletionRow`／`LearningError`／`ChapterStatus`（全部既有，見上方對照表）。
- Produces：`ChapterDetailViewModel`、`ChapterDetailChapterView`、`MasteryDisplay`、`ChapterDetailRetryTarget`、`deriveChapterDetailViewModel()`、`deriveMasteryDisplay()`、`isCardCompleted()`，供 Task 2 全部引用。

```typescript
// src/features/learning/pages/chapter-detail-view-model.ts
import type { ChapterAccessBlocker } from '../api/chapter-map';
import type { LearningErrorCode } from '../api/learning-repository';
import type { ChapterStatus } from '../lib/progress-status';

export type ChapterDetailRetryTarget = 'chapter-map' | 'chapter-content';

export type MasteryVersionScore = Readonly<{
  masteryPercent: number;
  contentVersion: string;
}>;

// 四態誠實契約（2026-08-10 二次 remediation）：legacy-recorded＝現有
// production 資料的唯一數字，誠實標示為「目前記錄精熟度」＋規則版本，不稱
// 最高、不稱目前內容版本分數、不標記 merged；unavailable-until-backend-
// contract＝數值缺失、progress row 缺失、或版本語意無法確認，一律歸這一
// 態，不得推論成任何形式的「尚未測驗」；not-attempted-current-version 與
// versioned 都需要後端明確提供 active content version／highest+current
// 正式契約才能建構，現有 production adapter 不會產生這兩態，只有測試
// fixture 能覆蓋。
export type MasteryDisplay =
  | Readonly<{
      kind: 'legacy-recorded';
      masteryPercent: number;
      rulesVersion: string;
    }>
  | Readonly<{
      kind: 'not-attempted-current-version';
      currentContentVersion: string;
    }>
  | Readonly<{ kind: 'unavailable-until-backend-contract' }>
  | Readonly<{
      kind: 'versioned';
      highest: MasteryVersionScore;
      current:
        | MasteryVersionScore
        | Readonly<{ kind: 'not-attempted'; contentVersion: string }>;
      merged: boolean;
    }>;

export type ChapterDetailCardView = Readonly<{
  cardId: string;
  title: string;
  groupLabel: string;
  content: string;
  media: readonly Readonly<{ altText: string; assetPath: string }>[];
  completed: boolean;
}>;

export type ChapterDetailSubtopicView = Readonly<{
  subtopicId: string;
  title: string;
  reviewCompleted: number;
  reviewTotal: number | null;
  mastery: number | null;
  cards: readonly ChapterDetailCardView[];
}>;

export type ChapterDetailSectionView = Readonly<{
  sectionId: string;
  title: string;
  subtopics: readonly ChapterDetailSubtopicView[];
}>;

export type ChapterDetailChapterView = Readonly<{
  chapterId: string;
  title: string;
  sortOrder: number;
  templateId: string | null;
  status: ChapterStatus;
  reviewCompleted: number;
  reviewTotal: number | null;
  masteryDisplay: MasteryDisplay;
  sections: readonly ChapterDetailSectionView[];
}>;

export type ChapterDetailViewModel =
  | Readonly<{ state: 'loading' }>
  | Readonly<{
      state: 'locked';
      chapterTitle: string;
      unmetConditions: readonly ChapterAccessBlocker[];
    }>
  | Readonly<{ state: 'content-preparing'; chapterTitle: string }>
  | Readonly<{
      state: 'content-readiness-error';
      chapterTitle: string;
      reason: string;
    }>
  | Readonly<{
      state: 'error';
      retryable: boolean;
      errorCode: LearningErrorCode | 'CHAPTER_NOT_FOUND';
      retryTarget: ChapterDetailRetryTarget | null;
    }>
  | Readonly<{ state: 'in-progress'; chapter: ChapterDetailChapterView }>
  | Readonly<{ state: 'completed'; chapter: ChapterDetailChapterView }>;
```

```typescript
// src/features/learning/pages/chapter-detail-page.test-fixtures.ts
// Test-only fixtures。禁止被任何 production route 檔案 import。
import type { StudentChapterMapEntry } from '../api/chapter-map';
import type {
  ChapterReviewSection,
  LearningProgressRow,
  ReviewCompletionRow,
} from '../api/learning-repository';

export const chapterMapEntryFixture = (
  overrides: Partial<StudentChapterMapEntry> = {},
): StudentChapterMapEntry => ({
  accessState: 'available',
  blockers: [],
  chapterId: '21000000-0000-0000-0000-000000000003',
  description: '色彩體系與應用',
  mastery: 59.5,
  progressStatus: 'learning',
  reviewCompleted: 1,
  reviewTotal: 3,
  sortOrder: 3,
  stableCode: 'chapter-3',
  templateId: '26000000-0000-0000-0000-000000000003',
  templateQuestionCount: 10,
  title: '色彩體系與應用',
  ...overrides,
});

export const chapterReviewSectionsFixture = (
  overrides: Partial<ChapterReviewSection>[] = [],
): readonly ChapterReviewSection[] => {
  const base: ChapterReviewSection = {
    sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
    sortOrder: 1,
    stableCode: 'sheet-3-1',
    subtopics: [
      {
        cards: [
          {
            cardId: '25500000-0000-0000-0000-000000000001',
            content: '第一行\n\n第二行',
            groupLabel: '色彩的分類',
            media: [],
            requiresRecompletion: false,
            sortOrder: 1,
            title: '有彩色與無彩色',
            version: 1,
          },
        ],
        sortOrder: 1,
        stableCode: 'sheet-3-1-all',
        subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
        title: '3-1 色彩三要素與色名的表示',
      },
    ],
    title: '3-1 色彩三要素與色名的表示',
  };
  return overrides.length > 0
    ? overrides.map((partial) => ({ ...base, ...partial }))
    : [base];
};

export const learningProgressRowsFixture = (
  overrides: Partial<LearningProgressRow>[] = [],
): readonly LearningProgressRow[] => {
  const chapterRow: LearningProgressRow = {
    accuracy: 95.7,
    chapterId: '21000000-0000-0000-0000-000000000003',
    coverage: 62.2,
    mastery: 59.5,
    reviewCompleted: 1,
    reviewTotal: 3,
    rulesVersion: '2026-07-progress-1',
    scope: 'chapter',
    status: 'learning',
    subtopicId: null,
  };
  const subtopicRow: LearningProgressRow = {
    accuracy: 66.7,
    chapterId: '21000000-0000-0000-0000-000000000003',
    coverage: 23.1,
    mastery: 15.4,
    reviewCompleted: 1,
    reviewTotal: 3,
    rulesVersion: '2026-07-progress-1',
    scope: 'subtopic',
    status: 'learning',
    subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
  };
  const base = [chapterRow, subtopicRow];
  return overrides.length > 0
    ? overrides.map((partial, index) => ({ ...base[index % 2], ...partial }))
    : base;
};

export const reviewCompletionsFixture = (): readonly ReviewCompletionRow[] => [
  { cardVersion: 1, reviewCardId: '25500000-0000-0000-0000-000000000001' },
];
```

- [ ] **Step 1：寫入 `chapter-detail-view-model.ts` 與 `chapter-detail-page.test-fixtures.ts`**（純型別與測試資料，不需要 RED-GREEN）
- [ ] **Step 2：`pnpm typecheck`**，Expected 0 errors

- [ ] **Step 3：寫失敗測試 —— `chapter-detail-adapter.test.ts`（`deriveMasteryDisplay`、`isCardCompleted`、`deriveChapterDetailViewModel` 三組）**

```typescript
// src/features/learning/pages/chapter-detail-adapter.test.ts
import { describe, expect, it } from 'vitest';

import { LearningError } from '../api/learning-repository';
import {
  chapterMapEntryFixture,
  chapterReviewSectionsFixture,
  learningProgressRowsFixture,
  reviewCompletionsFixture,
} from './chapter-detail-page.test-fixtures';
import {
  deriveChapterDetailViewModel,
  deriveMasteryDisplay,
  isCardCompleted,
} from './chapter-detail-adapter';

describe('deriveMasteryDisplay', () => {
  it('legacy 且有效數值 → legacy-recorded，保留數值與 rulesVersion，不稱最高／目前內容版本／merged', () => {
    const result = deriveMasteryDisplay({
      masteryPercent: 59.5,
      rulesVersion: '2026-07-progress-1',
      source: 'legacy',
    });
    expect(result).toEqual({
      kind: 'legacy-recorded',
      masteryPercent: 59.5,
      rulesVersion: '2026-07-progress-1',
    });
  });

  it('legacy 且數值為 0 → 仍是 legacy-recorded（真實 0 分照實記錄，不轉成缺值）', () => {
    const result = deriveMasteryDisplay({
      masteryPercent: 0,
      rulesVersion: '2026-07-progress-1',
      source: 'legacy',
    });
    expect(result).toEqual({
      kind: 'legacy-recorded',
      masteryPercent: 0,
      rulesVersion: '2026-07-progress-1',
    });
  });

  it('legacy 且 masteryPercent=null → unavailable-until-backend-contract（不得推論成 not-attempted-current-version）', () => {
    const result = deriveMasteryDisplay({
      masteryPercent: null,
      rulesVersion: '2026-07-progress-1',
      source: 'legacy',
    });
    expect(result).toEqual({ kind: 'unavailable-until-backend-contract' });
  });

  it('legacy 且 rulesVersion=null（progress row 缺失或版本語意無法確認）→ unavailable-until-backend-contract', () => {
    const result = deriveMasteryDisplay({
      masteryPercent: 59.5,
      rulesVersion: null,
      source: 'legacy',
    });
    expect(result).toEqual({ kind: 'unavailable-until-backend-contract' });
  });

  it('explicit-no-attempt-this-version（未來後端明確證明目前版本無有效嘗試）→ not-attempted-current-version', () => {
    const result = deriveMasteryDisplay({
      currentContentVersion: '2026-09-progress-2',
      source: 'explicit-no-attempt-this-version',
    });
    expect(result).toEqual({
      kind: 'not-attempted-current-version',
      currentContentVersion: '2026-09-progress-2',
    });
  });

  it('versioned 且 highest／current 版本與數值皆不同 → merged=false，各自呈現', () => {
    const result = deriveMasteryDisplay({
      current: { contentVersion: 'v2', masteryPercent: 40 },
      highest: { contentVersion: 'v1', masteryPercent: 82 },
      source: 'versioned',
    });
    expect(result).toEqual({
      kind: 'versioned',
      current: { contentVersion: 'v2', masteryPercent: 40 },
      highest: { contentVersion: 'v1', masteryPercent: 82 },
      merged: false,
    });
  });

  it('versioned 且 highest／current 版本與數值皆相同 → merged=true', () => {
    const score = { contentVersion: 'v1', masteryPercent: 82 };
    const result = deriveMasteryDisplay({
      current: score,
      highest: score,
      source: 'versioned',
    });
    expect(result).toEqual({
      kind: 'versioned',
      current: score,
      highest: score,
      merged: true,
    });
  });

  it('versioned 且 current 為未測驗 → current 保留 not-attempted 標記，merged=false', () => {
    const result = deriveMasteryDisplay({
      current: { contentVersion: 'v2' },
      highest: { contentVersion: 'v1', masteryPercent: 82 },
      source: 'versioned',
    });
    expect(result).toEqual({
      kind: 'versioned',
      current: { contentVersion: 'v2', kind: 'not-attempted' },
      highest: { contentVersion: 'v1', masteryPercent: 82 },
      merged: false,
    });
  });
});

describe('isCardCompleted', () => {
  it('requiresRecompletion=true 且版本不符 → 未完成', () => {
    expect(
      isCardCompleted(
        { cardId: 'card-a', requiresRecompletion: true, version: 2 },
        [{ cardVersion: 1, reviewCardId: 'card-a' }],
      ),
    ).toBe(false);
  });

  it('requiresRecompletion=false → 任何版本的完成紀錄都算完成', () => {
    expect(
      isCardCompleted(
        { cardId: 'card-a', requiresRecompletion: false, version: 2 },
        [{ cardVersion: 1, reviewCardId: 'card-a' }],
      ),
    ).toBe(true);
  });
});

const baseInput = () => ({
  chapterMapEntry: chapterMapEntryFixture(),
  chapterMapIsError: false,
  chapterMapIsPending: false,
  completions: reviewCompletionsFixture(),
  completionsIsError: false,
  completionsIsPending: false,
  progressIsError: false,
  progressIsPending: false,
  progressRows: learningProgressRowsFixture(),
  reviewError: null,
  reviewIsPending: false,
  reviewSections: chapterReviewSectionsFixture(),
});

describe('deriveChapterDetailViewModel', () => {
  it('章節地圖載入中 → loading', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: undefined,
      chapterMapIsPending: true,
    });
    expect(result.state).toBe('loading');
  });

  it('chapterMap 讀取失敗 → error，retryTarget=chapter-map', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapIsError: true,
    });
    expect(result).toMatchObject({
      errorCode: 'UNAVAILABLE',
      retryTarget: 'chapter-map',
      retryable: true,
      state: 'error',
    });
  });

  it('章節不在地圖清單裡 → error，errorCode=CHAPTER_NOT_FOUND，不可重試', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: undefined,
    });
    expect(result).toMatchObject({
      errorCode: 'CHAPTER_NOT_FOUND',
      retryTarget: null,
      retryable: false,
      state: 'error',
    });
  });

  it('accessState=locked → locked，附上 server 提供的 unmetConditions', () => {
    const entry = chapterMapEntryFixture({
      accessState: 'locked',
      blockers: [
        {
          chapterId: '21000000-0000-0000-0000-000000000002',
          chapterTitle: '色彩表示',
          code: 'PREREQUISITE_MASTERY',
          current: 45,
          required: 80,
        },
      ],
    });
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: entry,
    });
    expect(result.state).toBe('locked');
    if (result.state === 'locked') {
      expect(result.unmetConditions).toHaveLength(1);
      expect(result.unmetConditions[0]?.code).toBe('PREREQUISITE_MASTERY');
    }
  });

  it('accessState=content_unavailable → content-preparing', () => {
    const entry = chapterMapEntryFixture({
      accessState: 'content_unavailable',
    });
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: entry,
    });
    expect(result.state).toBe('content-preparing');
  });

  it('review 查詢因過期快取回報 CHAPTER_LOCKED → 頁內渲染 locked，不是 error', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewError: new LearningError('CHAPTER_LOCKED'),
      reviewSections: undefined,
    });
    expect(result.state).toBe('locked');
  });

  it('已解鎖但小節底下完全沒有複習卡 → content-readiness-error（不是空狀態）', () => {
    const emptySections = chapterReviewSectionsFixture([
      {
        subtopics: [
          {
            cards: [],
            sortOrder: 1,
            stableCode: 's',
            subtopicId: 'sub-1',
            title: '3-1',
          },
        ],
      },
    ]);
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewSections: emptySections,
    });
    expect(result.state).toBe('content-readiness-error');
  });

  it('review query 因 UNAVAILABLE 失敗 → error，retryable=true，retryTarget=chapter-content', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewError: new LearningError('UNAVAILABLE'),
      reviewSections: undefined,
    });
    expect(result).toMatchObject({
      errorCode: 'UNAVAILABLE',
      retryTarget: 'chapter-content',
      retryable: true,
      state: 'error',
    });
  });

  it('review query 因格式錯誤（非清單內的不可重試代碼）失敗 → error，retryable=false，retryTarget=null', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewError: new LearningError('INVALID_RESPONSE'),
      reviewSections: undefined,
    });
    expect(result).toMatchObject({
      retryTarget: null,
      retryable: false,
      state: 'error',
    });
  });

  it('reviewError 沒有可辨識的 code（例如非 LearningError 的例外）→ 預設視為可重試（防止意外把未知錯誤鎖死）', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewError: Object.assign(new Error('boom'), {}) as never,
      reviewSections: undefined,
    });
    expect(result).toMatchObject({
      retryTarget: 'chapter-content',
      retryable: true,
      state: 'error',
    });
  });

  it('accessState=available 且有卡片 → in-progress，帶入 status／masteryDisplay／completed', () => {
    const result = deriveChapterDetailViewModel(baseInput());
    expect(result.state).toBe('in-progress');
    if (result.state !== 'in-progress') throw new Error('unreachable');
    expect(result.chapter.status).toBe('learning');
    expect(result.chapter.masteryDisplay).toEqual({
      kind: 'legacy-recorded',
      masteryPercent: 59.5,
      rulesVersion: '2026-07-progress-1',
    });
    expect(result.chapter.sections[0]?.subtopics[0]?.cards[0]?.completed).toBe(
      true,
    );
  });

  it('章節 progress row 缺失 → masteryDisplay 為 unavailable-until-backend-contract', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      progressRows: [],
    });
    if (result.state !== 'in-progress') throw new Error('unreachable');
    expect(result.chapter.masteryDisplay).toEqual({
      kind: 'unavailable-until-backend-contract',
    });
  });

  it('production 呼叫路徑（legacy 來源）在各種 mastery 數值下，masteryDisplay 永遠不是 versioned 或 not-attempted-current-version', () => {
    for (const masteryPercent of [null, 0, 59.5, 100]) {
      const result = deriveChapterDetailViewModel({
        ...baseInput(),
        progressRows: [
          {
            accuracy: null,
            chapterId: '21000000-0000-0000-0000-000000000003',
            coverage: null,
            mastery: masteryPercent,
            reviewCompleted: 1,
            reviewTotal: 3,
            rulesVersion: '2026-07-progress-1',
            scope: 'chapter',
            status: 'learning',
            subtopicId: null,
          },
        ],
      });
      if (result.state !== 'in-progress') throw new Error('unreachable');
      expect([
        'legacy-recorded',
        'unavailable-until-backend-contract',
      ]).toContain(result.chapter.masteryDisplay.kind);
    }
  });

  it('accessState=completed → completed', () => {
    const entry = chapterMapEntryFixture({ accessState: 'completed' });
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: entry,
    });
    expect(result.state).toBe('completed');
  });
});
```

- [ ] **Step 4：執行確認失敗** — `npx vitest run src/features/learning/pages/chapter-detail-adapter.test.ts`，Expected FAIL（`chapter-detail-adapter.ts` 尚未存在）

- [ ] **Step 5：實作 `chapter-detail-adapter.ts`**

```typescript
// src/features/learning/pages/chapter-detail-adapter.ts
import type { StudentChapterMapEntry } from '../api/chapter-map';
import type {
  ChapterReviewSection,
  LearningError,
  LearningProgressRow,
  ReviewCompletionRow,
} from '../api/learning-repository';
import type {
  ChapterDetailChapterView,
  ChapterDetailRetryTarget,
  ChapterDetailViewModel,
  MasteryDisplay,
  MasteryVersionScore,
} from './chapter-detail-view-model';

export function deriveMasteryDisplay(
  input:
    | Readonly<{
        source: 'legacy';
        masteryPercent: number | null;
        rulesVersion: string | null;
      }>
    | Readonly<{
        source: 'explicit-no-attempt-this-version';
        currentContentVersion: string;
      }>
    | Readonly<{
        source: 'versioned';
        highest: MasteryVersionScore;
        current: MasteryVersionScore | Readonly<{ contentVersion: string }>;
      }>,
): MasteryDisplay {
  if (input.source === 'legacy') {
    if (input.masteryPercent === null || input.rulesVersion === null) {
      return { kind: 'unavailable-until-backend-contract' };
    }
    return {
      kind: 'legacy-recorded',
      masteryPercent: input.masteryPercent,
      rulesVersion: input.rulesVersion,
    };
  }
  if (input.source === 'explicit-no-attempt-this-version') {
    return {
      kind: 'not-attempted-current-version',
      currentContentVersion: input.currentContentVersion,
    };
  }
  const { current, highest } = input;
  if (!('masteryPercent' in current)) {
    return {
      current: {
        contentVersion: current.contentVersion,
        kind: 'not-attempted',
      },
      highest,
      kind: 'versioned',
      merged: false,
    };
  }
  const merged =
    highest.contentVersion === current.contentVersion &&
    highest.masteryPercent === current.masteryPercent;
  return { current, highest, kind: 'versioned', merged };
}

export const isCardCompleted = (
  card: Readonly<{
    cardId: string;
    requiresRecompletion: boolean;
    version: number;
  }>,
  completions: readonly ReviewCompletionRow[],
): boolean =>
  completions.some(
    (row) =>
      row.reviewCardId === card.cardId &&
      (row.cardVersion === card.version || !card.requiresRecompletion),
  );

const NON_RETRYABLE_ERROR_CODES = new Set<string>(['INVALID_RESPONSE']);

export function deriveChapterDetailViewModel(
  input: Readonly<{
    chapterMapEntry: StudentChapterMapEntry | undefined;
    chapterMapIsPending: boolean;
    chapterMapIsError: boolean;
    reviewSections: readonly ChapterReviewSection[] | undefined;
    reviewIsPending: boolean;
    reviewError: LearningError | null;
    progressRows: readonly LearningProgressRow[] | undefined;
    progressIsPending: boolean;
    progressIsError: boolean;
    completions: readonly ReviewCompletionRow[] | undefined;
    completionsIsPending: boolean;
    completionsIsError: boolean;
  }>,
): ChapterDetailViewModel {
  if (input.chapterMapIsPending) return { state: 'loading' };
  if (input.chapterMapIsError) {
    return {
      errorCode: 'UNAVAILABLE',
      retryTarget: 'chapter-map',
      retryable: true,
      state: 'error',
    };
  }
  if (!input.chapterMapEntry) {
    return {
      errorCode: 'CHAPTER_NOT_FOUND',
      retryTarget: null,
      retryable: false,
      state: 'error',
    };
  }

  const entry = input.chapterMapEntry;
  if (entry.accessState === 'locked') {
    return {
      chapterTitle: entry.title,
      state: 'locked',
      unmetConditions: entry.blockers,
    };
  }
  if (entry.accessState === 'content_unavailable') {
    return { chapterTitle: entry.title, state: 'content-preparing' };
  }

  // 過期快取：map 仍回報 available，但 guarded review 讀取已經偵測到鎖定——
  // 頁內渲染 locked（沿用目前已知的 blockers，通常為空；頁面 shell 會觸發
  // 一次 chapterMap.refetch() 取得真正的 unmet conditions，見 Task 2）。
  if (input.reviewError?.code === 'CHAPTER_LOCKED') {
    return {
      chapterTitle: entry.title,
      state: 'locked',
      unmetConditions: entry.blockers,
    };
  }

  if (
    input.reviewIsPending ||
    input.progressIsPending ||
    input.completionsIsPending
  ) {
    return { state: 'loading' };
  }

  if (input.reviewError) {
    const retryable = !NON_RETRYABLE_ERROR_CODES.has(input.reviewError.code);
    const retryTarget: ChapterDetailRetryTarget | null = retryable
      ? 'chapter-content'
      : null;
    return {
      errorCode: input.reviewError.code,
      retryTarget,
      retryable,
      state: 'error',
    };
  }
  if (input.progressIsError || input.completionsIsError) {
    return {
      errorCode: 'UNAVAILABLE',
      retryTarget: 'chapter-content',
      retryable: true,
      state: 'error',
    };
  }

  const sections = input.reviewSections ?? [];
  const hasCards = sections.some((section) =>
    section.subtopics.some((subtopic) => subtopic.cards.length > 0),
  );
  if (!hasCards) {
    return {
      chapterTitle: entry.title,
      reason: '章節已發布但沒有可用的複習卡或題目，內容管線可能未完整匯入。',
      state: 'content-readiness-error',
    };
  }

  const progressRows = input.progressRows ?? [];
  const completions = input.completions ?? [];
  const chapterRow = progressRows.find((row) => row.scope === 'chapter');

  const chapter: ChapterDetailChapterView = {
    chapterId: entry.chapterId,
    masteryDisplay: deriveMasteryDisplay({
      masteryPercent: chapterRow?.mastery ?? null,
      rulesVersion: chapterRow?.rulesVersion ?? null,
      source: 'legacy',
    }),
    reviewCompleted: entry.reviewCompleted,
    reviewTotal: entry.reviewTotal,
    sections: sections.map((section) => ({
      sectionId: section.sectionId,
      subtopics: section.subtopics.map((subtopic) => {
        const row = progressRows.find(
          (candidate) =>
            candidate.scope === 'subtopic' &&
            candidate.subtopicId === subtopic.subtopicId,
        );
        return {
          cards: subtopic.cards.map((card) => ({
            cardId: card.cardId,
            completed: isCardCompleted(card, completions),
            content: card.content,
            groupLabel: card.groupLabel,
            media: card.media,
            title: card.title,
          })),
          mastery: row?.mastery ?? null,
          reviewCompleted: row?.reviewCompleted ?? 0,
          reviewTotal: row?.reviewTotal ?? null,
          subtopicId: subtopic.subtopicId,
          title: subtopic.title,
        };
      }),
      title: section.title,
    })),
    sortOrder: entry.sortOrder,
    status: chapterRow?.status ?? 'not_started',
    templateId: entry.templateId,
    title: entry.title,
  };

  return {
    chapter,
    state: entry.accessState === 'completed' ? 'completed' : 'in-progress',
  };
}
```

- [ ] **Step 6：執行確認通過** — `npx vitest run src/features/learning/pages/chapter-detail-adapter.test.ts`，Expected PASS，0 skip
- [ ] **Step 7：`pnpm typecheck && npx eslint src/features/learning/pages/chapter-detail-view-model.ts src/features/learning/pages/chapter-detail-page.test-fixtures.ts src/features/learning/pages/chapter-detail-adapter.ts src/features/learning/pages/chapter-detail-adapter.test.ts`**，Expected 0 errors
- [ ] **Step 8：`npx prettier --check src/features/learning/pages/chapter-detail-view-model.ts src/features/learning/pages/chapter-detail-page.test-fixtures.ts src/features/learning/pages/chapter-detail-adapter.ts src/features/learning/pages/chapter-detail-adapter.test.ts`**，Expected 通過
- [ ] **Step 9：`git diff --check`**，Expected 乾淨
- [ ] **Step 10：Commit（單一 commit，4 個檔案一起）**

```bash
git add src/features/learning/pages/chapter-detail-view-model.ts src/features/learning/pages/chapter-detail-page.test-fixtures.ts src/features/learning/pages/chapter-detail-adapter.ts src/features/learning/pages/chapter-detail-adapter.test.ts
git commit -m "feat(learning): add pure chapter-detail-page view-model adapter with TDD coverage"
```

---

### Task 2：頁面整合 —— 七態渲染 + mastery UI，完整保留 media/torch/mutation 行為

**Files:**

- Create: `src/features/learning/pages/chapter-detail-states.tsx`
- Create: `src/features/learning/pages/chapter-detail-states.test.tsx`
- Modify: `src/features/learning/pages/chapter-detail-page.tsx`
- Modify: `src/features/learning/pages/chapter-detail-page.test.tsx`

**Interfaces:**

- Consumes：Task 1 的 `ChapterDetailViewModel`／`MasteryDisplay`／`ChapterDetailRetryTarget`／`deriveChapterDetailViewModel`／`isCardCompleted`；既有 `ChapterAccessBlocker`。
- Produces：
  - `chapter-detail-states.tsx`：`LoadingState()`、`LockedState({chapterTitle, unmetConditions})`、`ContentPreparingState({chapterTitle})`、`ContentReadinessErrorState({chapterTitle, reason})`、`ErrorState({errorCode, retryable, onRetry})`、`MasteryDisplayView({display})`、`chapterMasteryRingValue(display): number | null`。
  - `chapter-detail-page.tsx`：新增具名匯出 `ChapterDetailPageView`（純 presentational，供 Task 3 的瀏覽器 harness 直接掛載，不經過任何 hook）；預設匯出 `ChapterDetailPage`（hook-wired shell，組裝 view-model 並把 retry/complete 呼叫傳給 `ChapterDetailPageView`）。

- [ ] **Step 1：寫失敗測試 —— `chapter-detail-states.tsx`**

```tsx
// src/features/learning/pages/chapter-detail-states.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  chapterMasteryRingValue,
  ContentPreparingState,
  ContentReadinessErrorState,
  ErrorState,
  LoadingState,
  LockedState,
  MasteryDisplayView,
} from './chapter-detail-states';

describe('LoadingState', () => {
  it('顯示 loading 狀態並具備 aria-live announcement', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('章節資料載入中');
  });
});

describe('LockedState', () => {
  it('用固定 code→copy 對照表顯示條件，不顯示 raw code', () => {
    render(
      <LockedState
        chapterTitle="色彩認知"
        unmetConditions={[
          {
            chapterId: 'c2',
            chapterTitle: '色彩表示',
            code: 'PREREQUISITE_MASTERY',
            current: 45,
            required: 80,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('heading', { name: /色彩認知/u }),
    ).toBeInTheDocument();
    expect(screen.getByText(/色彩表示/u)).toBeInTheDocument();
    expect(screen.getByText(/80/u)).toBeInTheDocument();
    expect(screen.queryByText('PREREQUISITE_MASTERY')).toBeNull();
  });

  it('unmetConditions 為空陣列時仍顯示可理解的頁面（過期快取重新確認中）', () => {
    render(<LockedState chapterTitle="色彩認知" unmetConditions={[]} />);
    expect(
      screen.getByRole('heading', { name: /色彩認知/u }),
    ).toBeInTheDocument();
  });

  it('accessible name 與 ContentPreparingState 不同', () => {
    render(<LockedState chapterTitle="色彩認知" unmetConditions={[]} />);
    expect(screen.getByRole('region')).toHaveAccessibleName(
      expect.stringContaining('鎖定'),
    );
  });
});

describe('ContentPreparingState', () => {
  it('accessible name 與 LockedState 不同', () => {
    render(<ContentPreparingState chapterTitle="色彩心理" />);
    const region = screen.getByRole('region');
    expect(region).toHaveAccessibleName(expect.stringContaining('準備中'));
    expect(region).not.toHaveAccessibleName(expect.stringContaining('鎖定'));
  });
});

describe('ContentReadinessErrorState', () => {
  it('顯示錯誤原因且不提供重試按鈕', () => {
    render(
      <ContentReadinessErrorState
        chapterTitle="色彩表示"
        reason="章節已發布但沒有可用的複習卡"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('沒有可用的複習卡');
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });
});

describe('ErrorState', () => {
  it('retryable=true 時顯示重試按鈕並觸發 onRetry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState errorCode="UNAVAILABLE" onRetry={onRetry} retryable />);
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('errorCode=CHAPTER_NOT_FOUND 時顯示找不到章節文案與回學習地圖連結，不顯示重試按鈕', () => {
    render(
      <MemoryRouter>
        <ErrorState
          errorCode="CHAPTER_NOT_FOUND"
          onRetry={undefined}
          retryable={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('找不到這個章節');
    expect(screen.getByRole('link', { name: '回學習地圖' })).toHaveAttribute(
      'href',
      '/app',
    );
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });

  it('retryable=false 且非 CHAPTER_NOT_FOUND 時不顯示重試按鈕', () => {
    render(
      <MemoryRouter>
        <ErrorState
          errorCode="INVALID_RESPONSE"
          onRetry={undefined}
          retryable={false}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });
});

describe('MasteryDisplayView', () => {
  it('kind=legacy-recorded 顯示「目前記錄精熟度」與規則版本，不出現最高／目前內容版本／已合併字樣', () => {
    render(
      <MasteryDisplayView
        display={{
          kind: 'legacy-recorded',
          masteryPercent: 59.5,
          rulesVersion: '2026-07-progress-1',
        }}
      />,
    );
    expect(screen.getByText(/目前記錄精熟度 59.5%/u)).toBeInTheDocument();
    expect(
      screen.getByText(/規則版本 2026-07-progress-1/u),
    ).toBeInTheDocument();
    expect(screen.getByText(/跨版本比較尚待資料更新/u)).toBeInTheDocument();
    expect(screen.queryByText(/最高/u)).toBeNull();
    expect(screen.queryByText(/目前內容版本/u)).toBeNull();
    expect(screen.queryByText(/已合併/u)).toBeNull();
  });

  it('kind=not-attempted-current-version 顯示目前版本尚未測驗與版本識別碼', () => {
    render(
      <MasteryDisplayView
        display={{
          currentContentVersion: '2026-09-progress-2',
          kind: 'not-attempted-current-version',
        }}
      />,
    );
    expect(screen.getByText(/目前版本尚未測驗/u)).toBeInTheDocument();
    expect(screen.getByText(/2026-09-progress-2/u)).toBeInTheDocument();
  });

  it('kind=unavailable-until-backend-contract 顯示精熟度資料暫時無法確認，不顯示 0% 也不顯示「尚未測驗」', () => {
    render(
      <MasteryDisplayView
        display={{ kind: 'unavailable-until-backend-contract' }}
      />,
    );
    expect(screen.getByText('精熟度資料暫時無法確認')).toBeInTheDocument();
    expect(screen.queryByText(/%/u)).toBeNull();
    expect(screen.queryByText(/尚未測驗/u)).toBeNull();
  });

  it('kind=versioned 且 highest／current 版本與數值皆相同 → 只呈現一行合併數字', () => {
    const score = { contentVersion: 'v1', masteryPercent: 59.5 };
    render(
      <MasteryDisplayView
        display={{
          current: score,
          highest: score,
          kind: 'versioned',
          merged: true,
        }}
      />,
    );
    expect(screen.getAllByText(/59.5%/u)).toHaveLength(1);
  });

  it('kind=versioned 且版本不同 → 分別顯示跨版本最高與目前版本最新', () => {
    render(
      <MasteryDisplayView
        display={{
          current: { contentVersion: 'v2', masteryPercent: 40 },
          highest: { contentVersion: 'v1', masteryPercent: 82 },
          kind: 'versioned',
          merged: false,
        }}
      />,
    );
    expect(screen.getByText(/82%/u)).toBeInTheDocument();
    expect(screen.getByText(/40%/u)).toBeInTheDocument();
  });

  it('kind=versioned 且 current 為未測驗 → 顯示目前版本尚未測驗，不顯示 0%', () => {
    render(
      <MasteryDisplayView
        display={{
          current: { contentVersion: 'v2', kind: 'not-attempted' },
          highest: { contentVersion: 'v1', masteryPercent: 82 },
          kind: 'versioned',
          merged: false,
        }}
      />,
    );
    expect(screen.getByText('目前版本尚未測驗')).toBeInTheDocument();
    expect(screen.queryByText('0%')).toBeNull();
  });
});

describe('chapterMasteryRingValue', () => {
  it('legacy-recorded 回傳實際記錄數值（環形進度可以顯示已知的單一數字）', () => {
    expect(
      chapterMasteryRingValue({
        kind: 'legacy-recorded',
        masteryPercent: 59.5,
        rulesVersion: '2026-07-progress-1',
      }),
    ).toBe(59.5);
  });

  it('not-attempted-current-version／unavailable-until-backend-contract 回傳 null（不假裝有資料）', () => {
    expect(
      chapterMasteryRingValue({
        currentContentVersion: '2026-09-progress-2',
        kind: 'not-attempted-current-version',
      }),
    ).toBeNull();
    expect(
      chapterMasteryRingValue({ kind: 'unavailable-until-backend-contract' }),
    ).toBeNull();
  });

  it('versioned 回傳 highest 數值', () => {
    const score = { contentVersion: 'v1', masteryPercent: 82 };
    expect(
      chapterMasteryRingValue({
        current: score,
        highest: score,
        kind: 'versioned',
        merged: true,
      }),
    ).toBe(82);
  });
});
```

- [ ] **Step 2：執行確認失敗** — `npx vitest run src/features/learning/pages/chapter-detail-states.test.tsx`，Expected FAIL（檔案不存在）

- [ ] **Step 3：實作 `chapter-detail-states.tsx`**

```tsx
// src/features/learning/pages/chapter-detail-states.tsx
import { Link } from 'react-router-dom';

import type { ChapterAccessBlocker } from '../api/chapter-map';
import type { LearningErrorCode } from '../api/learning-repository';
import type { MasteryDisplay } from './chapter-detail-view-model';

// 固定 code→copy 對照表——不顯示 raw code，不由前端推導新的 unmet condition。
const blockerText = (blocker: ChapterAccessBlocker): string => {
  if (blocker.code === 'PREREQUISITE_MASTERY') {
    return `${blocker.chapterTitle}精熟度需達 ${String(blocker.required ?? 0)}%（目前 ${String(blocker.current ?? 0)}%）`;
  }
  if (blocker.code === 'PREREQUISITE_REVIEW') {
    return `${blocker.chapterTitle}的複習卡尚未全部完成`;
  }
  return `${blocker.chapterTitle}內容尚未開放`;
};

export function LoadingState() {
  return (
    <p aria-live="polite" role="status">
      章節資料載入中…
    </p>
  );
}

export function LockedState({
  chapterTitle,
  unmetConditions,
}: Readonly<{
  chapterTitle: string;
  unmetConditions: readonly ChapterAccessBlocker[];
}>) {
  return (
    <section
      aria-label={`${chapterTitle}：鎖定中`}
      className="chapter-dungeon scene-dungeon chapter-detail-state chapter-detail-state--locked"
      role="region"
    >
      <span aria-hidden="true" className="chapter-detail-state__icon">
        🔒
      </span>
      <h1>{chapterTitle}</h1>
      {unmetConditions.length > 0 ? (
        <>
          <p>這個章節目前鎖定，需要先完成：</p>
          <ul>
            {unmetConditions.map((blocker) => (
              <li key={`${blocker.chapterId}-${blocker.code}`}>
                {blockerText(blocker)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>這個章節目前鎖定，正在重新確認開放條件…</p>
      )}
    </section>
  );
}

export function ContentPreparingState({
  chapterTitle,
}: Readonly<{ chapterTitle: string }>) {
  return (
    <section
      aria-label={`${chapterTitle}：內容準備中`}
      className="chapter-dungeon scene-dungeon chapter-detail-state chapter-detail-state--preparing"
      role="region"
    >
      <span aria-hidden="true" className="chapter-detail-state__icon">
        🛠️
      </span>
      <h1>{chapterTitle}</h1>
      <p>這個章節的內容還在準備中，敬請期待。</p>
    </section>
  );
}

export function ContentReadinessErrorState({
  chapterTitle,
  reason,
}: Readonly<{ chapterTitle: string; reason: string }>) {
  return (
    <section
      aria-label={`${chapterTitle}：內容異常`}
      className="chapter-dungeon scene-dungeon chapter-detail-state chapter-detail-state--readiness-error"
    >
      <h1>{chapterTitle}</h1>
      <p aria-live="assertive" role="alert">
        {reason}
      </p>
    </section>
  );
}

export function ErrorState({
  errorCode,
  onRetry,
  retryable,
}: Readonly<{
  errorCode: LearningErrorCode | 'CHAPTER_NOT_FOUND';
  onRetry: (() => void) | undefined;
  retryable: boolean;
}>) {
  if (errorCode === 'CHAPTER_NOT_FOUND') {
    return (
      <section className="route-panel chapter-detail-state chapter-detail-state--error">
        <h1>章節複習</h1>
        <p role="alert">找不到這個章節，或內容尚未發布。</p>
        <Link className="primary-action" to="/app">
          回學習地圖
        </Link>
      </section>
    );
  }
  return (
    <section className="route-panel chapter-detail-state chapter-detail-state--error">
      <h1>章節複習</h1>
      <p role="alert">章節狀態暫時無法確認</p>
      {retryable && onRetry ? (
        <button className="primary-action" onClick={onRetry} type="button">
          重試
        </button>
      ) : null}
    </section>
  );
}

export function MasteryDisplayView({
  display,
}: Readonly<{ display: MasteryDisplay }>) {
  if (display.kind === 'legacy-recorded') {
    return (
      <span className="chapter-detail__mastery-value chapter-detail__mastery-value--legacy">
        <span className="chapter-detail__mastery-primary">
          目前記錄精熟度 {display.masteryPercent}%
        </span>
        <span className="chapter-detail__mastery-secondary">
          規則版本 {display.rulesVersion}；跨版本比較尚待資料更新
        </span>
      </span>
    );
  }
  if (display.kind === 'not-attempted-current-version') {
    return (
      <span className="chapter-detail__mastery-value">
        目前版本尚未測驗（{display.currentContentVersion}）
      </span>
    );
  }
  if (display.kind === 'unavailable-until-backend-contract') {
    return (
      <span className="chapter-detail__mastery-value chapter-detail__mastery-value--pending">
        精熟度資料暫時無法確認
      </span>
    );
  }
  const { current, highest, merged } = display;
  if (merged) {
    return (
      <span className="chapter-detail__mastery-value">
        {highest.masteryPercent}%（{highest.contentVersion}）
      </span>
    );
  }
  return (
    <span className="chapter-detail__mastery-value chapter-detail__mastery-value--dual">
      <span className="chapter-detail__mastery-primary">
        {highest.masteryPercent}%（{highest.contentVersion}）
      </span>
      <span className="chapter-detail__mastery-secondary">
        {'masteryPercent' in current
          ? `${current.masteryPercent}%（${current.contentVersion}）`
          : '目前版本尚未測驗'}
      </span>
    </span>
  );
}

export const chapterMasteryRingValue = (
  display: MasteryDisplay,
): number | null => {
  if (display.kind === 'legacy-recorded') return display.masteryPercent;
  if (display.kind === 'versioned') return display.highest.masteryPercent;
  return null;
};
```

- [ ] **Step 4：執行確認通過** — `npx vitest run src/features/learning/pages/chapter-detail-states.test.tsx`，Expected PASS，0 skip
- [ ] **Step 5：`pnpm typecheck && npx eslint src/features/learning/pages/chapter-detail-states.tsx src/features/learning/pages/chapter-detail-states.test.tsx`**，Expected 0 errors

- [ ] **Step 6：修改 `chapter-detail-page.test.tsx`（先改斷言，讓它們對著新行為紅燈）**

把「redirects a locked stale deep link before reading review cards」整段取代為：

```typescript
it('renders the locked state in place instead of navigating away, showing server unmet conditions', async () => {
  mockedChapterMap.mockReturnValue(
    mapResult({
      ...chapterMapEntry('locked'),
      blockers: [
        {
          chapterId: 'c2',
          chapterTitle: '色彩表示',
          code: 'PREREQUISITE_MASTERY',
          current: 45,
          required: 80,
        },
      ],
    }),
  );
  const repository = repositoryWith();
  renderPage(repository);

  expect(
    await screen.findByRole('heading', { name: '色彩體系與應用' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/色彩表示/u)).toBeInTheDocument();
  expect(screen.getByText(/80/u)).toBeInTheDocument();
  expect(repository.listChapterReview).not.toHaveBeenCalled();
});
```

把「redirects when the guarded review read detects a stale lock」整段取代為：

```typescript
it('renders the locked state and reconciles with the server when the guarded review read detects a stale lock', async () => {
  const refetch = vi.fn();
  mockedChapterMap.mockReturnValue({
    data: {
      chapters: [chapterMapEntry()],
      mode: 'sequential',
      rulesVersion: '2026-08-sequence-1',
    },
    error: null,
    isError: false,
    isPending: false,
    refetch,
  } as never);
  const repository = repositoryWith({
    listChapterReview: vi
      .fn()
      .mockRejectedValue(new LearningError('CHAPTER_LOCKED')),
  });
  renderPage(repository);

  await screen.findByRole('heading', { name: '色彩體系與應用' });
  expect(screen.queryByText('第一行')).toBeNull();
  await waitFor(() => {
    expect(refetch).toHaveBeenCalled();
  });
});
```

在「renders subtopic progress, cards, media, and completion states」測試裡，把精熟度相關斷言改為：

```typescript
expect(chapterProgress).toHaveTextContent('精熟程度');
expect(chapterProgress).toHaveTextContent('目前記錄精熟度 59.5%');
expect(chapterProgress).toHaveTextContent('規則版本 2026-07-progress-1');
expect(chapterProgress).toHaveTextContent('跨版本比較尚待資料更新');
const masteryRing = within(chapterProgress).getByRole('progressbar', {
  name: '精熟程度',
});
expect(masteryRing).toHaveAttribute('aria-valuenow', '59.5');
```

（原因：fixture 的 `chapterRow.mastery=59.5`、`rulesVersion='2026-07-progress-1'` 是合法的 legacy 單一數值，adapter 回傳 `legacy-recorded`，誠實標示為目前記錄精熟度＋規則版本；環形進度可以顯示這個已知數字，但文案不宣稱這是跨版本最高分或目前內容版本分數。）

刪除「derives completion with the recompletion rule」整個測試（`isCardCompleted` 的覆蓋率已搬到 Task 1 的 `chapter-detail-adapter.test.ts`），改為只保留純函式格式化的斷言：

```typescript
it('formats missing review/mastery values without fabricating a percentage', () => {
  expect(percentText(null)).toBe('—');
  expect(reviewText(0, null)).toBe('—');
});
```

同時移除 `isCardCompleted` 的 import（不再需要）；新增兩個小測試補齊 content-preparing／content-readiness-error 的頁面層級 wiring（Task 1 的 adapter 單元測試已覆蓋邏輯本身，這裡只驗證真的接上）：

```typescript
import { chapterReviewSectionsFixture } from './chapter-detail-page.test-fixtures';

it('renders the content-preparing state in place when content is not yet available', async () => {
  mockedChapterMap.mockReturnValue(
    mapResult(chapterMapEntry('content_unavailable')),
  );
  renderPage(repositoryWith());
  expect(
    await screen.findByText('這個章節的內容還在準備中，敬請期待。'),
  ).toBeInTheDocument();
});

it('renders the content-readiness-error state when the chapter has no cards despite being unlocked', async () => {
  const emptySections = chapterReviewSectionsFixture([
    {
      subtopics: [
        {
          cards: [],
          sortOrder: 1,
          stableCode: 's',
          subtopicId: 'sub-1',
          title: '3-1',
        },
      ],
    },
  ]);
  renderPage(
    repositoryWith({
      listChapterReview: vi.fn().mockResolvedValue(emptySections),
    }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '沒有可用的複習卡',
  );
});
```

其餘既有測試（「fails closed and retries only the map when access is unavailable」「completes a card through the trusted command」「shows a fallback when card media fails to load」「surfaces a retryable error state」「renders dungeon floor torches matching subtopic review progress」「單一 section 樓層數超過單頁容量時分頁…」）**斷言不變、原封不動保留**——`CardMedia`／`torchStates`／`ReviewCardItem`／`GamePager` 分頁行為在這個 task 內從頭到尾沒有被刪除過。

- [ ] **Step 7：執行確認失敗** — `npx vitest run src/features/learning/pages/chapter-detail-page.test.tsx`，Expected FAIL（目前實作仍是 `Navigate`／舊 mastery 文案）

- [ ] **Step 8：重寫 `chapter-detail-page.tsx`**

保留不動：頂部 import（移除 `Navigate`、`RouteLoading`，新增 `chapter-detail-adapter`／`chapter-detail-states`／`chapter-detail-view-model` 的 import）、`statusTone`、`percentText`、`reviewText`、`reviewPercent`、`MasteryRing`、`CardMedia`、`torchStates`、`ReviewCardItem`（只改 `card` prop 型別為 `ChapterDetailCardView`，`completed` 改讀 `card.completed`，其餘 JSX 不動）。

移除：`isCardCompleted`（搬到 Task 1 的 adapter，此檔改 import）、`subtopicRow`（adapter 已把 per-subtopic 的 row 併入 `ChapterDetailSubtopicView`，這個 helper 不再需要）。

新增 `ChapterDetailPageView`（純 presentational，供 Task 3 harness 直接掛載）：

```tsx
export function ChapterDetailPageView({
  completeError,
  completePending,
  onCompleteCard,
  onRetry,
  viewModel,
}: Readonly<{
  completeError: string | undefined;
  completePending: boolean;
  onCompleteCard: (
    input: Readonly<{ requestId: string; reviewCardId: string }>,
  ) => void;
  onRetry: (target: ChapterDetailRetryTarget) => void;
  viewModel: ChapterDetailViewModel;
}>) {
  const stageWide = useStageWide();

  if (viewModel.state === 'loading') return <LoadingState />;
  if (viewModel.state === 'locked') {
    return (
      <LockedState
        chapterTitle={viewModel.chapterTitle}
        unmetConditions={viewModel.unmetConditions}
      />
    );
  }
  if (viewModel.state === 'content-preparing') {
    return <ContentPreparingState chapterTitle={viewModel.chapterTitle} />;
  }
  if (viewModel.state === 'content-readiness-error') {
    return (
      <ContentReadinessErrorState
        chapterTitle={viewModel.chapterTitle}
        reason={viewModel.reason}
      />
    );
  }
  if (viewModel.state === 'error') {
    const target = viewModel.retryTarget;
    return (
      <ErrorState
        errorCode={viewModel.errorCode}
        onRetry={
          target
            ? () => {
                onRetry(target);
              }
            : undefined
        }
        retryable={viewModel.retryable}
      />
    );
  }

  const { chapter } = viewModel;
  const chapterTone = statusTone[chapter.status];

  return (
    <section
      aria-labelledby="chapter-detail-title"
      className="chapter-dungeon scene-dungeon"
    >
      <header>
        <p className="route-panel__eyebrow">章節複習</p>
        <div className="chapter-detail__title-row">
          <h1 className="chapter-detail__title" id="chapter-detail-title">
            Chapter {chapter.sortOrder}：{chapter.title}
          </h1>
          {chapter.templateId ? (
            <Link
              className="primary-action"
              to={`/app/quiz/new?template=${chapter.templateId}`}
            >
              開始挑戰
            </Link>
          ) : null}
        </div>
        <div aria-label="章節進度" className="chapter-detail__progress">
          <span
            className={`chapter-status-pill chapter-status-pill--${chapterTone}`}
          >
            <span
              aria-hidden="true"
              className={`chapter-status-dot chapter-status-dot--${chapterTone}`}
            />
            {statusLabels[chapter.status]}
          </span>
          <div className="chapter-detail__review-progress">
            <div className="chapter-detail__review-progress-row">
              <span className="chapter-detail__review-progress-label">
                複習完成
              </span>{' '}
              <span className="chapter-detail__review-progress-value">
                {reviewText(chapter.reviewCompleted, chapter.reviewTotal)}
              </span>
            </div>
            <ProgressBar
              label="複習完成"
              tone="primary"
              value={reviewPercent(
                chapter.reviewCompleted,
                chapter.reviewTotal,
              )}
            />
          </div>
          <div className="chapter-detail__mastery">
            <MasteryRing
              value={chapterMasteryRingValue(chapter.masteryDisplay)}
            />
            <span className="chapter-detail__mastery-text">
              <span className="chapter-detail__mastery-label">精熟程度</span>
              <MasteryDisplayView display={chapter.masteryDisplay} />
            </span>
          </div>
        </div>
      </header>

      {chapter.sections.map((section) => (
        <section aria-label={section.title} key={section.sectionId}>
          <GamePager
            ariaLabel={`${section.title} 樓層分頁`}
            items={section.subtopics}
            pageSize={stageWide ? 4 : 2}
          >
            {(pageSubtopics) => (
              <>
                {pageSubtopics.map((subtopic) => (
                  <section
                    aria-label={subtopic.title}
                    className="chapter-detail__subtopic"
                    key={subtopic.subtopicId}
                  >
                    <h2 className="chapter-detail__subtopic-title">
                      <span className="chapter-detail__subtopic-tag">小節</span>{' '}
                      {subtopic.title}
                    </h2>
                    {torchStates(subtopic.reviewCompleted, subtopic.reviewTotal)
                      .length > 0 ? (
                      <span aria-hidden="true" className="floor-torches">
                        {torchStates(
                          subtopic.reviewCompleted,
                          subtopic.reviewTotal,
                        ).map((lit, index) => (
                          <span
                            className={
                              lit
                                ? 'floor-torch floor-torch--lit'
                                : 'floor-torch'
                            }
                            key={index}
                          />
                        ))}
                      </span>
                    ) : null}
                    <div
                      aria-label="小節進度"
                      className="chapter-detail__subtopic-progress"
                    >
                      <span className="chapter-detail__subtopic-studied">
                        <span
                          aria-hidden="true"
                          className="chapter-detail__subtopic-dot"
                        />
                        已學習
                      </span>
                      <span
                        aria-hidden="true"
                        className="chapter-detail__subtopic-divider"
                      >
                        ・
                      </span>
                      <span className="chapter-detail__subtopic-review">
                        複習{' '}
                        {reviewText(
                          subtopic.reviewCompleted,
                          subtopic.reviewTotal,
                        )}
                        <ProgressBar
                          label="複習完成"
                          size="sm"
                          tone="primary"
                          value={reviewPercent(
                            subtopic.reviewCompleted,
                            subtopic.reviewTotal,
                          )}
                        />
                      </span>
                      <span
                        aria-hidden="true"
                        className="chapter-detail__subtopic-divider"
                      >
                        ・
                      </span>
                      <span>精熟 {percentText(subtopic.mastery)}</span>
                    </div>
                    {subtopic.cards.map((card, index) => (
                      <ReviewCardItem
                        card={card}
                        completed={card.completed}
                        index={index}
                        key={card.cardId}
                        onComplete={() => {
                          onCompleteCard({
                            requestId: crypto.randomUUID(),
                            reviewCardId: card.cardId,
                          });
                        }}
                        pending={completePending}
                      />
                    ))}
                  </section>
                ))}
              </>
            )}
          </GamePager>
        </section>
      ))}
      {completeError ? <p role="alert">{completeError}</p> : null}
    </section>
  );
}
```

`ChapterDetailPage`（shell，取代原本整個元件本體，`useParams`/`chapterId` 解析邏輯不變）：

```tsx
export function ChapterDetailPage({
  chapterId: suppliedChapterId,
  repository,
}: Readonly<{ chapterId?: string; repository?: LearningRepository }>) {
  const params = useParams();
  const chapterId = suppliedChapterId ?? params.chapterId ?? '';
  const chapterMap = useStudentChapterMap();
  const entry = chapterMap.data?.chapters.find(
    (row) => row.chapterId === chapterId,
  );
  const accessGranted =
    entry?.accessState === 'available' || entry?.accessState === 'completed';
  const review = useChapterReview(chapterId, repository, accessGranted);
  const progress = useLearningProgress(chapterId, repository);
  const completions = useReviewProgressRows(repository);
  const complete = useCompleteReviewCard(chapterId, repository);
  const [completeError, setCompleteError] = useState<string>();

  useEffect(() => {
    if (review.error?.code === 'CHAPTER_LOCKED') {
      void chapterMap.refetch();
    }
  }, [review.error, chapterMap]);

  const viewModel = deriveChapterDetailViewModel({
    chapterMapEntry: entry,
    chapterMapIsError: chapterMap.isError,
    chapterMapIsPending: chapterMap.isPending,
    completions: completions.data,
    completionsIsError: completions.isError,
    completionsIsPending: completions.isPending,
    progressIsError: progress.isError,
    progressIsPending: progress.isPending,
    progressRows: progress.data,
    reviewError: review.error ?? null,
    reviewIsPending: review.isPending,
    reviewSections: review.data,
  });

  const retryActions: Record<ChapterDetailRetryTarget, () => void> = {
    'chapter-content': () => {
      void review.refetch();
      void progress.refetch();
    },
    'chapter-map': () => {
      void chapterMap.refetch();
    },
  };

  return (
    <ChapterDetailPageView
      completeError={completeError}
      completePending={complete.isPending}
      onCompleteCard={(input) => {
        setCompleteError(undefined);
        complete.mutate(input, {
          onError: (error) => {
            if (error.code === 'CHAPTER_LOCKED') {
              void chapterMap.refetch();
              return;
            }
            setCompleteError(error.message);
          },
        });
      }}
      onRetry={(target) => {
        retryActions[target]();
      }}
      viewModel={viewModel}
    />
  );
}
```

- [ ] **Step 9：執行確認通過** — `npx vitest run src/features/learning/pages/chapter-detail-page.test.tsx`，Expected 全部 PASS，**0 skip**
- [ ] **Step 10：`pnpm typecheck && npx eslint src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/chapter-detail-page.test.tsx`**，Expected 0 errors
- [ ] **Step 11：`npx prettier --check src/features/learning/pages/chapter-detail-states.tsx src/features/learning/pages/chapter-detail-states.test.tsx src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/chapter-detail-page.test.tsx`**，Expected 通過
- [ ] **Step 12：`git diff --check`**，Expected 乾淨
- [ ] **Step 13：Commit（單一 commit，4 個檔案一起）**

```bash
git add src/features/learning/pages/chapter-detail-states.tsx src/features/learning/pages/chapter-detail-states.test.tsx src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/chapter-detail-page.test.tsx
git commit -m "refactor(learning): wire chapter-detail-page to typed view-model, render locked/preparing states in-page instead of navigating away"
```

---

### Task 3：既有 CSS 區塊改版 + RWD/a11y + scoped Chromium 驗證

**Files:**

- Modify: `src/styles/globals.css`
- Modify: `src/features/learning/pages/chapter-detail-states.tsx`（加入 focus management，純行為新增，不改既有渲染邏輯）
- Create: `src/features/learning/pages/chapter-detail-page.harness.tsx`
- Create: `dev-harness/chapter-detail.html`
- Create: `dev-harness/chapter-detail.main.tsx`
- Create: `playwright.chapter-detail-harness.config.ts`
- Create: `tests/e2e/chapter-detail-page.harness.spec.ts`

> **Inventory correction（implementation 後、2026-08-10 owner 核准，非原始需求）：** 上述清單原本未列
> `tsconfig.app.json`、`tsconfig.node.json`。實作時發現 `dev-harness/`（`chapter-detail.harness.tsx`／
> `chapter-detail.main.tsx`）與新的 `playwright.chapter-detail-harness.config.ts` 都不在任何既有
> tsconfig 的 `include` 範圍內，導致 `pnpm typecheck` 實際上完全沒有覆蓋這些新檔案——這個缺口在原始
> plan 撰寫時沒有被發現。Owner 事後核准把這兩個檔案的 `include` 各加一行（`tsconfig.app.json` 加
> `"dev-harness"`；`tsconfig.node.json` 加 `"playwright.chapter-detail-harness.config.ts"`）列為 Phase
> 4A 必要的 companion changes，理由：沒有這個修正，Task 3 自己要求的 `pnpm typecheck` 驗證步驟形同虛
> 設。這項裁定**不**代表其他 build／test／production 設定可以比照修改。

#### Part A：焦點管理（有行為，走 TDD）

- [ ] **Step 1：在 `chapter-detail-states.test.tsx` 附加失敗測試**

```typescript
it('LockedState 掛載時焦點移動到標題', () => {
  render(<LockedState chapterTitle="色彩認知" unmetConditions={[]} />);
  expect(screen.getByRole('heading', { name: /色彩認知/u })).toHaveFocus();
});

it('ContentPreparingState 掛載時焦點移動到標題', () => {
  render(<ContentPreparingState chapterTitle="色彩心理" />);
  expect(screen.getByRole('heading', { name: /色彩心理/u })).toHaveFocus();
});

it('ContentReadinessErrorState 掛載時焦點移動到標題', () => {
  render(<ContentReadinessErrorState chapterTitle="色彩表示" reason="測試原因" />);
  expect(screen.getByRole('heading', { name: /色彩表示/u })).toHaveFocus();
});
```

- [ ] **Step 2：執行確認失敗** — `npx vitest run src/features/learning/pages/chapter-detail-states.test.tsx -t "焦點"`，Expected FAIL

- [ ] **Step 3：實作**——在 `LockedState`／`ContentPreparingState`／`ContentReadinessErrorState` 三個元件的 `<h1>` 加上 `ref`＋`tabIndex={-1}`＋掛載時 `focus()`：

```tsx
import { useEffect, useRef } from 'react';
// 三個元件各自加入（以 LockedState 為例，其餘兩個同樣處理）：
const headingRef = useRef<HTMLHeadingElement>(null);
useEffect(() => {
  headingRef.current?.focus();
}, []);
// <h1 ref={headingRef} tabIndex={-1}>{chapterTitle}</h1>
```

- [ ] **Step 4：執行確認通過** — `npx vitest run src/features/learning/pages/chapter-detail-states.test.tsx`，Expected 全部 PASS，0 skip

#### Part B：CSS——就地擴充既有區塊，不在檔尾新增區塊

- [ ] **Step 5**：在 `src/styles/globals.css` 第 4491 行（`.chapter-dungeon .review-accordion { ... }` 規則結束後、`/* 空狀態與錯誤列直接坐夜底。 */` 之前）插入：

```css
/* Phase 4A：locked／content-preparing／content-readiness-error／error 頁內狀態卡。
   沿用本區塊既有夜窗配方（.chapter-dungeon > header 同款），只用已確認存在
   的 token，不新增未經確認的 --pixel-ink-*／--pixel-paper-* 或 --font-pixel。 */
.chapter-dungeon .chapter-detail-state {
  background: var(--pixel-night);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  padding: 20px 24px;
  color: var(--pixel-window-ink);
}

.chapter-detail-state__icon {
  display: block;
  margin-bottom: var(--space-2);
  font-size: 32px;
}

.chapter-detail-state--error > p[role='alert'] {
  color: var(--pixel-danger);
}
```

在第 4451 行（`.chapter-dungeon .chapter-detail__review-progress-value, .chapter-dungeon .chapter-detail__mastery-value { color: var(--pixel-window-ink); }` 規則之後）插入：

```css
.chapter-dungeon .chapter-detail__mastery-value--pending {
  color: var(--pixel-window-muted);
  font-size: 0.85em;
}
```

**不新增 reduced-motion 規則**：這批新增的狀態卡是純靜態卡片，沒有 transition／animation，既有的 `@media (prefers-reduced-motion: reduce)` 規則（globals.css:4535，只管 `.floor-torch--lit`）已經覆蓋本頁面唯一的動畫來源，無需重複宣告。

- [ ] **Step 6**：`npx prettier --check src/styles/globals.css`，Expected 通過
- [ ] **Step 7**：`npx vitest run src/features/learning/pages/chapter-detail-page.test.tsx src/features/learning/pages/chapter-detail-states.test.tsx`，Expected 全部 PASS（純 CSS 變更不改變任何斷言）

#### Part C：不依賴 Local Supabase 的 dev-only Chromium 驗證 harness

`ChapterDetailPageView`（Task 2 產出）本身是純 presentational component，只吃 `viewModel` + 幾個 no-op-able callback，因此可以完全繞過 `useStudentChapterMap`／Supabase，直接用 Task 1 的 fixtures 建構 `viewModel`。**production route（`chapter-detail-page.tsx`／`create-app-router.tsx`）永遠不 import 這個 harness 或任何 fixture**——harness 是獨立檔案，只有 `dev-harness/*` 這組專用進入點會載入它，而 `vite build`（`pnpm build`）預設只打包根目錄的 `index.html`，不會把 `dev-harness/` 收進正式 production bundle。

- [ ] **Step 8：建立 `src/features/learning/pages/chapter-detail-page.harness.tsx`**

```tsx
// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
// 用 Task 1 fixtures 直接建構 viewModel，掛載純 presentational 的
// ChapterDetailPageView，完全不觸碰 Supabase／任何 hook。
import type { StudentChapterMapEntry } from '../api/chapter-map';
import { LearningError } from '../api/learning-repository';
import { deriveChapterDetailViewModel } from './chapter-detail-adapter';
import { ChapterDetailPageView } from './chapter-detail-page';
import {
  chapterMapEntryFixture,
  chapterReviewSectionsFixture,
  learningProgressRowsFixture,
  reviewCompletionsFixture,
} from './chapter-detail-page.test-fixtures';

export type ChapterDetailHarnessScenario =
  | 'loading'
  | 'locked'
  | 'content-preparing'
  | 'content-readiness-error'
  | 'error'
  | 'in-progress'
  | 'completed'
  | 'long-title';

export const CHAPTER_DETAIL_HARNESS_SCENARIOS: readonly ChapterDetailHarnessScenario[] =
  [
    'loading',
    'locked',
    'content-preparing',
    'content-readiness-error',
    'error',
    'in-progress',
    'completed',
    'long-title',
  ];

const LONG_TITLE =
  '這是一個刻意寫得很長很長很長很長很長很長很長很長的小節標題用來測試換行行為';

function entryFor(
  scenario: ChapterDetailHarnessScenario,
): StudentChapterMapEntry {
  if (scenario === 'locked') {
    return chapterMapEntryFixture({
      accessState: 'locked',
      blockers: [
        {
          chapterId: 'c2',
          chapterTitle: '色彩表示',
          code: 'PREREQUISITE_MASTERY',
          current: 45,
          required: 80,
        },
      ],
    });
  }
  if (scenario === 'content-preparing')
    return chapterMapEntryFixture({ accessState: 'content_unavailable' });
  if (scenario === 'completed')
    return chapterMapEntryFixture({ accessState: 'completed' });
  return chapterMapEntryFixture({ accessState: 'available' });
}

export function ChapterDetailPageHarness({
  scenario,
}: Readonly<{ scenario: ChapterDetailHarnessScenario }>) {
  const sections =
    scenario === 'content-readiness-error'
      ? chapterReviewSectionsFixture([
          {
            subtopics: [
              {
                cards: [],
                sortOrder: 1,
                stableCode: 's',
                subtopicId: 'sub-1',
                title: '3-1 色彩三要素',
              },
            ],
          },
        ])
      : scenario === 'long-title'
        ? chapterReviewSectionsFixture([
            {
              subtopics: [
                {
                  cards: [],
                  sortOrder: 1,
                  stableCode: 's',
                  subtopicId: 'sub-1',
                  title: LONG_TITLE,
                },
              ],
            },
          ])
        : chapterReviewSectionsFixture();

  const viewModel = deriveChapterDetailViewModel({
    chapterMapEntry: scenario === 'loading' ? undefined : entryFor(scenario),
    chapterMapIsError: false,
    chapterMapIsPending: scenario === 'loading',
    completions: reviewCompletionsFixture(),
    completionsIsError: false,
    completionsIsPending: false,
    progressIsError: false,
    progressIsPending: false,
    progressRows: learningProgressRowsFixture(),
    reviewError: scenario === 'error' ? new LearningError('UNAVAILABLE') : null,
    reviewIsPending: false,
    reviewSections: sections,
  });

  return (
    <ChapterDetailPageView
      completeError={undefined}
      completePending={false}
      onCompleteCard={() => {}}
      onRetry={() => {}}
      viewModel={viewModel}
    />
  );
}
```

- [ ] **Step 9：建立 `dev-harness/chapter-detail.main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import {
  CHAPTER_DETAIL_HARNESS_SCENARIOS,
  ChapterDetailPageHarness,
  type ChapterDetailHarnessScenario,
} from '../src/features/learning/pages/chapter-detail-page.harness';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';

const requested = new URLSearchParams(window.location.search).get('scenario');
const scenario: ChapterDetailHarnessScenario = (
  CHAPTER_DETAIL_HARNESS_SCENARIOS as readonly string[]
).includes(requested ?? '')
  ? (requested as ChapterDetailHarnessScenario)
  : 'in-progress';

const root = document.querySelector('#root');
if (!root) throw new Error('dev-harness: #root missing');
createRoot(root).render(
  <StrictMode>
    <MemoryRouter>
      <main id="main-content">
        <ChapterDetailPageHarness scenario={scenario} />
      </main>
    </MemoryRouter>
  </StrictMode>,
);
```

- [ ] **Step 10：建立 `dev-harness/chapter-detail.html`**

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chapter Detail Harness (dev/test only)</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/dev-harness/chapter-detail.main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 11：建立 `playwright.chapter-detail-harness.config.ts`**（獨立、scoped 設定，不改動共用的 `playwright.config.ts`；`webServer` 用 `pnpm dev`，純前端，不連任何後端）

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /chapter-detail-page\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173/dev-harness/chapter-detail.html?scenario=in-progress',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

- [ ] **Step 12：建立 `tests/e2e/chapter-detail-page.harness.spec.ts`**

```typescript
import { expect, test, type Page } from '@playwright/test';

const observeRuntimeErrors = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
};

const WIDTHS = [320, 375, 1024, 1440] as const;
const SCENARIOS = [
  'locked',
  'content-preparing',
  'content-readiness-error',
  'error',
  'in-progress',
  'completed',
  'long-title',
] as const;

for (const width of WIDTHS) {
  test(`chapter-detail-page states render without layout/console defects at ${String(width)}px`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ height: 900, width });

    for (const scenario of SCENARIOS) {
      await page.goto(`/dev-harness/chapter-detail.html?scenario=${scenario}`);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth, scenario).toBeLessThanOrEqual(
        overflow.clientWidth,
      );

      if (
        [
          'locked',
          'content-preparing',
          'content-readiness-error',
          'error',
        ].includes(scenario)
      ) {
        await expect(page.getByRole('heading').first()).toBeVisible();
      }
      if (scenario === 'locked' || scenario === 'content-preparing') {
        await expect(page.getByRole('heading').first()).toBeFocused();
      }
      if (scenario === 'in-progress' || scenario === 'completed') {
        const primaryAction = page.locator('.primary-action').first();
        await expect(primaryAction).toBeVisible();
      }
      if (scenario === 'long-title') {
        const heading = page.getByRole('heading', { level: 2 }).first();
        const box = await heading.boundingBox();
        expect(box?.width ?? 0).toBeLessThanOrEqual(width);
      }
    }

    expect(
      runtimeErrors.consoleErrors,
      `console errors at ${String(width)}px`,
    ).toEqual([]);
    expect(
      runtimeErrors.pageErrors,
      `page errors at ${String(width)}px`,
    ).toEqual([]);
  });
}

test('keyboard operation reaches the retry action in the error state', async ({
  page,
}) => {
  await page.goto('/dev-harness/chapter-detail.html?scenario=error');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '重試' })).toBeFocused();
});
```

- [ ] **Step 13：執行一次 scoped Chromium 驗證**

```bash
npx playwright test --config=playwright.chapter-detail-harness.config.ts
```

Expected：全部 PASS（4 個寬度測試 + 1 個鍵盤測試），console/page error 均為空陣列。**這是 dev-only harness 上的 scoped 驗證，不是真實裝置或 Phase 8 release evidence。**

- [ ] **Step 14：`pnpm typecheck && npx eslint src/features/learning/pages/chapter-detail-page.harness.tsx dev-harness/chapter-detail.main.tsx tests/e2e/chapter-detail-page.harness.spec.ts playwright.chapter-detail-harness.config.ts`**，Expected 0 errors
- [ ] **Step 15：`npx prettier --check src/features/learning/pages/chapter-detail-states.tsx src/features/learning/pages/chapter-detail-page.harness.tsx dev-harness/chapter-detail.main.tsx tests/e2e/chapter-detail-page.harness.spec.ts playwright.chapter-detail-harness.config.ts src/styles/globals.css`**，Expected 通過
- [ ] **Step 16：`git diff --check`**，Expected 乾淨
- [ ] **Step 17：Commit**

```bash
git add src/styles/globals.css src/features/learning/pages/chapter-detail-states.tsx src/features/learning/pages/chapter-detail-page.harness.tsx dev-harness/chapter-detail.html dev-harness/chapter-detail.main.tsx playwright.chapter-detail-harness.config.ts tests/e2e/chapter-detail-page.harness.spec.ts
git commit -m "style(learning): apply Codédex-style dark flat state cards, add focus management and a dev-only Chromium verification harness"
```

---

## Review（全部 3 個 task 完成後執行一次）

三個 implementation task 全部完成、以下驗證全綠後，啟動**一位** reviewer、跑**一次** code review（不逐 task 分別啟動）：

```bash
pnpm typecheck
npx eslint src/features/learning/pages/chapter-detail-view-model.ts src/features/learning/pages/chapter-detail-page.test-fixtures.ts src/features/learning/pages/chapter-detail-adapter.ts src/features/learning/pages/chapter-detail-adapter.test.ts src/features/learning/pages/chapter-detail-states.tsx src/features/learning/pages/chapter-detail-states.test.tsx src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/chapter-detail-page.test.tsx src/features/learning/pages/chapter-detail-page.harness.tsx dev-harness/chapter-detail.main.tsx tests/e2e/chapter-detail-page.harness.spec.ts playwright.chapter-detail-harness.config.ts
npx vitest run src/features/learning/pages/chapter-detail-adapter.test.ts src/features/learning/pages/chapter-detail-states.test.tsx src/features/learning/pages/chapter-detail-page.test.tsx
npx prettier --check src/features/learning/pages/chapter-detail-view-model.ts src/features/learning/pages/chapter-detail-page.test-fixtures.ts src/features/learning/pages/chapter-detail-adapter.ts src/features/learning/pages/chapter-detail-adapter.test.ts src/features/learning/pages/chapter-detail-states.tsx src/features/learning/pages/chapter-detail-states.test.tsx src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/chapter-detail-page.test.tsx src/features/learning/pages/chapter-detail-page.harness.tsx dev-harness/chapter-detail.main.tsx tests/e2e/chapter-detail-page.harness.spec.ts playwright.chapter-detail-harness.config.ts src/styles/globals.css
git diff --check
npx playwright test --config=playwright.chapter-detail-harness.config.ts
```

若該輪 review 有 findings：修復後只重跑上面這批 scoped 驗證命令，**不再啟動第二次 review**。不執行 `pnpm acceptance`。

---

## Task-Level DoD 對照（AC Mapping，沿用 spec 第 9 節）

| Task | 對應 AC                                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | AC-UI-006（readiness-error 分類）、AC-TBD（見 spec：content-readiness-error 分類細節）                                       |
| 2    | AC-LEARN-001（既有，維持不迴歸）、AC-UI-006、AC-UI-015（狀態可辨識）                                                         |
| 3    | AC-UI-008（扁平化設計）、AC-UI-003（320px 無水平 overflow）、AC-UI-007（無 console/network 異常）、AC-UI-015（focus 可辨識） |

## Slice Gate

全部 3 個 task 完成、Review 一節的驗證命令全綠、`git diff --check` 乾淨，即為本 plan 的 Slice Gate 通過。**不代表 Phase 4 完成，也不代表章節體驗功能完整可用**——真實資料整合仍依賴 Phase 2A／3A（未授權實作）。

## Future Integration Dependency（不是本 plan 的任務，記錄供後續銜接）

- **2A**：`ReviewCardView`／`ChapterReviewSection` 目前的資料來源（`listChapterReview`）需要接上 2A 完成後的真實匯入內容，本 plan 的 adapter 介面不需要改變，只是輸入資料從 fixture／既有測試資料換成真實資料。
- **3A**：`StudentChapterMapEntry.accessState`／`blockers` 已經是真實 RPC（`get_student_chapter_map`）契約，3A 的工作是驗證這個 RPC 背後的判定邏輯正確性與 hosted 驗收，不改變本 plan 消費的型別介面。
- **精熟度雙版本／目前版本語意**：`deriveMasteryDisplay` 的 `versioned`／`explicit-no-attempt-this-version` 輸入分支已經設計好完整型別契約與渲染邏輯（`MasteryDisplayView` 全部覆蓋），但目前 production 資料只有單一 `mastery`+`rulesVersion`，adapter 因此只會在 `legacy`（有效數值→`legacy-recorded`）與資料不足（`unavailable-until-backend-contract`）之間輸出，永遠不會產生 `versioned` 或 `not-attempted-current-version`。等後端提供 (a) 明確的 active content version、且能證明該版本無有效嘗試時，呼叫端可改用 `source: 'explicit-no-attempt-this-version'`；(b)「跨版本最高分」與「目前版本最新分」兩個獨立欄位時，呼叫端可改用 `source: 'versioned'` 並傳入兩組真實數字。`MasteryDisplay`／`MasteryDisplayView`／測試矩陣都不需要改介面。這個後端契約擴充不在本 plan 或 3A 的既定範圍內，需要另外提出。

## 明確排除

- `/app`（學習大廳）、`/app/missions`（小節任務選擇）——不同路由，不在本 plan 範圍。
- 教師端任何頁面、Live 任何頁面。
- `supabase/` 任何 migration、RPC、RLS policy。
- `scripts/content/*` 內容匯入 pipeline。
- 2A／3A／5V／5F 的 implementation plan 或程式碼。
- `playwright.config.ts`（共用設定檔）——Task 3 的 Chromium 驗證用獨立的 `playwright.chapter-detail-harness.config.ts`，不修改共用設定。
