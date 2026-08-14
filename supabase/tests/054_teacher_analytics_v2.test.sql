begin;

select plan(23);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '2a700000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'analytics.v2.teacher@colorplay.test',
    crypt('LocalOnly-AnalyticsV2-1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '2a700000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'analytics.v2.student@colorplay.test',
    crypt('LocalOnly-AnalyticsV2-2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '2a700000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'analytics.v2.other@colorplay.test',
    crypt('LocalOnly-AnalyticsV2-3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '2a700000-0000-0000-0000-000000000001',
  '2a700000-0000-0000-0000-000000000003'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '2a800000-0000-0000-0000-000000000001',
  '2a700000-0000-0000-0000-000000000001',
  'Analytics V2 Classroom', decode(repeat('a7', 32), 'hex'), 1, now(), 'active'
), (
  '2a800000-0000-0000-0000-000000000002',
  '2a700000-0000-0000-0000-000000000003',
  'Other Teacher Classroom', decode(repeat('a8', 32), 'hex'), 1, now(), 'active'
), (
  '2a800000-0000-0000-0000-000000000003',
  '2a700000-0000-0000-0000-000000000001',
  'Empty Analytics Classroom', decode(repeat('a9', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  member_ref, classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '2af00000-0000-0000-0000-000000000001',
    '2a800000-0000-0000-0000-000000000001',
    '2a700000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '2a900000-0000-0000-0000-000000000001'
  ),
  (
    '2af00000-0000-0000-0000-000000000002',
    '2a800000-0000-0000-0000-000000000001',
    '2a700000-0000-0000-0000-000000000002',
    'student', 'active', now(), now(), '2a900000-0000-0000-0000-000000000002'
  ),
  (
    '2af00000-0000-0000-0000-000000000003',
    '2a800000-0000-0000-0000-000000000002',
    '2a700000-0000-0000-0000-000000000003',
    'teacher', 'active', now(), now(), '2a900000-0000-0000-0000-000000000003'
  );

create function pg_temp.quiz_answer(question_code text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  question_record public.questions;
  correct_option uuid;
  new_session uuid;
  new_session_question uuid;
  new_answer uuid;
begin
  select * into question_record
  from public.questions where stable_code = question_code;
  select id into correct_option from public.question_options
  where question_id = question_record.id and is_correct;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    status, answered_count, correct_count, total_score, completed_at
  ) values (
    '2a700000-0000-0000-0000-000000000002',
    '26000000-0000-0000-0000-000000000003', gen_random_uuid(),
    '分析', 1, 'completed', 1, 1, 100, '2026-08-13T04:00:00+00:00'
  ) returning id into new_session;

  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id
  ) values (
    new_session, question_record.id, 1, question_record.stable_code,
    question_record.version, question_record.prompt,
    question_record.explanation,
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', option.id,
          'key', option.option_key,
          'text', option.option_text
        ) order by option.sort_order
      )
      from public.question_options as option
      where option.question_id = question_record.id
    ),
    correct_option
  ) returning id into new_session_question;

  insert into public.quiz_answers (
    session_id, session_question_id, user_id, selected_option_id,
    correct_option_id, answer_status, response_ms, score_delta,
    idempotency_key, answered_at
  ) values (
    new_session, new_session_question,
    '2a700000-0000-0000-0000-000000000002', correct_option, correct_option,
    'correct', 1000, 100, gen_random_uuid(), '2026-08-13T04:00:00+00:00'
  ) returning id into new_answer;
  return new_answer;
end;
$$;

select pg_temp.quiz_answer('QB3101');

insert into public.live_activities (
  id, owner_teacher_id, title, quiz_template_id,
  question_time_limit_seconds, status
)
values (
  '2aa00000-0000-0000-0000-000000000001',
  '2a700000-0000-0000-0000-000000000001',
  '3-1 色彩三要素', '26000000-0000-0000-0000-000000000003', 20, 'active'
);

insert into public.live_sessions (
  id, live_activity_id, host_teacher_id, classroom_id, state, join_code_hash,
  join_code_version, current_position, state_version, question_count,
  completed_at, created_at
)
values (
  '2ab00000-0000-0000-0000-000000000001',
  '2aa00000-0000-0000-0000-000000000001',
  '2a700000-0000-0000-0000-000000000001',
  '2a800000-0000-0000-0000-000000000001',
  'completed', decode(repeat('b7', 32), 'hex'), 1, 1, 2, 1,
  '2026-08-13T05:00:00+00:00', '2026-08-13T04:30:00+00:00'
);

