# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** ColorPlay
**Generated:** 2026-07-22 22:52:36
**Category:** Educational App

---

## Global Rules

> 2026-07-22 owner 拍板:專業 Flat 色塊風、對象高中職設計群、調色盤整組重設計(黃色降為配角)、Blook 改自製 SVG(20 隻角色+20 個外框)。以下取代產生器預設值,為全站權威。

### 設計概念:「會做設計的人做的色彩教學工具」

- 暖紙張底色 + 墨色文字 + 六章節色相系統。UI 本身示範色彩學:色彩承擔層次,不靠陰影。
- 無投影(flat):層次以色塊、1px/2px 邊框、字級對比表達。
- 主要 CTA 用墨色(editorial 風格);鈷藍為互動色(連結/focus/active);章節各配一個色相。
- 禁用 emoji 圖示,一律 outline SVG(stroke 1.8);Blook 用自製幾何扁平 SVG 角色。

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Ink 950(標題) | `#14161F` | `--ink-950` |
| Ink 900(主文字/主按鈕) | `#1D212E` | `--ink-900` |
| Ink 500(次要文字) | `#646B7E` | `--ink-500` |
| Ink 200(邊框) | `#E2E5EC` | `--ink-200` |
| Paper(頁面底) | `#F6F4EE` | `--paper` |
| Surface(卡片) | `#FFFFFF` | `--surface-card` |
| Accent 鈷藍(互動/focus) | `#3056D8` | `--color-accent` |
| XP 珊瑚紅 | `#D64533` | `--color-xp` |
| Token 松石綠 | `#128A5E` | `--color-token` |
| 品牌黃(僅 logo/高光點綴) | `#FFD600` | `--yellow-brand` |

**六章節色相(卡片色帶/圖表/徽章):**
Ch1 光源 `#E5960A`、Ch2 生理 `#2F9E63`、Ch3 表示 `#3056D8`、Ch4 視覺 `#7B48CE`、Ch5 心理 `#D2418E`、Ch6 配色 `#0E98A5`,各附 `-soft` 淡色底(`--hue-ch*-soft`)。

### Typography

- **Display(數字/拉丁/章節編號):** Syne(500/700/800)— 設計學校氣質、非 AI 慣用字體
- **Body(中文):** Noto Sans TC(400/500/700/900;900 僅限大標)
- **Google Fonts:**
```css
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&family=Noto+Sans+TC:wght@400;500;700;900&display=swap');
```
- 數字類資訊(XP、Token、題號、倒數、加入碼)一律 `--font-display`,大字級呈現。

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #F59E0B;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #2563EB;
  border: 2px solid #2563EB;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #EFF6FF;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #2563EB;
  outline: none;
  box-shadow: 0 0 0 3px #2563EB20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Micro-interactions

**Keywords:** Small animations, gesture-based, tactile feedback, subtle animations, contextual interactions, responsive

**Best For:** Mobile apps, touchscreen UIs, productivity tools, user-friendly, consumer apps, interactive components

**Key Effects:** Small hover (50-100ms), loading spinners, success/error state anim, gesture-triggered (swipe/pinch), haptic

### Page Pattern

**Pattern Name:** Hero + Features + CTA

- **Conversion Strategy:** Deep CTA placement. Use contrasting color (at least 7:1 contrast ratio). Sticky navbar CTA.
- **CTA Placement:** Hero (sticky) + Bottom
- **Section Order:** 1. Hero with headline/image, 2. Value prop, 3. Key features (3-5), 4. CTA section, 5. Footer

---

## Anti-Patterns (Do NOT Use)

- ❌ Dark modes
- ❌ Complex jargon

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
