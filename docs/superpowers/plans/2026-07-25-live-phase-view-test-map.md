# Live Phase View：page case → view test 對照表

> Task 2 Step 1 交付物。行號以 Task 1 完成後（`live-pages.test.tsx` 移除 remainingSeconds suite 後）為準。分類依據是 case 實際 render 的元件，不是 describe 標題。

## Render `<LiveSessionPage>` 的全部 case（participant describe 7 個 + 誤置於 host describe 3 個）

| # | 行 | case | 去向 | 理由／對應 view test |
|---|---|---|---|---|
| P1 | :189 | renders the lobby with the authoritative participant count | **轉譯** | `participantView` → `lobby` 變體含 `participantCount`（文案渲染由 switch 分支覆蓋） |
| P2 | :203 | renders ggame four-color option buttons in order | **轉譯** | `question` 變體 `options` 依 `sortOrder` 排序、index 對應色形；`ui-option--*` className 屬 OptionButton 自身樣式（option-button.test.tsx 已覆蓋） |
| P3 | :223 | submits one answer and locks the options | **留在頁面層** | React 交互＋mutation（idempotency key、payload、答後鎖定）——判準：不讀 session state 的提交流程 |
| P4 | :266 | shows the personal result and podium after completion | **轉譯** | `completed` 變體含 `myResult` / `podium` |
| P5 | :305 | shows text-free color-shape buttons in screen_only mode | **轉譯** | `question` 變體 `screenOnly: true`、`prompt: null`、options 無 text（伺服器已剝除——view 誠實透傳） |
| P6 | :338 | parks a late joiner on the waiting screen | **轉譯** | `waiting-for-next` 變體優先於 question（答案選項缺席由變體判定保證） |
| P7 | :361 | shows the personal standing with encouragement between questions | **留在頁面層**（變體判定另行轉譯） | 四條件規則（feedback＋screen_only＋!isHost＋!waitingForNext → `screen-only-result`）**轉譯進 view test**；本 case 的 standing 抓取（getMyStanding）、`role="status"` 播報與「標題缺席」斷言屬頁面層（合法理由 3、4） |
| P8 | :549 | shows the paused overlay to participants | **轉譯** | `paused` 變體含 `frozenSeconds`（tick 凍結）與 `prompt` |
| P9 | :570 | celebrates a server-reported streak after answering | **留在頁面層** | mutation 回應（server streak）驅動的互動渲染，不讀 session state |
| P10 | :592 | shows the team scoreboard at feedback in team mode | **留在頁面層**（showScoreboard 另行轉譯） | 隊伍總分為元件層資料抓取（getTeamTotals）；「feedback‖completed 才顯示計分板」規則**轉譯為 view 的 `showScoreboard` 欄位測試** |

**Step 5 刪除清單**：P1、P2、P4、P5、P6、P8（六案全數由 view test 取代）。
**保留清單**：P3、P7、P9、P10（各含上表合法理由；其中 P7/P10 的 state-derived 部分已另行轉譯）。

## 已知微偏差

- `state === 'draft'` 在現行頁面不落任何分支（僅渲染標題）。participant 實務上不可能處於 draft（join 需 lobby 之後）；為使 union 窮盡，`participantView` 將 draft 映為 `lobby` 變體。此為唯一非逐字對應處。

## Task 3 範圍註記

`live-pages.test.tsx` host describe 中實際 render `<TeacherLiveSessionPage>` 的 case（:411 起的 transition/finalize/pause/distribution 等）屬 Task 3；本表的 P8–P10 不得在 Task 3 被轉譯或刪除。
