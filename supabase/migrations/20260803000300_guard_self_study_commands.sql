-- Forward replacements for every self-study mutation. Each command resolves
-- its published chapter, applies the shared server-side access guard, and
-- only then performs its existing write path. Teacher-hosted Live remains on
-- its independent commands and is intentionally absent from this migration.

create or replace function public.complete_review_card(
  p_review_card_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  card_record record;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'REVIEW_INVALID_REQUEST';
  end if;

  select card.*, ch.id as chapter_id into card_record
  from public.review_cards card
  join public.subtopics st on st.id = card.subtopic_id
  join public.sections s on s.id = st.section_id
  join public.chapters ch on ch.id = s.chapter_id
  join public.courses c on c.id = ch.course_id
  where card.id = p_review_card_id
    and card.status = 'published'
    and st.status = 'published'
    and s.status = 'published'
    and ch.status = 'published'
    and c.status = 'published';
  if card_record.id is null then
    raise exception using errcode = 'P0001', message = 'REVIEW_CARD_NOT_FOUND';
  end if;

  perform public.assert_student_chapter_access(card_record.chapter_id);

  insert into public.review_progress (
    user_id, review_card_id, card_version, request_id
  )
  values (
    current_user_id, card_record.id, card_record.version, p_request_id
  )
  on conflict on constraint review_progress_user_card_version_unique
  do nothing;

  return jsonb_build_object(
    'review_card_id', card_record.id,
    'card_version', card_record.version,
    'rules_version', '2026-07-progress-1'
  );
end;
$$;

create or replace function public.create_quiz_session(
  template_id uuid,
  client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_session_id uuid;
  new_session_id uuid;
  template_record record;
  inserted_question_count integer;
  session_started_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if template_id is null or client_request_id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_INVALID_REQUEST';
  end if;

  select s.id
  into existing_session_id
  from public.quiz_sessions s
  where s.user_id = current_user_id
    and s.client_request_id = create_quiz_session.client_request_id;

  if existing_session_id is not null then
    return public.build_quiz_session_payload(existing_session_id);
  end if;

  select t.id, t.question_count, ch.id as chapter_id, ch.title as chapter_title
  into template_record
  from public.quiz_templates t
  join public.chapters ch on ch.id = t.chapter_id
  join public.courses c on c.id = ch.course_id
  where t.id = create_quiz_session.template_id
    and t.status = 'published'
    and ch.status = 'published'
    and c.status = 'published';

  if template_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_TEMPLATE_NOT_FOUND';
  end if;

  perform public.assert_student_chapter_access(template_record.chapter_id);

  insert into public.quiz_sessions (
    user_id,
    template_id,
    client_request_id,
    chapter_title,
    question_count,
    started_at
  )
  values (
    current_user_id,
    template_record.id,
    create_quiz_session.client_request_id,
    template_record.chapter_title,
    1,
    session_started_at
  )
  on conflict on constraint quiz_sessions_user_client_request_unique do nothing
  returning id into new_session_id;

  if new_session_id is null then
    select s.id into existing_session_id
    from public.quiz_sessions s
    where s.user_id = current_user_id
      and s.client_request_id = create_quiz_session.client_request_id;
    return public.build_quiz_session_payload(existing_session_id);
  end if;

  with question_candidates as (
    select
      q.id,
      q.stable_code,
      q.version,
      q.prompt,
      q.explanation,
      random() as random_order
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections sec on sec.id = st.section_id
    where sec.chapter_id = template_record.chapter_id
      and q.status = 'published'
      and st.status = 'published'
      and sec.status = 'published'
  ), selected_questions as (
    select * from question_candidates
    order by random_order
    limit template_record.question_count
  ), randomized_questions as (
    select
      selected_questions.*,
      row_number() over (order by random_order)::integer as position
    from selected_questions
  ), question_payloads as (
    select
      rq.id,
      rq.stable_code,
      rq.version,
      rq.prompt,
      rq.explanation,
      rq.position,
      jsonb_agg(
        jsonb_build_object(
          'id', qo.id,
          'key', qo.option_key,
          'text', qo.option_text,
          'sort_order', qo.sort_order
        ) order by qo.sort_order
      ) as options,
      (array_agg(qo.id order by qo.sort_order) filter (where qo.is_correct))[1]
        as correct_option_id
    from randomized_questions rq
    join public.question_options qo on qo.question_id = rq.id
    group by rq.id, rq.stable_code, rq.version, rq.prompt, rq.explanation, rq.position
  )
  insert into public.quiz_session_questions (
    session_id,
    question_id,
    position,
    question_stable_code,
    question_version,
    prompt,
    explanation,
    frozen_options,
    correct_option_id,
    started_at,
    deadline_at
  )
  select
    new_session_id,
    qp.id,
    qp.position,
    qp.stable_code,
    qp.version,
    qp.prompt,
    qp.explanation,
    qp.options,
    qp.correct_option_id,
    case when qp.position = 1 then session_started_at end,
    case when qp.position = 1 then session_started_at + interval '20 seconds' end
  from question_payloads qp;

  get diagnostics inserted_question_count = row_count;
  if inserted_question_count = 0 then
    raise exception using errcode = 'P0001', message = 'QUIZ_TEMPLATE_HAS_NO_QUESTIONS';
  end if;

  update public.quiz_sessions
  set question_count = inserted_question_count
  where id = new_session_id;

  return public.build_quiz_session_payload(new_session_id);
end;
$$;

create or replace function public.start_mastery_session(p_chapter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  existing_id uuid;
  selected_ids uuid[];
  selected_versions integer[];
  new_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  perform 1
  from public.chapters
  where id = p_chapter_id and status = 'published';

  if not found then
    raise exception using errcode = 'P0001', message = 'MASTERY_CHAPTER_NOT_FOUND';
  end if;

  perform public.assert_student_chapter_access(p_chapter_id);

  select id into existing_id
  from public.mastery_sessions
  where user_id = actor_id
    and chapter_id = p_chapter_id
    and status = 'in_progress';

  if existing_id is not null then
    return existing_id;
  end if;

  select
    array_agg(picked.id order by picked.stable_code),
    array_agg(picked.version order by picked.stable_code)
  into selected_ids, selected_versions
  from (
    select q.id, q.stable_code, q.version
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections se on se.id = st.section_id
    where se.chapter_id = p_chapter_id and q.status = 'published'
    order by q.stable_code
    limit 5
  ) picked;

  if selected_ids is null then
    raise exception using errcode = 'P0001', message = 'MASTERY_NO_QUESTIONS';
  end if;

  insert into public.mastery_sessions (
    user_id, chapter_id, question_ids, question_versions
  )
  values (actor_id, p_chapter_id, selected_ids, selected_versions)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.start_remediation_session(
  p_subtopic_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_session record;
  template_record record;
  subtopic_chapter_id uuid;
  new_session_id uuid;
  frozen_count integer;
  session_started_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_INVALID_REQUEST';
  end if;

  select s.id, s.purpose
  into existing_session
  from public.quiz_sessions s
  where s.user_id = current_user_id
    and s.client_request_id = p_request_id;
  if existing_session.id is not null then
    if existing_session.purpose <> 'remediation' then
      raise exception using errcode = 'P0001', message = 'REMEDIATION_INVALID_REQUEST';
    end if;
    return public.build_quiz_session_payload(existing_session.id);
  end if;

  select chapter.id into subtopic_chapter_id
  from public.subtopics subtopic
  join public.sections section on section.id = subtopic.section_id
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.courses course on course.id = chapter.course_id
  where subtopic.id = p_subtopic_id
    and subtopic.status = 'published'
    and section.status = 'published'
    and chapter.status = 'published'
    and course.status = 'published';

  if subtopic_chapter_id is not null then
    perform public.assert_student_chapter_access(subtopic_chapter_id);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_subtopic_id::text || current_user_id::text, 43)
  );

  select least(count(*), 10)::integer
  into frozen_count
  from public.mistake_items item
  join public.questions question on question.id = item.question_id
  join public.subtopics st on st.id = question.subtopic_id
  join public.sections s on s.id = st.section_id
  join public.chapters ch on ch.id = s.chapter_id
  join public.courses c on c.id = ch.course_id
  where item.user_id = current_user_id
    and item.status in ('open', 'reopened')
    and st.id = p_subtopic_id
    and question.status = 'published'
    and st.status = 'published'
    and s.status = 'published'
    and ch.status = 'published'
    and c.status = 'published';
  if frozen_count = 0 then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_NOTHING_OPEN';
  end if;

  select template.id, chapter.title as chapter_title
  into template_record
  from public.subtopics st
  join public.sections section on section.id = st.section_id
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.quiz_templates template on template.chapter_id = chapter.id
  where st.id = p_subtopic_id
    and template.status = 'published';
  if template_record.id is null then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_UNAVAILABLE';
  end if;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    purpose, game_rules_version, started_at
  ) values (
    current_user_id, template_record.id, p_request_id,
    template_record.chapter_title, frozen_count, 'remediation',
    '2026-07-progress-1', session_started_at
  )
  returning id into new_session_id;

  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id, started_at,
    deadline_at
  )
  with remediation_targets as (
    select
      question.id as question_id,
      question.stable_code,
      question.version,
      question.prompt,
      question.explanation,
      row_number() over (
        order by item.first_wrong_at, question.stable_code
      )::integer as position
    from public.mistake_items item
    join public.questions question on question.id = item.question_id
    join public.subtopics st on st.id = question.subtopic_id
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where item.user_id = current_user_id
      and item.status in ('open', 'reopened')
      and st.id = p_subtopic_id
      and question.status = 'published'
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
    order by item.first_wrong_at, question.stable_code
    limit 10
  )
  select
    new_session_id,
    target.question_id,
    target.position,
    target.stable_code,
    target.version,
    target.prompt,
    target.explanation,
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'key', o.option_key,
          'text', o.option_text,
          'sort_order', o.sort_order
        ) order by o.sort_order
      )
      from public.question_options o
      where o.question_id = target.question_id
    ),
    (
      select o.id
      from public.question_options o
      where o.question_id = target.question_id and o.is_correct
    ),
    case when target.position = 1 then session_started_at end,
    case when target.position = 1
      then session_started_at + interval '20 seconds'
    end
  from remediation_targets target;

  return public.build_quiz_session_payload(new_session_id);
end;
$$;

revoke all on function public.complete_review_card(uuid, uuid)
from public, anon;
grant execute on function public.complete_review_card(uuid, uuid)
to authenticated;

revoke all on function public.create_quiz_session(uuid, uuid)
from public, anon;
grant execute on function public.create_quiz_session(uuid, uuid)
to authenticated;

revoke all on function public.start_mastery_session(uuid)
from public, anon;
grant execute on function public.start_mastery_session(uuid)
to authenticated;

revoke all on function public.start_remediation_session(uuid, uuid)
from public, anon;
grant execute on function public.start_remediation_session(uuid, uuid)
to authenticated;
