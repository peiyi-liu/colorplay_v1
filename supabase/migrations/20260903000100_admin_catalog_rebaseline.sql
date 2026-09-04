-- GENERATED FILE — do not edit by hand.
-- Regenerate: pnpm admin:catalog:generate
-- Source: 2026-09-03 Admin catalog rebaseline design.
insert into public.admin_sensitivity_catalog
  (resource, domain, surface, column_name, class, mask_strategy,
   searchable, filterable, sortable)
values
  ('classroom_join_rate_limits', 'classrooms', 'none', 'failure_count', 'forbidden', null, false, false, false),
  ('classroom_join_rate_limits', 'classrooms', 'none', 'scope', 'forbidden', null, false, false, false),
  ('classroom_join_rate_limits', 'classrooms', 'none', 'subject_hash', 'forbidden', null, false, false, false),
  ('classroom_join_rate_limits', 'classrooms', 'none', 'updated_at', 'forbidden', null, false, false, false),
  ('classroom_join_rate_limits', 'classrooms', 'none', 'window_started_at', 'forbidden', null, false, false, false),
  ('course_progression_settings', 'learning', 'none', 'course_id', 'forbidden', null, false, false, false),
  ('course_progression_settings', 'learning', 'none', 'mode', 'forbidden', null, false, false, false),
  ('course_progression_settings', 'learning', 'none', 'rules_version', 'forbidden', null, false, false, false),
  ('course_progression_settings', 'learning', 'none', 'updated_at', 'forbidden', null, false, false, false),
  ('live_session_questions', 'live', 'browser', 'chapter_id', 'forbidden', null, false, false, false),
  ('live_session_questions', 'live', 'browser', 'section_id', 'forbidden', null, false, false, false),
  ('questions', 'content', 'browser', 'bank_kind', 'forbidden', null, false, false, false),
  ('quiz_sessions', 'assessments', 'browser', 'abandoned_at', 'forbidden', null, false, false, false),
  ('quiz_sessions', 'assessments', 'browser', 'classroom_id', 'forbidden', null, false, false, false),
  ('quiz_templates', 'content', 'browser', 'section_id', 'forbidden', null, false, false, false),
  ('student_chapter_unlocks', 'learning', 'none', 'chapter_id', 'forbidden', null, false, false, false),
  ('student_chapter_unlocks', 'learning', 'none', 'rules_version', 'forbidden', null, false, false, false),
  ('student_chapter_unlocks', 'learning', 'none', 'source_chapter_id', 'forbidden', null, false, false, false),
  ('student_chapter_unlocks', 'learning', 'none', 'unlocked_at', 'forbidden', null, false, false, false),
  ('student_chapter_unlocks', 'learning', 'none', 'user_id', 'forbidden', null, false, false, false),
  ('student_registration_claims', 'users', 'none', 'created_at', 'forbidden', null, false, false, false),
  ('student_registration_claims', 'users', 'none', 'lease_expires_at', 'forbidden', null, false, false, false),
  ('student_registration_claims', 'users', 'none', 'lease_token', 'forbidden', null, false, false, false),
  ('student_registration_claims', 'users', 'none', 'state', 'forbidden', null, false, false, false),
  ('student_registration_claims', 'users', 'none', 'updated_at', 'forbidden', null, false, false, false),
  ('student_registration_claims', 'users', 'none', 'user_id', 'forbidden', null, false, false, false);
