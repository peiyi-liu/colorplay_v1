begin;

set local search_path = public, extensions;

select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '2d700000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'chapter.state.teacher@colorplay.test',
    crypt('LocalOnly-ChapterState-1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '2d700000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'chapter.state.student@colorplay.test',
    crypt('LocalOnly-ChapterState-2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '2d700000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '2d800000-0000-0000-0000-000000000001',
  '2d700000-0000-0000-0000-000000000001',
  'Chapter State Classroom', decode(repeat('d7', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  member_ref, classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '2df00000-0000-0000-0000-000000000001',
    '2d800000-0000-0000-0000-000000000001',
    '2d700000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '2d900000-0000-0000-0000-000000000001'
  ),
  (
    '2df00000-0000-0000-0000-000000000002',
    '2d800000-0000-0000-0000-000000000001',
    '2d700000-0000-0000-0000-000000000002',
    'student', 'active', now(), now(), '2d900000-0000-0000-0000-000000000002'
  );

create function pg_temp.add_chapter_attempt(
  p_correct_count integer,
  p_purpose public.quiz_session_purpose default 'practice'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  answer_status public.quiz_answer_status;
  correct_option uuid;
  incorrect_option uuid;
  position integer := 0;
  question_record public.questions;
  selected_option uuid;
  session_id uuid;
  session_question_id uuid;
begin
  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, classroom_id, chapter_title,
    question_count, purpose
  ) values (
    '2d700000-0000-0000-0000-000000000002',
    '26000000-0000-0000-0000-000000000003', gen_random_uuid(),
    '2d800000-0000-0000-0000-000000000001', '色彩表示',
    10, p_purpose
  ) returning id into session_id;

  for question_record in
    select question.*
    from public.questions as question
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    join public.sections as section on section.id = subtopic.section_id
    where section.chapter_id = '21000000-0000-0000-0000-000000000003'
      and question.bank_kind = 'chapter'
      and question.status = 'published'
    order by question.stable_code
    limit 10
  loop
    position := position + 1;
    select option.id into correct_option
    from public.question_options as option
    where option.question_id = question_record.id and option.is_correct;
    select option.id into incorrect_option
    from public.question_options as option
    where option.question_id = question_record.id and not option.is_correct
    order by option.sort_order
    limit 1;
    if position <= p_correct_count then
      selected_option := correct_option;
      answer_status := 'correct';
    else
      selected_option := incorrect_option;
      answer_status := 'incorrect';
    end if;

    insert into public.quiz_session_questions (
      session_id, question_id, position, question_stable_code, question_version,
      prompt, explanation, frozen_options, correct_option_id
    ) values (
      session_id, question_record.id, position, question_record.stable_code,
      question_record.version, question_record.prompt, question_record.explanation,
      (
        select jsonb_agg(jsonb_build_object(
          'id', option.id, 'key', option.option_key, 'text', option.option_text
        ) order by option.sort_order)
        from public.question_options as option
        where option.question_id = question_record.id
      ),
      correct_option
    ) returning id into session_question_id;

    insert into public.quiz_answers (
      session_id, session_question_id, user_id, selected_option_id,
      correct_option_id, answer_status, response_ms, score_delta,
      idempotency_key, answered_at
    ) values (
      session_id, session_question_id,
      '2d700000-0000-0000-0000-000000000002', selected_option,
      correct_option, answer_status, 1000,
      case when answer_status = 'correct' then 100 else 0 end,
      gen_random_uuid(), clock_timestamp()
    );
  end loop;

  update public.quiz_sessions
  set status = 'completed',
      answered_count = 10,
      correct_count = p_correct_count,
      total_score = p_correct_count * 100,
      completed_at = clock_timestamp()
  where id = session_id;

  return session_id;
end;
$$;

select ok(
  not has_table_privilege(
    'authenticated', 'public.chapter_challenge_finalize_facts', 'INSERT'
  ),
  'authenticated users cannot forge chapter challenge finalize facts'
);

insert into public.quiz_sessions (
  id, user_id, template_id, client_request_id, classroom_id, chapter_title,
  question_count, purpose
) values (
  '2dd00000-0000-0000-0000-000000000001',
  '2d700000-0000-0000-0000-000000000002',
  '26000000-0000-0000-0000-000000000003', gen_random_uuid(),
  '2d800000-0000-0000-0000-000000000001', '色彩表示', 1, 'practice'
);

update public.quiz_sessions
set status = 'completed', answered_count = 1, correct_count = 1,
    completed_at = clock_timestamp()
where id = '2dd00000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::integer
    from public.chapter_challenge_finalize_facts
    where session_id = '2dd00000-0000-0000-0000-000000000001'
  ),
  0,
  'a direct status update without real CR answers cannot forge completion'
);

select pg_temp.add_chapter_attempt(10, 'remediation');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '2d700000-0000-0000-0000-000000000001',
  true
);

