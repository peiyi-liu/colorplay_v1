# Phase 5F：教師與 Live 功能——問題清單與 Owner Decision Log

- 日期：2026-08-10
- 狀態：**這不是 spec，是問題清單與 owner decision log**。在 owner 完成獨立的 brainstorming、逐項裁定第 2 節的問題之前，本文件不能轉為可核准的 design spec，也不能進入 writing-plans 階段。
- 對應：`docs/roadmap-colorplay-next.md` Phase 5（Live 與教師報表）的功能性子集。
- Umbrella：`docs/superpowers/specs/2026-08-10-chapter-three-umbrella-brief.md`

## 0. 為什麼這裡不能直接寫成 spec

本文件涵蓋的範圍——LivePresenter 狀態機/按鍵/主持流程/RPC 的功能性優化、教師端新統計資料（學生 Live/自主表現拆分）——牽涉會影響學生分數/排名/正式紀錄的邏輯。這類決定不能由代理（agent）自行填入語意後讓 owner 事後追認,必須先走一輪完整的 `superpowers:brainstorming` 流程，逐項確認 owner 的實際意圖，才能形成可核准的 spec。

本文件的作用是**收斂問題本身**，不是預先假設答案。

## 1. 已知範圍（尚未展開細節，展開後才是未來 spec 的內容）

- `src/features/live/components/live-presenter.tsx`（LivePresenter）的狀態機、按鍵、主持流程順序、對應 RPC 的功能性優化。
- 學生進度頁新增「Live 參與紀錄」與「課堂/課後」正確率拆分——這是新的資料查詢與展示邏輯，不是視覺調整。
- Timeout／reconnect／cancel／unofficial settlement／rank／隱私與 RLS 邊界。

## 2. 待決問題（按阻塞順序排列，尚未有任何裁定）

1. **LivePresenter 具體要優化什麼？** 目前只確認「允許改」，但沒有具體問題描述——按鍵位置不順手？主持流程哪個步驟多餘？RPC 呼叫時機有沒有已知 bug？這是最上游的問題，沒有這個答案，後面所有問題都無法展開。
2. **教師端新統計資料的 numerator/denominator 定義**：學生進度頁的「課堂 Live 正確率」與「課後自主正確率」，分母要不要排除逾時未作答的題目？分子只算完全正確、還是部分給分（若未來有此機制）？
3. **時間範圍與版本**：這個正確率是「當前內容版本」還是「全部歷史版本累加」？跨版本後舊資料要不要重新計算？
4. **取消場次／非正式結算的計入方式**：`docs/roadmap-colorplay-next.md` 已核准「取消的 Live Session 只保留伺服器已確認的逐題分數，排除完成/排名/連擊/勳章/精熟度/班級平均效果，結果標記非正式」——但教師端的「Live 參與紀錄」清單要不要顯示這些非正式場次？顯示的話怎麼標示？
5. **平手與缺席的名次呈現**：學生進度頁要顯示該學生在某場 Live 的「名次」，平手時怎麼排？學生中途離線/缺席算不算「參與」？
6. **Timeout/reconnect 對正確率計算的影響**：逾時未答算錯誤還是不計入分母？重新連線後補答是否算數？
7. **隱私/RLS 邊界**：這些新統計資料誰看得到——只有該班級的擁有教師,還是所有有權限看該學生的教師都可以？

## 3. 決策紀律

- 以上問題**逐項向 owner 提出，一次一個**，不批次丟給 owner 一次回答。
- 客觀不可行的選項會在提出時直接排除並說明原因，不留給 owner 篩選。
- 在這些問題有裁定之前，不建立 implementation task、不建立 worktree、不產生程式碼 diff、不假設任何未核准的語意。

## 4. 下一步

由 owner 決定何時另外啟動一輪 `superpowers:brainstorming`（或指定其他流程）逐項處理第 2 節的問題。本文件本身不觸發該流程。
