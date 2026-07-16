# 測試策略與證據規格

## 1. 原則

- 測試的目的不是取得綠燈，而是證明行為符合規格。
- Acceptance 不得 mock Supabase application API。
- UI 通過必須有真實瀏覽器畫面；terminal log 與 headless 結果只能作輔助。
- 每個測試可追溯至 requirement／acceptance ID。
- 缺少規定證據時只能標記 `NOT VERIFIED`，不得以「程式碼看起來正確」取代。
- UI、布局與操作流程的判定必須同時包含畫面證據與可重現操作；只檢查 DOM、snapshot 或 console log 不足以通過。

## 2. 測試層級

### Unit

範圍：

- 純函式、formatters、Zod schemas。
- Quiz UI reducer／client ephemeral state。
- Level display、reward preview（僅顯示，不作權威計算）。
- React components 的互動與 accessibility semantics。
- interaction group 中 primary action 數量。
- icon registry 與 accessible labels。
- dialog copy consistency。

工具：Vitest + React Testing Library。

### Domain integration

- Supabase client repository 與 local backend。
- Auth bootstrap、route guards。
- Query invalidation 與 error states。
- XLSX parsing validation。
- Quiz pending/locked state 與 server response reconciliation。
- Visual Viewport／dynamic viewport adapter 的 integration tests。

### Database／RLS

- migrations 可從空 DB 完整套用。
- pgTAP／SQL 測試 positive + negative policy。
- secure functions 的 authorization、idempotency、transactions。
- ledger reconciliation。

### E2E

- 真實 React app + local/staging Supabase。
- 不使用 `page.route` 攔截核心 application API。
- 測 student、teacher、outsider 三種身份。
- E2E assertion 必須同時檢查 UI 結果與必要 DB/network 結果。

### Visual／Accessibility

- Playwright screenshot baselines。
- axe 或等價自動檢查。
- 鍵盤流程與 focus 檢查。
- 375×812、768×1024、1440×900。
- 320px overflow smoke。
- 真實行動裝置軟體鍵盤與 Android back evidence。

## 3. Coverage 門檻

- `src` overall：statements ≥ 80%、branches ≥ 75%、functions ≥ 80%、lines ≥ 80%。
- 核心 domain（quiz/rewards/auth/permissions/import validation）：statements ≥ 95%、branches ≥ 90%。
- Coverage 不可透過排除核心檔案或大量 `/* istanbul ignore */` 達標。
- UI 視覺規格不能只靠 coverage 判定通過。

## 4. 必要 E2E 流程

- E2E-001：Student login → lobby → review → quiz all correct → result → wallet／leaderboard 更新。
- E2E-002：答錯 → 解析 → 下一題，舊解析不殘留。
- E2E-003：timeout → authoritative timeout → 無獎勵。
- E2E-004：refresh in-progress quiz → 恢復同一 session。
- E2E-005：重送同一 answer → 只有一筆 answer／reward。
- E2E-006：Token 不足購買 → 無扣款／ownership。
- E2E-007：成功購買 → 原子扣款與裝備。
- E2E-008：Student 存取 teacher route／API 被拒絕。
- E2E-009：Teacher 匯入合法 XLSX → preview → commit → student 可見 published content。
- E2E-010：不合法 XLSX 顯示逐列錯誤且不可 commit。
- E2E-011：Teacher A 不可取得 Teacher B 班級資料。
- E2E-012：研究匯出筆數與 DB 查詢一致。
- E2E-013：文字輸入 → 軟體鍵盤／visual viewport 變化 → primary action 仍可見 → 不關閉鍵盤完成送出。
- E2E-014：開啟 Quiz Dialog → browser back → 只關閉 Dialog → route 與 quiz session 保留。
- E2E-015：鍵盤-only 完成 Login、Quiz 與 Dialog 關閉，focus order 與 focus return 正確。
- E2E-016：Quiz 選項依序呈現 default → selected → pending/locked → correct/incorrect，且 pending 期間無重複提交。
- E2E-017：相同類型 Dialog 的文案、主要 action、close control 與位置一致。
- E2E-018：Assignment availability／deadline／attempt limit 由後端決定，完成引用 finalized session，跨班級拒絕。
- E2E-019：ColorPlay Live 一 host、兩 students、一 outsider 完成 create/join/lobby/question/answer/finalize；outsider channel 被拒、重送不重複。
- E2E-020：Review completion、current-version mastery、remediation resolution 與 achievement progress 對應 authoritative DB read model。

## 5. Headed evidence run

至少一次驗收流程以 visible browser 執行：

```bash
pnpm playwright test tests/acceptance --headed --project=chromium
```

要求：

