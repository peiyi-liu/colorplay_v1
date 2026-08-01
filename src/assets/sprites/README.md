# Pixel Sprites

規格見 `spec/07-ui-visual-system.md`「素材規格」節；管線見 ADR 0006。
每檔記錄：生成模型／prompt／reference／pixelize 參數。style anchor＝
owner 定稿圖（artifacts/design-audit/asset-batch/anchor/，不入 repo）。

| 檔名             | 模型                                                | prompt 摘要                                            | pixelize 參數        |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------ | -------------------- |
| monster-base.png | 手繪網格（scratchpad assetgen/production_task4.py） | design＝owner 定稿 monster-2（藍色圓史萊姆）網格直出   | 無（直接 @1x 32×32） |
| chest-base.png   | 手繪網格（scratchpad assetgen/production_task4.py） | design＝owner 定稿 chest-1 下半重繪：箱體＋獨立頂緣列  | 無（直接 @1x 24×11） |
| chest-lid.png    | 手繪網格（scratchpad assetgen/production_task4.py） | design＝owner 定稿 chest-1 上半重繪：蓋＋金緣＋底緣線  | 無（直接 @1x 24×9）  |
| spirit-red.png   | 手繪網格（scratchpad assetgen/production_task5.py） | design＝owner 定稿 spirit-1 網格直出（珊瑚紅＋金尖角） | 無（直接 @1x 16×16） |
| spirit-blue.png  | 手繪網格（scratchpad assetgen/production_task5.py） | design＝spirit-1 同輪廓鈷藍換色（U/B/V 三階）＋金方帽  | 無（直接 @1x 16×16） |
| spirit-green.png | 手繪網格（scratchpad assetgen/production_task5.py） | design＝spirit-1 同輪廓翡翠綠換色（L/G/D 三階）＋斜葉  | 無（直接 @1x 16×16） |
| hero.png         | 手繪網格（scratchpad assetgen/production_task5.py） | design＝迷你冒險者：棕髮＋羊皮紙臉＋珊瑚上衣＋暗色腿   | 無（直接 @1x 8×8）   |
| torch.png        | 手繪網格（scratchpad assetgen/production_task5.py） | design＝壁掛火把：金焰 6 列（g/b）＋暗色炬座與把手     | 無（直接 @1x 8×14）  |
