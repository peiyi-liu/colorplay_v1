begin;

select plan(15);

select has_function('public', 'live_team_totals', 'team totals read exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  ('33000000-0000-0000-0000-00000000000' || seed.n)::uuid,
  'authenticated', 'authenticated',
  'teams.user.' || seed.n || '@colorplay.test',
  crypt('LocalOnly-Teams' || seed.n || '!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from generate_series(1, 6) seed(n);

update public.profiles
set role = 'teacher'
where id = '33000000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '33100000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  'Teams Classroom', decode(repeat('b3', 32), 'hex'), 1, now(), 'active'
);
insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
select
  '33100000-0000-0000-0000-000000000001',
  ('33000000-0000-0000-0000-00000000000' || seed.n)::uuid,
  (
    case when seed.n = 1 then 'teacher' else 'student' end
  )::public.classroom_member_role,
  'active', now(), now(),
  ('33200000-0000-0000-0000-00000000000' || seed.n)::uuid
from generate_series(1, 5) seed(n);

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

create function pg_temp.team_of(target_session uuid, target_user uuid)
returns integer
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select participant.team_number
  from public.live_participants participant
  where participant.session_id = target_session
    and participant.user_id = target_user;
$$;

create function pg_temp.expected_totals(target_session uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_agg(
    jsonb_build_object(
      'team_number', grouped.team_number,
      'score', grouped.total_score,
      'member_count', grouped.member_count
    ) order by grouped.total_score desc, grouped.team_number
  )
  from (
    select
      participant.team_number,
      sum(participant.score)::integer as total_score,
      count(*)::integer as member_count
    from public.live_participants participant
    where participant.session_id = target_session
      and participant.status = 'active'
    group by participant.team_number
  ) grouped;
$$;

create function pg_temp.play_team_round(
  target_session uuid,
  host_user uuid,
  first_open boolean
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
  select * into session_record
  from public.live_sessions where id = target_session;
  perform pg_temp.as_user(host_user);
  if first_open then
    perform public.open_live_question(
      target_session, session_record.state_version
    );
  else
    perform public.advance_live_session(
      target_session, session_record.state_version
    );
  end if;

  question_record := pg_temp.current_live_question(target_session);
  perform pg_temp.as_user('33000000-0000-0000-0000-000000000002');
  perform public.submit_live_answer(
    question_record.id, question_record.correct_option_id, gen_random_uuid()
  );
  perform pg_temp.as_user('33000000-0000-0000-0000-000000000003');
  perform public.submit_live_answer(
    question_record.id,
    pg_temp.wrong_option_of(question_record),
    gen_random_uuid()
  );
  perform pg_temp.as_user('33000000-0000-0000-0000-000000000004');
  perform public.submit_live_answer(
    question_record.id, question_record.correct_option_id, gen_random_uuid()
  );

  select * into session_record
  from public.live_sessions where id = target_session;
  perform pg_temp.as_user(host_user);
  perform public.close_live_question(
    target_session, session_record.state_version
  );
end;
$$;

set local role authenticated;
select pg_temp.as_user('33000000-0000-0000-0000-000000000001');

select set_config(
  'test.activity',
  public.create_live_activity(
    'Teams 對戰', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);

select throws_ok(
  format(
    $sql$select public.create_live_session(
      '%s', '33100000-0000-0000-0000-000000000001', null, 'battle', 2
    )$sql$,
    current_setting('test.activity')::jsonb ->> 'activity_id'
  ),
  'P0001',
  'LIVE_MODE_INVALID',
  'unknown modes are rejected'
);
select throws_ok(
  format(
    $sql$select public.create_live_session(
      '%s', '33100000-0000-0000-0000-000000000001', null, 'team', 5
    )$sql$,
    current_setting('test.activity')::jsonb ->> 'activity_id'
  ),
  'P0001',
  'LIVE_TEAM_COUNT_INVALID',
  'team counts outside 2-4 are rejected'
);

-- Individual stays the default shape.
select set_config(
  'test.solo',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '33100000-0000-0000-0000-000000000001'
  )::text,
  true
);

select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '33100000-0000-0000-0000-000000000001',
    null,
    'team',
    2
  )::text,
  true
);
select set_config(
  'test.session_id',
  current_setting('test.session')::jsonb ->> 'session_id',
  true
);

reset role;
select is(
  (
    select session.mode || '/' || coalesce(session.team_count::text, 'none')
    from public.live_sessions session
    where session.id
      = (current_setting('test.solo')::jsonb ->> 'session_id')::uuid
  ),
  'individual/none',
  'sessions default to individual mode without a team count'
);

set local role authenticated;
select pg_temp.as_user('33000000-0000-0000-0000-000000000001');
select set_config(
  'test.started',
  public.start_live_session(current_setting('test.session_id')::uuid, 1)::text,
  true
);

select pg_temp.as_user('33000000-0000-0000-0000-000000000002');
select lives_ok(
  format(
    $sql$select public.join_live_session('%s', gen_random_uuid())$sql$,
    current_setting('test.session')::jsonb ->> 'join_code'
  ),
  'student one joins the team session'
);
select pg_temp.as_user('33000000-0000-0000-0000-000000000003');
select lives_ok(
  format(
    $sql$select public.join_live_session('%s', gen_random_uuid())$sql$,
    current_setting('test.session')::jsonb ->> 'join_code'
  ),
  'student two joins the team session'
);
select pg_temp.as_user('33000000-0000-0000-0000-000000000004');
select lives_ok(
  format(
    $sql$select public.join_live_session('%s', gen_random_uuid())$sql$,
    current_setting('test.session')::jsonb ->> 'join_code'
  ),
  'student three joins the team session'
);

select is(
  array[
    pg_temp.team_of(
      current_setting('test.session_id')::uuid,
      '33000000-0000-0000-0000-000000000002'
    ),
    pg_temp.team_of(
      current_setting('test.session_id')::uuid,
      '33000000-0000-0000-0000-000000000003'
    ),
    pg_temp.team_of(
      current_setting('test.session_id')::uuid,
      '33000000-0000-0000-0000-000000000004'
    )
  ],
  array[1, 2, 1],
  'joins are assigned round-robin to the smallest team'
);

-- Totals are hidden until feedback.
select throws_ok(
  format(
    $sql$select public.live_team_totals('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'team totals stay hidden before feedback'
);

select pg_temp.play_team_round(
  current_setting('test.session_id')::uuid,
  '33000000-0000-0000-0000-000000000001',
  true
);

select pg_temp.as_user('33000000-0000-0000-0000-000000000003');
select is(
  public.live_team_totals(current_setting('test.session_id')::uuid),
  pg_temp.expected_totals(current_setting('test.session_id')::uuid),
  'team totals equal the independently recomputed sums'
);
select ok(
  (
    public.live_team_totals(current_setting('test.session_id')::uuid)
      -> 0 ->> 'score'
  )::integer = 300,
  'the leading team sums both fast correct answers'
);

select pg_temp.as_user('33000000-0000-0000-0000-000000000005');
select throws_ok(
  format(
    $sql$select public.live_team_totals('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'non-participants cannot read team totals'
);
select pg_temp.as_user('33000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $sql$select public.live_team_totals('%s')$sql$,
    current_setting('test.solo')::jsonb ->> 'session_id'
  ),
  'P0001',
  'LIVE_MODE_INVALID',
  'individual sessions expose no team totals'
);

-- Finish the session; team mode must not change individual rewards.
select pg_temp.play_team_round(
  current_setting('test.session_id')::uuid,
  '33000000-0000-0000-0000-000000000001',
  false
) from generate_series(2, 10);

select pg_temp.as_user('33000000-0000-0000-0000-000000000001');
select lives_ok(
  format(
    $sql$select public.finalize_live_session('%s', (
      select session.state_version from public.live_sessions session
      where session.id = '%s'
    ))$sql$,
    current_setting('test.session_id'),
    current_setting('test.session_id')
  ),
  'the team session finalizes atomically'
);

reset role;
select is(
  (
    select ledger.amount
    from public.xp_transactions ledger
    where ledger.user_id = '33000000-0000-0000-0000-000000000002'
      and ledger.source_type = 'live'
      and ledger.source_id = current_setting('test.session_id')::uuid
  ),
  750,
  'individual live rewards are untouched by team mode'
);

select * from finish();
rollback;
