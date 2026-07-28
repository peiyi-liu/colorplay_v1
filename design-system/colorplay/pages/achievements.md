# Page Override: achievements（個人成就與徽章）

> owner 0728 晚間淡彩批，與 [lobby.md](./lobby.md) 共用淡彩卡片系統；
> 本檔只記載徽章頁的差異。色值唯一定義點 `src/styles/tokens.css`。

## 覆蓋規則

- 主背景白、欄寬 1180、三／二／單欄網格與 lobby 相同（`.pastel-grid`）。
- 徽章卡：`.pastel-card.achievement-card`，min-height 150、padding 18；
  主題依成就家族分配（perfect→coral、first_task→green、mistake→blue、
  master→yellow、level→purple、streak→cyan、blook→purple、其餘→blue）。
- 已解鎖：主題淡彩底＋「已解鎖」標籤（done 樣式）＋解鎖日期（Asia/Taipei）。
- 未解鎖：底色以 `color-mix(…45%, --pastel-surface)` 降飽和（非整卡灰階／非透明度），
  icon 換鎖頭灰底，「未解鎖」標籤＋解鎖條件＋進度列。
- 進度列：6px 圓角條、底 `--pastel-track: #e9edf3`、填色 `--card-icon`（主題強調色）、
  右側「n / m」數值；無 target 時顯示「—」且不掛 progressbar role。
- 頁首：PageHeader＋左側 `.pastel-back` 返回鍵（44×44）。
