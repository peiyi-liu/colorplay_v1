# Pixel Sprites

規格見 `spec/07-ui-visual-system.md`「素材規格」節；管線見 ADR 0006。
每檔記錄：生成模型／prompt／reference／pixelize 參數。style anchor＝
owner 定稿圖（artifacts/design-audit/asset-batch/anchor/，不入 repo）。

| 檔名                   | 模型                                                    | prompt 摘要                                                                      | pixelize 參數             |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------- |
| monster-base.png       | 手繪網格（scratchpad assetgen/production_task4.py）     | design＝owner 定稿 monster-2（藍色圓史萊姆）網格直出                             | 無（直接 @1x 32×32）      |
| chest-base.png         | 手繪網格（scratchpad assetgen/production_task4.py）     | design＝owner 定稿 chest-1 下半重繪：箱體＋獨立頂緣列                            | 無（直接 @1x 24×11）      |
| chest-lid.png          | 手繪網格（scratchpad assetgen/production_task4.py）     | design＝owner 定稿 chest-1 上半重繪：蓋＋金緣＋底緣線                            | 無（直接 @1x 24×9）       |
| spirit-red.png         | 手繪網格（scratchpad assetgen/production_task5.py）     | design＝owner 定稿 spirit-1 網格直出（珊瑚紅＋金尖角）                           | 無（直接 @1x 16×16）      |
| spirit-blue.png        | 手繪網格（scratchpad assetgen/production_task5.py）     | design＝spirit-1 同輪廓鈷藍換色（U/B/V 三階）＋金方帽                            | 無（直接 @1x 16×16）      |
| spirit-green.png       | 手繪網格（scratchpad assetgen/production_task5.py）     | design＝spirit-1 同輪廓翡翠綠換色（L/G/D 三階）＋斜葉                            | 無（直接 @1x 16×16）      |
| hero.png               | 手繪網格（scratchpad assetgen/production_task5.py）     | design＝迷你冒險者：棕髮＋羊皮紙臉＋珊瑚上衣＋暗色腿                             | 無（直接 @1x 8×8）        |
| torch.png              | 手繪網格（scratchpad assetgen/production_task5.py）     | design＝壁掛火把：金焰 6 列（g/b）＋暗色炬座與把手                               | 無（直接 @1x 8×14）       |
| village-silhouette.png | 手繪程序網格（scratchpad assetgen/production_task6.py） | design＝owner 定稿 village-2（中世紀陡屋頂＋尖塔＋窗燈）直出                     | 無（直接 @1x 320×80）     |
| ground-tile.png        | 手繪程序網格（scratchpad assetgen/production_task6.py） | design＝無縫石板廣場磚：錯縫圓石、低對比；像素限 #f6eed8/#fdf8ea/#e3d5b3         | 無（直接 @1x 32×32 滿版） |
| wood-tile.png          | 手繪程序網格（scratchpad assetgen/production_task6.py） | design＝無縫深色木板：橫板＋錯位板端縫＋稀疏木紋；像素限 #6b4a26/#4a3118/#8a651f | 無（直接 @1x 32×32 滿版） |
| keeper-blooks.png      | 手繪網格（scratchpad assetgen/production_task6.py）     | design＝Blook 店主半身像：spirit-1 家族風、棕髮＋珊瑚圍裙＋舉手打招呼            | 無（直接 @1x 16×16）      |
| keeper-frames.png      | 手繪網格（scratchpad assetgen/production_task6.py）     | design＝畫框店主半身像：spirit-1 家族風、鈷藍貝雷帽＋金色捲尺帶                  | 無（直接 @1x 16×16）      |
| rune-slot.png          | 手繪網格（scratchpad assetgen/production_task7.py）     | design＝深藍石板咒文格：#565c82 刻邊＋#232a55 體＋中央符文鏤空透明               | 無（直接 @1x 12×15）      |
| camp-fire.png          | 手繪網格（scratchpad assetgen/production_task7.py）     | design＝營火：金焰（g/b/Y 熱芯）疊暗色柴堆（d/o）                                | 無（直接 @1x 10×12）      |
| gems.png               | 手繪網格（scratchpad assetgen/production_task7.py）     | design＝三顆切面菱形寶石橫排：珊瑚/鈷藍/翡翠，各 7px 寬＋1px 間隔＋W 高光        | 無（直接 @1x 24×8）       |
| firework.png           | 手繪網格（scratchpad assetgen/production_task7.py）     | design＝放射煙火：金色 2×2 核＋金環＋珊瑚/鈷藍/翡翠火花＋白色閃點                | 無（直接 @1x 16×16）      |

批⑤a 換裝裁定（Task 7）：

- rune-slot lit 態＝金底透出（`.rune-slot--lit` 只鋪 `background-color`，
  金色從 sprite 中央鏤空符文透出），未採 sepia filter 備案——實測金符文
  在石板上清楚可辨，且保留石板材質。
- 旗尾織紋＝保留（`.live-presenter__wall-chip` 疊 wood-tile.png）。名條白字
  對木紋最亮色 #8a651f 實測對比 5.3:1 ≥ 4.5:1，未觸發「撤三行」降格條款。
