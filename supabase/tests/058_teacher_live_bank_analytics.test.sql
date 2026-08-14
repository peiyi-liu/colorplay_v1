begin;

select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '58800000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'live-bank.teacher@colorplay.test',
    crypt('LocalOnly-LiveBank-1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '58800000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'live-bank.student@colorplay.test',
    crypt('LocalOnly-LiveBank-2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '58800000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '58900000-0000-0000-0000-000000000001',
  '58800000-0000-0000-0000-000000000001',
  'LT Analytics Classroom', decode(repeat('e1', 32), 'hex'), 1, now(),
  'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '58900000-0000-0000-0000-000000000001',
    '58800000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(),
    '58a00000-0000-0000-0000-000000000001'
  ),
  (
    '58900000-0000-0000-0000-000000000001',
    '58800000-0000-0000-0000-000000000002',
    'student', 'active', now(), now(),
    '58a00000-0000-0000-0000-000000000002'
  );

insert into public.live_activities (
  id, owner_teacher_id, title, quiz_template_id,
  question_time_limit_seconds, status, section_id
)
values (
  '58b00000-0000-0000-0000-000000000001',
  '58800000-0000-0000-0000-000000000001',
  '3-1 LT Analytics', '4f208855-dfc8-6cc5-7671-02dfacba85d1',
  20, 'active', 'cd732278-0bfe-1293-19e1-338db3fe6a3c'
);

insert into public.live_sessions (
  id, live_activity_id, host_teacher_id, classroom_id, state, join_code_hash,
  join_code_version, current_position, state_version, question_count,
  completed_at, created_at
)
values (
  '58c00000-0000-0000-0000-000000000001',
  '58b00000-0000-0000-0000-000000000001',
  '58800000-0000-0000-0000-000000000001',
  '58900000-0000-0000-0000-000000000001',
  'completed', decode(repeat('e2', 32), 'hex'), 1, 1, 2, 1,
  '2026-08-14T06:00:00+00:00', '2026-08-14T05:30:00+00:00'
);

insert into public.live_participants (id, session_id, user_id, status, score)
values (
  '58d00000-0000-0000-0000-000000000001',
  '58c00000-0000-0000-0000-000000000001',
  '58800000-0000-0000-0000-000000000002', 'active', 100
);

insert into public.live_session_questions (
  id, session_id, position, question_stable_code, question_version,
  prompt, public_options, correct_option_id, explanation, closed_at,
  chapter_id, section_id
)
select
  '58e00000-0000-0000-0000-000000000001',
  '58c00000-0000-0000-0000-000000000001', 1,
  question.stable_code, question.version, question.prompt,
  (
    select jsonb_agg(
      jsonb_build_object(
        'id', frozen_option.id,
        'key', frozen_option.option_key,
        'text', frozen_option.option_text,
        'sort_order', frozen_option.sort_order
      )
      order by frozen_option.sort_order
    )
    from public.question_options as frozen_option
    where frozen_option.question_id = question.id
  ),
  option.id, question.explanation, '2026-08-14T06:00:00+00:00',
  '21000000-0000-0000-0000-000000000003',
  'cd732278-0bfe-1293-19e1-338db3fe6a3c'
from public.questions as question
join public.question_options as option
  on option.question_id = question.id and option.is_correct
where question.stable_code = 'LT3101';

-- The same stable code exists in a completed Quiz and in a historical
-- QB-backed Live snapshot. Source + Live session identity must prevent the
-- answer projection from combining both four-option sets.
insert into public.quiz_sessions (
  id, user_id, template_id, client_request_id, chapter_title, question_count,
  status, answered_count, correct_count, total_score, completed_at,
  classroom_id, purpose
)
values (
  '58c00000-0000-0000-0000-000000000002',
  '58800000-0000-0000-0000-000000000002',
  '4f208855-dfc8-6cc5-7671-02dfacba85d1',
  '58c00000-0000-0000-0000-000000000003',
  '3-1 historical overlap', 1, 'completed', 1, 1, 100,
  '2026-08-14T05:55:00+00:00',
  '58900000-0000-0000-0000-000000000001', 'practice'
);

insert into public.quiz_session_questions (
  id, session_id, question_id, position, question_stable_code,
  question_version, prompt, explanation, frozen_options, correct_option_id
)
select
  '58e00000-0000-0000-0000-000000000002',
  '58c00000-0000-0000-0000-000000000002', question.id, 1,
  question.stable_code, question.version, question.prompt,
  question.explanation,
  (
    select jsonb_agg(
      jsonb_build_object(
        'id', frozen_option.id,
        'key', frozen_option.option_key,
        'text', frozen_option.option_text
      ) order by frozen_option.sort_order
    )
    from public.question_options as frozen_option
    where frozen_option.question_id = question.id
  ),
  option.id
from public.questions as question
join public.question_options as option
  on option.question_id = question.id and option.is_correct
where question.stable_code = 'QB3101';

insert into public.live_session_questions (
  id, session_id, position, question_stable_code, question_version,
  prompt, public_options, correct_option_id, explanation, closed_at,
  chapter_id, section_id
)
select
  '58e00000-0000-0000-0000-000000000003',
  '58c00000-0000-0000-0000-000000000001', 2,
  question.stable_code, question.version, question.prompt,
  (
    select jsonb_agg(
      jsonb_build_object(
        'id', frozen_option.id,
        'key', frozen_option.option_key,
        'text', '歷史 ' || frozen_option.option_text,
        'sort_order', frozen_option.sort_order
      ) order by frozen_option.sort_order
    )
    from public.question_options as frozen_option
    where frozen_option.question_id = question.id
  ),
  option.id, question.explanation, '2026-08-14T06:00:00+00:00',
  '21000000-0000-0000-0000-000000000003',
  'cd732278-0bfe-1293-19e1-338db3fe6a3c'
from public.questions as question
join public.question_options as option
  on option.question_id = question.id and option.is_correct
where question.stable_code = 'QB3101';

insert into public.live_answers (
  session_question_id, participant_id, selected_option_id, answer_status,
  response_ms, score_delta, idempotency_key, submitted_at
)
select
  '58e00000-0000-0000-0000-000000000001',
  '58d00000-0000-0000-0000-000000000001', option.id,
  'correct', 1200, 100, gen_random_uuid(), '2026-08-14T06:00:00+00:00'
from public.questions as question
join public.question_options as option
  on option.question_id = question.id and option.is_correct
where question.stable_code = 'LT3101';

-- Current taxonomy may later move while the completed Live attribution must
-- remain bound to the frozen 3-1 identities above.
update public.questions
set subtopic_id = (
  select subtopic.id
  from public.subtopics as subtopic
  where subtopic.stable_code = 'sheet-3-2-all'
)
where stable_code = 'LT3101';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '58800000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  $$select section_id
    from public.teacher_assessment_question_analysis(
      '58900000-0000-0000-0000-000000000001', 'live', null, null, null
    )
    where stable_code = 'LT3101'$$,
  $$values ('cd732278-0bfe-1293-19e1-338db3fe6a3c'::uuid)$$,
  'completed LT analytics keep the frozen section after taxonomy changes'
);

