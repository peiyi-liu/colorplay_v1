-- Separate chapter completion from mastery under 2026-09-progression-1.
-- The immutable fact is emitted by the server-owned finalize transition. A
-- challenge fingerprint freezes the template/pool/scope/rules identity at
-- session creation; unknown changes fail closed as requalification changes.
-- This migration intentionally stays atomic despite its length: the fact
-- table, backfill, finalize trigger, and four projections must switch together
-- so deploys never expose a mixed completion/mastery definition.

alter table public.quiz_sessions
add column chapter_progression_id uuid references public.chapters(id),
add column chapter_progression_fingerprint text
  check (
    chapter_progression_fingerprint is null
    or char_length(chapter_progression_fingerprint) = 64
  );

create function public.chapter_challenge_fingerprint(p_template_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'rules_version', '2026-09-progression-1',
          'template_id', template.id,
          'chapter_id', template.chapter_id,
          'section_id', template.section_id,
          'question_count', template.question_count,
          'status', template.status,
          'pool', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'question_id', question.id,
                  'version', question.version,
                  'subtopic_id', question.subtopic_id,
                  'section_id', section.id
                ) order by question.stable_code, question.id
              ),
              '[]'::jsonb
            )
            from public.questions as question
            join public.subtopics as subtopic
              on subtopic.id = question.subtopic_id
            join public.sections as section on section.id = subtopic.section_id
            where section.chapter_id = template.chapter_id
              and section.status = 'published'
              and subtopic.status = 'published'
              and question.status = 'published'
              and question.bank_kind = 'chapter'
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.quiz_templates as template
  where template.id = p_template_id
    and template.section_id is null
$$;

revoke all on function public.chapter_challenge_fingerprint(uuid)
from public, anon, authenticated;

-- Existing completed sessions keep their historical chapter identity. They
-- deliberately receive no creation-time fingerprint, so mastery fails closed.
update public.quiz_sessions as session
set chapter_progression_id = template.chapter_id
from public.quiz_templates as template
where template.id = session.template_id
  and template.section_id is null
  and session.chapter_progression_id is null;

create function public.capture_chapter_progression_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  template_record record;
begin
  if tg_op = 'UPDATE' then
    if new.chapter_progression_id is distinct from old.chapter_progression_id
      or new.chapter_progression_fingerprint is distinct from
        old.chapter_progression_fingerprint then
      raise exception using
        errcode = '23514',
        message = 'QUIZ_CHAPTER_PROGRESSION_IDENTITY_IMMUTABLE';
    end if;
    return new;
  end if;

  select template.chapter_id, template.section_id
  into template_record
  from public.quiz_templates as template
  where template.id = new.template_id;

  if template_record.section_id is null then
    new.chapter_progression_id := template_record.chapter_id;
    new.chapter_progression_fingerprint :=
      public.chapter_challenge_fingerprint(new.template_id);
  else
    new.chapter_progression_id := null;
    new.chapter_progression_fingerprint := null;
  end if;

  return new;
end;
$$;

revoke all on function public.capture_chapter_progression_identity()
from public, anon, authenticated;

create trigger quiz_sessions_capture_chapter_progression_identity
before insert or update of chapter_progression_id, chapter_progression_fingerprint
on public.quiz_sessions
for each row execute function public.capture_chapter_progression_identity();

