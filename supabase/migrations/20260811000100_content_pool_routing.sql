-- Route the owner-approved RC/QB/CR namespaces to distinct product surfaces.
-- Existing legacy questions remain stored for history, but new practice and
-- Live sessions only sample the explicitly selected bank.

alter table public.questions
  add column bank_kind text not null default 'legacy'
  check (bank_kind in ('legacy', 'section', 'chapter'));

alter table public.questions
  drop constraint questions_stable_code_check;
alter table public.questions
  add constraint questions_stable_code_check check (
    stable_code ~ '^[0-9]+-[0-9]+-[0-9]{2}$'
    or stable_code ~ '^QB[1-9][1-9][0-9]{2}$'
    or stable_code ~ '^CR[1-9][0-9]{3}$'
  );

create index questions_bank_kind_status_idx
  on public.questions(bank_kind, status, subtopic_id);

alter table public.quiz_templates
  add column section_id uuid references public.sections(id) on delete cascade;

create unique index quiz_templates_section_unique
  on public.quiz_templates(section_id)
  where section_id is not null;

create function public.validate_quiz_template_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.section_id is not null and not exists (
    select 1 from public.sections section
    where section.id = new.section_id
      and section.chapter_id = new.chapter_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'quiz template section must belong to its chapter';
  end if;
  return new;
end;
$$;

create trigger quiz_templates_validate_scope
before insert or update of chapter_id, section_id on public.quiz_templates
for each row execute function public.validate_quiz_template_scope();

create or replace function public.chapter_content_is_available(p_chapter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.chapters chapter
    join public.courses course on course.id = chapter.course_id
    join public.quiz_templates template
      on template.chapter_id = chapter.id and template.section_id is null
    where chapter.id = p_chapter_id
      and course.status = 'published'
      and chapter.status = 'published'
      and template.status = 'published'
      and (
        select count(*)
        from public.questions question
        join public.subtopics subtopic on subtopic.id = question.subtopic_id
        join public.sections section on section.id = subtopic.section_id
        where section.chapter_id = chapter.id
          and section.status = 'published'
          and subtopic.status = 'published'
          and question.status = 'published'
          and question.bank_kind = 'chapter'
      ) >= template.question_count
      and exists (
        select 1
        from public.review_cards card
        join public.subtopics subtopic on subtopic.id = card.subtopic_id
        join public.sections section on section.id = subtopic.section_id
        where section.chapter_id = chapter.id
          and section.status = 'published'
          and subtopic.status = 'published'
          and card.status = 'published'
      )
  )
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

  select session.id into existing_session_id
  from public.quiz_sessions session
  where session.user_id = current_user_id
    and session.client_request_id = create_quiz_session.client_request_id;
  if existing_session_id is not null then
    return public.build_quiz_session_payload(existing_session_id);
  end if;

  select template.id, template.question_count, template.section_id,
    chapter.id as chapter_id, chapter.title as chapter_title
  into template_record
  from public.quiz_templates template
  join public.chapters chapter on chapter.id = template.chapter_id
  join public.courses course on course.id = chapter.course_id
  where template.id = create_quiz_session.template_id
    and template.status = 'published'
    and chapter.status = 'published'
    and course.status = 'published';
  if template_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_TEMPLATE_NOT_FOUND';
  end if;

  perform public.assert_student_chapter_access(template_record.chapter_id);

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    started_at
  ) values (
    current_user_id, template_record.id,
    create_quiz_session.client_request_id, template_record.chapter_title, 1,
    session_started_at
  )
  on conflict on constraint quiz_sessions_user_client_request_unique do nothing
  returning id into new_session_id;

  if new_session_id is null then
    select session.id into existing_session_id
    from public.quiz_sessions session
    where session.user_id = current_user_id
      and session.client_request_id = create_quiz_session.client_request_id;
    return public.build_quiz_session_payload(existing_session_id);
  end if;

  with question_candidates as (
    select question.id, question.stable_code, question.version,
      question.prompt, question.explanation, random() as random_order
    from public.questions question
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    where question.status = 'published'
      and subtopic.status = 'published'
      and section.status = 'published'
      and (
        (template_record.section_id is null
          and question.bank_kind = 'chapter'
          and section.chapter_id = template_record.chapter_id)
        or
        (template_record.section_id is not null
          and question.bank_kind = 'section'
          and section.id = template_record.section_id)
      )
  ), selected_questions as (
    select * from question_candidates
    order by random_order limit template_record.question_count
  ), randomized_questions as (
    select selected_questions.*,
      row_number() over (order by random_order)::integer as position
    from selected_questions
  ), question_payloads as (
    select selected.id, selected.stable_code, selected.version,
      selected.prompt, selected.explanation, selected.position,
      jsonb_agg(jsonb_build_object(
        'id', option.id, 'key', option.option_key, 'text', option.option_text,
        'sort_order', option.sort_order
      ) order by option.sort_order) as options,
      (array_agg(option.id order by option.sort_order)
        filter (where option.is_correct))[1] as correct_option_id
    from randomized_questions selected
    join public.question_options option on option.question_id = selected.id
    group by selected.id, selected.stable_code, selected.version,
      selected.prompt, selected.explanation, selected.position
  )
  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id, started_at,
    deadline_at
  )
  select new_session_id, payload.id, payload.position, payload.stable_code,
    payload.version, payload.prompt, payload.explanation, payload.options,
    payload.correct_option_id,
    case when payload.position = 1 then session_started_at end,
    case when payload.position = 1
      then session_started_at + interval '20 seconds' end
  from question_payloads payload;

  get diagnostics inserted_question_count = row_count;
  if inserted_question_count = 0 then
    raise exception using errcode = 'P0001', message = 'QUIZ_TEMPLATE_HAS_NO_QUESTIONS';
  end if;
  update public.quiz_sessions set question_count = inserted_question_count
  where id = new_session_id;
  return public.build_quiz_session_payload(new_session_id);
