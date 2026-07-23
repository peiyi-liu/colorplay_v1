create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_live_join_code(
  out plain_code text,
  out code_hash bytea
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  raw_hex text;
begin
  raw_hex := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  plain_code := format(
    '%s-%s-%s-%s',
    substr(raw_hex, 1, 4),
    substr(raw_hex, 5, 4),
    substr(raw_hex, 9, 4),
    substr(raw_hex, 13, 4)
  );
  code_hash := extensions.digest(raw_hex, 'sha256');
end;
$$;

revoke all on function public.generate_live_join_code()
from public, anon, authenticated;

create function public.create_live_activity(
  p_title text,
  p_quiz_template_id uuid,
  p_question_time_limit_seconds integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  activity_record public.live_activities;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = current_user_id
      and profile.role = 'teacher'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_TEACHER_ROLE_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.quiz_templates template
    where template.id = p_quiz_template_id
      and template.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_TEMPLATE_NOT_FOUND';
  end if;

  insert into public.live_activities (
    owner_teacher_id, title, quiz_template_id, question_time_limit_seconds
  ) values (
    current_user_id, p_title, p_quiz_template_id,
    coalesce(p_question_time_limit_seconds, 20)
  )
  returning * into activity_record;

  return jsonb_build_object(
    'activity_id', activity_record.id,
    'title', activity_record.title,
    'quiz_template_id', activity_record.quiz_template_id,
    'question_time_limit_seconds', activity_record.question_time_limit_seconds,
    'status', activity_record.status,
    'rules_version', activity_record.rules_version
  );
end;
$$;

create function public.create_live_session(
  p_live_activity_id uuid,
  p_classroom_id uuid,
  p_assignment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  code record;
  session_record public.live_sessions;
  attempt integer := 0;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.live_activities activity
    where activity.id = p_live_activity_id
      and activity.owner_teacher_id = current_user_id
      and activity.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_ACTIVITY_NOT_FOUND';
  end if;
  if not exists (
    select 1
    from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = current_user_id
      and classroom.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_CLASSROOM_NOT_FOUND';
  end if;
  if p_assignment_id is not null and not exists (
    select 1
    from public.assignments assignment
    where assignment.id = p_assignment_id
      and assignment.owner_teacher_id = current_user_id
      and assignment.classroom_id = p_classroom_id
      and assignment.activity_type = 'live_activity'
      and assignment.live_activity_id = p_live_activity_id
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_ASSIGNMENT_MISMATCH';
  end if;

  loop
    attempt := attempt + 1;
    select * into code from public.generate_live_join_code();
    begin
      insert into public.live_sessions (
        live_activity_id, host_teacher_id, classroom_id, assignment_id,
        join_code_hash
      ) values (
        p_live_activity_id, current_user_id, p_classroom_id, p_assignment_id,
        code.code_hash
      )
      returning * into session_record;
      exit;
    exception
      when unique_violation then
        if attempt >= 5 then
          raise exception using errcode = 'P0001', message = 'LIVE_CODE_GENERATION_FAILED';
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'join_code', code.plain_code,
    'join_code_version', session_record.join_code_version
  );
end;
$$;

create function public.rotate_live_join_code(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  code record;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id
    and live_session.host_teacher_id = current_user_id
  for update;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;
  if session_record.state not in ('draft', 'lobby') then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  select * into code from public.generate_live_join_code();
  update public.live_sessions
  set join_code_hash = code.code_hash,
      join_code_version = join_code_version + 1,
      updated_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  return jsonb_build_object(
    'session_id', session_record.id,
    'join_code', code.plain_code,
    'join_code_version', session_record.join_code_version
  );
end;
$$;

create function public.start_live_session(
  p_session_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  activity_record public.live_activities;
  template_record record;
  frozen_count integer;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id
    and live_session.host_teacher_id = current_user_id
  for update;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;
  if p_expected_version is distinct from session_record.state_version then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_CONFLICT';
  end if;
  if session_record.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  select activity.* into activity_record
  from public.live_activities activity
  where activity.id = session_record.live_activity_id;

  select template.question_count, template.chapter_id
  into template_record
  from public.quiz_templates template
  where template.id = activity_record.quiz_template_id;

  with question_candidates as (
    select
      question.id,
      question.stable_code,
      question.version,
      question.prompt,
      question.explanation,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', question_option.id,
            'key', question_option.option_key,
            'text', question_option.option_text,
            'sort_order', question_option.sort_order
          ) order by question_option.sort_order
        )
        from public.question_options question_option
        where question_option.question_id = question.id
      ) as public_options,
      (
        select question_option.id
        from public.question_options question_option
        where question_option.question_id = question.id
          and question_option.is_correct
      ) as correct_option_id,
      random() as random_order
    from public.questions question
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    where section.chapter_id = template_record.chapter_id
      and question.status = 'published'
  ), selected_questions as (
    select *
    from question_candidates
    order by random_order
    limit template_record.question_count
  )
  insert into public.live_session_questions (
    session_id, "position", question_stable_code, question_version, prompt,
    public_options, correct_option_id, explanation
  )
  select
    session_record.id,
    row_number() over (order by random_order)::integer,
    selected_questions.stable_code,
    selected_questions.version,
    selected_questions.prompt,
    selected_questions.public_options,
    selected_questions.correct_option_id,
    selected_questions.explanation
  from selected_questions;

  get diagnostics frozen_count = row_count;
  if frozen_count = 0 then
    raise exception using errcode = 'P0001', message = 'LIVE_TEMPLATE_HAS_NO_QUESTIONS';
  end if;

  update public.live_sessions
  set state = 'lobby',
      question_count = frozen_count,
      state_version = state_version + 1,
      opened_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'question_count', session_record.question_count
  );
end;
$$;

create function public.join_live_session(
  p_join_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized text;
  session_record public.live_sessions;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_INVALID_REQUEST';
  end if;

  normalized := upper(replace(coalesce(p_join_code, ''), '-', ''));
  if normalized !~ '^[0-9A-F]{16}$' then
    raise exception using errcode = 'P0001', message = 'LIVE_JOIN_INVALID_CODE';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.join_code_hash = extensions.digest(normalized, 'sha256')
    and live_session.state = 'lobby'
  for share;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_JOIN_INVALID_CODE';
  end if;
  if not exists (
    select 1
    from public.classroom_members member
    where member.classroom_id = session_record.classroom_id
      and member.user_id = current_user_id
      and member.member_role = 'student'
      and member.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_JOIN_INVALID_CODE';
  end if;

  insert into public.live_participants (session_id, user_id)
  values (session_record.id, current_user_id)
  on conflict (session_id, user_id)
  do update set status = 'active', left_at = null;

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version
  );
end;
$$;

create function public.get_live_session_state(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  caller_is_host boolean;
  participant_record public.live_participants;
  question_record public.live_session_questions;
  payload jsonb;
  question_payload jsonb;
  my_answer public.live_answers;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;

  caller_is_host := session_record.host_teacher_id = current_user_id;
  if not caller_is_host then
    select participant.* into participant_record
    from public.live_participants participant
    where participant.session_id = session_record.id
      and participant.user_id = current_user_id
      and participant.status = 'active';
    if participant_record.id is null then
      raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
    end if;
  end if;

  payload := jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'current_position', session_record.current_position,
    'question_count', session_record.question_count,
    'participant_count', (
      select count(*)
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.status = 'active'
    ),
    'rules_version', session_record.rules_version,
    'server_time', clock_timestamp(),
    'is_host', caller_is_host
  );

  if session_record.state in ('question_open', 'question_feedback')
    and session_record.current_position > 0 then
    select question.* into question_record
    from public.live_session_questions question
    where question.session_id = session_record.id
      and question."position" = session_record.current_position;

    question_payload := jsonb_build_object(
      'position', question_record."position",
      'prompt', question_record.prompt,
      'public_options', question_record.public_options,
      'opened_at', question_record.opened_at,
      'deadline_at', question_record.deadline_at
    );

    payload := payload || jsonb_build_object(
      'question', question_payload,
      'answered_count', (
        select count(*)
        from public.live_answers answer
        where answer.session_question_id = question_record.id
      )
    );

    if not caller_is_host then
      select answer.* into my_answer
      from public.live_answers answer
      where answer.session_question_id = question_record.id
        and answer.participant_id = participant_record.id;
    end if;

    if session_record.state = 'question_feedback' then
      payload := payload || jsonb_build_object(
        'correct_option_id', question_record.correct_option_id,
        'explanation', question_record.explanation,
        'option_counts', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'option_id', counted.selected_option_id,
                'count', counted.answer_count
              )
            ),
            '[]'::jsonb
          )
          from (
            select answer.selected_option_id, count(*) as answer_count
            from public.live_answers answer
            where answer.session_question_id = question_record.id
            group by answer.selected_option_id
          ) counted
        )
      );
      if not caller_is_host and my_answer.id is not null then
        payload := payload || jsonb_build_object(
          'my_answer', jsonb_build_object(
            'answer_status', my_answer.answer_status,
            'selected_option_id', my_answer.selected_option_id,
            'score_delta', my_answer.score_delta
          )
        );
      end if;
    elsif not caller_is_host then
      payload := payload || jsonb_build_object(
        'my_answer', jsonb_build_object('answered', my_answer.id is not null)
      );
    end if;
  end if;

  if session_record.state = 'completed' then
    payload := payload || jsonb_build_object(
      'podium', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'rank', ranked.final_rank,
              'display_name', ranked.display_name,
              'score', ranked.score
            ) order by ranked.final_rank
          ),
          '[]'::jsonb
        )
        from (
          select
            participant.final_rank,
            profile.display_name,
            participant.score
          from public.live_participants participant
          join public.profiles profile on profile.id = participant.user_id
          where participant.session_id = session_record.id
            and participant.final_rank is not null
          order by participant.final_rank
          limit 3
        ) ranked
      )
    );
    if not caller_is_host then
      payload := payload || jsonb_build_object(
        'my_result', jsonb_build_object(
          'score', participant_record.score,
          'rank', participant_record.final_rank
        )
      );
    end if;
  end if;

  return payload;
end;
$$;

revoke all on function public.create_live_activity(text, uuid, integer)
from public, anon;
revoke all on function public.create_live_session(uuid, uuid, uuid)
from public, anon;
revoke all on function public.rotate_live_join_code(uuid) from public, anon;
revoke all on function public.start_live_session(uuid, integer) from public, anon;
revoke all on function public.join_live_session(text, uuid) from public, anon;
revoke all on function public.get_live_session_state(uuid) from public, anon;

grant execute on function public.create_live_activity(text, uuid, integer)
to authenticated;
grant execute on function public.create_live_session(uuid, uuid, uuid)
to authenticated;
grant execute on function public.rotate_live_join_code(uuid) to authenticated;
grant execute on function public.start_live_session(uuid, integer) to authenticated;
grant execute on function public.join_live_session(text, uuid) to authenticated;
grant execute on function public.get_live_session_state(uuid) to authenticated;