create table public.chapter_challenge_finalize_facts (
  session_id uuid primary key references public.quiz_sessions(id),
  user_id uuid not null references public.profiles(id),
  chapter_id uuid not null references public.chapters(id),
  template_id uuid not null references public.quiz_templates(id),
  question_count integer not null check (question_count > 0),
  correct_count integer not null check (
    correct_count >= 0 and correct_count <= question_count
  ),
  challenge_fingerprint text check (
    challenge_fingerprint is null or char_length(challenge_fingerprint) = 64
  ),
  finalized_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.chapter_challenge_finalize_facts enable row level security;
revoke all on public.chapter_challenge_finalize_facts
from public, anon, authenticated;

create function public.record_chapter_challenge_finalize_fact()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  answer_record record;
  question_record record;
  template_question_count integer;
begin
  if old.status = 'completed' or new.status <> 'completed'
    or new.purpose not in ('practice', 'assignment')
    or new.chapter_progression_id is null then
    return new;
  end if;

  select
    count(*)::integer as question_count,
    count(*) filter (
      where session_question.question_stable_code ~ '^CR[1-9][0-9]{3}$'
        and question.bank_kind = 'chapter'
        and section.chapter_id = new.chapter_progression_id
    )::integer as valid_question_count
  into question_record
  from public.quiz_session_questions as session_question
  join public.questions as question on question.id = session_question.question_id
  join public.subtopics as subtopic on subtopic.id = question.subtopic_id
  join public.sections as section on section.id = subtopic.section_id
  where session_question.session_id = new.id;

  select
    count(*)::integer as answered_count,
    count(*) filter (where answer.answer_status = 'correct')::integer
      as correct_count
  into answer_record
  from public.quiz_answers as answer
  where answer.session_id = new.id
    and answer.user_id = new.user_id;

  select template.question_count
  into template_question_count
  from public.quiz_templates as template
  where template.id = new.template_id
    and template.section_id is null
    and template.chapter_id = new.chapter_progression_id;

  if new.completed_at is null
    or new.question_count <= 0
    or new.question_count <> template_question_count
    or new.answered_count <> new.question_count
    or answer_record.answered_count <> new.question_count
    or question_record.question_count <> new.question_count
    or question_record.valid_question_count <> new.question_count
    or answer_record.correct_count <> new.correct_count then
    return new;
  end if;

  insert into public.chapter_challenge_finalize_facts (
    session_id, user_id, chapter_id, template_id, question_count,
    correct_count, challenge_fingerprint, finalized_at
  ) values (
    new.id, new.user_id, new.chapter_progression_id, new.template_id,
    new.question_count, new.correct_count,
    new.chapter_progression_fingerprint, new.completed_at
  ) on conflict (session_id) do nothing;

  return new;
end;
$$;

revoke all on function public.record_chapter_challenge_finalize_fact()
from public, anon, authenticated;

create trigger quiz_sessions_record_chapter_challenge_finalize_fact
after update of status on public.quiz_sessions
for each row execute function public.record_chapter_challenge_finalize_fact();

-- Backfill only structurally valid server-owned historical completions. Their
-- fingerprint remains null, so they retain completed but not mastered.
insert into public.chapter_challenge_finalize_facts (
  session_id, user_id, chapter_id, template_id, question_count,
  correct_count, challenge_fingerprint, finalized_at
)
select
  session.id,
  session.user_id,
  session.chapter_progression_id,
  session.template_id,
  session.question_count,
  session.correct_count,
  null,
  session.completed_at
from public.quiz_sessions as session
join lateral (
  select
    count(*)::integer as question_count,
    count(*) filter (
      where session_question.question_stable_code ~ '^CR[1-9][0-9]{3}$'
        and question.bank_kind = 'chapter'
        and section.chapter_id = session.chapter_progression_id
    )::integer as valid_question_count
  from public.quiz_session_questions as session_question
  join public.questions as question on question.id = session_question.question_id
  join public.subtopics as subtopic on subtopic.id = question.subtopic_id
  join public.sections as section on section.id = subtopic.section_id
  where session_question.session_id = session.id
) as questions on true
join lateral (
  select
    count(*)::integer as answered_count,
    count(*) filter (where answer.answer_status = 'correct')::integer
      as correct_count
  from public.quiz_answers as answer
  where answer.session_id = session.id
    and answer.user_id = session.user_id
) as answers on true
where session.status = 'completed'
  and session.purpose in ('practice', 'assignment')
  and session.chapter_progression_id is not null
  and session.completed_at is not null
  and session.answered_count = session.question_count
  and questions.question_count = session.question_count
  and questions.valid_question_count = session.question_count
  and answers.answered_count = session.question_count
  and answers.correct_count = session.correct_count;

create function public.chapter_challenge_progress_for(
  p_user_id uuid,
  p_chapter_id uuid
)
returns table (
  status text,
  best_qualifying_percentage numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with attempts as (
    select
      fact.correct_count,
      fact.question_count,
      fact.challenge_fingerprint =
        public.chapter_challenge_fingerprint(fact.template_id)
        as is_current_version
    from public.chapter_challenge_finalize_facts as fact
    where fact.user_id = p_user_id
      and fact.chapter_id = p_chapter_id
  ),
  summary as (
    select
      count(*) > 0 as is_completed,
      bool_or(
        is_current_version
        and correct_count * 100 >= question_count * 80
      ) as is_mastered,
      max(
        round(correct_count * 100.0 / question_count, 1)
      ) filter (where is_current_version) as best_percentage
    from attempts
  )
  select
    case
      when coalesce(summary.is_mastered, false) then 'mastered'
      when summary.is_completed then 'completed'
      else 'not_started'
    end,
    summary.best_percentage
  from summary
  where p_user_id is not null and p_chapter_id is not null
$$;

revoke all on function public.chapter_challenge_progress_for(uuid, uuid)
from public, anon, authenticated;

create or replace function public.teacher_chapter_completion_summary(
  p_classroom_id uuid,
  p_chapter_id uuid default null
)
returns table (
  chapter_id uuid,
  chapter_title text,
  chapter_sort_order integer,
  completed_students integer,
  total_students integer,
  completion_rate numeric,
  student_statuses jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with owned_classroom as (
    select classroom.id
    from public.classrooms as classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
      and classroom.status = 'active'
  ),
  chapter_rows as (
    select chapter.id, chapter.title, chapter.sort_order
    from owned_classroom
    cross join public.chapters as chapter
    join public.courses as course on course.id = chapter.course_id
    where course.status = 'published'
      and chapter.status = 'published'
      and (p_chapter_id is null or chapter.id = p_chapter_id)
  ),
  active_students as (
    select membership.user_id, membership.member_ref, profile.display_name
    from owned_classroom
    join public.classroom_members as membership
      on membership.classroom_id = owned_classroom.id
      and membership.member_role = 'student'
      and membership.status = 'active'
    join public.profiles as profile on profile.id = membership.user_id
  ),
  student_rows as (
    select
      chapter.id as chapter_id,
      student.member_ref,
      student.display_name,
      challenge.status in ('completed', 'mastered') as is_complete
    from chapter_rows as chapter
    cross join active_students as student
    cross join lateral public.chapter_challenge_progress_for(
      student.user_id, chapter.id
    ) as challenge
  )
  select
    chapter.id,
    chapter.title,
    chapter.sort_order,
    count(student.member_ref) filter (where student.is_complete)::integer,
    count(student.member_ref)::integer,
    case
      when count(student.member_ref) > 0 then round(
        count(student.member_ref) filter (where student.is_complete)
          * 100.0 / count(student.member_ref),
        1
      )
      else null
    end,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'member_ref', student.member_ref,
          'display_name', student.display_name,
          'is_complete', student.is_complete
        )
        order by student.display_name, student.member_ref
      ) filter (where student.member_ref is not null),
      '[]'::jsonb
    )
  from chapter_rows as chapter
  left join student_rows as student on student.chapter_id = chapter.id
  group by chapter.id, chapter.title, chapter.sort_order
  order by chapter.sort_order, chapter.id