- 使用真實 app URL。
- 使用 local 或 staging Supabase。
- 禁止 mock API。
- 擷取 screenshots、video、trace。
- 測試 manifest 記錄 commit SHA、環境、browser version、viewport、開始／結束時間。
- Headed browser 視窗不得被其他視窗遮擋後仍宣稱完成視覺驗收。

CI 可另外 headless 執行，但不能取代 headed evidence run。

## 6. Screenshot 規格

命名：

```text
<AC-ID>__<role>__<state>__<viewport>__<step>.png
```

範例：

```text
AC-QUIZ-004__student__incorrect-feedback__375x812__03.png
```

截圖必須：

- 來源為測試當下瀏覽器，不是設計稿、Storybook 或靜態 mock。
- 顯示可識別的 seeded data 與 run ID。
- 不得裁掉會影響判斷的 navigation、錯誤訊息、primary action 或 modal。
- 不含真實 production 個資或 secrets。
- 對動畫狀態採 deterministic 設定。
- metadata 記錄 viewport、device scale factor、browser、route、role、git SHA。
- UI 規格要求狀態變化時，至少提供 before/after 或完整 sequence，單張最終畫面不足。

## 7. Sequence evidence

每個核心流程至少提供：

- 5 張以上有序截圖，或
- 1 段完整 video + 關鍵截圖，並
- Playwright trace。

只有最後一張成功頁面不構成完整流程證據。

Sequence 必須能判斷：

1. 操作前狀態。
2. 使用者執行的動作。
3. pending/loading 狀態。
4. 成功或失敗結果。
5. 後續狀態是否保留。

## 8. 真實行動裝置證據

### 8.1 適用範圍

以下行為不能只靠 desktop headed browser 或 device emulation 宣稱完整通過：

- OS 軟體鍵盤是否遮擋 input 與 primary action。
- Android hardware/system back 是否先關閉 Dialog。
- Safe area、browser chrome 與 visual viewport 對 fixed/sticky controls 的影響。

### 8.2 最低要求

Release candidate 至少提供：

- 1 台真實 iOS 或 Android 裝置的軟體鍵盤證據。
- 1 台真實 Android 裝置的 back 行為證據；若無 Android 實機，該項標記 `NOT VERIFIED`，不得以 iOS 或 desktop browser 取代。
- 裝置型號、OS 版本、browser 版本、CSS viewport、orientation。
- Screenshot 或 video 中必須看得到 OS keyboard／system back 操作結果與 app 畫面。

### 8.3 自動化與實機的分工

- Playwright mobile emulation：驗證 responsive layout、scroll、bounding rect、history state 與自動 assertion。
- 真實裝置：驗證 OS keyboard、browser chrome、safe area 與 Android back 的實際體驗。
- 兩者都通過才可將 `AC-UI-010`／`AC-UI-012` 標記 PASS。

## 9. Mobile interaction and cognitive-load evidence

### 9.1 扁平化與視覺降載

測試需檢查：

- 核心學生 route 不載入未核准的 WebGL／3D canvas。
- 持續循環的裝飾動畫數量 = 0。
- primary action 每個 student core task state = 1。
- 同一 `data-interaction-group` 內同等高權重 action ≤ 2。
- 重要 action 不只使用圖示。

### 9.2 虛擬鍵盤

Automated assertion：

- 在 375×812 與 768×1024 觸發 input focus。
- 模擬 visual viewport 高度減少。
- focused input 至少 50% 高度在可視區。
- primary action bounding box 完整位於 visual viewport。
- `document.documentElement.scrollWidth <= clientWidth + 1`。
- 不關閉鍵盤即可觸發 submit。

Real-device evidence：

- OS keyboard 可見。
- focused input、主要按鈕與成功送出結果可辨識。
- 不接受只拍鍵盤收起後的畫面。

### 9.3 Dialog／Back

Automated assertion：

- Dialog open 時 `aria-modal="true"`，focus 位於 Dialog。
- `page.goBack()` 或等價 history action 後，Dialog 關閉、route 不變、quiz session ID 不變。
- 關閉後 focus 返回 trigger。
- 同一 Dialog open/close 10 次後 history depth 不持續異常增加。

Real-device evidence：

- Android back 操作前 Dialog 開啟。
- 第一次 back 只關閉 Dialog。
- 第二次 back 或離開操作依產品規格顯示 Quiz 離開確認，不直接無提示離開。

### 9.4 圖示語意

- 學習求助元件不得包含 `SOS` 文案或 emergency icon identifier。
- 所有 icon-only buttons accessible name 缺失數 = 0。
- 同一 action 的 icon/label mapping 由單一 registry 或共享 component 管理。

