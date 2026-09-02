# JRPG Six-Chapter Learning Map Design

> **Superseded in part on 2026-09-02:** the cross-chapter sequential access and
> chapter-completion gating in this historical design are replaced by
> `2026-09-02-section-progression-design.md`. The JRPG map, full chapter
> overview, content-readiness state, and data-driven chapter identity remain.

**Date:** 2026-08-03

**Status:** Owner-approved design

**Scope:** Student learning lobby, sequential chapter access, Assignment write retirement, content activation gate

## 1. Goal

Replace the student learning lobby's paged chapter cards with an original, high-detail 16-bit JRPG forest-kingdom village. Six progressively larger buildings represent Chapters 1–6. Selecting a building shows the same chapter information on desktop and mobile; an available chapter then enters its existing review-and-progress page, where the existing `開始挑戰` action remains beside the chapter title.

Add server-authoritative sequential progression: after activation, a student must complete Chapter N before Chapter N+1 becomes available. An unlock is permanent once granted. Teacher-hosted Live remains exempt.

This initiative also completes the already-started Assignment retirement by preventing new Assignment writes while retaining historical database structures.

## 2. Authoritative chapter content

Chapter title and description text comes from the published chapter records populated by the Google Sheets content pipeline. No title or description is baked into map artwork or hard-coded in the map component.

The current owner-provided titles are:

1. Chapter 1：認識色彩
2. Chapter 2：色彩呈現
3. Chapter 3：色彩表示
4. Chapter 4：色彩感知
5. Chapter 5：色彩認知
6. Chapter 6：色彩應用

These strings may receive small content edits before final activation. Chapter identity and building mapping use stable chapter code and `sort_order`, not title text.

## 3. Scope decomposition

The work is split into three independently reviewable subprojects:

1. **Assignment retirement safety audit** — verify removed UI/routes, revoke new Assignment mutation access, preserve historical tables and read compatibility.
2. **Learning map and access service** — ship the detailed map, persistent unlock model, map RPC, and guarded self-study entry points while progression remains in `open` mode.
3. **Content activation** — import and validate all six chapters, reset only fixture test-account learning data, run the full progression gate, then explicitly change the course to `sequential` mode.

Physical deletion of Assignment tables/RPC history is a separate future migration and is not part of this design.

## 4. Visual direction

### 4.1 World and composition

- Original high-detail 16-bit JRPG pixel art; the supplied screenshot is composition inspiration only and is not copied or cropped.
- Forest-kingdom village with layered trees, stone roads, river, bridge, fountain, foliage, props, shadows, and lit windows.
- Desktop uses a complete 3×2 responsive village path.
- Buildings grow in visual scale and prestige by chapter order rather than being tied to mutable chapter titles:
  1. village school;
  2. artisan workshop;
  3. library tower;
  4. observatory;
  5. forest academy;
  6. royal castle/master hall.
- A fixed full-body JRPG adventurer decorates the road with a subtle idle animation.
- The student's equipped Blook appears as a personal location badge near the default selected chapter. The badge has no `目前位置` text.

### 4.2 Modular assets

The shipped scene is not one flattened image. It comprises:

- reusable forest-village background layers;
- six transparent building sprites with distinct silhouettes and increasing detail;
- cloud/fog, lock, completion emblem, current-selection, and construction overlays;
- a fixed adventurer sprite;
- the existing equipped-Blook rendering for the personal badge.

All labels and state text remain semantic HTML. Pure decoration is `aria-hidden`. CSS geometric placeholder art is allowed only in design mockups and tests; it is not an acceptable production deliverable.

Initial compressed map assets must total no more than approximately 1.2 MiB. Assets use explicit dimensions, optimized PNG or lossless WebP as appropriate, cached static URLs, and crisp nearest-neighbour pixel rendering. The asset task must visually inspect transparent edges and all supported viewports after optimization.

### 4.3 Building states

Access state and learning-progress state are separate concepts.

| Access state          | Map treatment                                                                |
| --------------------- | ---------------------------------------------------------------------------- |
| `content_unavailable` | Construction fencing plus `內容準備中`; no chapter entry                     |
| `locked`              | Grey-white pixel cloud partly covers roof/entrance, plus lock icon and text  |
| `available`           | Fully visible building; selected building receives a non-colour-only outline |
| `completed`           | Fully visible building plus completion emblem and `已完成` text              |

The locked cloud uses a subtle two-frame drift. It becomes static under reduced-motion. It never obscures the chapter sign. Unlocking removes the cloud without a persisted one-time dispersal animation.

Progress text continues to use the canonical `not_started`, `learning`, `developing`, and `mastered` concepts. Completion is shown separately because mastery alone is insufficient.

