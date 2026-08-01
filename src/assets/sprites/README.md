# Pixel Sprites

規格見 `spec/07-ui-visual-system.md`「素材規格」節；管線見 ADR 0006。
每檔記錄：生成模型／prompt／reference／pixelize 參數。style anchor＝
owner 定稿圖（artifacts/design-audit/asset-batch/anchor/，不入 repo）。

| 檔名             | 模型                                                | prompt 摘要                                           | pixelize 參數        |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------- | -------------------- |
| monster-base.png | 手繪網格（scratchpad assetgen/production_task4.py） | design＝owner 定稿 monster-2（藍色圓史萊姆）網格直出  | 無（直接 @1x 32×32） |
| chest-base.png   | 手繪網格（scratchpad assetgen/production_task4.py） | design＝owner 定稿 chest-1 下半重繪：箱體＋獨立頂緣列 | 無（直接 @1x 24×11） |
| chest-lid.png    | 手繪網格（scratchpad assetgen/production_task4.py） | design＝owner 定稿 chest-1 上半重繪：蓋＋金緣＋底緣線 | 無（直接 @1x 24×9）  |
