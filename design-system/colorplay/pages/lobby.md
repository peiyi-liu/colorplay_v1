# Page Override: lobby（色彩任務選擇大廳）

> owner 0728 晚間淡彩批。本頁與 achievements 改用「淡彩卡片系統」，
> **覆蓋 MASTER.md 的淡黃紙張底**；其餘頁面仍依 MASTER.md 暖色系。
> 色值唯一定義點：`src/styles/tokens.css` 的 `--pastel-*`（tokens.test 釘值）。

## 覆蓋規則

- 頁面主背景 `--pastel-page: #ffffff`（以 `.app-shell:has(.lobby)` 限定範圍）。
- 內容欄寬 `min(100%, 1180px)`；頁緣 桌面 32／平板 24／手機 16。
- 文字階：主標題 `--pastel-ink-strong: #18212f` 28px/700（手機 24px）、
  說明 `--pastel-ink-body: #667085` 14px、卡片標題 `--pastel-ink-heading: #253042` 16px/700。
- 章節卡：六主題 blue/purple/yellow/green/coral/cyan（`--pastel-<theme>-tint/-tint-2/-border/-icon`），
  165deg 漸層、1px 主題邊框、radius 16、min-height 190、padding 20、
  陰影兩檔 `--pastel-shadow(-hover)`；hover 上移 3px（reduced-motion 時停用）。
- 進行中卡（解鎖前緣＝最後一個 isPlayable）：2px `--pastel-cta: #f5c400` 邊框＋
  `--pastel-shadow-current` 淡黃外圈；CTA 文案「繼續學習 →」。
- 鎖定卡：opacity 0.72＋鎖頭 icon＋「尚未解鎖」標籤＋「完成前一章節後解鎖」，保留主題底色。
- 狀態標籤（StatusBadge）：11px/600 膠囊；文字用加深版（`--pastel-tag-*`，均 ≥4.5:1；
  規格原色對比僅約 3:1，刻意偏離並記錄於此）。
- 主按鈕 `.pastel-action`：`#f5c400`／文字 `#2d2600`／radius 10／觸控高 44（規格 40 → 依 AC-UI 升為 44）。
- 學生資訊橫卡 `.pastel-summary`：`#fffdf4→#fff8d8` 漸層＋`#f8e7a0` 邊框；
  右側 XP／代幣／徽章／全體排名半透明白數值格（owner 0728 取代 UAT 0727 #2「不顯示代幣」）。

## 元件

`PageHeader`、`StudentSummaryCard`、`LearningChapterCard`、`StatusBadge`、
`pastel-themes.ts`（主題名↔序號；hex 不進 TS）。
