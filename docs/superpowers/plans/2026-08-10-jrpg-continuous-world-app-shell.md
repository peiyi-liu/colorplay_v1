# JRPG Generated-Board Visual Parity Implementation Plan

Status: Owner approved 2026-08-11 — UI／UX first; four implementation test seams confirmed; authorized for UI-1 implementation

Design: `docs/superpowers/specs/2026-08-10-jrpg-continuous-world-app-shell-design.md`

References: `artifacts/design-audit/jrpg-app-shell/{selected,batch-01,batch-02}/`

## A. 新執行策略

先完成所有目前有 reference 的 Visual Modules，再逐項加入新功能。現有正式 hooks、repository calls、handlers、route guards 與 server authority 在 restyle 過程保持連線，不做「拔掉功能的靜態 UI 版本」。

```text
Wave UI-0 Reference lock
→ UI-1 Shell/HUD/Transition
→ UI-2 Public/Auth/Map
→ UI-3 Book/Battle/Market
→ UI-4 Teacher
→ UI-5 Live
→ existing-function regression checkpoint
→ F-1 → F-2 → F-3 → F-4 → F-5
```

## B. Git 與工作邊界

- 開始前重新確認 `feature/v2-major-update` tip。
- Worktree：`.worktrees/jrpg-generated-board-ui`。
- Branch：`phase6/jrpg-generated-board-ui`。
- 建立前記錄主 checkout staged／unstaged／untracked fingerprints。
- 不改動主 checkout 既有 `docs/content/sheet-db-verify-report.md` 與 unrelated artifacts。
- 不使用 `git add -A`；每個 task 逐檔 stage、各自 commit。
- UI wave 完成後只使用一位 reviewer、一次 implementation review。
- 未經 owner 明確 checkpoint 授權不 merge／push／deploy。

## C. Reference lock

### 採用

- `selected/continuous-world-journey-c.png`
- batch 01：01、02-v2、03、04、05。
- batch 02：06-v2、07-v2、08-v2、09a、09b、10-v2、11、12-v2、13、14。

### 禁用

- `09-live-teacher-host-v1-rejected.png`
- `12-teacher-table-v1-rejected.png`
- manifest 中所有 superseded v1。

### Visual parity 量測

- 以 composition、scene layers、relative geometry、spacing rhythm、palette、typography hierarchy、primary-action placement 為準。
- 正式 DOM copy、server data、a11y 與 responsive overflow 優先於生成圖錯誤細節。
- 不把 generated board 當 raster page background。

## D. 實作前確認的 seams

1. **Shell seam**：`JourneyAppShell` interface 承擔 role、identity、HUD metrics、scene slot 與 reduced-motion。
2. **Visual Module seam**：Book／Battle／Teacher／Live Surface 只接受 typed view state 與 handlers，不建立第二份 domain state。
3. **Route seam**：route-level module 保留現有 repository／hook adapter，將資料轉交 Visual Module。
4. **Browser seam**：production route screenshot＋DOM metric assertions；dev-only harness 不得進 production import graph。

Owner 已於 2026-08-11 確認這四個 seams。UI-1 可在隔離 worktree 依序執行 RED → GREEN；後續 UI waves 仍依本 plan 的 task boundary 執行。

## E. UI-1 — Shell、HUD、夜空與轉場

**References**：01、04、selected C。

**主要 ownership**

- `src/app/shell/app-shell.tsx`
- `src/app/shell/hud-command-bar.tsx`
- `src/styles/tokens.css`
- `src/styles/globals.css`
- 必要時新增 `src/app/shell/route-world-stage.tsx`
- 對應 shell tests

**RED**

- 學生 identity group 同時顯示 avatar 與 nickname。
- student／teacher HUD 在對應 route matrix 的 slot 結構穩定。
- teacher HUD 不顯示 XP／Token。
- reduced motion 不執行 path displacement。

**GREEN**

- root 改為 deep-navy continuous world，禁止 cream full-page background。
- 固定 HUD row、scene row、safe-area、menu overlay 與 loading continuity。
- `RouteWorldStage` 集中 scene／transition implementation。

**Validation**

- Shell RTL、eslint、typecheck。
- 1280／393 HUD height、nickname overflow、menu overlap、44px assertions。

## F. UI-2 — Home、Auth、Learning Map

**References**：02-v2、03、05。

**Routes**

- `/`
- `/login`、register、forgot、reset
- unauthorized／not-found
- `/app`

**Implementation**

- Home 使用星空村莊，desktop CTA 位於右下 safe area。
- Auth 共用 Guild Desk Visual Module。
- Map 使用六章 Continuous World，不以 generic card grid 代替。
- 保留 Auth submit／pending／error／redirect 與 chapter access state。

