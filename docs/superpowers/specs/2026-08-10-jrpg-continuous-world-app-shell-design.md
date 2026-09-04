# JRPG Continuous World App Shell 全站改版設計

Status: Owner revised 2026-08-11 — generated-image visual parity first; new functionality follows incrementally

## 1. 本輪裁定

先依 `artifacts/design-audit/jrpg-app-shell/` 內目前選定的生成圖，更新 UI／UX 的場景、構圖、比例、色彩、HUD、資訊層級與 responsive composition。既有正式功能在換畫面時保持連線；新的學習與 Live 功能等視覺基線完成後，再逐項加入。

```text
Generated boards → Visual-parity UI → Existing function regression check
→ New function 1 → validate → New function 2 → validate → …
```

這個裁定取代上一版「先按功能區混合實作 UI 與新增功能」的排序。視覺與功能仍使用同一 production route，但新增 server contract 不得阻塞第一階段畫面更新。

## 2. 生成圖的權威範圍

### 2.1 要複刻的內容

- viewport 構圖、場景分區、主要物件相對位置與視覺重量。
- 深藍夜空 App Shell、固定 HUD、連續道路／橋梁／霧幕／階梯／燈光。
- 書本、Quiz 選項、教師表格、商店攤位、Live 主持與投影的表面形式。
- 桌面 1280px 與手機 393px 的不同 composition。
- 畫面 primary action 的位置與層級。

### 2.2 不可直接複製的內容

- 生成圖內的錯字、示意文案、暱稱、題目、分數、價格、進度與排名。
- 不符合現有資料模型的按鈕、欄位或狀態。
- 生成角色與圖示的任意細節；正式素材仍需符合 palette、授權、檔案大小與 accessibility。
- 以圖片文字取代真實 DOM 文字。

「與圖片一樣」的驗收定義是 layout／scene／hierarchy visual parity，不是把生成圖當成整張背景或逐像素複製其錯誤內容。

## 3. 採用的 reference registry

唯一主方向：`selected/continuous-world-journey-c.png`。

| Visual Module        | 採用檔案                                       | 適用 route／畫面                                 |
| -------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Stable Student HUD   | `batch-01/01-stable-student-hud.png`           | 所有 authenticated student routes                |
| Home Entrance        | `batch-01/02-home-world-entrance-v2.png`       | `/`                                              |
| Auth Guild Desk      | `batch-01/03-login-guild-desk.png`             | login／register／forgot／reset                   |
| Route Transition     | `batch-01/04-route-transition-storyboard.png`  | 一般 route scene transition                      |
| Learning Map         | `batch-01/05-student-learning-map.png`         | `/app`                                           |
| Book Reading         | `batch-02/06-review-reading-v2.png`            | chapter review／long-form learning content       |
| Battle Choice        | `batch-02/07-student-section-quiz-v2.png`      | Quiz／subtopic Quiz／chapter final Quiz          |
| Live Participant     | `batch-02/08-live-student-options-only-v2.png` | screen-only Live participant                     |
| Live Creation        | `batch-02/09a-live-create.png`                 | `/teacher/live`                                  |
| Live Host            | `batch-02/09b-live-fullscreen-host.png`        | `/teacher/live/:sessionId` host mode             |
| Live Projector       | `batch-02/10-live-projector-phases-v2.png`     | lobby／countdown／feedback／ranking              |
| Teacher Menu         | `batch-02/11-teacher-menu.png`                 | authenticated teacher shell                      |
| Teacher Work Surface | `batch-02/12-teacher-table-v2.png`             | dashboard／analytics／classes／progress／reports |
| Market               | `batch-02/13-shop-market.png`                  | `/app/shop`                                      |
| Live Join            | `batch-02/14-live-join-code.png`               | `/app/live`                                      |

明確排除所有檔名含 `rejected` 的圖片，以及 manifest 列出的 superseded v1 圖。缺少專屬生成圖的 route 必須重用上表最接近的 Visual Module，不得自行建立另一套視覺語言。

## 4. 深 Visual Modules

每張生成圖對應一個可重用的深 Module，而不是為每個 route 複製一份 JSX／CSS。

### 4.1 `JourneyAppShell`

Interface：角色、identity、HUD metrics、目前 route、scene slot、reduced-motion。

Implementation：固定 HUD 幾何、safe-area、navigation、scene stacking、loading continuity。學生 identity group 必須同時顯示 avatar 與 nickname；教師 shell 不顯示 XP／Token。

### 4.2 `RouteWorldStage`

Interface：有限的 scene key、transition key、children。

Implementation：深藍世界背景、terrain／mist／lighting layers、route transition。頁面只能選 scene，不得自行改 HUD 高度或 body 背景。

### 4.3 `BookReadingSurface`

Interface：章節／小節標題、cards、media、completion state、completion handler。

Implementation：桌面近滿版雙頁書、手機單頁 vertical flow、長內容 pagination／flow、media placement。正式內容來自 Learning repository。

