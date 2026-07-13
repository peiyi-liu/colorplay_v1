# Acceptance Evidence Template

> 每次正式驗收複製此範本至 `artifacts/acceptance/<run-id>/summary.md`。不得刪除未通過項目，只能填寫狀態與原因。

## 1. Run Metadata

| Field | Value |
|---|---|
| Run ID | |
| Git SHA | |
| Worktree clean | true / false |
| Branch | |
| App URL | |
| Supabase environment | local / staging |
| Supabase project/ref | |
| Migration version | |
| Seed version | |
| Game rules version | |
| Started at UTC | |
| Finished at UTC | |
| OS | |
| Browser + version | |
| Real device(s) | model / OS / browser / viewport / orientation |
| Operator / agent | |

## 2. Commands

| Command | Exit code | Started | Duration | Report path |
|---|---:|---|---:|---|
| `pnpm install --frozen-lockfile` | | | | |
| `pnpm build` | | | | |
| `pnpm lint` | | | | |
| `pnpm typecheck` | | | | |
| `pnpm test:coverage` | | | | |
| `pnpm test:db` | | | | |
| `pnpm test:e2e` | | | | |
| `pnpm test:visual` | | | | |
| headed acceptance command | | | | |

## 3. Overall Result

| Status | Count |
|---|---:|
| PASS | |
| FAIL | |
| NOT VERIFIED | |
| NOT APPLICABLE | |

**Release decision:** PASS / BLOCKED

**Blocking reason(s):**

- 

## 4. Criterion Evidence Matrix

每個 Blocking AC 都必須有一列。

| AC ID | Status | Automated test | Screenshot/sequence | Trace/video | DB/network proof | Notes |
|---|---|---|---|---|---|---|
| AC-ENV-001 | | | | | | |
| AC-AUTH-001 | | | | | | |
| ... | | | | | | |

## 5. Required Screenshot Inventory

### Core states — 36 minimum

| State | 375×812 | 768×1024 | 1440×900 | Verified |
|---|---|---|---|---|
| Login | | | | |
| Student lobby | | | | |
| Chapter/subtopic | | | | |
| Review card | | | | |
| Quiz unanswered | | | | |
| Quiz incorrect feedback | | | | |
| Quiz result | | | | |
| Profile/shop | | | | |
| Leaderboard | | | | |
| Teacher dashboard | | | | |
| Question import validation | | | | |
| Teacher analytics | | | | |

### Sequence evidence

| Flow | Evidence files | Steps visible | Trace | Result |
|---|---|---:|---|---|
| Login + refresh | | | | |
| Review → correct → result | | | | |
| Incorrect → explanation → next | | | | |
| Timeout | | | | |
| Purchase + equip | | | | |
| Import → publish → student visibility | | | | |
| Input → keyboard visible → submit | | | | |
| Dialog open → Back closes dialog → quiz retained | | | | |
| Quiz default → selected → pending → result | | | | |

### UI and mobile interaction evidence

| AC ID | Device / viewport | Before | Interaction | After | Real-device proof | Result |
|---|---|---|---|---|---|---|
| AC-UI-008 Flat Design | 375×812 / 768×1024 / 1440×900 | | | | N/A | |
| AC-UI-009 Natural mapping | 375×812 / 768×1024 / 1440×900 | | | | N/A | |
| AC-UI-010 Virtual keyboard | real iOS/Android | | keyboard visible | submit result | required | |
| AC-UI-011 Dialog close | 375×812 / 768×1024 / 1440×900 | | close/Esc | focus returned | optional | |
| AC-UI-012 Back protection | real Android | | system Back | dialog closed/session retained | required | |
| AC-UI-013 Icon semantics | core routes | | | | N/A | |
| AC-UI-014 Status visibility | quiz sequence | | | | N/A | |
| AC-UI-015 Interaction states | quiz/form | default | selected/pending | result/error | N/A | |

## 6. Data Integrity Proof

| Check | Expected | Actual | Query/report | Result |
|---|---:|---:|---|---|
| wallet reconciliation differences | 0 | | | |
| quiz aggregate differences | 0 | | | |
| orphan foreign keys | 0 | | | |
| invalid published single-choice questions | 0 | | | |
| duplicate answer reward sources | 0 | | | |
| export/query row count mismatch | 0 | | | |

## 7. Security Proof

| Attack / check | Expected | Evidence | Result |
|---|---|---|---|
| Student role escalation | denied | | |
| Cross-user answer read | denied | | |
| Direct wallet mutation | denied | | |
| Replay answer ×10 | one answer/reward | | |
| localStorage XP tamper | no DB/UI authoritative change | | |
| bundle secret scan | 0 findings | | |
| question payload answer scan | 0 forbidden fields | | |
| malicious script content | not executed | | |

## 8. Browser Health

| Metric | Expected | Actual | Evidence |
|---|---:|---:|---|
| Console errors | 0 | | |
| Unhandled page errors | 0 | | |
| Unexpected 5xx | 0 | | |
| Unexpected failed requests | 0 | | |

## 9. Accessibility and Performance

| Check | Threshold | Actual | Report | Result |
|---|---:|---:|---|---|
| axe critical | 0 | | | |
| axe serious | 0 | | | |
| Lighthouse accessibility | ≥95 | | | |
| LCP | ≤2.5s | | | |
| INP | ≤200ms | | | |
| CLS | ≤0.1 | | | |
| Initial JS gzip | ≤300 KiB target | | | |

## 10. Manual Exploratory Checklist

- [ ] Keyboard-only student flow completed.
- [ ] Keyboard-only teacher main flow completed.
- [ ] 320px overflow checked.
- [ ] Reduced motion checked.
- [ ] Slow network / offline retry checked.
- [ ] Shared-device logout checked.
- [ ] Real phone software keyboard remains visible while primary action is used.
- [ ] Real Android Back closes the top Dialog before leaving Quiz.
- [ ] Login, join-class, Quiz and Dialog actions follow natural prompt/input/action grouping.
- [ ] Learning-help icons use `?` / HELP / explicit text, not SOS or emergency imagery.
- [ ] Quiz default, selected, pending, result and error states are visually distinguishable.
- [ ] No production personal data appears in artifacts.

## 11. Real Device Inventory

| Evidence ID | Device model | OS | Browser/version | CSS viewport | Orientation | Keyboard visible | Android Back tested | File path |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

A missing real Android device result means `AC-UI-012` is `NOT VERIFIED`, not PASS. A desktop emulator does not fill this table.

## 12. Known Failures / Not Verified

| ID / area | Description | User impact | Workaround | Owner | Target |
|---|---|---|---|---|---|
| | | | | | |

## 13. Reviewer Sign-off

- Reviewer:
- Date:
- Decision:
- Notes:
