# ColorPlay

> Current work: **Phase 0 hosted foundation gates** on isolated branch
> `phase0/release-foundation`. Read
> [`docs/roadmap-colorplay-next.md`](docs/roadmap-colorplay-next.md), the
> [approved spec](docs/superpowers/specs/2026-08-05-phase-0-environment-release-foundation-design.md),
> and the
> [implementation plan](docs/superpowers/plans/2026-08-06-phase-0-environment-release-foundation.md)
> before acting. Status: **TASK 14 BACKUP, RESTORE, AND RECONCILIATION COMPLETE
> FOR THE TWO-SLOT CANDIDATE PATH**. GitHub controls and the first immutable
> Production backup/isolated restore are verified. No Staging merge, Candidate,
> DNS change, Production migration, deployment, or promotion has occurred.

A classroom quiz platform. Teachers publish question content and open a Live Session from a Live Activity; during that session the teacher is its Host, Participants answer on their own devices, and the Projector carries the shared screen.

## Current program

Before starting or resuming ColorPlay work, read
[`docs/roadmap-colorplay-next.md`](docs/roadmap-colorplay-next.md). It is the
single current-status entry point for the active environment, Admin, content,
learning-progression, Live, and JRPG rollout program. It records what is
approved, what is in progress, what remains, and which worktrees contain
protected work in progress.

Historical task-level evidence remains in `.superpowers/sdd/progress.md` and
does not replace the current program tracker. Re-verify time-sensitive Git,
Vercel, Supabase, DNS, and deployment facts before acting on them.

## Language

### Live

**Live Activity**:
A reusable setup for running a quiz live — which question set, the per-question time limit, and the Question Display. Running one with a class produces a Live Session.
_Avoid_: quiz, game, template

**Live Session**:
One run-through of a Live Activity with a class, from join code to podium. Its state machine is owned by Postgres; the client only projects it.
_Avoid_: game, match, room

**Phase**:
What a Live Session shows and permits at one moment — derived from the session state together with which payload fields are populated. Distinct from the stored `live_session_state` enum, which is only one input to it.
_Avoid_: step, stage, screen

**Host**:
The teacher running a Live Session, identified server-side by `isHost` on the session payload.
_Avoid_: presenter, teacher (when the running role is meant), owner

**Projector**:
The shared classroom screen showing the question, the answer distribution, and the podium. It renders the Host's payload — it is not a separate identity.
_Avoid_: presenter, big screen, display (as a noun for the screen itself — Question Display is a different concept)

**Participant**:
A student taking part in a Live Session on their own device.
_Avoid_: player, student (when the in-session role is meant), member

**Question Display**:
Whether question text reaches Participant devices (`device`) or only the Projector (`screen_only`). In `screen_only` the server strips prompts and option text from Participant payloads.
_Avoid_: dual-screen mode, projection mode

**Late Join**:
A Participant who joined after the current question opened, and so waits out the question rather than answering it. Carried as `waitingForNext`.
_Avoid_: latecomer, spectator

**Ambient Loop**:
Sound that should be playing for as long as a Phase lasts — the lobby music. A property of the Phase, so re-entering that Phase, or reconnecting into it, resumes it.
_Avoid_: background music, BGM, soundtrack

**Cue**:
A one-shot sound belonging to a change _between_ Phases — the reveal chime, the closing fanfare. An event, never a property of a Phase, so it does not fire on reconnect.
_Avoid_: sound effect, SFX, audio event

## Notes on naming vs. wire compatibility

`presenter` survives in one place that is a contract with people outside the codebase, and must not be renamed to match this glossary: the `?presenter=1` query parameter, because teachers bookmark projector links and paste them into lesson plans.

Internal identifiers use **Projector**; the URL parameter stays as-is.

## JRPG Pixel Restyle（2026-07-31, ADR 0005）

**RPG Window（對話窗）**:
全站唯一的像素風容器元件：夜空底＋白雙線框。題目窗、系統訊息、NPC 對話、
購買確認一律用它。元件名 `RpgWindow`，樣式類名 `rpg-window`。
_Avoid_: dialog box, message box, panel（指此容器時）

**Tri-Spirits（三色精靈）**:
紅／藍／綠三位 NPC 導師，對應品牌三色寶石，負責回饋頁講解、標題畫面與
頒獎台演出。同一基底 sprite 換色而成。
元件：`src/components/ui/spirit-avatar.tsx`（`SpiritAvatar`＋`spiritForSeed` 確定性指派）。
_Avoid_: mascot, tutor, guide（指這組角色時）

**Loot Reveal（寶箱結算）**:
quiz result 頁的獎勵演出：寶箱開啟後滾動顯示本次「確定已入帳」的
XP／G／新解鎖成就。純演出，禁止任何隨機掉落。
_Avoid_: loot drop, gacha, reward roll

**Day/Night Scene（日夜場景）**:
村莊與世界地圖＝羊皮紙暖色日景；戰鬥、Live、投影幕＝夜空 navy。
Live 投影墨色舞台自此為正規邏輯而非例外。

**Sprite（素材）**:
`src/assets/sprites/` 下的 @1x 像素 PNG，經 globals.css `url()` 整數倍放大消費；規格見 spec/07「素材規格」節。

**@1x**:
sprite 的原生像素尺寸；顯示尺寸恆為其整數倍（pixelated 放大）。

**Palette Swap（換色）**:
同基底 sprite 換色相產生家族變體的策略（spec §4.5）；由 pixelize.py 以調色盤映射實作，非 CSS filter。
