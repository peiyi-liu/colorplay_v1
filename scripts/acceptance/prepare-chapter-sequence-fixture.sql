\set ON_ERROR_STOP on

begin;

do $$
declare
  auth_count integer;
  profile_count integer;
begin
  select count(*)::integer into auth_count
  from auth.users
  where email = 'sequence.student@colorplay.test';

  select count(*)::integer into profile_count
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where account.email = 'sequence.student@colorplay.test'
    and profile.role = 'student';

  if auth_count <> 1 or profile_count <> 1 then
    raise exception 'CHAPTER_SEQUENCE_FIXTURE_IDENTITY_INVALID';
  end if;
end;
$$;

create temporary table chapter_sequence_selected_questions on commit drop as
with fixture as (
  select account.id as user_id
  from auth.users account
  where account.email = 'sequence.student@colorplay.test'
), published_questions as (
  select
    fixture.user_id,
    chapter.id as chapter_id,
    chapter.sort_order as chapter_number,
    chapter.title as chapter_title,
    template.id as template_id,
    question.id as question_id,
    question.stable_code,
    question.version,
    question.prompt,
    question.explanation,
    row_number() over (
      partition by chapter.id
      order by question.stable_code, question.id
    ) as chapter_position,
    count(*) over (partition by chapter.id) as published_question_count
  from fixture
  cross join public.chapters chapter
  join public.courses course on course.id = chapter.course_id
  join public.quiz_templates template
    on template.chapter_id = chapter.id
   and template.status = 'published'
  join public.sections section
    on section.chapter_id = chapter.id
   and section.status = 'published'
  join public.subtopics subtopic
    on subtopic.section_id = section.id
   and subtopic.status = 'published'
  join public.questions question
    on question.subtopic_id = subtopic.id
   and question.status = 'published'
  where course.id = '20000000-0000-0000-0000-000000000001'::uuid
    and course.status = 'published'
    and chapter.status = 'published'
), selected as (
  select *, ceil(published_question_count * 0.80)::integer as required_count
  from published_questions
)
select
  selected.*,
  ((selected.chapter_position - 1) / 10 + 1)::integer as session_number,
  ((selected.chapter_position - 1) % 10 + 1)::integer as session_position,
  md5(
    'chapter-sequence-session:' || selected.chapter_id::text || ':' ||
    (((selected.chapter_position - 1) / 10) + 1)::text
  )::uuid as session_id,
  md5(
    'chapter-sequence-question:' || selected.question_id::text
  )::uuid as session_question_id
from selected
where selected.chapter_position <= selected.required_count;

do $$
declare
  chapter_count integer;
begin
  select count(distinct chapter_id)::integer into chapter_count
  from chapter_sequence_selected_questions;
  if chapter_count <> 6 then
    raise exception 'CHAPTER_SEQUENCE_FIXTURE_CONTENT_NOT_READY';
  end if;
end;
$$;

insert into public.quiz_sessions (
  id,
  user_id,
  template_id,
  client_request_id,
  chapter_title,
  status,
  question_count,
  answered_count,
  correct_count,
  total_score,
  xp_awarded,
  tokens_awarded,
  started_at,
  completed_at,
  game_rules_version,
  reward_rate_percent,
  purpose
)
select
  selected.session_id,
  selected.user_id,
  selected.template_id,
  md5('chapter-sequence-request:' || selected.session_id::text)::uuid,
  selected.chapter_title,
  'completed'::public.quiz_session_status,
  count(*)::integer,
  count(*)::integer,
  count(*)::integer,
  (count(*) * 100)::integer,
  0,
  0,
  '2026-08-04T00:00:00Z'::timestamptz +
    make_interval(mins => selected.chapter_number * 10 + selected.session_number),
  '2026-08-04T00:01:00Z'::timestamptz +
    make_interval(mins => selected.chapter_number * 10 + selected.session_number),
  '2026-07-progress-1',
  100,
  'practice'::public.quiz_session_purpose
from chapter_sequence_selected_questions selected
group by
  selected.session_id,
  selected.user_id,
  selected.template_id,
  selected.chapter_title,
  selected.chapter_number,
  selected.session_number;

insert into public.quiz_session_questions (
  id,
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
  selected.session_question_id,
  selected.session_id,
  selected.question_id,
  selected.session_position,
  selected.stable_code,
  selected.version,
  selected.prompt,
  selected.explanation,
  options.frozen_options,
  options.correct_option_id,
  '2026-08-04T00:00:00Z'::timestamptz +
    make_interval(mins => selected.chapter_number * 10 + selected.session_number),
  '2026-08-04T00:02:00Z'::timestamptz +
    make_interval(mins => selected.chapter_number * 10 + selected.session_number)
from chapter_sequence_selected_questions selected
cross join lateral (
  select
    jsonb_agg(
      jsonb_build_object(
        'id', option.id,
        'key', option.option_key,
        'text', option.option_text
      ) order by option.sort_order
    ) as frozen_options,
    (array_agg(option.id order by option.sort_order)
      filter (where option.is_correct))[1] as correct_option_id
  from public.question_options option
  where option.question_id = selected.question_id
) options;

insert into public.quiz_answers (
  id,
  session_id,
  session_question_id,
  user_id,
  selected_option_id,
  correct_option_id,
  answer_status,
  response_ms,
  score_delta,
  idempotency_key,
  answered_at,
  provisional_xp,
  provisional_tokens
)
select
  md5('chapter-sequence-answer:' || selected.question_id::text)::uuid,
  selected.session_id,
  selected.session_question_id,
  selected.user_id,
  option.id,
  option.id,
  'correct'::public.quiz_answer_status,
  6000,
  100,
  md5('chapter-sequence-idempotency:' || selected.question_id::text)::uuid,
  '2026-08-04T00:01:00Z'::timestamptz +
    make_interval(mins => selected.chapter_number * 10 + selected.session_number),
  0,
  0
from chapter_sequence_selected_questions selected
join public.question_options option
  on option.question_id = selected.question_id
 and option.is_correct;

do $$
declare
  sequence_user_id uuid;
  mastery_ready boolean;
  review_count integer;
  unlock_count integer;
begin
  select account.id into strict sequence_user_id
  from auth.users account
  where account.email = 'sequence.student@colorplay.test';

  select bool_and(snapshot.mastery >= 80) into mastery_ready
  from public.learning_progress_for(sequence_user_id, null) snapshot
  where snapshot.scope = 'chapter';

  select count(*)::integer into review_count
  from public.review_progress
  where user_id = sequence_user_id;

  select count(*)::integer into unlock_count
  from public.student_chapter_unlocks
  where user_id = sequence_user_id;

  if mastery_ready is not true
    or review_count <> 0
    or unlock_count <> 0
    or exists (
      select 1
      from public.quiz_sessions
      where user_id = sequence_user_id
        and purpose <> 'practice'
    )
    or (
      select count(*)
      from public.quiz_sessions
      where user_id = sequence_user_id
        and purpose = 'practice'
    ) <> (
      select count(distinct session_id)
      from chapter_sequence_selected_questions
    ) then
    raise exception 'CHAPTER_SEQUENCE_FIXTURE_POSTCONDITION_FAILED';
  end if;
end;
$$;

commit;
