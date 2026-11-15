# Local recovery origin repair and bounded diagnostics

Root coordinates and is sole reviewer; reuse the same implementation worker. Base: d54436c59976db7f370fadb0eb155abd96aecc34. This is a new empirically triggered M task, not a second C3 review. You are not alone in the codebase; preserve root-owned docs/runtime and others' changes.

## Confirmed evidence

First true functional wsb-261115-99ab481a47fc failed at registration_recovery after true R1 registration/login. Root final FAIL/exit1/stderr0/sourceFrozen/ownedProcessesRemaining0; original files retained. All five initial identities, R1, two classes and two mails retained; XP/wallet/media0. Read-only recovery message shape proves owned Local API verify/type=recovery but redirect origin58373/path empty, not /reset-password; verify link not consumed. auth-recover ALLOWED_ORIGINS lacks the fixed Local app origin58373, chooses Staging fallback; GoTrue clamps the unallowed Staging redirect to its Local SITE_URL. Driver correctly rejects. Stage failure currently always records generic error, and producer close conflates health errors with resource closure, while root separately verified actual exit.

## Ownership and change

1. Product: supabase/functions/_shared/cors.ts only: add the exact http://127.0.0.1:58373 origin; preserve every existing origin, safe Staging fallback and no wildcard/dynamic trust. Existing tests/contracts/auth-recover-redirect-origin.test.ts may gain behavioral coverage. If actual handler testing needs a seam, propose the smallest exact path before changing; prefer evaluating the unchanged handler with controlled Deno/client ports over refactoring it merely for tests.
2. Diagnostic tools: scripts/concurrency/auth-journey.ts, functional-runner.ts, functional-journeys.ts and direct contract tests only. Preserve known functionalFailureCode(error) safely in private stage failure; foreign errors stay fixed generic. Add bounded write-once recovery substep checkpoints without link/token/email/UUID/password/body. Save count/enum-only functional health snapshot before closure can erase observers, so future failures identify available/unexpected/expected counts. Separate diagnostic health failure from actual resource state in evidence, without weakening the health gate or promoting cleanup failure/PASS.
3. RED before product change for exact58373 redirect behavior and strict foreign origin fallback; safe error/checkpoint paths with synthetic secrets must never persist raw strings. Keep callback 303/origin/path/type/token guards, all deadlines/retries/required stages, zero broad skips, no quota/DB/schema/dependency changes.

## Validation and handoff

Full lint/typecheck, affected auth+functional/capacity contracts, scoped format and diff; exact paths commit, clean freeze and packet with hashes/commands. Root performs one review round. Do not launch browser/App/API/OTP/SQL/Hosted, change preflight to allow nonempty DB, or rerun failed run. Root prepares a fresh isolated Local generation while retaining the old VM/data and all evidence; no data deletion/reset. Actual new run is only after a new source review/freeze/build/root approval.