insert into public.live_participants (id, session_id, user_id, status, score)
values (
  '2ac00000-0000-0000-0000-000000000001',
  '2ab00000-0000-0000-0000-000000000001',
  '2a700000-0000-0000-0000-000000000002', 'active', 0
);

insert into public.live_session_questions (
  id, session_id, position, question_stable_code, question_version,
  prompt, public_options, correct_option_id, closed_at, chapter_id, section_id
)
select
  '2ad00000-0000-0000-0000-000000000001',
  '2ab00000-0000-0000-0000-000000000001', 1,
  question.stable_code, question.version, question.prompt, '[]'::jsonb,
  option.id, '2026-08-13T05:00:00+00:00',
  '21000000-0000-0000-0000-000000000003',
  'cd732278-0bfe-1293-19e1-338db3fe6a3c'
from public.questions question
join public.question_options option
  on option.question_id = question.id and option.is_correct
where question.stable_code = 'QB3101';

insert into public.live_answers (
  id, session_question_id, participant_id, selected_option_id, answer_status,
  response_ms, score_delta, idempotency_key, submitted_at
)
values (
  '2ae00000-0000-0000-0000-000000000001',
  '2ad00000-0000-0000-0000-000000000001',
  '2ac00000-0000-0000-0000-000000000001', gen_random_uuid(),
  'incorrect', 1500, 0, gen_random_uuid(), '2026-08-13T05:00:00+00:00'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '2a700000-0000-0000-0000-000000000001',
  true
);

select throws_ok(
  $$select * from public.teacher_assessment_facts(
      '2a800000-0000-0000-0000-000000000001', 'all', null, null, null
    )$$,
  '42501',
  null,
  'authenticated users cannot execute internal assessment facts directly'
);

select results_eq(
  $$select attempts, correct_rate
    from public.teacher_assessment_question_analysis(
      '2a800000-0000-0000-0000-000000000001', 'all', null, null, null
    ) where stable_code = 'QB3101'$$,
  $$values (2, 50.0::numeric)$$,
  'all analysis combines Quiz and Live with the actual answer denominator'
);

select results_eq(
  $$select attempts, correct_rate
    from public.teacher_assessment_question_analysis(
      '2a800000-0000-0000-0000-000000000001',
      'section_quiz', null, null, null
    ) where stable_code = 'QB3101'$$,
  $$values (1, 100.0::numeric)$$,
  'section analysis isolates section Quiz answers'
);

select results_eq(
  $$select attempts, correct_rate
    from public.teacher_assessment_question_analysis(
      '2a800000-0000-0000-0000-000000000001', 'live', null, null, null
    ) where stable_code = 'QB3101'$$,
  $$values (1, 0.0::numeric)$$,
  'Live analysis isolates Live answers'
);

select results_eq(
  $$select completed_students, total_students
    from public.teacher_classroom_overview(
      '2a800000-0000-0000-0000-000000000001', null, null, null
    )$$,
  $$values (0, 1)$$,
  'Live answers do not affect authoritative chapter completion'
);

select results_eq(
  $$select completed_students, total_students, average_accuracy,
      worst_subtopic_code, worst_subtopic_title
    from public.teacher_classroom_overview(
      '2a800000-0000-0000-0000-000000000003', null, null, null
    )$$,
  $$values (0, 0, null::numeric, null::text, null::text)$$,
  'owner receives one zero summary row for an empty classroom'
);

select results_eq(
  $$select classroom_name, total_count
    from public.teacher_live_session_report_v2(
      '2a800000-0000-0000-0000-000000000001', null, null, 5, 0
    )$$,
  $$values ('Analytics V2 Classroom'::text, 1::integer)$$,
  'Live history exposes classroom identity and pagination total'
);

select is(
  (
    select (payload -> 'stats' ->> 'unfinished_mistake_count')::integer
    from public.teacher_student_progress_v2(
      '2a800000-0000-0000-0000-000000000001',
      '2af00000-0000-0000-0000-000000000002'
    ) payload
  ),
  0,
  'student progress reports zero unfinished mistakes when none exist'
);