end;
$$;

create or replace function public.get_student_chapter_map()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  course_record public.courses%rowtype;
  progression_mode text;
  progression_rules text;
  chapters_payload jsonb;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  select course.* into course_record from public.courses course
  where course.status = 'published'
  order by course.sort_order, course.id limit 1;
  if course_record.id is null then
    return jsonb_build_object('mode', 'open',
      'rules_version', '2026-08-sequence-1', 'chapters', '[]'::jsonb);
  end if;
  select coalesce(setting.mode, 'open'),
    coalesce(setting.rules_version, '2026-08-sequence-1')
  into progression_mode, progression_rules
  from (select course_record.id as course_id) target
  left join public.course_progression_settings setting
    on setting.course_id = target.course_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'chapter_id', chapter.id, 'stable_code', chapter.stable_code,
    'sort_order', chapter.sort_order, 'title', chapter.title,
    'description', chapter.description, 'template_id', template.id,
    'template_question_count', template.question_count,
    'access_state', case
      when not public.chapter_content_is_available(chapter.id)
        then 'content_unavailable'
      when completion.is_complete then 'completed'
      when public.student_can_access_chapter(chapter.id) then 'available'
      else 'locked' end,
    'progress_status', completion.progress_status,
    'review_completed', completion.review_completed,
    'review_total', completion.review_total, 'mastery', completion.mastery,
    'blockers', case
      when not public.chapter_content_is_available(chapter.id)
        or not public.student_can_access_chapter(chapter.id)
        then public.chapter_access_blockers(chapter.id)
      else '[]'::jsonb end
  ) order by chapter.sort_order, chapter.id), '[]'::jsonb)
  into chapters_payload
  from public.chapters chapter
  left join lateral (
    select candidate.id, candidate.question_count
    from public.quiz_templates candidate
    where candidate.chapter_id = chapter.id
      and candidate.section_id is null
      and candidate.status = 'published'
    order by candidate.created_at, candidate.id limit 1
  ) template on true
  left join lateral (
    select snapshot.*
    from public.student_chapter_completion(actor_id, chapter.id) snapshot
  ) completion on true
  where chapter.course_id = course_record.id and chapter.status = 'published';
  return jsonb_build_object('mode', progression_mode,
    'rules_version', progression_rules, 'chapters', chapters_payload);
end;
$$;

create or replace function public.get_accessible_chapter_review(p_chapter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare review_payload jsonb;
begin
  perform public.assert_student_chapter_access(p_chapter_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', section.id, 'stable_code', section.stable_code,
    'title', section.title, 'sort_order', section.sort_order,
    'quiz_template_id', (
      select template.id from public.quiz_templates template
      where template.section_id = section.id and template.status = 'published'
      order by template.created_at, template.id limit 1
    ),
    'subtopics', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', subtopic.id, 'stable_code', subtopic.stable_code,
        'title', subtopic.title, 'sort_order', subtopic.sort_order,
        'review_cards', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', card.id, 'group_label', card.group_label,
            'title', card.title, 'content', card.content,
            'version', card.version,
            'requires_recompletion', card.requires_recompletion,
            'sort_order', card.sort_order, 'review_card_media', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'asset_path', media.asset_path, 'alt_text', media.alt_text,
                'sort_order', media.sort_order
              ) order by media.sort_order, media.id), '[]'::jsonb)
              from public.review_card_media media
              where media.review_card_id = card.id
                and media.card_version = card.version
            )
          ) order by card.sort_order, card.id), '[]'::jsonb)
          from public.review_cards card
          where card.subtopic_id = subtopic.id and card.status = 'published'
        )
      ) order by subtopic.sort_order, subtopic.id), '[]'::jsonb)
      from public.subtopics subtopic
      where subtopic.section_id = section.id
        and subtopic.status = 'published'
        and exists (
          select 1 from public.review_cards card
          where card.subtopic_id = subtopic.id and card.status = 'published'
        )
    )
  ) order by section.sort_order, section.id), '[]'::jsonb)
  into review_payload
  from public.sections section
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.courses course on course.id = chapter.course_id
  where section.chapter_id = p_chapter_id
    and section.status = 'published'
    and chapter.status = 'published'
    and course.status = 'published'
    and exists (
      select 1 from public.subtopics subtopic
      join public.review_cards card on card.subtopic_id = subtopic.id
      where subtopic.section_id = section.id
        and subtopic.status = 'published' and card.status = 'published'
    );
  return review_payload;
end;
$$;

revoke all on function public.validate_quiz_template_scope()
from public, anon, authenticated;