**Validation**

- 既有 Auth／Lobby tests。
- 每 route 1280／393 screenshots 與 DOM metric assertions。

## G. UI-3 — Book、Battle、Market

**References**：06-v2、07-v2、13。

**Routes／reuse**

- chapter detail／review → `BookReadingSurface`。
- Quiz session／future subtopic Quiz／chapter final Quiz → `BattleChoiceSurface`。
- Quiz result／mistakes → 重用 Book／Battle 的 scene family。
- shop → Market。
- achievements／leaderboard → Continuous World landmark／list family。

**Implementation**

- Book desktop 近滿版雙頁、mobile 單頁 vertical flow。
- Battle desktop 2×2、mobile 單欄；long copy 不裁切。
- Market 使用真實 inventory／balance，不採 generated values。
- 現有 review complete、Quiz、remediation、purchase／equip、achievement／rank handlers 保持連線。

**Validation**

- Learning／Quiz／Inventory／Achievement／Leaderboard 受影響 tests。
- 1280／393 screenshots；option／book／dialog overflow 與 overlap assertions。

## H. UI-4 — Teacher Menu 與 Work Surface

**References**：11、12-v2。

**Routes**

- dashboard、analytics、classrooms、classroom detail、student progress。
- Live create／report 的共用 teacher shell。

**Implementation**

- 固定 menu＋slate work plane。
- desktop table；393px disclosure rows。
- loading／empty／error 使用同一 Module，不顯示假 0。
- repository calls、filters、pagination、class codes、role guards 維持不變。

**Validation**

- 現有 teacher route tests。
- 1280／393 table-to-row、overflow、overlap、focus order。

## I. UI-5 — Live Join、Participant、Create、Host、Projector

**References**：08-v2、09a、09b、10-v2、14。

**Implementation**

- Join：六位碼與單一 primary action。
- Participant：`screen_only` 只呈現 A／B／C／D keys。
- Create：先保留現有單一 section 與每題預設 20 秒。
- Host：full-screen lobby、code、joined count、nickname wall、start 與既有 phase controls。
- Projector：waiting、countdown、feedback／distribution、ranking。
- 先做 5F-U1 integration preflight，吸收已核准 remediation，不平行重寫同一 CSS／Presenter。

**Validation**

- Live RTL／phase tests。
- Join／Participant／Create 1280／393。
- Projector 1024×768、1280×720、1366×768、1920×1080。
- 零 root scroll、44px controls、reduced motion、production harness import scan。

## J. UI visual-parity checkpoint

UI-1 至 UI-5 全部完成後：

- 列出每張採用 board → Visual Module → production routes mapping。
- 每個 route 產出 1280／393 screenshot manifest。
- 機械檢查 root cream background = 0、page-sized generic frame = 0、HUD geometry drift = 0、必要文字 overflow = 0、重要 overlap = 0。
- 跑受影響 lint、typecheck、unit／integration tests。
- 只宣稱「JRPG generated-board UI surface complete」，不宣稱新學習功能、Phase 6 或 production-ready。

## K. 新功能逐項 vertical slices

### F-1 — 移除課後任務入口

- navigation 移除 missions。
- `/app/missions*` replace redirect 回 learning map。
- 不刪除歷史 DB facts。

### F-2 — 學習旅程與現有 progress

- 以既有 chapter map／review／mastery projection 呈現 journey node。
- 不由 client 推導正式 unlock。

### F-3 — 小節 Quiz

- 核准 subtopic → quiz template interface。
- server-authoritative completion gate、repository adapter、route CTA、Quiz session reuse。
- DB／RLS／negative tests 與 UI tests 同 slice 完成。

### F-4 — Chapter Final Quiz Gate

- 所有 required subtopics 的閱讀與測驗完成後，由 server 回傳 availability。
- client 不自行計數解鎖。

### F-5 — Live 多 section

- 核准 activity selection model、question-set merge/order、session freeze semantics。
- migration／RPC／RLS／repository／UI 一個 vertical slice。

每個 F task 單獨 plan／commit／scoped validation；一項完成後才開始下一項。不得用 UI fixture 宣稱 server contract 已完成。

## L. Staging

建議兩個 owner-visible checkpoints：

1. UI-1～UI-3：Shell＋public＋student visual parity。
2. UI-4～UI-5：teacher＋Live visual parity。

Owner 核准 UI checkpoint 且 scoped validation 全綠後，才可依當輪明確授權 push／deploy 至 `staging.colorplayapp.com`。Vercel READY／HTTP 200 仍不是 Phase gate 證據。
