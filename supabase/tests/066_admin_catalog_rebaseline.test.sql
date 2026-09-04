-- supabase/tests/066_admin_catalog_rebaseline.test.sql
begin;
select plan(7);

create temporary table expected_catalog_rebaseline (
  resource text not null,
  domain text not null,
  surface text not null,
  column_name text not null,
  primary key (resource, column_name)
) on commit drop;

insert into expected_catalog_rebaseline
  (resource, domain, surface, column_name)
values
  ('course_progression_settings', 'learning', 'none', 'course_id'),
  ('course_progression_settings', 'learning', 'none', 'mode'),
  ('course_progression_settings', 'learning', 'none', 'rules_version'),
  ('course_progression_settings', 'learning', 'none', 'updated_at'),
  ('live_session_questions', 'live', 'browser', 'chapter_id'),
  ('live_session_questions', 'live', 'browser', 'section_id'),
  ('questions', 'content', 'browser', 'bank_kind'),
  ('quiz_sessions', 'assessments', 'browser', 'abandoned_at'),
  ('quiz_sessions', 'assessments', 'browser', 'classroom_id'),
  ('quiz_templates', 'content', 'browser', 'section_id'),
  ('student_chapter_unlocks', 'learning', 'none', 'chapter_id'),
  ('student_chapter_unlocks', 'learning', 'none', 'rules_version'),
  ('student_chapter_unlocks', 'learning', 'none', 'source_chapter_id'),
  ('student_chapter_unlocks', 'learning', 'none', 'unlocked_at'),
  ('student_chapter_unlocks', 'learning', 'none', 'user_id'),
  ('student_registration_claims', 'users', 'none', 'created_at'),
  ('student_registration_claims', 'users', 'none', 'lease_expires_at'),
  ('student_registration_claims', 'users', 'none', 'lease_token'),
  ('student_registration_claims', 'users', 'none', 'state'),
  ('student_registration_claims', 'users', 'none', 'updated_at'),
  ('student_registration_claims', 'users', 'none', 'user_id');

select is(
  (select count(*)::integer from expected_catalog_rebaseline),
  21,
  'fixture names the exact 21-column rebaseline'
);
select is(
  (select count(*)::integer
     from expected_catalog_rebaseline expected
     join public.admin_sensitivity_catalog actual
       using (resource, column_name)),
  21,
  'all rebaseline columns exist in the database catalog'
);
select is(
  (select count(*)::integer
     from expected_catalog_rebaseline expected
     join public.admin_sensitivity_catalog actual
       using (resource, column_name)
    where actual.domain = expected.domain
      and actual.surface = expected.surface),
  21,
  'every row keeps its exact domain and fail-closed surface'
);
select is(
  (select count(*)::integer
     from expected_catalog_rebaseline expected
     join public.admin_sensitivity_catalog actual
       using (resource, column_name)
    where actual.class = 'forbidden'),
  21,
  'all rebaseline columns are forbidden'
);
select is(
  (select count(*)::integer
     from expected_catalog_rebaseline expected
     join public.admin_sensitivity_catalog actual
       using (resource, column_name)
    where actual.mask_strategy is null
      and actual.searchable is false
      and actual.filterable is false
      and actual.sortable is false),
  21,
  'quarantined columns cannot be masked, searched, filtered, or sorted'
);
select is(
  (select count(distinct actual.resource)::integer
     from expected_catalog_rebaseline expected
     join public.admin_sensitivity_catalog actual
       using (resource, column_name)
    where actual.surface = 'none'),
  3,
  'the three newly registered resources have no browser surface'
);
select is(
  (select count(*)::integer
     from public.admin_sensitivity_catalog
    where resource in (
      'course_progression_settings',
      'student_chapter_unlocks',
      'student_registration_claims'
    )
      and surface <> 'none'),
  0,
  'new resources contain no row that can authorize browser access'
);

select * from finish();
rollback;
