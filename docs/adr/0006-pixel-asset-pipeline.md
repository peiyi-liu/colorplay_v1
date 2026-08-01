# ADR 0006: 像素素材生產管線

- 狀態：Accepted（owner 2026-08-01 拍板方案 C）

## 背景

批①–⑤a 交付了 CSS 幾何佔位；素材規格在 P0 刻意延後（需先看對話窗/字型
實渲染），至今從未落地。owner 於 0801 在「A 手繪 / B 委外 / C AI 生成打樣」中
選 C。

## 決策

1. 素材規格 normative 落於 spec/07「素材規格」節；本 ADR 只記管線決策。
2. 生成＝google-genai `gemini-2.5-flash-image`（打樣可升 `gemini-3-pro-image-preview`）。
   生成腳本為拋棄式（session scratchpad）；再現性靠 `src/assets/sprites/README.md`
   記錄每檔 prompt/模型/後製參數。
3. 節奏＝小批打樣（3 素材類×4 變體＋1 場景樣張）→ owner 篩選定稿 → 以定稿圖
   為 reference image 量產同風格素材。
4. 後製與守門＝repo 內 Python（Pillow）：`pixelize.py`／`check-sprites.py`。
   AI 輸出是高解析假像素，必經降採樣到真 @1x 網格＋量化到 29 色調色盤＋去背，
   才是合格素材。
5. 退路：兩輪打樣風格仍不可控 → (A) 手繪像素（SVG 或程式化網格 PNG）（repo 已有
   BlookArt 先例）逐件替代；(B) 保留 CSS 幾何佔位、結批止損。任一退路都不得延長
   批次去「硬試」。

## 修訂（2026-08-01 Task 3 執行時）

owner 的 Gemini key 為免費層，圖像生成配額 0（429 RESOURCE_EXHAUSTED, limit: 0，帳務
門檻非速率），owner 裁定改採退路 A 機器輔助版為主路線——由 Claude 直接程式化手繪 @1x
像素網格（PIL 渲染，色彩由建構保證 ⊆ 調色盤，免量化）。Gemini 生成降為備選（開帳單後可
切回）。打樣→owner 篩選→量產節奏與 `check-sprites.py` 守門不變；`pixelize.py` 保留
供外源圖後製。打樣 round 1＋2 已依此路線完成，owner 四項定稿：spirit-1／
monster-2／chest-1／village-2（anchor 網格源碼存 session scratchpad，PNG 存
design-audit anchor 目錄）。

## 影響

素材檔進 `src/assets/sprites/`（Vite 雜湊快取）；globals.css 消費；
TSX 零接觸。`GEMINI_API_KEY` 為 owner 私有，不入 repo。