### 4.4 `BattleChoiceSurface`

Interface：progress、timer、score、prompt、options、selected／pending／feedback state、handlers。

Implementation：桌面 2×2、手機單欄；長選項先換行再分級縮字，桌面最低 20px、手機最低 16px，仍不足時增加高度而不裁字。

### 4.5 `TeacherWorkSurface`

Interface：title、navigation、toolbar、rows、row actions、loading／empty／error state。

Implementation：固定教師選單、桌面 table、393px disclosure rows；像素濃度約三成，不混用學生經濟 HUD。

### 4.6 `LiveStageSurface`

Interface：既有 typed Live phase view、join／answer／transition handlers。

Implementation：加入碼、學生選項、建立活動、主持 lobby、projector phases。SQL／repository 仍是 phase 與 transition authority。

## 5. 全站視覺契約

- body、App Shell、HUD 使用深藍夜空，不再以 `--surface-page` 或 `--pixel-parchment` 鋪滿頁面。
- 羊皮紙只用於書頁、卷軸、任務板等局部 in-world objects。
- 禁止以單一大外框包住整個主要內容。
- HUD 跨 route 不重新排列、縮放或改高度；內容 loading 不能讓 HUD 消失。
- 標題與必要文字不得 ellipsis；所有正式 viewport 機械檢查 horizontal overflow 與重要元素 overlap。
- 互動 target 至少 44×44 CSS px；狀態不只靠顏色。
- route transition 150–300ms，只動 transform／opacity；reduced motion 使用 opacity-only 或直接切換。
- generated image 不得作為整頁 raster background 取代 semantic DOM。

## 6. UI-first route coverage

### 6.1 Public／Auth／Map

- `/` 使用 Home Entrance。
- login／register／forgot／reset 使用 Auth Guild Desk。
- `/app` 使用 Learning Map。
- unauthorized／not-found 重用 Home／Auth 的夜間路標語彙。

### 6.2 Student learning

- chapter detail／review 使用 Book Reading。
- current Quiz、future subtopic Quiz、chapter final Quiz 共用 Battle Choice。
- Quiz result 重用 battle-to-loot 的夜景舞台；mistakes 重用 Book Reading／battle feedback 語彙。
- shop 使用 Market。
- achievements／leaderboard 重用 Continuous World 的地標與 Teacher Work Surface 的高密度列，不回到 generic card grid。
- missions 從正式 navigation 移除；舊 URL 安全 redirect。

### 6.3 Teacher

Dashboard、Analytics、classrooms、classroom detail、student progress、Live report 全部使用 Teacher Menu＋Teacher Work Surface。差異只來自真實資料與 actions，不另做互不一致的 page shell。

### 6.4 Live

- Join 使用 Live Join。
- `screen_only` participant 使用 Live Participant，只顯示 option keys。
- Create 使用 Live Creation；現況先保持單一 section。
- Host 使用 Live Host。
- Presenter 使用 Live Projector 四態；主持控制仍由既有 handler 驅動。

## 7. 功能加入順序

### 7.1 視覺改版期間保留的現有功能

Auth、chapter map、review completion、Quiz create／answer／finalize、mistakes remediation、shop purchase／equip、achievements、leaderboard、teacher queries、Live join／answer／host transitions 不得先拔除再以 mock 補回。UI Module 直接接現有 repository／hook interface，既有行為測試必須持續通過。

### 7.2 視覺基線後逐項新增

1. 移除 missions navigation 與 legacy route redirect。
2. 學習旅程節點與現有 progress 呈現。
3. 小節 Quiz template／authoritative completion gate。
4. 全小節完成後的 chapter final Quiz gate。
5. Live 多 section selection、question-set freezing 與排序。

每個新增功能各自形成一個 vertical slice：server authority → repository adapter → UI → tests；一項完成與驗證後才開始下一項。

## 8. Visual parity 驗收

每個 Visual Module 至少產出：

- 1280px desktop screenshot。
- 393px mobile screenshot。
- reference path、route、state、viewport、commit SHA 的 manifest。
- HUD 高度一致、`scrollWidth <= clientWidth`、重要文字 overflow、bounding-box overlap、44px target assertions。
- loading／empty／error／pending 中至少與該 route 相關的狀態。

Live projector 另驗證 1024×768、1280×720、1366×768、1920×1080。截圖供 owner 比對，不由自動化把生成圖中的錯誤文字當 pixel-diff baseline。

## 9. 明確不做

- 不把生成圖裡的示意資料帶入 production。
- 不在第一階段新增 API／RPC／schema 來追趕尚未存在的按鈕。
- 不以 fake fixtures 冒充 staging 正式功能。
- 不複製 `legacy/colorplay-original.html`。
- 不讓 route 自己複製 App Shell、Teacher Menu、Book 或 Battle 的 implementation。
- 不把 task-level UI checks 宣稱為 Phase gate 或 production-ready。
