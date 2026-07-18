begin;

select plan(27);

select has_function(
  'public', 'live_question_distribution', 'distribution read exists'
);
select has_function(
  'public', 'teacher_live_session_detail', 'session detail read exists'
);
select has_function(
  'public', 'schedule_live_activity', 'schedule command exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  ('34000000-0000-0000-0000-00000000000' || seed.n)::uuid,
  'authenticated', 'authenticated',
  'insights.user.' || seed.n || '@colorplay.test',
  crypt('LocalOnly-Insights' || seed.n || '!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from generate_series(1, 4) seed(n);

update public.profiles
set role = 'teacher'
where id in (
  '34000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000004'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '34100000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  'Insights Classroom', decode(repeat('c4', 32), 'hex'), 1, now(), 'active'
);
insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
select
  '34100000-0000-0000-0000-000000000001',
  ('34000000-0000-0000-0000-00000000000' || seed.n)::uuid,
  (
    case when seed.n = 1 then 'teacher' else 'student' end
  )::public.classroom_member_role,
  'active', now(), now(),
  ('34200000-0000-0000-0000-00000000000' || seed.n)::uuid
from generate_series(1, 3) seed(n);

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
    and live_session.current_position = question."position";
$$;

create function pg_temp.wrong_option_of(target_question public.live_session_questions)
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

create function pg_temp.streak_of(target_session uuid, target_user uuid)
returns integer
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select participant.current_streak
  from public.live_participants participant
  where participant.session_id = target_session
    and participant.user_id = target_user;
$$;

create function pg_temp.expected_distribution(target_session uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'answered_count', (
      select count(*)
      from public.live_answers answer
      join public.live_session_questions question
        on question.id = answer.session_question_id
      join public.live_sessions live_session
        on live_session.id = question.session_id
      where question.session_id = target_session
        and question."position" = live_session.current_position
    ),
    'options', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'option_id', counted.selected_option_id,
            'count', counted.answer_count
          ) order by counted.selected_option_id
        ),
        '[]'::jsonb
      )
      from (
        select answer.selected_option_id, count(*) as answer_count
        from public.live_answers answer
        join public.live_session_questions question
          on question.id = answer.session_question_id
        join public.live_sessions live_session
          on live_session.id = question.session_id
        where question.session_id = target_session
          and question."position" = live_session.current_position
        group by answer.selected_option_id
      ) counted
    )
  );
$$;

