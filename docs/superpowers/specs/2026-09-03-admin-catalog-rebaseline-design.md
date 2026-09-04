# Admin sensitivity catalog rebaseline

**Status:** Owner-authorized fail-closed correction package
**Date:** 2026-09-03
**Scope:** Catalog metadata only; no product schema or Admin browser exposure change

## 1. Problem

Twenty-one columns introduced after the Phase 1 Admin catalog baseline are
present in the `public` schema but absent from the machine catalog. The runtime
already denies unnamed resources and columns, but the exact-inventory gate must
also remain complete so later Admin work cannot inherit silent catalog drift.

## 2. Decision

This package records every drifted column explicitly as `forbidden`. The three
previously unregistered resources use `surface=none`; every resource remains
`export=false`. All overlay columns have no mask strategy and are not searchable,
filterable, or sortable.

This is a quarantine decision, not a permanent domain classification. A domain
owner may promote a column only in a later, separately reviewed forward
migration. `student_registration_claims.lease_token` remains permanently
forbidden because it is an attempt-binding capability.

## 3. Machine-readable quarantine overlay

| Resource                      | Domain        | Surface   | Column              | Class       |
| ----------------------------- | ------------- | --------- | ------------------- | ----------- |
| `course_progression_settings` | `learning`    | `none`    | `course_id`         | `forbidden` |
| `course_progression_settings` | `learning`    | `none`    | `mode`              | `forbidden` |
| `course_progression_settings` | `learning`    | `none`    | `rules_version`     | `forbidden` |
| `course_progression_settings` | `learning`    | `none`    | `updated_at`        | `forbidden` |
| `live_session_questions`      | `live`        | `browser` | `chapter_id`        | `forbidden` |
| `live_session_questions`      | `live`        | `browser` | `section_id`        | `forbidden` |
| `questions`                   | `content`     | `browser` | `bank_kind`         | `forbidden` |
| `quiz_sessions`               | `assessments` | `browser` | `abandoned_at`      | `forbidden` |
| `quiz_sessions`               | `assessments` | `browser` | `classroom_id`      | `forbidden` |
| `quiz_templates`              | `content`     | `browser` | `section_id`        | `forbidden` |
| `student_chapter_unlocks`     | `learning`    | `none`    | `chapter_id`        | `forbidden` |
| `student_chapter_unlocks`     | `learning`    | `none`    | `rules_version`     | `forbidden` |
| `student_chapter_unlocks`     | `learning`    | `none`    | `source_chapter_id` | `forbidden` |
| `student_chapter_unlocks`     | `learning`    | `none`    | `unlocked_at`       | `forbidden` |
| `student_chapter_unlocks`     | `learning`    | `none`    | `user_id`           | `forbidden` |
| `student_registration_claims` | `users`       | `none`    | `created_at`        | `forbidden` |
| `student_registration_claims` | `users`       | `none`    | `lease_expires_at`  | `forbidden` |
| `student_registration_claims` | `users`       | `none`    | `lease_token`       | `forbidden` |
| `student_registration_claims` | `users`       | `none`    | `state`             | `forbidden` |
| `student_registration_claims` | `users`       | `none`    | `updated_at`        | `forbidden` |
| `student_registration_claims` | `users`       | `none`    | `user_id`           | `forbidden` |

## 4. Acceptance contract

- The generated JSON contains exactly 58 resources: 46 historical domain
  resources, nine Admin control resources, and the three quarantined resources.
- The 21 rows above exist exactly once and remain `forbidden`, non-queryable,
  unmasked, and non-exportable.
- `course_progression_settings`, `student_chapter_unlocks`, and
  `student_registration_claims` remain absent from the Admin browser surface.
- The historical `20260808000500_admin_sensitivity_catalog.sql` migration stays
  byte-identical. A new forward migration adds only this quarantine overlay.
- No source migration, product payload, or long-term domain rule changes here.
