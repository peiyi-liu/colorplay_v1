# 10B 主持投影體驗 Plan（2026-07-22）

依 `docs/roadmap-live-classroom.md` B2-10B（owner 裁定版，不重跑 brainstorm）。基線 `b35926b`（10A 完成）。

## 範圍

大廳暱稱牆＋六碼大字、投影模式（大字題目/色塊形狀/倒數環/作答數）、題間 Top5（名次箭頭）、終場頒獎台動畫、第一方 Web Audio 音效＋獨立靜音。全部第一方素材；`state_version` 紀律與 host-only RLS 不變。

## 決策

- **六碼投影顯示**：伺服器只存 hash（不回存明碼）。代碼在建立/rotate 時寫入 `sessionStorage['live-join-code:{sessionId}']`；presenter 讀不到時提供「重新產生代碼」（rotate）。同分頁 refresh 存活，符合關分頁即登出政策。
- **暱稱牆資料**：join 成功 broadcast 加 `joined_display_name`（彈入動畫用）；`get_live_session_state` 於 `lobby` 附 `participants`（privacy-safe display_name，依 joined_at 排序）供 reconnect/refresh 重建。
- **Top5**：新 host-only RPC `live_session_standings`，僅 `question_feedback` 可讀（completed 用既有 podium）；tie-break 與 finalize 相同（score desc→最後答對時間 asc→user_id）。名次箭頭由 client 比對上一輪快照。
- **音效**：Web Audio 合成（無資產）；靜音為非關鍵偏好存 localStorage；與 reduced-motion 獨立。
- **動畫**：CSS＋`data-reduced-motion` 既有機制；reduced-motion 時頒獎台直接全顯、暱稱不彈跳、倒數環改數字。

## Tasks（逐 task M 級：實作＋測試綠；phase 末一次 review）

1. **後端**（pgTAP `041_live_presenter` test-first → migration `20260724000200_live_presenter`）：join broadcast 暱稱、lobby roster、`live_session_standings`。
2. **前端資料層**：repository schema（participants/standings）＋`useLiveStandings`＋types；unit 測試。
3. **Presenter shell＋大廳**：投影模式切換（全螢幕 overlay）、六碼大字＋sessionStorage 流、暱稱牆；RTL。
4. **題目視圖**：大字題目、選項色塊＋形狀（非互動）、倒數環、已作答大字、縮小操作列（暫停/收題/退出）、paused 覆蓋；RTL。
5. **Top5＋頒獎台**：feedback Top5＋箭頭；completed 依序揭曉；RTL。
6. **音效**：`presenter-audio.ts` 合成器＋靜音鈕；stub AudioContext 單元測試。
7. **e2e＋gate**：live-advanced 擴充（投影開啟/六碼/暱稱牆/三 viewport 截圖）；全套綠；一次 review；commit＋staging `apply_migration`。

## 驗收對應

AC-LIVE 延遲門檻不變；UI 遵守 spec/07（狀態不能只靠顏色→形狀符號、Dialog 明確關閉、primary action 單一）。