## 5. Interaction design

Desktop and mobile use the same two-step operation:

1. Select a building with pointer, touch, or keyboard.
2. Read the shared chapter-information panel and use its single primary action.

For available/completed chapters, the action is `進入複習與進度` and navigates to `/app/chapters/:chapterId`. For locked chapters, the panel replaces the action with the prerequisite breakdown and does not expose a chapter link. For unavailable chapters, it explains that content is being prepared.

The information panel contains identical semantic information at every viewport:

- chapter number and data-driven title;
- data-driven description;
- current progress status;
- review completed/total;
- mastery and the 80% threshold;
- access/completion state;
- either the entry action or explicit blockers.

The default selection is the first permanently unlocked chapter that is not complete. If all six are complete, Chapter 6 is selected. Selection changes never write product data.

The existing chapter-detail title row and its `開始挑戰` link remain. The challenge is available whenever that chapter is accessible and contains a playable template; review completion is not a prerequisite for starting the challenge.

## 6. Responsive behavior

- **Desktop:** complete 3×2 village with the common information panel along the lower map edge.
- **Portrait mobile (375×812 target):** complete village overview above the same information panel. Buildings may use a compact sprite presentation, but semantic information is not removed.
- **Short landscape/tablet (812×375 target):** map on the left and information panel on the right. The main content container may scroll normally; fixed overflow rules must not crop controls or focus rings.
- All building controls, signs, primary actions, and locked-state controls have at least a 44×44 CSS-pixel hit target.
- No horizontal viewport overflow is permitted.

The existing top HUD navigation remains above the map in DOM and visual order.

## 7. Accessibility

- Represent the six chapters as an ordered semantic list.
- Each building selector is a real button with an accessible name containing chapter number, title, and access state.
- The common information panel updates with polite live-region behavior without moving focus unexpectedly.
- Locked prerequisites are keyboard-readable and are not expressed only through colour, cloud, or icon.
- Decorative map layers, clouds, vegetation, water, and the fixed adventurer do not enter the accessibility tree.
- Focus rings remain visible and are not clipped by the map, HUD, or landscape overflow rules.
- Reduced-motion disables cloud drift and adventurer idle animation.
- If artwork fails to load, semantic labels, states, blockers, and actions remain usable through a text/fallback-building presentation.

## 8. Server-authoritative progression

### 8.1 Course setting

Store an explicit course-level progression mode:

- `open` — every content-available chapter retains current access behavior;
- `sequential` — Chapter 1 starts available and later chapters require a stored unlock.

The setting defaults to `open`. Content import never changes it automatically. Only the explicit activation operation may change it to `sequential`, and that operation must fail atomically if the content gate is not satisfied.

### 8.2 Permanent unlocks

Add a persistent unlock record keyed uniquely by student and chapter. It records at least:

- student ID;
- unlocked chapter ID;
- source/prerequisite chapter ID where applicable;
- unlock timestamp;
- progression-rules version.

In `sequential` mode, Chapter 1 is available when its content is available. Chapter N+1 is granted permanently the first time the server confirms Chapter N completion. Small future content edits may change displayed progress but never delete a stored unlock.

Chapter completion is the existing canonical calculation with the retired Assignment condition removed:

```text
review completion = 100%
and mastery >= 80%
```

The client never grants an unlock. A central server-side grant function is called inside the terminal transaction of every qualifying review/practice/remediation completion path. A unique constraint plus idempotent insert handles retries and concurrent tabs.

### 8.3 Student chapter-map RPC

Provide one server-authoritative chapter-map projection that returns all six chapter records with:

- stable identity, order, title, description, and playable-content availability;
- current progress metrics and progress status;
- permanent access state and completion state;
- structured lock blockers;
- current course progression mode and rules version.

The frontend does not derive access from `isPlayable`, visual position, or local progress arithmetic.

### 8.4 Enforcement matrix

| Surface/action                     | Sequential access required  |
| ---------------------------------- | --------------------------- |
| Learning map chapter entry         | Yes                         |
| Chapter review content read        | Yes                         |
| Complete review card               | Yes                         |
| Start ordinary chapter challenge   | Yes                         |
| Start after-school mastery mission | Yes                         |
| Remediation for accessible chapter | Yes                         |
| Teacher-hosted Live join/play      | No                          |
| Teacher administration/read        | No student progression gate |

Every guarded read or mutation uses the same database access function. Direct route entry and direct RPC calls cannot bypass it. A locked request returns a stable `CHAPTER_LOCKED` result with the same structured blockers used by the map panel.

Live remains on its independent server path and does not grant permanent self-study unlocks merely through participation, consistent with the existing rule that Live answers do not change formal mastery.

## 9. Assignment retirement

Current product code already routes removed teacher Assignment pages to the site-wide 404 and omits student/teacher Assignment navigation. The implementation task therefore performs a narrow audit rather than rebuilding that removal:

- inventory all Assignment create/publish/update mutation RPCs and callable paths;
- revoke authenticated mutation access or make those entry points return a stable retired-feature error;
- verify no UI, router, analytics shortcut, Live shortcut, or client hook can create new Assignment data;
- preserve historical tables, foreign keys, result compatibility, and read-only migration support;
- remove Assignment from the chapter-completion rule;
- do not physically drop tables or bulk-delete history in this initiative.

## 10. Content gate and activation

Sequential activation requires all of the following for stable codes `chapter-1` through `chapter-6`:

- exactly one published chapter per code and a unique order 1–6;
- non-empty title and description;
- a published playable quiz template;
- published questions sufficient for the configured challenge;
- at least one published review card;
- valid parent section/subtopic publication state;
- successful chapter-map and access-RPC contract checks.

The activation operation validates these conditions and changes the mode in one transaction. Failure leaves the course in `open` mode.

## 11. Fixture reset

Before the full sequential phase gate, reset only explicit fixture test accounts from the approved `@colorplay.test` allowlist.

The reset covers their Quiz sessions/answers, review completion, remediation/mistakes, mastery sessions, permanent chapter unlocks, and learning-event-derived XP/Token ledger entries. To avoid retaining purchases whose funding entries were removed, fixture-owned mutable wallet/inventory state is returned transactionally to the canonical fixture seed baseline. Auth accounts, profiles, and the shared Blook catalogue/art assets are preserved. Non-fixture accounts are never selected by pattern alone and are not modified.

Before execution, produce target IDs and per-table row counts plus a recoverable database checkpoint. After execution, verify affected counts against the allowlist. This destructive step requires explicit execution-time owner authorization even though the design scope is approved.

## 12. Failure handling and rollback

- In `sequential` mode, chapter-access service failure is fail-closed and shows a retryable `章節狀態暫時無法確認` state; the client never guesses unlocked.
- `content_unavailable` and `locked` remain distinct stable outcomes.
- Stale deep links return to the map with the relevant building selected and its blocker panel visible.
- Unlock writes are idempotent and safe under duplicate completion callbacks or concurrent tabs.
- The course can be returned to `open` mode without deleting unlock history if a production regression requires rollback.
- Assignment-retirement changes preserve historical schema so they can be reverted without reconstructing deleted data.

## 13. Verification

### 13.1 UI/unit contracts

- six stable ordered buildings;
- two-step selection and identical information content across layouts;
- cloud, construction, available, selected, and completed states;
- default selection logic;
- no `目前位置` text associated with the equipped badge;
- artwork failure fallback;
- reduced-motion behavior;
- existing chapter-detail `開始挑戰` placement.

### 13.2 Database/RPC contracts

- `open` mode preserves current access;
- Chapter 1 access in valid `sequential` content;
- Chapter N+1 stays locked until both review 100% and mastery ≥80% are true;
- unlock is permanent and isolated per student;
- direct guarded RPC access fails for locked chapters;
- retries/concurrent tabs do not duplicate grants;
- activation gate is atomic;
- Live remains accessible and does not grant self-study unlocks;
- Assignment mutations are unavailable;
- non-fixture users are excluded from reset targets.

### 13.3 Real-flow phase gate

From a clean local Supabase fixture account, verify the Chapter 1→6 sequence, prerequisite dialogs, locked deep links, unlock persistence after reload/re-login, and Live access independent of chapter state.

Run visual and interaction checks at 1280×720, 812×375, and 375×812:

- minimum 44px targets;
- pointer and keyboard activation;
- visible focus rings;
- no HUD obstruction or horizontal overflow;
- desktop/mobile information equivalence;
- crisp optimized artwork and correct overlay stacking;
- zero unexpected console errors or page errors.

Engineering gates include affected Vitest/contract tests, Supabase database tests, typecheck, ESLint, production build, the scoped Playwright phase gate, and one precise diff review. Final pixel artwork requires owner visual approval; a wireframe or CSS placeholder cannot satisfy completion.

## 14. Out of scope

- Physical deletion of Assignment tables and historical rows.
- Changes to Live participation, scoring, mastery contribution, or presenter behavior.
- Changes to Quiz scoring, XP/Token formulas, leaderboard rules, or Blook ownership.
- Resetting any non-fixture account.
- Automatically enabling sequential mode when a spreadsheet is imported.
- A persisted one-time cloud-dispersal animation.
- Copying or shipping the supplied reference screenshot.
