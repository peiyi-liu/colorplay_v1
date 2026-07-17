-- Participants must address submit_live_answer by the frozen question's id,
-- so the safe question projection carries it (it reveals nothing sensitive).

create or replace function public.live_question_payload(
  target_question public.live_session_questions
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'question_id', target_question.id,
    'position', target_question."position",
    'prompt', target_question.prompt,
    'public_options', target_question.public_options,
    'opened_at', target_question.opened_at,
    'deadline_at', target_question.deadline_at
  );
$$;

create or replace function public.get_live_session_state(p_session_id uuid)
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

    payload := payload || jsonb_build_object(
      'question', public.live_question_payload(question_record),
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
