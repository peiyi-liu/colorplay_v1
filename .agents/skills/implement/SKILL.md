---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Before writing any code, arm the review gate: use the **Write tool** to create `.claude/review-gate/pending` containing the task label (the Write tool creates parent directories; avoid bash `mkdir`/`echo`, which the auto-mode classifier may block). The Stop hook will block ending the session until /code-review has run and released the gate by creating `.claude/review-gate/clear` (max 3 blocks, then it releases with a human-required flag).

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.
