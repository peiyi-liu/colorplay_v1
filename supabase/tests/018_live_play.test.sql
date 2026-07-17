begin;

select plan(43);

select has_function('public', 'open_live_question', 'open live question exists');
select has_function('public', 'submit_live_answer', 'submit live answer exists');
select has_function('public', 'close_live_question', 'close live question exists');
select has_function(
  'public',
  'advance_live_session',
  'advance live session exists'
);
select has_function(
  'public',
  'finalize_live_session',
  'finalize live session exists'
);
select has_function('public', 'cancel_live_session', 'cancel live session exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '18000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'play.host@colorplay.test',
    crypt('LocalOnly-Play1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '18000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'play.student.a@colorplay.test',
    crypt('LocalOnly-Play3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '18000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'play.student.b@colorplay.test',
    crypt('LocalOnly-Play4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '18000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated', 'play.outsider@colorplay.test',
    crypt('LocalOnlyPlay5!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '18000000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '18100000-0000-0000-0000-000000000001',
  '18000000-0000-0000-0000-000000000001',
  'Play Classroom', decode(repeat('d1', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '18100000-0000-0000-0000-000000000001',
    '18000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '18200000-0000-0000-0000-000000000001'
  ),
  (
    '18100000-0000-0000-0000-000000000001',
    '18000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '18200000-0000-0000-0000-000000000003'
  ),
  (
    '18100000-0000-0000-0000-000000000001',
    '18000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(), '18200000-0000-0000-0000-000000000004'
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

create function pg_temp.play_remaining_rounds(
  target_session uuid,
  host_user uuid,
  student_a uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_record public.live_sessions;
  question_record public.live_session_questions;
  rounds integer := 0;
begin
  loop
    select * into session_record
    from public.live_sessions where id = target_session;
    exit when session_record.current_position >= session_record.question_count
      and session_record.state = 'question_feedback';

    perform pg_temp.as_user(host_user);
    perform public.advance_live_session(
      target_session, session_record.state_version
    );

    question_record := pg_temp.current_live_question(target_session);
    perform pg_temp.as_user(student_a);
    perform public.submit_live_answer(
      question_record.id,
      question_record.correct_option_id,
      gen_random_uuid()
    );

    select * into session_record
    from public.live_sessions where id = target_session;
    perform pg_temp.as_user(host_user);
    perform public.close_live_question(
      target_session, session_record.state_version
    );
    rounds := rounds + 1;
  end loop;
  return rounds;
end;
$$;

set local role authenticated;
select pg_temp.as_user('18000000-0000-0000-0000-000000000001');

select set_config(
  'test.activity',
  public.create_live_activity(
    'Play 對戰', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);
select set_config(
  'test.assignment',
  public.create_assignment(
    '18100000-0000-0000-0000-000000000001',
    'Live 對戰作業',
    'live_activity',
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    null, null, null, 600
  )::text,
  true
);
select is(
  current_setting('test.assignment')::jsonb ->> 'status',
  'draft',
  'live assignments can now be created'
);
select set_config(
  'test.assignment_id',
  current_setting('test.assignment')::jsonb ->> 'assignment_id',
  true
);
select set_config(
  'test.assignment_published',
  public.update_assignment_status(
    current_setting('test.assignment_id')::uuid, 'published', null
  )::text,
  true
);

select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '18100000-0000-0000-0000-000000000001',
    current_setting('test.assignment_id')::uuid
  )::text,
  true
);
select set_config(
  'test.session_id',
  current_setting('test.session')::jsonb ->> 'session_id',
  true
);
select set_config(
  'test.code',
  current_setting('test.session')::jsonb ->> 'join_code',
  true
);
select set_config(
  'test.started',
  public.start_live_session(current_setting('test.session_id')::uuid, 1)::text,
  true
);

select pg_temp.as_user('18000000-0000-0000-0000-000000000003');
select set_config(
  'test.join_a',
  public.join_live_session(
    current_setting('test.code'), '18300000-0000-0000-0000-000000000001'
  )::text,
  true
);
select pg_temp.as_user('18000000-0000-0000-0000-000000000004');
select set_config(
  'test.join_b',
  public.join_live_session(
    current_setting('test.code'), '18300000-0000-0000-0000-000000000002'
  )::text,
  true
);

select pg_temp.as_user('18000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select public.open_live_question(
    current_setting('test.session_id')::uuid, 2
  )$$,
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'students cannot open questions'
);

select pg_temp.as_user('18000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.finalize_live_session(
    current_setting('test.session_id')::uuid, 2
  )$$,
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'a lobby session cannot finalize'
);
select set_config(
  'test.q1_open',
  public.open_live_question(
    current_setting('test.session_id')::uuid, 2
  )::text,
  true
);
select is(
  current_setting('test.q1_open')::jsonb ->> 'state',
  'question_open',
  'opening moves the session to question_open'
);
select ok(
  position('correct_option_id' in current_setting('test.q1_open')) = 0,
  'the open payload hides the correct option'
);
select throws_ok(
  $$select public.open_live_question(
    current_setting('test.session_id')::uuid, 2
  )$$,
  'P0001',
  'LIVE_STATE_CONFLICT',
  'a duplicate host tab cannot reopen with a stale version'
);

select set_config(
  'test.q1',
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id::text,
  true
);
select set_config(
  'test.q1_correct',
  (
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ).correct_option_id::text,
  true
);

select pg_temp.as_user('18000000-0000-0000-0000-000000000003');
select set_config(
  'test.answer_a',
  public.submit_live_answer(
    current_setting('test.q1')::uuid,
    current_setting('test.q1_correct')::uuid,
    '18400000-0000-0000-0000-000000000001'
  )::text,
  true
);
select is(
  (current_setting('test.answer_a')::jsonb ->> 'recorded')::boolean,
  true,
  'a live answer is recorded'
);
select ok(
  position('answer_status' in current_setting('test.answer_a')) = 0
  and position('correct' in current_setting('test.answer_a')) = 0,
  'the submit payload never reveals correctness before close'
);
select is(
  public.submit_live_answer(
    current_setting('test.q1')::uuid,
    current_setting('test.q1_correct')::uuid,
    '18400000-0000-0000-0000-000000000001'
  )::text,
  current_setting('test.answer_a'),
  'the same idempotency key returns the original result'
);
select throws_ok(
  format(
    $$select public.submit_live_answer(
      %L, %L, '18400000-0000-0000-0000-000000000099'
    )$$,
    current_setting('test.q1'),
    current_setting('test.q1_correct')
  ),
  'P0001',
  'LIVE_ANSWER_ALREADY_SUBMITTED',
  'a different key cannot overwrite the authoritative answer'
);
select is(
  (
    select count(*)::integer
    from public.live_answers
    where session_question_id = current_setting('test.q1')::uuid
  ),
  1,
  'exactly one authoritative answer exists for the participant'
);

select pg_temp.as_user('18000000-0000-0000-0000-000000000004');
select throws_ok(
  format(
    $$select public.submit_live_answer(
      %L, '18999999-0000-0000-0000-000000000001',
      '18400000-0000-0000-0000-000000000002'
    )$$,
    current_setting('test.q1')
  ),
  'P0001',
  'LIVE_INVALID_OPTION',
  'an option outside the frozen set is rejected'
);
select set_config(
  'test.answer_b',
  public.submit_live_answer(
    current_setting('test.q1')::uuid,
    pg_temp.wrong_option_of(
      pg_temp.current_live_question(current_setting('test.session_id')::uuid)
    ),
    '18400000-0000-0000-0000-000000000003'
  )::text,
  true
);

select pg_temp.as_user('18000000-0000-0000-0000-000000000005');
select throws_ok(
  format(
    $$select public.submit_live_answer(
      %L, %L, '18400000-0000-0000-0000-000000000004'
    )$$,
    current_setting('test.q1'),
    current_setting('test.q1_correct')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'an outsider cannot answer'
);

select pg_temp.as_user('18000000-0000-0000-0000-000000000001');
select set_config(
  'test.q1_closed',
  public.close_live_question(
    current_setting('test.session_id')::uuid,
    (current_setting('test.q1_open')::jsonb ->> 'state_version')::integer
  )::text,
  true
);
select is(
  current_setting('test.q1_closed')::jsonb ->> 'state',
  'question_feedback',
  'closing moves the session to feedback'
);
select is(
  current_setting('test.q1_closed')::jsonb ->> 'correct_option_id',
  current_setting('test.q1_correct'),
  'feedback reveals the correct option'
);
select is(
  (
    select score
    from public.live_participants
    where session_id = current_setting('test.session_id')::uuid
      and user_id = '18000000-0000-0000-0000-000000000003'
  ),
  150,
  'a fast correct answer scores 150'
);
select is(
  (
    select score
    from public.live_participants
    where session_id = current_setting('test.session_id')::uuid
      and user_id = '18000000-0000-0000-0000-000000000004'
  ),
  0,
  'a wrong answer scores zero'
);

select is(
  pg_temp.play_remaining_rounds(
    current_setting('test.session_id')::uuid,
    '18000000-0000-0000-0000-000000000001',
    '18000000-0000-0000-0000-000000000003'
  ),
  9,
  'the host advances through the remaining nine questions'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.live_answers answer
    join public.live_session_questions question
      on question.id = answer.session_question_id
    join public.live_participants participant
      on participant.id = answer.participant_id
    where question.session_id = current_setting('test.session_id')::uuid
      and participant.user_id = '18000000-0000-0000-0000-000000000004'
      and answer.answer_status = 'timeout'
  ),
  9,
  'closing writes timeout answers for silent participants'
);

create function public.fail_wallet_update_once()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = 'INJECTED_WALLET_FAULT';
end;
$$;
create trigger inject_wallet_fault
before update on public.wallets
for each row
execute function public.fail_wallet_update_once();
set local role authenticated;
select pg_temp.as_user('18000000-0000-0000-0000-000000000001');

select set_config(
  'test.final_version',
  (
    select state_version::text
    from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  true
);
select throws_ok(
  format(
    $$select public.finalize_live_session(%L, %s)$$,
    current_setting('test.session_id'),
    current_setting('test.final_version')
  ),
  'P0001',
  'INJECTED_WALLET_FAULT',
  'an injected mid-transaction fault aborts finalize'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.xp_transactions
    where source_type = 'live'
      and source_id = current_setting('test.session_id')::uuid
  ),
  0,
  'a failed finalize leaves no partial XP rows'
);
select is(
  (
    select state::text
    from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  'question_feedback',
  'a failed finalize leaves the state untouched'
);

reset role;
drop trigger inject_wallet_fault on public.wallets;
drop function public.fail_wallet_update_once();
set local role authenticated;
select pg_temp.as_user('18000000-0000-0000-0000-000000000001');

select set_config(
  'test.finalized',
  public.finalize_live_session(
    current_setting('test.session_id')::uuid,
    current_setting('test.final_version')::integer
  )::text,
  true
);
select is(
  current_setting('test.finalized')::jsonb ->> 'state',
  'completed',
  'the retried finalize completes the session'
);
select is(
  current_setting('test.finalized')::jsonb #>> '{podium,0,rank}',
  '1',
  'the podium ranks the strongest participant first'
);
select is(
  (
    select final_rank
    from public.live_participants
    where session_id = current_setting('test.session_id')::uuid
      and user_id = '18000000-0000-0000-0000-000000000003'
  ),
  1,
  'the perfect participant ranks first'
);
reset role;
select is(
  (
    select amount
    from public.xp_transactions
    where source_type = 'live'
      and source_id = current_setting('test.session_id')::uuid
      and user_id = '18000000-0000-0000-0000-000000000003'
  ),
  750,
  'ten fast correct answers award 750 live XP'
);
select is(
  (
    select amount
    from public.wallet_transactions
    where source_type = 'live'
      and source_id = current_setting('test.session_id')::uuid
      and user_id = '18000000-0000-0000-0000-000000000003'
  ),
  250,
  'ten fast correct answers award 250 live Token'
);
select is(
  (
    select count(*)::integer
    from public.xp_transactions
    where source_type = 'live'
      and source_id = current_setting('test.session_id')::uuid
      and user_id = '18000000-0000-0000-0000-000000000004'
  ),
  0,
  'a zero-score participant receives no live XP row'
);
select is(
  (
    select token_balance
    from public.wallets
    where user_id = '18000000-0000-0000-0000-000000000003'
  ),
  (
    select coalesce(sum(amount), 0)::integer
    from public.wallet_transactions
    where user_id = '18000000-0000-0000-0000-000000000003'
  ),
  'the wallet cache reconciles to the ledger after live rewards'
);
set local role authenticated;
select pg_temp.as_user('18000000-0000-0000-0000-000000000001');
select is(
  public.finalize_live_session(
    current_setting('test.session_id')::uuid,
    current_setting('test.final_version')::integer
  )::text,
  current_setting('test.finalized'),
  'replayed finalize returns the stored result'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.xp_transactions
    where source_type = 'live'
      and source_id = current_setting('test.session_id')::uuid
  ),
  1,
  'replayed finalize never duplicates reward rows'
);
select is(
  (
    select count(*)::integer
    from public.assignment_attempts
    where assignment_id = current_setting('test.assignment_id')::uuid
      and live_session_id = current_setting('test.session_id')::uuid
  ),
  2,
  'a linked assignment derives one attempt per participant'
);
select is(
  (
    select passed
    from public.assignment_attempts
    where assignment_id = current_setting('test.assignment_id')::uuid
      and user_id = '18000000-0000-0000-0000-000000000003'
  ),
  true,
  'a 1500-point live run passes the 600-point rule'
);
select is(
  (
    select passed
    from public.assignment_attempts
    where assignment_id = current_setting('test.assignment_id')::uuid
      and user_id = '18000000-0000-0000-0000-000000000004'
  ),
  false,
  'a zero-point live run fails the passing rule'
);
select pass(
  'mastery tables arrive in a later phase; live finalize writes none'
);

set local role authenticated;
select pg_temp.as_user('18000000-0000-0000-0000-000000000001');
select set_config(
  'test.cancel_session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '18100000-0000-0000-0000-000000000001',
    null
  )::text,
  true
);
select is(
  public.cancel_live_session(
    (current_setting('test.cancel_session')::jsonb ->> 'session_id')::uuid,
    1
  ) ->> 'state',
  'cancelled',
  'a draft session can cancel'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.xp_transactions
    where source_type = 'live'
      and source_id =
        (current_setting('test.cancel_session')::jsonb ->> 'session_id')::uuid
  ),
  0,
  'cancelled sessions never mint rewards'
);

reset role;
select * from finish();
rollback;