$$;

create or replace function public.teacher_classroom_overview(
  p_classroom_id uuid,
  p_from date default null,
  p_to date default null,
  p_chapter_id uuid default null
)
returns table (
  completed_students integer,
  total_students integer,
  average_accuracy numeric,
  worst_subtopic_code text,
  worst_subtopic_title text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with owned_classroom as (
    select classroom.id
    from public.classrooms as classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
      and classroom.status = 'active'
  ),
  active_students as (
    select membership.user_id
    from owned_classroom
    join public.classroom_members as membership
      on membership.classroom_id = owned_classroom.id
      and membership.member_role = 'student'
      and membership.status = 'active'
  ),
  selected_chapters as (
    select chapter.id
    from public.chapters as chapter
    join public.courses as course on course.id = chapter.course_id
    where chapter.status = 'published'
      and course.status = 'published'
      and (p_chapter_id is null or chapter.id = p_chapter_id)
  ),
  completion as (
    select
      student.user_id,
      bool_and(challenge.status in ('completed', 'mastered')) as is_complete
    from active_students as student
    cross join selected_chapters as chapter
    cross join lateral public.chapter_challenge_progress_for(
      student.user_id, chapter.id
    ) as challenge
    group by student.user_id
  ),
  facts as (
    select *
    from public.teacher_assessment_facts(
      p_classroom_id, 'all', p_from, p_to, p_chapter_id
    )
  ),
  subtopic_accuracy as (
    select
      subtopic.stable_code,
      subtopic.title,
      count(*) filter (where facts.is_correct) * 100.0 / count(*) as accuracy
    from facts
    join public.questions as question on question.stable_code = facts.stable_code
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    group by subtopic.stable_code, subtopic.title
  )
  select
    count(*) filter (where completion.is_complete)::integer,
    count(*)::integer,
    case when (select count(*) from facts) > 0 then (
      select round(
        count(*) filter (where facts.is_correct) * 100.0 / count(*), 1
      ) from facts
    ) end,
    (select stable_code from subtopic_accuracy order by accuracy, stable_code limit 1),
    (select title from subtopic_accuracy order by accuracy, stable_code limit 1)
  from completion
  having exists (select 1 from owned_classroom)
$$;

create or replace function public.teacher_student_progress_v2(
  p_classroom_id uuid,
  p_member_ref uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  base jsonb;
  student_id uuid;
  chapters jsonb;
  total_mistakes integer;
  unfinished_mistakes integer;
  overall_accuracy numeric;
begin
  base := public.teacher_student_progress(p_classroom_id, p_member_ref);

  select membership.user_id into student_id
  from public.classrooms as classroom
  join public.classroom_members as membership
    on membership.classroom_id = classroom.id
  where classroom.id = p_classroom_id
    and classroom.owner_teacher_id = (select auth.uid())
    and membership.member_ref = p_member_ref
    and membership.member_role = 'student';

  if student_id is null then
    return base;
  end if;

  select
    count(*)::integer,
    count(*) filter (where status in ('open', 'reopened'))::integer
  into total_mistakes, unfinished_mistakes
  from public.mistake_items
  where user_id = student_id;

  with student_facts as (
    select facts.*
    from public.teacher_assessment_facts(
      p_classroom_id, 'all', null, null, null
    ) as facts
    where facts.user_id = student_id
  )
  select case when count(*) > 0 then round(
    count(*) filter (where is_correct) * 100.0 / count(*), 1
  ) end into overall_accuracy
  from student_facts;

  select coalesce(jsonb_agg(
    chapter.value || jsonb_build_object(
      'assessment_accuracy', aggregate.assessment_accuracy,
      'section_quiz_accuracy', aggregate.section_quiz_accuracy,
      'chapter_quiz_accuracy', aggregate.chapter_quiz_accuracy,
      'live_accuracy', aggregate.live_accuracy,
      'status', case
        when challenge.status in ('completed', 'mastered') then challenge.status
        when chapter.value ->> 'status' = 'not_started' then 'not_started'
        else 'learning'
      end
    ) order by chapter.ordinality
  ), '[]'::jsonb)
  into chapters
  from jsonb_array_elements(base -> 'chapters')
    with ordinality as chapter(value, ordinality)
  left join lateral (
    select
      case when count(*) > 0 then round(
        count(*) filter (where facts.is_correct) * 100.0 / count(*), 1
      ) end as assessment_accuracy,
      case when count(*) filter (where facts.source_kind = 'section_quiz') > 0
        then round(
          count(*) filter (
            where facts.source_kind = 'section_quiz' and facts.is_correct
          ) * 100.0
          / count(*) filter (where facts.source_kind = 'section_quiz'), 1
        ) end as section_quiz_accuracy,
      case when count(*) filter (where facts.source_kind = 'chapter_quiz') > 0
        then round(
          count(*) filter (
            where facts.source_kind = 'chapter_quiz' and facts.is_correct
          ) * 100.0
          / count(*) filter (where facts.source_kind = 'chapter_quiz'), 1
        ) end as chapter_quiz_accuracy,
      case when count(*) filter (where facts.source_kind = 'live') > 0
        then round(
          count(*) filter (
            where facts.source_kind = 'live' and facts.is_correct
          ) * 100.0
          / count(*) filter (where facts.source_kind = 'live'), 1
        ) end as live_accuracy
    from public.teacher_assessment_facts(
      p_classroom_id, 'all', null, null,
      (chapter.value ->> 'chapter_id')::uuid
    ) as facts
    where facts.user_id = student_id
  ) as aggregate on true
  left join lateral public.chapter_challenge_progress_for(
    student_id, (chapter.value ->> 'chapter_id')::uuid
  ) as challenge on true;

  return jsonb_set(
    jsonb_set(base, '{chapters}', chapters),
    '{stats}',
    (base -> 'stats') || jsonb_build_object(
      'avg_accuracy', overall_accuracy,
      'total_mistake_count', total_mistakes,
      'unfinished_mistake_count', unfinished_mistakes
    )
  ) - 'mistakes';
end;
$$;

create or replace function public.get_classroom_progress(p_classroom_id uuid)
returns table (
  user_id uuid, display_name text, chapter_id uuid, mastery numeric,
  status text, rules_version text
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with owned as (
    select classroom.id
    from public.classrooms as classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
      and classroom.status = 'active'
  ), students as (
    select membership.user_id
    from public.classroom_members as membership
    join owned on owned.id = membership.classroom_id
    where membership.member_role = 'student'
      and membership.status = 'active'
  ), current_questions as (
    select question.id, question.version, chapter.id as chapter_id
    from public.questions as question
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    join public.sections as section on section.id = subtopic.section_id
    join public.chapters as chapter on chapter.id = section.chapter_id
    join public.courses as course on course.id = chapter.course_id
    where question.status = 'published'
      and question.bank_kind = 'chapter'
      and subtopic.status = 'published'
      and section.status = 'published'
      and chapter.status = 'published'
      and course.status = 'published'
  ), latest_answers as (
    select distinct on (student.user_id, current.id)
      student.user_id,
      current.id as question_id,
      current.chapter_id,
      answer.answer_status
    from students as student
    join public.quiz_sessions as session on session.user_id = student.user_id
      and session.status = 'completed'
      and session.purpose in ('practice', 'assignment', 'remediation')
    join public.quiz_session_questions as session_question
      on session_question.session_id = session.id
    join current_questions as current
      on current.id = session_question.question_id
      and current.version = session_question.question_version
    join public.quiz_answers as answer
      on answer.session_question_id = session_question.id
    order by student.user_id, current.id, answer.answered_at desc
  ), per_chapter as (
    select
      student.user_id,
      current.chapter_id,
      count(distinct current.id)::integer as total,
      count(answer.question_id)::integer as answered,
      count(answer.question_id) filter (
        where answer.answer_status = 'correct'
      )::integer as correct
    from students as student
    cross join current_questions as current
    left join latest_answers as answer on answer.user_id = student.user_id
      and answer.question_id = current.id
    group by student.user_id, current.chapter_id
  )
  select
    progress.user_id,
    profile.display_name,
    progress.chapter_id,
    case when progress.total > 0
      then round(progress.correct * 100.0 / progress.total, 1) end,
    case
      when challenge.status in ('completed', 'mastered') then challenge.status
      when progress.answered = 0 then 'not_started'
      when progress.correct * 100.0 / progress.total >= 60 then 'developing'
      else 'learning'
    end,
    '2026-09-progression-1'::text
  from per_chapter as progress
  join public.profiles as profile on profile.id = progress.user_id
  cross join lateral public.chapter_challenge_progress_for(
    progress.user_id, progress.chapter_id
  ) as challenge
$$;
