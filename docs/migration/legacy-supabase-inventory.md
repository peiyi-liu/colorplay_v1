# Legacy hosted Supabase sanitized inventory

- Audit method: read-only API/schema inspection performed before Phase 0
- Audit scope: aggregate resource names, counts, authorization behavior, and content comparison
- Hosted mutation status: `NOT EXECUTED`
- Credential/value retention: none

## Resource counts

| Resource           |    Count/state | Migration decision                                                       |
| ------------------ | -------------: | ------------------------------------------------------------------------ |
| Auth users         |              2 | Do not migrate; Staging reset creates synthetic identities               |
| `profiles`         |              2 | Do not migrate; anonymous visibility is a blocking finding               |
| `wallets`          |              1 | Do not migrate; no trusted ledger provenance                             |
| `mistake_records`  |      4 pending | Do not migrate; no authoritative attempt history                         |
| `chapters`         |              2 | Do not migrate; current repository taxonomy is authoritative             |
| `sections`         |              3 | Do not migrate; names include malformed serial values                    |
| `knowledge_points` | 3 generic rows | Do not migrate; taxonomy mapping is not trustworthy                      |
| `questions`        |             46 | Do not migrate directly; compare only to verified 45-question baseline   |
| `question_options` |            179 | Do not migrate directly; answer visibility and invalid rows are blocking |
| `attempts`         |              0 | Nothing to migrate                                                       |
| `hints`            |              0 | Nothing to migrate                                                       |
| `review_cards`     |              0 | Nothing to migrate                                                       |
| `kahoot_configs`   |              0 | Nothing to migrate                                                       |
| Storage buckets    |              0 | Nothing to migrate                                                       |

## Verified blocking findings

1. An anonymous request could read a `profiles` row.
2. An anonymous request could read `question_options.is_correct`, exposing formal answers.
3. Question identifiers were converted to spreadsheet date serials, including values such as `36951`.
4. Section names contained serial values rather than approved taxonomy labels.
5. One remote-only row had three options and zero correct options.
6. One remote-only row had an empty prompt and no options.

These findings invalidate the legacy schema/policies as a Production baseline. They are security and data-quality facts, not evidence that the current repository has the same defects.

## Question comparison

- Remote inventory: 46 prompts and 179 options.
- Verified repository pipeline: 45 questions (37 in chapter 3; 8 in chapter 4).
- Prompt matches: 44.
- Remote-only rows: 2, both invalid under the published single-choice rules.
- Repository-only row: 1 corrected duplicate-code question absent from the remote database.
- Unique valid remote content requiring rescue: 0.

The approved 45-question pipeline is therefore preserved exactly. The remote inventory is not a fallback question source.

## Required record before Staging reset

- Keep this aggregate inventory in Git; do not archive raw identities, responses, or credentials.
- Obtain explicit account-owner authorization for destructive reset and credential rotation.
- Capture the pre-reset project identifier outside public documentation without storing secrets.
- Reset all legacy schema/data, replay repository migrations, and seed synthetic identities only.
- Re-run positive/negative RLS tests, content count verification, and the applicable Staging phase gate.

## Production exclusion

Production starts in a separate clean project at migration zero. No legacy user, profile, wallet, mistake, taxonomy, question, option, policy, or Storage object crosses that boundary. This inventory satisfies the decision record only; it is not hosted migration evidence.
