# Larger Blooks and Top HUD Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enlarge shop and equipped student HUD character art by 1.8×, and move the authenticated HUD navigation to the top of the page without changing navigation behavior.

**Architecture:** Keep `BlookArt` unchanged and apply larger sizes only at the shop and student HUD call sites. Move `HudCommandBar` in the real `AppShell` DOM, then invert its sticky edge and menu-panel anchor in the existing HUD CSS. Preserve all routes, labels, menu state, focus, click-outside, and Escape behavior.

**Tech Stack:** React 19, TypeScript, CSS, Vitest/Testing Library, Playwright.

## Global Constraints

- Work only in the isolated `codex/shop-avatar-hud-top` worktree.
- Do not touch teacher avatars, leaderboard avatars, student summaries, routes, APIs, scoring, inventory mutations, or menu mechanics.
- Do not use CSS visual ordering or a fixed overlay to move the command bar.
- Keep `RotateBanner` first; place the command bar after it and before `.hud-top` and `main`.
- Stage exact files only. Do not push or deploy.

---

## Task 1: Enlarge shop and equipped HUD Blook art

**Files:**

- Modify: `src/features/inventory/pages/shop-page.test.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`
- Create: `tests/contracts/shop-avatar-hud-top.test.ts`
- Modify: `src/features/inventory/pages/shop-page.tsx`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Write failing rendering tests**

In `shop-page.test.tsx`, extend the existing character-card image assertion to require intrinsic `width="130"` and `height="130"` on shop `BlookArt` images.

In `app-shell.test.tsx`, assert the equipped student HUD image has intrinsic `width="47"` and `height="47"`.

Create `tests/contracts/shop-avatar-hud-top.test.ts` to read `globals.css` and require these declarations in their selector blocks:

```css
.blook-card__art .blook-art {
  max-width: 100%;
  height: auto;
}

.hud-avatar {
  width: 52px;
  height: 40px;
}

.hud-avatar .blook-art {
  max-width: 100%;
  height: auto;
}

.hud-avatar--hero {
  background-size: 32px 32px;
}
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run src/features/inventory/pages/shop-page.test.tsx src/app/shell/app-shell.test.tsx tests/contracts/shop-avatar-hud-top.test.ts
```

Expected: failures show the old `72`, `26`, `34px`, and `24px` values or missing scoped image rules.

- [ ] **Step 3: Apply the smallest product change**

Change only:

```tsx
<BlookArt ... size={130} />
```

for shop cards and:

```tsx
<BlookArt ... size={47} />
```

for `StudentHudAvatar`.

Update the existing CSS selectors with the exact dimensions from Step 1. Keep the shop art well at `96px` high and let the scoped image rules preserve aspect ratio and contain the artwork.

- [ ] **Step 4: Verify GREEN and regression coverage**

Run:

```bash
pnpm vitest run src/features/inventory/pages/shop-page.test.tsx src/app/shell/app-shell.test.tsx tests/contracts/shop-avatar-hud-top.test.ts src/features/inventory/components/blook-art.test.tsx src/features/live/components/live-leaderboard.test.tsx
pnpm prettier --check src/features/inventory/pages/shop-page.tsx src/features/inventory/pages/shop-page.test.tsx src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css tests/contracts/shop-avatar-hud-top.test.ts
```

Expected: all tests and formatting checks pass; leaderboard coverage confirms its compact art remains unchanged.

- [ ] **Step 5: Commit exact Task 1 files**

Commit subject:

```text
feat(inventory): enlarge shop and hud blook artwork
```

Use `git commit -F` and the repository-standard co-author trailer.

---

## Task 2: Move the authenticated HUD navigation to the top

**Files:**

- Modify: `src/app/shell/app-shell.test.tsx`
- Modify: `tests/contracts/shop-avatar-hud-top.test.ts`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/app/shell/hud-command-bar.tsx`
- Modify: `tests/e2e/helpers/auth.ts`

- [ ] **Step 1: Write failing DOM-order and CSS contract tests**

Add an `AppShell` helper that compares direct child indices and assert, for student and teacher renders:

```text
.hud-command < .hud-top < #main-content
```

Extend the CSS contract to require:

```css
.hud-command {
  position: sticky;
  top: 0;
  border-bottom: ...;
}

.hud-menu__panel {
  top: calc(100% + var(--space-2));
  bottom: auto;
}
```

Also assert the landscape rule still makes `.hud-command` static.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run src/app/shell/app-shell.test.tsx tests/contracts/shop-avatar-hud-top.test.ts
```

Expected: DOM order and old bottom-edge CSS fail while existing behavior tests remain unchanged.

- [ ] **Step 3: Move the real DOM node and invert CSS anchoring**

In `AppShell`, render the role-specific `HudCommandBar` immediately after `RotateBanner`, before `.hud-top` and `main`. Do not duplicate it or use CSS `order`.

In `globals.css`:

- replace `bottom: 0` with `top: 0` on `.hud-command`;
- replace its top divider with a bottom divider;
- anchor `.hud-menu__panel` below the command bar with `top` and `bottom: auto`;
- retain the existing landscape `position: static` rule and safe-area padding.

Update only stale comments that describe the bar as bottom navigation.

- [ ] **Step 4: Verify navigation behavior and formatting**

Run:

```bash
pnpm vitest run src/app/shell/app-shell.test.tsx src/app/shell/hud-command-bar.test.tsx tests/contracts/shop-avatar-hud-top.test.ts
pnpm prettier --check src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/app/shell/hud-command-bar.tsx src/styles/globals.css tests/contracts/shop-avatar-hud-top.test.ts tests/e2e/helpers/auth.ts
```

Expected: all pass, including always-mounted/hidden panel, click-outside, focus transfer, Escape return, and link-close behavior.

- [ ] **Step 5: Commit exact Task 2 files**

Commit subject:

```text
feat(shell): move hud command navigation to top
```

Use `git commit -F` and the repository-standard co-author trailer.

---

## Task 3: Run full gates and rendered viewport validation

**Files:** No repository changes expected. Put screenshots and measurement scripts under `/tmp` only.

- [ ] **Step 1: Run repository gates**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: every command exits zero.

- [ ] **Step 2: Start or reuse a local server safely**

Probe the expected local URL first. Reuse an existing healthy server; otherwise start this worktree's server without killing another session.

- [ ] **Step 3: Validate rendered behavior at all required viewports**

Use the read-only `inventoryStudentOne` fixture account and validate `375×812`, `812×375`, and `1280×720`:

- shop art is approximately `130×87` for the current 3:2 PNG assets and remains within its card;
- equipped HUD art is approximately `47×31` and remains within the `52×40` frame;
- the command bar precedes the identity header and main content visually and in DOM order;
- the MENU panel opens below its toggle, remains in the viewport, has pointer-operable items at least `44px` high, and focus remains visible;
- navigation works through normal pointer clicks;
- `scrollWidth <= viewport width`;
- console errors and uncaught page errors are zero.

Store evidence only in `/tmp`; do not modify test-account data.

- [ ] **Step 4: Review exact scope**

```bash
git diff --check HEAD~2..HEAD
git log -2 --oneline --stat
git status --short
```

Expected: two isolated implementation commits, no unrelated files, and a clean branch. Do not push or deploy.