create function pg_temp.host_close(target_session uuid, host_user uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_record public.live_sessions;
begin
  select * into session_record
  from public.live_sessions where id = target_session;
  perform pg_temp.as_user(host_user);
  perform public.close_live_question(
    target_session, session_record.state_version
  );
end;
$$;

create function pg_temp.host_advance(target_session uuid, host_user uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_record public.live_sessions;
begin
  select * into session_record
  from public.live_sessions where id = target_session;
  perform pg_temp.as_user(host_user);
  perform public.advance_live_session(
    target_session, session_record.state_version
  );
end;
$$;

create function pg_temp.answer_as(
  target_session uuid,
  target_user uuid,
  answer_correct boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  question_record public.live_session_questions;
begin
  question_record := pg_temp.current_live_question(target_session);
  perform pg_temp.as_user(target_user);
  return public.submit_live_answer(
    question_record.id,
    case
      when answer_correct then question_record.correct_option_id
      else pg_temp.wrong_option_of(question_record)
    end,
    gen_random_uuid()
  );
end;
$$;

set local role authenticated;

-- Reduced motion is a server-backed preference on the own profile only.
select pg_temp.as_user('34000000-0000-0000-0000-000000000002');
update public.profiles
set reduced_motion = true
where id = '34000000-0000-0000-0000-000000000002';
select is(
  (
    select reduced_motion from public.profiles
    where id = '34000000-0000-0000-0000-000000000002'
  ),
  true,
  'students can turn on their own reduced motion'
);
update public.profiles
set reduced_motion = true
where id = '34000000-0000-0000-0000-000000000003';
reset role;
select is(
  (
    select reduced_motion from public.profiles
    where id = '34000000-0000-0000-0000-000000000003'
  ),
  false,
  'nobody can flip reduced motion for someone else'
);

set local role authenticated;
select pg_temp.as_user('34000000-0000-0000-0000-000000000001');
select set_config(
  'test.activity',
  public.create_live_activity(
    'Insights 對戰', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);
select set_config(
  'test.activity_id',
  current_setting('test.activity')::jsonb ->> 'activity_id',
  true
);

-- Scheduling is host-only, set and clear.
select lives_ok(
  format(
    $sql$select public.schedule_live_activity(
      '%s', '2026-07-25T04:00:00+00:00'
    )$sql$,
    current_setting('test.activity_id')
  ),
  'the owner schedules an activity'
);
select is(
  (
    select activity.scheduled_for
    from public.live_activities activity
    where activity.id = current_setting('test.activity_id')::uuid
  ),
  '2026-07-25T04:00:00+00:00'::timestamptz,
  'the scheduled time is stored'
);
select pg_temp.as_user('34000000-0000-0000-0000-000000000004');
select throws_ok(
  format(
    $sql$select public.schedule_live_activity(
      '%s', '2026-07-26T04:00:00+00:00'
    )$sql$,
    current_setting('test.activity_id')
  ),
  'P0001',
  'LIVE_ACTIVITY_NOT_FOUND',
  'another teacher cannot schedule the activity'
);
select pg_temp.as_user('34000000-0000-0000-0000-000000000001');
select lives_ok(
  format(
    $sql$select public.schedule_live_activity('%s', null)$sql$,
    current_setting('test.activity_id')
  ),
  'the owner clears the schedule'
);

select set_config(
  'test.session',
  public.create_live_session(
    current_setting('test.activity_id')::uuid,
    '34100000-0000-0000-0000-000000000001'
  )::text,
  true
);
select set_config(
  'test.session_id',
  current_setting('test.session')::jsonb ->> 'session_id',
  true
);
select set_config(
  'test.started',
  public.start_live_session(current_setting('test.session_id')::uuid, 1)::text,
  true
);
select pg_temp.as_user('34000000-0000-0000-0000-000000000002');
select set_config(
  'test.join_a',
  public.join_live_session(
    current_setting('test.session')::jsonb ->> 'join_code',
    gen_random_uuid()
  )::text,
  true
);
select pg_temp.as_user('34000000-0000-0000-0000-000000000003');
select set_config(
  'test.join_b',
  public.join_live_session(
    current_setting('test.session')::jsonb ->> 'join_code',
    gen_random_uuid()
  )::text,
  true
);

select pg_temp.as_user('34000000-0000-0000-0000-000000000001');
select set_config(
  'test.opened',
  public.open_live_question(
    current_setting('test.session_id')::uuid,
    (current_setting('test.started')::jsonb ->> 'state_version')::integer
  )::text,
  true
);

select is(
  (
    public.live_question_distribution(current_setting('test.session_id')::uuid)
      ->> 'answered_count'
  )::integer,
  0,
  'the distribution starts empty'
);

-- Round 1: A correct (streak 1), B wrong (streak 0).
select is(
  (
    pg_temp.answer_as(
      current_setting('test.session_id')::uuid,
      '34000000-0000-0000-0000-000000000002',
      true
    ) ->> 'streak'
  )::integer,
  1,
  'a correct answer starts the streak'
);
select is(
  (
    pg_temp.answer_as(
      current_setting('test.session_id')::uuid,
      '34000000-0000-0000-0000-000000000003',
      false
    ) ->> 'streak'
  )::integer,
  0,
  'a wrong answer keeps the streak at zero'
);

select pg_temp.as_user('34000000-0000-0000-0000-000000000001');
select is(
  public.live_question_distribution(current_setting('test.session_id')::uuid),
  pg_temp.expected_distribution(current_setting('test.session_id')::uuid),
  'the host distribution matches the recomputed counts'
);
select pg_temp.as_user('34000000-0000-0000-0000-000000000002');
select throws_ok(
  format(
    $sql$select public.live_question_distribution('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'students cannot read the during-open distribution'
);
select pg_temp.as_user('34000000-0000-0000-0000-000000000004');
select throws_ok(
  format(
    $sql$select public.live_question_distribution('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'another teacher cannot read the distribution'
);

select pg_temp.host_close(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000001'
);

-- Detail reports only exist after finalize.
select pg_temp.as_user('34000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $sql$select public.teacher_live_session_detail('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'the detail report stays hidden before completion'
);

-- Round 2: A correct again (streak 2), B correct (streak 1).
select pg_temp.host_advance(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000001'
);
select is(
  (
    pg_temp.answer_as(
      current_setting('test.session_id')::uuid,
      '34000000-0000-0000-0000-000000000002',
      true
    ) ->> 'streak'
  )::integer,
  2,
  'consecutive correct answers grow the streak'
);
select is(
  (
    pg_temp.answer_as(
      current_setting('test.session_id')::uuid,
      '34000000-0000-0000-0000-000000000003',
      true
    ) ->> 'streak'
  )::integer,
  1,
  'recovering with a correct answer restarts the streak'
);
select pg_temp.host_close(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000001'
);

-- Round 3: A wrong resets to zero; B times out and resets at close.
select pg_temp.host_advance(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000001'
);
select is(
  (
    pg_temp.answer_as(
      current_setting('test.session_id')::uuid,
      '34000000-0000-0000-0000-000000000002',
      false
    ) ->> 'streak'
  )::integer,
  0,
  'a wrong answer resets the streak'
);
select pg_temp.host_close(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000001'
);
select is(
  pg_temp.streak_of(
    current_setting('test.session_id')::uuid,
    '34000000-0000-0000-0000-000000000003'
  ),
  0,
  'a timeout resets the streak at close'
);

-- Play out the rest and finalize.
select pg_temp.host_advance(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000001'
), pg_temp.answer_as(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000002',
  true
), pg_temp.answer_as(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000003',
  true
), pg_temp.host_close(
  current_setting('test.session_id')::uuid,
  '34000000-0000-0000-0000-000000000001'
)
from generate_series(4, 10);

select pg_temp.as_user('34000000-0000-0000-0000-000000000001');
select lives_ok(
  format(
    $sql$select public.finalize_live_session('%s', (
      select session.state_version from public.live_sessions session
      where session.id = '%s'
    ))$sql$,
    current_setting('test.session_id'),
    current_setting('test.session_id')
  ),
  'the session finalizes'
);

select set_config(
  'test.detail',
  public.teacher_live_session_detail(
    current_setting('test.session_id')::uuid
  )::text,
  true
);
select is(
  jsonb_array_length(current_setting('test.detail')::jsonb -> 'questions'),
  10,
  'the detail report covers every question'
);
select is(
  (
    select jsonb_build_object(
      'answered', (entry.value ->> 'answered')::integer,
      'correct', (entry.value ->> 'correct')::integer,
      'correct_rate', (entry.value ->> 'correct_rate')::numeric
    )
    from jsonb_array_elements(
      current_setting('test.detail')::jsonb -> 'questions'
    ) entry(value)
    where (entry.value ->> 'position')::integer = 1
  ),
  jsonb_build_object(
    'answered', 2, 'correct', 1, 'correct_rate', 50.0
  ),
  'question rows match the recorded answers'
);
select ok(
  current_setting('test.detail') !~ '@colorplay.test',
  'the detail report never leaks emails'
);
select is(
  jsonb_array_length(current_setting('test.detail')::jsonb -> 'ranking'),
  2,
  'the ranking lists every participant'
);

select pg_temp.as_user('34000000-0000-0000-0000-000000000002');
select throws_ok(
  format(
    $sql$select public.teacher_live_session_detail('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'students cannot read the detail report'
);
select pg_temp.as_user('34000000-0000-0000-0000-000000000004');
select throws_ok(
  format(
    $sql$select public.teacher_live_session_detail('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'another teacher cannot read the detail report'
);

reset role;
select * from finish();
rollback;
