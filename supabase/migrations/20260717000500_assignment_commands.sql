create or replace function public.build_assignment_attempt_payload(target_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'attempt_id', attempt.id,
    'assignment_id', attempt.assignment_id,
    'attempt_number', attempt.attempt_number,
    'status', attempt.status,
    'passed', attempt.passed,
    'completed_at', attempt.completed_at
  )
  from public.assignment_attempts attempt
  where attempt.id = target_attempt_id;
$$;

revoke all on function public.build_assignment_attempt_payload(uuid)
from public, anon, authenticated;

create function public.create_assignment(
  p_classroom_id uuid,
  p_title text,
  p_activity_type public.assignment_activity_type,
  p_activity_reference uuid,
  p_available_from timestamptz,
  p_deadline_at timestamptz,
  p_attempt_limit integer,
  p_passing_threshold integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  assignment_record public.assignments;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = current_user_id
      and classroom.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'CLASSROOM_NOT_FOUND';
  end if;

  if p_passing_threshold is null or p_passing_threshold < 0 then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_INVALID_PASSING_RULE';
  end if;

  if p_activity_type = 'live_activity' then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_LIVE_ACTIVITY_UNAVAILABLE';
  end if;

  if not exists (
    select 1
    from public.quiz_templates template
    where template.id = p_activity_reference
      and template.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_TEMPLATE_NOT_FOUND';
  end if;

  insert into public.assignments (
    classroom_id, owner_teacher_id, title, activity_type, quiz_template_id,
    available_from, deadline_at, attempt_limit, passing_rule, status
  ) values (
    p_classroom_id, current_user_id, p_title, p_activity_type,
    p_activity_reference, p_available_from, p_deadline_at, p_attempt_limit,
    jsonb_build_object(
      'rule', 'score_at_least',
      'threshold', p_passing_threshold::text
    ),
    'draft'
  )
  returning * into assignment_record;

  return jsonb_build_object(
    'assignment_id', assignment_record.id,
    'classroom_id', assignment_record.classroom_id,
    'title', assignment_record.title,
    'activity_type', assignment_record.activity_type,
    'status', assignment_record.status,
    'available_from', assignment_record.available_from,
    'deadline_at', assignment_record.deadline_at,
    'attempt_limit', assignment_record.attempt_limit,
    'passing_threshold', (assignment_record.passing_rule ->> 'threshold')::integer,
    'created_at', assignment_record.created_at,
    'updated_at', assignment_record.updated_at
  );
end;
$$;

create function public.update_assignment_status(
  p_assignment_id uuid,
  p_status public.assignment_status,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  assignment_record public.assignments;
  transition_allowed boolean;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select assignment.*
  into assignment_record
  from public.assignments assignment
  where assignment.id = p_assignment_id
    and assignment.owner_teacher_id = current_user_id
  for update;

  if assignment_record.id is null then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;

  if p_expected_updated_at is not null
    and p_expected_updated_at <> assignment_record.updated_at then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_STATUS_CONFLICT';
  end if;

  transition_allowed := (
    assignment_record.status = 'draft'
    and p_status in ('published', 'archived')
  ) or (
    assignment_record.status = 'published'
    and p_status in ('paused', 'archived')
  ) or (
    assignment_record.status = 'paused'
    and p_status in ('published', 'archived')
  );

  if not transition_allowed then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_STATUS_INVALID_TRANSITION';
  end if;

  if p_status = 'published' then
    insert into public.assignment_targets (assignment_id, user_id)
    select assignment_record.id, member.user_id
    from public.classroom_members member
    where member.classroom_id = assignment_record.classroom_id
      and member.member_role = 'student'
      and member.status = 'active'
    on conflict (assignment_id, user_id) do nothing;
  end if;

  update public.assignments
  set status = p_status,
      updated_at = clock_timestamp()
  where id = assignment_record.id
  returning * into assignment_record;

  return jsonb_build_object(
    'assignment_id', assignment_record.id,
    'status', assignment_record.status,
    'updated_at', assignment_record.updated_at
  );
end;
$$;

create function public.list_classroom_assignments(p_classroom_id uuid)
returns table (
  assignment_id uuid,
  title text,
  activity_type public.assignment_activity_type,
  status public.assignment_status,
  available_from timestamptz,
  deadline_at timestamptz,
  attempt_limit integer,
  passing_threshold integer,
  target_count bigint,
  completed_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = auth.uid()
  ) then
    raise exception using errcode = 'P0001', message = 'CLASSROOM_NOT_FOUND';
  end if;

  return query
  select
    assignment.id,
    assignment.title,
    assignment.activity_type,
    assignment.status,
    assignment.available_from,
    assignment.deadline_at,
    assignment.attempt_limit,
    (assignment.passing_rule ->> 'threshold')::integer,
    (
      select count(*)
      from public.assignment_targets target
      where target.assignment_id = assignment.id
    ),
    (
      select count(*)
      from public.assignment_attempts attempt
      where attempt.assignment_id = assignment.id
        and attempt.status = 'completed'
    ),
    assignment.created_at,
    assignment.updated_at
  from public.assignments assignment
  where assignment.classroom_id = p_classroom_id
  order by assignment.created_at desc;
end;
$$;

create function public.list_my_assignments()
returns table (
  assignment_id uuid,
  classroom_id uuid,
  classroom_name text,
  title text,
  status public.assignment_status,
  available_from timestamptz,
  deadline_at timestamptz,
  attempt_limit integer,
  passing_threshold integer,
  attempts_used integer,
  latest_attempt_status public.assignment_attempt_status,
  latest_passed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  return query
  select
    assignment.id,
    assignment.classroom_id,
    classroom.name,
    assignment.title,
    assignment.status,
    assignment.available_from,
    assignment.deadline_at,
    assignment.attempt_limit,
    (assignment.passing_rule ->> 'threshold')::integer,
    (
      select count(*)::integer
      from public.assignment_attempts attempt
      where attempt.assignment_id = assignment.id
        and attempt.user_id = auth.uid()
    ),
    latest.status,
    latest.passed
  from public.assignments assignment
  join public.classrooms classroom on classroom.id = assignment.classroom_id
  join public.assignment_targets target
    on target.assignment_id = assignment.id
    and target.user_id = auth.uid()
  left join lateral (
    select attempt.status, attempt.passed
    from public.assignment_attempts attempt
    where attempt.assignment_id = assignment.id
      and attempt.user_id = auth.uid()
    order by attempt.attempt_number desc
    limit 1
  ) latest on true
  where assignment.status in ('published', 'paused')
  order by assignment.deadline_at nulls last, assignment.created_at desc;
end;
$$;

create function public.start_assignment_attempt(
  p_assignment_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  assignment_record public.assignments;
  existing_attempt public.assignment_attempts;
  attempt_record public.assignment_attempts;
  used_attempts integer;
  session_payload jsonb;
  new_session_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_INVALID_REQUEST';
  end if;

  select assignment.*
  into assignment_record
  from public.assignments assignment
  where assignment.id = p_assignment_id
    and exists (
      select 1
      from public.assignment_targets target
      where target.assignment_id = assignment.id
        and target.user_id = current_user_id
    )
    and exists (
      select 1
      from public.classroom_members member
      where member.classroom_id = assignment.classroom_id
        and member.user_id = current_user_id
        and member.member_role = 'student'
        and member.status = 'active'
    );

  if assignment_record.id is null then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;

  if assignment_record.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_PUBLISHED';
  end if;
  if assignment_record.available_from is not null
    and clock_timestamp() < assignment_record.available_from then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_AVAILABLE_YET';
  end if;
  if assignment_record.deadline_at is not null
    and clock_timestamp() >= assignment_record.deadline_at then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_DEADLINE_PASSED';
  end if;
  if assignment_record.activity_type <> 'quiz_template' then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_ACTIVITY_UNAVAILABLE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_assignment_id::text || current_user_id::text, 42)
  );

  select attempt.*
  into existing_attempt
  from public.assignment_attempts attempt
  join public.quiz_sessions session on session.id = attempt.quiz_session_id
  where attempt.assignment_id = assignment_record.id
    and attempt.user_id = current_user_id
    and session.client_request_id = p_request_id;

  if existing_attempt.id is not null then
    return jsonb_build_object(
      'attempt_id', existing_attempt.id,
      'assignment_id', existing_attempt.assignment_id,
      'attempt_number', existing_attempt.attempt_number,
      'session', public.build_quiz_session_payload(existing_attempt.quiz_session_id)
    );
  end if;

  select count(*)::integer
  into used_attempts
  from public.assignment_attempts attempt
  where attempt.assignment_id = assignment_record.id
    and attempt.user_id = current_user_id;

  if assignment_record.attempt_limit is not null
    and used_attempts >= assignment_record.attempt_limit then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_ATTEMPT_LIMIT_REACHED';
  end if;

  insert into public.assignment_attempts (
    assignment_id, user_id, attempt_number, status
  ) values (
    assignment_record.id, current_user_id, used_attempts + 1, 'in_progress'
  )
  returning * into attempt_record;

  session_payload := public.create_quiz_session(
    assignment_record.quiz_template_id,
    p_request_id
  );
  new_session_id := (session_payload ->> 'session_id')::uuid;

  update public.quiz_sessions
  set purpose = 'assignment',
      assignment_attempt_id = attempt_record.id
  where id = new_session_id;

  update public.assignment_attempts
  set quiz_session_id = new_session_id
  where id = attempt_record.id;

  return jsonb_build_object(
    'attempt_id', attempt_record.id,
    'assignment_id', attempt_record.assignment_id,
    'attempt_number', attempt_record.attempt_number,
    'session', public.build_quiz_session_payload(new_session_id)
  );
end;
$$;

create or replace function public.finalize_quiz_session(session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record record;
  aggregate_record record;
  previous_completed integer;
  reward_rate integer;
  formal_xp integer;
  formal_tokens integer;
  attempt_record record;
  attempt_payload jsonb := null;
  result_payload jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if session_id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_INVALID_REQUEST';
  end if;

  select s.*
  into session_record
  from public.quiz_sessions s
  where s.id = finalize_quiz_session.session_id
    and s.user_id = current_user_id
  for update;

  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_FOUND';
  end if;

  if session_record.status = 'completed' then
    result_payload := jsonb_build_object(
      'session_id', session_record.id,
      'status', session_record.status,
      'question_count', session_record.question_count,
      'answered_count', session_record.answered_count,
      'correct_count', session_record.correct_count,
      'total_score', session_record.total_score,
      'xp_awarded', session_record.xp_awarded,
      'tokens_awarded', session_record.tokens_awarded,
      'reward_rate_percent', session_record.reward_rate_percent,
      'game_rules_version', session_record.game_rules_version,
      'completed_at', session_record.completed_at
    );
    if session_record.purpose = 'assignment'
      and session_record.assignment_attempt_id is not null then
      result_payload := result_payload || jsonb_build_object(
        'assignment_attempt',
        public.build_assignment_attempt_payload(session_record.assignment_attempt_id)
      );
    end if;
    return result_payload;
  end if;

  select
    count(*)::integer as answered_count,
    count(*) filter (where a.answer_status = 'correct')::integer as correct_count,
    coalesce(sum(a.score_delta), 0)::integer as total_score,
    coalesce(sum(a.provisional_xp), 0)::integer as provisional_xp,
    coalesce(sum(a.provisional_tokens), 0)::integer as provisional_tokens
  into aggregate_record
  from public.quiz_answers a
  where a.session_id = session_record.id;

  if aggregate_record.answered_count <> session_record.question_count then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_INCOMPLETE';
  end if;

  perform 1
  from public.wallets
  where user_id = current_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ECONOMY_WALLET_NOT_FOUND';
  end if;

  select count(*)::integer
  into previous_completed
  from public.quiz_sessions prior
  where prior.user_id = current_user_id
    and prior.template_id = session_record.template_id
    and prior.status = 'completed'
    and (prior.completed_at at time zone 'Asia/Taipei')::date =
      (clock_timestamp() at time zone 'Asia/Taipei')::date;

  reward_rate := case when previous_completed < 3 then 100 else 20 end;
  formal_xp := floor(aggregate_record.provisional_xp * reward_rate / 100.0)::integer;
  formal_tokens := case when reward_rate = 100
    then aggregate_record.provisional_tokens
    else 0
  end;

  if formal_xp > 0 then
    insert into public.xp_transactions (
      user_id, amount, reason, source_type, source_id
    ) values (
      current_user_id, formal_xp, 'quiz finalize reward',
      'quiz_finalize', session_record.id
    );
  end if;

  if formal_tokens > 0 then
    insert into public.wallet_transactions (
      user_id, amount, reason, source_type, source_id
    ) values (
      current_user_id, formal_tokens, 'quiz finalize reward',
      'quiz_finalize', session_record.id
    );

    update public.wallets
    set token_balance = token_balance + formal_tokens,
        updated_at = clock_timestamp()
    where user_id = current_user_id;
  end if;

  update public.quiz_sessions
  set status = 'completed',
      answered_count = aggregate_record.answered_count,
      correct_count = aggregate_record.correct_count,
      total_score = aggregate_record.total_score,
      xp_awarded = formal_xp,
      tokens_awarded = formal_tokens,
      reward_rate_percent = reward_rate,
      completed_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  if session_record.purpose = 'assignment'
    and session_record.assignment_attempt_id is not null then
    select attempt.*, assignment.deadline_at, assignment.passing_rule
    into attempt_record
    from public.assignment_attempts attempt
    join public.assignments assignment on assignment.id = attempt.assignment_id
    where attempt.id = session_record.assignment_attempt_id
    for update of attempt;

    if attempt_record.id is not null
      and attempt_record.status = 'in_progress' then
      if attempt_record.deadline_at is not null
        and clock_timestamp() > attempt_record.deadline_at then
        update public.assignment_attempts
        set status = 'expired'
        where id = attempt_record.id;
      else
        update public.assignment_attempts
        set status = 'completed',
            passed = session_record.total_score >=
              (attempt_record.passing_rule ->> 'threshold')::integer,
            completed_at = clock_timestamp()
        where id = attempt_record.id;
      end if;
    end if;

    attempt_payload := public.build_assignment_attempt_payload(
      session_record.assignment_attempt_id
    );
  end if;

  result_payload := jsonb_build_object(
    'session_id', session_record.id,
    'status', session_record.status,
    'question_count', session_record.question_count,
    'answered_count', session_record.answered_count,
    'correct_count', session_record.correct_count,
    'total_score', session_record.total_score,
    'xp_awarded', session_record.xp_awarded,
    'tokens_awarded', session_record.tokens_awarded,
    'reward_rate_percent', session_record.reward_rate_percent,
    'game_rules_version', session_record.game_rules_version,
    'completed_at', session_record.completed_at
  );
  if attempt_payload is not null then
    result_payload := result_payload
      || jsonb_build_object('assignment_attempt', attempt_payload);
  end if;
  return result_payload;
end;
$$;

revoke all on function public.create_assignment(
  uuid, text, public.assignment_activity_type, uuid,
  timestamptz, timestamptz, integer, integer
) from public, anon;
revoke all on function public.update_assignment_status(
  uuid, public.assignment_status, timestamptz
) from public, anon;
revoke all on function public.list_classroom_assignments(uuid) from public, anon;
revoke all on function public.list_my_assignments() from public, anon;
revoke all on function public.start_assignment_attempt(uuid, uuid) from public, anon;

grant execute on function public.create_assignment(
  uuid, text, public.assignment_activity_type, uuid,
  timestamptz, timestamptz, integer, integer
) to authenticated;
grant execute on function public.update_assignment_status(
  uuid, public.assignment_status, timestamptz
) to authenticated;
grant execute on function public.list_classroom_assignments(uuid) to authenticated;
grant execute on function public.list_my_assignments() to authenticated;
grant execute on function public.start_assignment_attempt(uuid, uuid) to authenticated;
