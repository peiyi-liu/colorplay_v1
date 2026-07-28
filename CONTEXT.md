# ColorPlay

A classroom quiz platform. Teachers publish question content and open a Live Session from a Live Activity; during that session the teacher is its Host, Participants answer on their own devices, and the Projector carries the shared screen.

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
