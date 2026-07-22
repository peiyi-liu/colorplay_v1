-- 10E report and learning loop: the detail matrix agrees with an
-- independent recount, and completing a session writes non-correct answers
-- into the mistake book idempotently (resolved rows reopen).

begin;

select plan(11);

select has_trigger(
  'public', 'live_sessions', 'live_sessions_record_mistakes',
  'completing a session records mistakes'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '43000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'report.loop.host@colorplay.test',
    crypt('LocalOnly-Rep1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '43000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'report.loop.a@colorplay.test',
    crypt('LocalOnly-Rep3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '43000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'report.loop.b@colorplay.test',
    crypt('LocalOnly-Rep4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '43000000-0000-0000-0000-000000000001';
update public.profiles
set display_name = '準同學'
where id = '43000000-0000-0000-0000-000000000003';
update public.profiles
set display_name = '錯同學'
where id = '43000000-0000-0000-0000-000000000004';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '43100000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000001',
  'Report Loop Classroom', decode(repeat('f3', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '43100000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '43200000-0000-0000-0000-000000000001'
  ),
  (
    '43100000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '43200000-0000-0000-0000-000000000003'
  ),
  (
    '43100000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(), '43200000-0000-0000-0000-000000000004'
  );

create function pg_temp.as_user(target_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select set_config('request.jwt.claim.sub', target_user::text, true);
$$;

create function pg_temp.current_live_question(target_session uuid)
returns public.live_session_questions
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select question.*
  from public.live_session_questions question
  join public.live_sessions live_session
    on live_session.id = question.session_id
  where question.session_id = target_session
    and question."position" = live_session.current_position;
$$;

create function pg_temp.wrong_option_of(
  target_question public.live_session_questions
)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select (option_value ->> 'id')::uuid
  from jsonb_array_elements(target_question.public_options) option_value
  where (option_value ->> 'id')::uuid <> target_question.correct_option_id
  limit 1;
$$;

-- Plays a whole session: A answers correct, B answers wrong every round,
-- so the all-answered auto-close drives the state machine; then finalizes.
create function pg_temp.play_and_finalize(
  target_session uuid,
  host_user uuid,
  student_a uuid,
  student_b uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_record public.live_sessions;
  question_record public.live_session_questions;
begin
  loop
    select * into session_record
    from public.live_sessions where id = target_session;
    exit when session_record.state = 'question_feedback'
      and session_record.current_position >= session_record.question_count;

    perform pg_temp.as_user(host_user);
    if session_record.state = 'lobby' then
      perform public.open_live_question(
        target_session, session_record.state_version
      );
    else
      perform public.advance_live_session(
        target_session, session_record.state_version
      );
    end if;

    question_record := pg_temp.current_live_question(target_session);
    perform pg_temp.as_user(student_a);
    perform public.submit_live_answer(
      question_record.id, question_record.correct_option_id, gen_random_uuid()
    );
    perform pg_temp.as_user(student_b);
    perform public.submit_live_answer(
      question_record.id,
      pg_temp.wrong_option_of(question_record),
      gen_random_uuid()
    );
  end loop;

  select * into session_record
  from public.live_sessions where id = target_session;
  perform pg_temp.as_user(host_user);
  perform public.finalize_live_session(
    target_session, session_record.state_version
  );
end;
$$;

create function pg_temp.start_session(target_activity uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  created jsonb;
  session_id uuid;
begin
  perform pg_temp.as_user('43000000-0000-0000-0000-000000000001');
  created := public.create_live_session(
    target_activity, '43100000-0000-0000-0000-000000000001', null
  );
  session_id := (created ->> 'session_id')::uuid;
  perform public.start_live_session(session_id, 1);
  perform pg_temp.as_user('43000000-0000-0000-0000-000000000003');
  perform public.join_live_session(created ->> 'join_code', gen_random_uuid());
  perform pg_temp.as_user('43000000-0000-0000-0000-000000000004');
  perform public.join_live_session(created ->> 'join_code', gen_random_uuid());
  return session_id;
end;
$$;

set local role authenticated;
select pg_temp.as_user('43000000-0000-0000-0000-000000000001');

select set_config(
  'test.activity_id',
  public.create_live_activity(
    '報表閉環對戰', '26000000-0000-0000-0000-000000000003', 20
  )::jsonb ->> 'activity_id',
  true
);
select set_config(
  'test.session_id',
  pg_temp.start_session(current_setting('test.activity_id')::uuid)::text,
  true
);
select pg_temp.play_and_finalize(
  current_setting('test.session_id')::uuid,
  '43000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000003',
  '43000000-0000-0000-0000-000000000004'
);

select pg_temp.as_user('43000000-0000-0000-0000-000000000001');
select set_config(
  'test.detail',
  public.teacher_live_session_detail(
    current_setting('test.session_id')::uuid
  )::text,
  true
);

select is(
  current_setting('test.detail')::jsonb ->> 'classroom_id',
  '43100000-0000-0000-0000-000000000001',
  'the detail names the classroom for the one-click review assignment'
);
select is(
  current_setting('test.detail')::jsonb -> 'activity' ->> 'quiz_template_id',
  '26000000-0000-0000-0000-000000000003',
  'the detail names the quiz template behind the activity'
);
select is(
  jsonb_array_length(current_setting('test.detail')::jsonb -> 'participants'),
  2,
  'the matrix covers every active participant'
);

-- The matrix agrees with an independent per-question recount.
select is(
  (
    select bool_and(compared.matches)
    from (
      select
        (question_row ->> 'answered')::integer = matrix.answered
        and (question_row ->> 'correct')::integer = matrix.correct as matches
      from jsonb_array_elements(
        current_setting('test.detail')::jsonb -> 'questions'
      ) question_row
      join lateral (
        select
          count(*)::integer as answered,
          (count(*) filter (where entry ->> 'status' = 'correct'))::integer
            as correct
        from jsonb_array_elements(
          current_setting('test.detail')::jsonb -> 'participants'
        ) participant,
        jsonb_array_elements(participant -> 'answers') entry
        where (entry ->> 'position')::integer
          = (question_row ->> 'position')::integer
      ) matrix on true
    ) compared
  ),
  true,
  'the matrix and the per-question aggregate recount agree on every question'
);

select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      current_setting('test.detail')::jsonb -> 'participants'
    ) participant,
    jsonb_array_elements(participant -> 'answers') entry
    where participant ->> 'display_name' = '錯同學'
      and entry ->> 'status' = 'incorrect'
  ),
  (
    select question_count
    from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  'the wrong-every-time student shows a full incorrect row in the matrix'
);

-- Mistake book: every non-correct answer landed once, with a live origin.
reset role;
select is(
  (
    select count(*)::integer
    from public.mistake_items item
    where item.user_id = '43000000-0000-0000-0000-000000000004'
      and item.origin_live_answer_id is not null
      and item.origin_answer_id is null
      and item.status = 'open'
  ),
  (
    select question_count
    from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  'completing the session writes one open live-origin mistake per wrong question'
);
select is(
  (
    select count(*)::integer
    from public.mistake_items item
    where item.user_id = '43000000-0000-0000-0000-000000000003'
  ),
  0,
  'the all-correct student gets no mistake rows'
);

-- Idempotency and the reopen path: resolve everything, then re-fire the
-- completed transition so the very same wrong answers land again. (Each
-- session freezes a random subset of the template pool, so a second played
-- session would not deterministically revisit the same questions.)
update public.mistake_items
set status = 'resolved'
where user_id = '43000000-0000-0000-0000-000000000004';

update public.live_sessions
set state = 'question_feedback'
where id = current_setting('test.session_id')::uuid;
update public.live_sessions
set state = 'completed'
where id = current_setting('test.session_id')::uuid;

select is(
  (
    select count(*)::integer
    from public.mistake_items item
    where item.user_id = '43000000-0000-0000-0000-000000000004'
  ),
  (
    select question_count
    from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  'a replayed completed transition never duplicates mistake rows'
);
select is(
  (
    select bool_and(item.status = 'reopened')
    from public.mistake_items item
    where item.user_id = '43000000-0000-0000-0000-000000000004'
  ),
  true,
  'resolved mistakes reopen when the question is missed again live'
);

-- The matrix stays host-only.
set local role authenticated;
select pg_temp.as_user('43000000-0000-0000-0000-000000000003');
select throws_ok(
  format(
    $sql$select public.teacher_live_session_detail('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'students cannot read the session detail matrix'
);

select * from finish();

rollback;