select is(
  (
    select chapter ->> 'live_accuracy'
    from public.teacher_student_progress_v2(
      '2a800000-0000-0000-0000-000000000001',
      '2af00000-0000-0000-0000-000000000002'
    ) payload
    cross join lateral jsonb_array_elements(payload -> 'chapters') chapter
    where chapter ->> 'chapter_id' = '21000000-0000-0000-0000-000000000003'
  ),
  '0.0',
  'student chapter progress exposes Live accuracy separately'
);

select is(
  (
    select chapter ->> 'status'
    from public.teacher_student_progress_v2(
      '2a800000-0000-0000-0000-000000000001',
      '2af00000-0000-0000-0000-000000000002'
    ) payload
    cross join lateral jsonb_array_elements(payload -> 'chapters') chapter
    where chapter ->> 'chapter_id' = '21000000-0000-0000-0000-000000000003'
  ),
  'not_started',
  'chapter status does not call an incomplete reading and mastery snapshot complete'
);

select is(
  (
    select count(*)::integer
    from public.teacher_assessment_question_analysis(
      '2a800000-0000-0000-0000-000000000002', 'all', null, null, null
    )
  ),
  0,
  'owner reads zero assessment rows from another teacher classroom'
);
select is(
  (
    select count(*)::integer
    from public.teacher_classroom_overview(
      '2a800000-0000-0000-0000-000000000002', null, null, null
    )
  ),
  0,
  'owner reads zero overview rows from another teacher classroom'
);
select is(
  (
    select count(*)::integer
    from public.teacher_live_session_report_v2(
      '2a800000-0000-0000-0000-000000000002', null, null, 5, 0
    )
  ),
  0,
  'owner reads zero Live rows from another teacher classroom'
);
select throws_ok(
  $$select public.teacher_student_progress_v2(
      '2a800000-0000-0000-0000-000000000002',
      '2af00000-0000-0000-0000-000000000004'
    )$$,
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'owner cannot read progress from another teacher classroom'
);

select set_config(
  'request.jwt.claim.sub',
  '2a700000-0000-0000-0000-000000000003',
  true
);
select is(
  (
    select count(*)::integer
    from public.teacher_assessment_question_analysis(
      '2a800000-0000-0000-0000-000000000001', 'all', null, null, null
    )
  ),
  0,
  'a non-owner reads zero unified analysis rows'
);
select is(
  (
    select count(*)::integer
    from public.teacher_classroom_overview(
      '2a800000-0000-0000-0000-000000000001', null, null, null
    )
  ),
  0,
  'a non-owner reads zero classroom overview rows'
);
select is(
  (
    select count(*)::integer
    from public.teacher_live_session_report_v2(
      '2a800000-0000-0000-0000-000000000001', null, null, 5, 0
    )
  ),
  0,
  'a non-owner reads zero Live history rows'
);
select throws_ok(
  $$select public.teacher_student_progress_v2(
      '2a800000-0000-0000-0000-000000000001',
      '2af00000-0000-0000-0000-000000000002'
    )$$,
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'a non-owner cannot read student progress'
);

select set_config(
  'request.jwt.claim.sub',
  '2a700000-0000-0000-0000-000000000002',
  true
);
select is(
  (
    select count(*)::integer
    from public.teacher_live_session_report_v2(
      '2a800000-0000-0000-0000-000000000001', null, null, 5, 0
    )
  ),
  0,
  'a student reads zero Live history rows'
);
select is(
  (
    select count(*)::integer
    from public.teacher_assessment_question_analysis(
      '2a800000-0000-0000-0000-000000000001', 'all', null, null, null
    )
  ),
  0,
  'a student reads zero unified analysis rows'
);
select is(
  (
    select count(*)::integer
    from public.teacher_classroom_overview(
      '2a800000-0000-0000-0000-000000000001', null, null, null
    )
  ),
  0,
  'a student reads zero classroom overview rows'
);
select throws_ok(
  $$select public.teacher_student_progress_v2(
      '2a800000-0000-0000-0000-000000000001',
      '2af00000-0000-0000-0000-000000000002'
    )$$,
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'a student cannot read teacher student progress'
);

select set_config(
  'request.jwt.claim.sub',
  '2a700000-0000-0000-0000-000000000001',
  true
);
select throws_ok(
  $$select public.teacher_student_progress_v2(
      '2a800000-0000-0000-0000-000000000001',
      '2af00000-0000-0000-0000-000000000004'
    )$$,
  '42501',
  'MEMBER_NOT_AVAILABLE',
  'cross-classroom member_ref cannot be read through student progress'
);

reset role;
select * from finish();
rollback;