### 9.5 狀態可視性

Quiz sequence 必須拍到：

1. 未選取。
2. 已選取。
3. pending/locked。
4. correct 或 incorrect。
5. 下一題，上一題回饋消失。

每張需同時看得到題號／總題數與當前關卡或子主題。

## 10. Evidence manifest

每次 run 產生：

```text
artifacts/acceptance/<YYYYMMDD-HHmmss>-<short-sha>/
├─ manifest.json
├─ summary.md
├─ screenshots/
├─ real-device/
├─ videos/
├─ traces/
├─ reports/
├─ network/
└─ db/
```

`manifest.json` 至少包含：

- run_id
- git_sha
- dirty_worktree boolean
- app_url
- supabase_environment（local/staging；禁止 production 測試寫入）
- migration version
- seed version
- browser name/version
- OS
- commands and exit codes
- acceptance IDs and evidence files
- start/end timestamps
- known failures
- real_devices：型號、OS、browser、viewport、orientation、evidence files

## 11. 證據拒收條件

以下任一成立則該項不得 Pass：

- 截圖來自 mock／Storybook，而 requirement 要求整合流程。
- UI 顯示成功，但 DB 沒有對應資料。
- 只有 log、JSON、DOM assertion 或 headless result，沒有規定的畫面證據。
- 截圖沿用舊 commit、manifest SHA 不一致。
- 截圖使用 production 個資。
- 測試為 skipped、flaky retry 後未說明、或 assertion 被弱化。
- acceptance test 攔截核心 API 回傳假資料。
- 用 desktop viewport 高度縮小的截圖冒充真實 OS 軟體鍵盤。
- 只提供 Dialog 關閉後畫面，沒有開啟與操作 sequence。
- 只使用 CSS class 存在判斷 Flat Design 或 selected state，沒有真實畫面。
- UI 規格要求實機但 manifest 未記錄裝置資訊。

## 12. Visual regression

- 核心穩定頁面建立 baseline。
- 動畫、時間、隨機資料需固定。
- `maxDiffPixelRatio` 預設 ≤ 0.01；特定頁面需放寬時必須有文件理由。
- Baseline 更新必須伴隨 before／after 與 reviewer 核准，不得自動覆寫後宣稱通過。
- Visual baseline 不能取代 interaction sequence、real-device 或 accessibility evidence。

## 13. Console／Network

每個 E2E flow 蒐集：

- console errors：預期 0。
- unhandled page errors：0。
- failed network requests：除明確測試錯誤外 0。
- unexpected HTTP 5xx：0。
- 核心 fetch payload 檢查不含正解與秘密。

## 14. Manual exploratory

自動化後至少進行一次：

- 鍵盤-only。
- 320px 寬。
- reduced motion。
- 慢速網路／斷線重試。
- 共享裝置登出後返回。
- 真實手機軟體鍵盤。
- Android back 關閉 Dialog 與 Quiz 離開保護。
- 高對比／放大文字下的 primary action 可見性。

結果納入 `summary.md`，列出發現與是否阻塞 release。

## 15. Task、phase 與 release gate

### Task gate

- 文件/設定：執行結構、格式、confidentiality 與受影響 contract checks。
- Behavioral code：TDD + lint + typecheck + affected unit/integration/DB/E2E。
- Task 不建立 screenshot/video/trace evidence directory，不執行 `pnpm acceptance`。

### Phase gate

- 每個 phase 的核准 plan 定義 scoped real-stack/browser gate，只驗該 phase 新增能力與相關 regression。
- 至少包含 positive/negative RLS、transaction/idempotency、必要 browser contexts、console/network health、sanitized manifest 與一次 code review。
- Live phase 使用一 host、兩 students、一 outsider，涵蓋 concurrent answer、duplicate key、refresh/reconnect、state conflict、deadline edge、unauthorized channel、rollback 與當期核准 capacity profile。
- Staging 只用 synthetic data；Production 禁止 automated mutation acceptance。

### Phase 8 release gate

- ADR 0001 延後的 Foundation Task 16 與現有完整 `pnpm acceptance` 只在 Phase 8 核准 runbook 執行。
- 完整 gate 包含 Local reset、全部 unit/integration/DB/RLS、三 browser、三 viewports、headed core flow、a11y/performance/secrets、GitHub/Vercel/hosted environment、backup/restore 與 evidence manifest。
- `AC-UI-010`／`AC-UI-012` 真實裝置證據由人類提供；缺少即 `NOT VERIFIED`。
- Normative acceptance metadata 在 Phase 0 後為 122 unique IDs；沒有 explicit proof 的項目保持 `NOT VERIFIED`，不能因 architecture 文件存在而 Pass。