select is(
  (
    select count(*)::integer
    from public.teacher_assessment_question_analysis(
      '58900000-0000-0000-0000-000000000001',
      'section_quiz', null, null, null
    )
    where stable_code = 'LT3101'
  ),
  0,
  'LT answers never leak into section Quiz analytics'
);

select is(
  (
    select count(*)::integer
    from public.teacher_question_answer_options(
      '58900000-0000-0000-0000-000000000001', 'LT3101', 'live',
      '58c00000-0000-0000-0000-000000000001'
    )
  ),
  4,
  'the owner can reveal LT answers only after the classroom Live is completed'
);

select is(
  (
    select count(*)::integer
    from public.teacher_question_answer_options(
      '58900000-0000-0000-0000-000000000001', 'LT3102', 'live',
      '58c00000-0000-0000-0000-000000000001'
    )
  ),
  0,
  'an LT question outside a completed classroom Live remains answer-free'
);

select is(
  (
    select count(*)::integer
    from public.teacher_question_answer_options(
      '58900000-0000-0000-0000-000000000001', 'QB3101',
      'section_quiz', null
    )
  ),
  4,
  'the section source returns only the completed Quiz option set'
);

select is(
  (
    select count(*)::integer
    from public.teacher_question_answer_options(
      '58900000-0000-0000-0000-000000000001', 'QB3101', 'live',
      '58c00000-0000-0000-0000-000000000001'
    )
  ),
  4,
  'the Live source returns only the requested frozen session option set'
);

select is(
  (
    select count(*)::integer
    from public.teacher_question_answer_options(
      '58900000-0000-0000-0000-000000000001', 'QB3101', 'live',
      '58c00000-0000-0000-0000-000000000001'
    )
    where option_text like '歷史 %'
  ),
  4,
  'the Live source reads the exact historical snapshot rather than current options'
);

reset role;
update public.profiles
set role = 'student'
where id = '58800000-0000-0000-0000-000000000001';
set local role authenticated;
select is(
  (
    select count(*)::integer
    from public.teacher_assessment_question_analysis(
      '58900000-0000-0000-0000-000000000001', 'live', null, null, null
    )
  ),
  0,
  'a demoted classroom owner cannot retain teacher analytics access'
);

reset role;
select * from finish();
rollback;
