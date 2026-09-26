# Phase 2 Chapter 3 Rebaseline Decision

- Date: 2026-09-26 (Asia/Taipei)
- Inventory base: protected `staging@9c42ba3d9e6552e4c135d3d52efad783dc526f57`
- Status: owner-approved Chapter 3 scope and no-grandfather semantics; platform scope is extended by `2026-09-26-colorplay-content-studio-design.md`
- Supersedes: the Phase 2 all-chapter delivery lane and inserted-card grandfather policy in the 2026-09-02 contracts

## 1. Outcome

The current Phase 2 delivery lane makes Chapter 3 content trustworthy,
versioned, publishable, and auditable. Chapters 1, 2, 4, 5, and 6 are deferred.
Completion may be reported only as `Phase 2 Chapter 3 slice PASS`; it is never
full Phase 2 completion or Production readiness.

Phase 2 owns content truth and version impact. Phase 3 later projects current
completion percentages, access, and next action from the Phase 2 contract; the
browser never writes or reconstructs those values.

## 2. Included scope

### Phase 2A — canonical Chapter 3 intake

The later approved Content Studio design extends this intake to first-party Admin manual authoring, CSV packages, media ZIP, and all curriculum nodes while keeping Chapter 3 as the only content-completeness gate.

- RC review cards, QB section questions, and CR chapter questions.
- One normalized import Interface shared by Sheet and XLSX Adapters.
- RC／QB／CR stable-code, exact parent-chain, deterministic identity, structural
  validation, content-review disposition, source digest, dry-run, transactional
  commit, idempotent receipt, and answer-leakage denial.
- Owner Apps Script setup and operator instructions. Actual Sheet mutation still
  requires separate authorization.

### Phase 2B-Ch3 — Chapter 3 publication integrity

- Existing Chapter 3 LT Live-only bank without QB／CR fallback.
- Current-version publish／archive／rollback history for Chapter 3 RC／QB／CR／LT.
- Server-derived publication impact and immutable frozen payload/hash.
- Review-card media mapping, private delivery, alt text, current-version binding,
  and content hash/integrity.
- One Chapter 3 readiness report covering every section, bank, card, source,
  disposition, version, media mapping, and student answer-leakage check.

## 3. Excluded scope

- Content creation or completeness for Chapters 1, 2, 4, 5, and 6.
- All-chapter readiness or a full Phase 2 PASS claim.
- Phase 3 percentage calculation, chapter-internal unlock logic, and next-action
  projection.
- Phase 4 redesign, Phase 5 reporting, Phase 6 formalization, Phase 8 release
  proof, and Production mutation.
- A separate external CMS or a revived Teacher authoring surface. The later approved design includes one first-party Admin `/admin/content` Content Studio; existing orphaned or conflicting mutation surfaces must not remain an alternative production write path.

## 4. Content-version domain rules

### 4.1 Historical facts and current projection

- Review completions, quiz attempts, scores, rewards, and audit events are
  immutable Historical Learning Facts tied to the exact content versions used.
- Current Progress is computed only against the Current Content Set.
- Publishing a new version never deletes, rewrites, or re-rewards an old fact.
- Migrating this contract does not itself reset progress: the current published
  Chapter 3 set at migration time becomes the accepted baseline. Only a later
  publication event can change current qualification.

### 4.2 Server-derived impact

| Publication change                                                                                 | Required impact            | Current effect                                                         |
| -------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Typo, formatting, or non-semantic accessibility correction                                         | `compatible`               | Preserve current completion and qualification                          |
| New required review card or semantic review-card／media change                                     | `requires_recompletion`    | The new card/version is incomplete until explicitly completed          |
| Question, option, correct answer, explanation meaning, duration, template, or pool-semantic change | `requires_requalification` | Earlier attempts remain history but do not qualify the current version |
| Missing or ambiguous classification evidence                                                       | Strictest applicable value | Fail closed; never preserve progress by default                        |

The server derives and validates the strongest applicable value from the frozen
before/after payload and changed-field allowlist. Clients may display the
receipt but cannot choose, weaken, or override the impact.

### 4.3 No grandfather exemption

There is no `finalized_before_publish` cohort. Every learner, including one who
completed or mastered the prior section version, must satisfy newly required or
semantically changed content before it contributes to Current Progress.

Therefore Phase 2B-Ch3 does not create publication cutoffs, shared section
event ordering, or manual exemption toggles. Removing the exemption simplifies
the publication Interface; it does not authorize deletion of historical facts.

## 5. Concrete outcomes

- A learner who completed four of four required cards retains those four
  historical facts. Publishing a fifth required card produces current review
  progress of four of five until the fifth card is explicitly completed.
- A semantic v2 of a completed card leaves the v1 completion visible in history,
  but v2 is incomplete and must be completed again.
- A materially changed section or chapter assessment leaves prior attempts and
  rewards visible, but current mastered status is unavailable until a qualifying
  attempt uses the new version set.
- A punctuation-only correction classified `compatible` does not lower progress.

## 6. Module and Interface decisions

- **ContentImport Module:** one normalized RC／QB／CR／LT Interface; Sheet and XLSX
  are external Adapters at the same Seam. Server validation, transactionality,
  source/disposition evidence, and receipt generation stay behind the Interface.
- **ContentPublication Module:** one server-authoritative Interface that receives
  content identity, proposed payload, actor, and idempotency key, then returns
  version, payload hash, impact, reason, changed-field digest, and audit event.
- **ContentReadiness Module:** one deterministic Chapter 3 report Interface bound
  to repository SHA, source digest, migration head, and environment identity.
- Phase 3 consumes these Interfaces. It must not duplicate impact classification
  or infer compatibility in React.

## 7. Gate and authorization

The slice gate requires canonical import proof, exact Chapter 3 parent/bank
routing, persisted owner dispositions, publication/rollback/version tests,
current-version media integrity, RLS and answer-leakage negative tests, and a
zero-blocker Chapter 3 readiness report.

Local implementation, Local database reset, Google Sheet changes, Storage
upload, Hosted migration/import, push, merge, and deployment each remain outside
this decision unless separately authorized. Vercel automation from a future
`staging` merge does not turn a task-level result into this slice gate.