select is(
  (
    select chapter ->> 'status'
    from public.teacher_student_progress_v2(
      '2d800000-0000-0000-0000-000000000001',
      '2df00000-0000-0000-0000-000000000002'
    ) payload
    cross join lateral jsonb_array_elements(payload -> 'chapters') chapter
    where chapter ->> 'chapter_id' = '21000000-0000-0000-0000-000000000003'
  ),
  'learning',
  'remediation may affect learning analytics but does not complete a chapter challenge'
);

reset role;
select pg_temp.add_chapter_attempt(7);
set local role authenticated;
select set_config('request.jwt.claim.sub', '2d700000-0000-0000-0000-000000000001', true);

select is(
  (
    select chapter ->> 'status'
    from public.teacher_student_progress_v2(
      '2d800000-0000-0000-0000-000000000001',
      '2df00000-0000-0000-0000-000000000002'
    ) payload
    cross join lateral jsonb_array_elements(payload -> 'chapters') chapter
    where chapter ->> 'chapter_id' = '21000000-0000-0000-0000-000000000003'
  ),
  'completed',
  'a finalized chapter challenge below 80 percent is completed, not mastered'
);

select results_eq(
  $$select completed_students, total_students
    from public.teacher_chapter_completion_summary(
      '2d800000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000003'
    )$$,
  $$values (1, 1)$$,
  'the chapter completion summary counts a finalized below-threshold challenge'
);

select results_eq(
  $$select completed_students, total_students
    from public.teacher_classroom_overview(
      '2d800000-0000-0000-0000-000000000001', null, null,
      '21000000-0000-0000-0000-000000000003'
    )$$,
  $$values (1, 1)$$,
  'the classroom overview uses the same chapter completion fact'
);

select results_eq(
  $$select status
    from public.get_classroom_progress(
      '2d800000-0000-0000-0000-000000000001'
    )
    where user_id = '2d700000-0000-0000-0000-000000000002'
      and chapter_id = '21000000-0000-0000-0000-000000000003'$$,
  $$values ('completed'::text)$$,
  'the legacy classroom progress RPC uses the finalized challenge fact'
);

reset role;
select pg_temp.add_chapter_attempt(8);
set local role authenticated;
select set_config('request.jwt.claim.sub', '2d700000-0000-0000-0000-000000000001', true);

select is(
  (
    select chapter ->> 'status'
    from public.teacher_student_progress_v2(
      '2d800000-0000-0000-0000-000000000001',
      '2df00000-0000-0000-0000-000000000002'
    ) payload
    cross join lateral jsonb_array_elements(payload -> 'chapters') chapter
    where chapter ->> 'chapter_id' = '21000000-0000-0000-0000-000000000003'
  ),
  'mastered',
  'an exact eight of ten chapter challenge is mastered and completed'
);

reset role;
update public.quiz_templates
set question_count = case when question_count = 10 then 9 else question_count + 1 end
where id = '26000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '2d700000-0000-0000-0000-000000000001',
  true
);

select is(
  (
    select chapter ->> 'status'
    from public.teacher_student_progress_v2(
      '2d800000-0000-0000-0000-000000000001',
      '2df00000-0000-0000-0000-000000000002'
    ) payload
    cross join lateral jsonb_array_elements(payload -> 'chapters') chapter
    where chapter ->> 'chapter_id' = '21000000-0000-0000-0000-000000000003'
  ),
  'completed',
  'a material template change preserves completion but revokes old mastery'
);

select results_eq(
  $$select status
    from public.get_classroom_progress(
      '2d800000-0000-0000-0000-000000000001'
    )
    where user_id = '2d700000-0000-0000-0000-000000000002'
      and chapter_id = '21000000-0000-0000-0000-000000000003'$$,
  $$values ('completed'::text)$$,
  'all teacher progress projections preserve completion after requalification'
);

reset role;
select * from finish();
rollback;
