-- Keep student learning reads below the published-content latency budget by
-- reusing one progress snapshot per request instead of recalculating it once
-- for every chapter.

create index if not exists quiz_session_questions_question_version_idx
on public.quiz_session_questions(question_id, question_version, session_id);

create or replace function public.get_learning_progress(
  p_chapter_id uuid default null
)
returns table (
  scope text,
  chapter_id uuid,
  subtopic_id uuid,
  review_completed integer,
  review_total integer,
  coverage numeric,
  accuracy numeric,
  mastery numeric,
  status text,
  rules_version text
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    snapshot.scope,
    snapshot.chapter_id,
    snapshot.subtopic_id,
    snapshot.review_completed,
    snapshot.review_total,
    snapshot.coverage,
    snapshot.accuracy,
    snapshot.mastery,
    snapshot.status,
    snapshot.rules_version
  from public.learning_progress_for(
    (select auth.uid()),
    p_chapter_id
  ) snapshot
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

  select course.* into course_record
  from public.courses course
  where course.status = 'published'
  order by course.sort_order, course.id
  limit 1;

  if course_record.id is null then
    return jsonb_build_object(
      'mode', 'open',
      'rules_version', '2026-08-sequence-1',
      'chapters', '[]'::jsonb
    );
  end if;

  select
    coalesce(setting.mode, 'open'),
    coalesce(setting.rules_version, '2026-08-sequence-1')
  into progression_mode, progression_rules
  from (select course_record.id as course_id) target
  left join public.course_progression_settings setting
    on setting.course_id = target.course_id;

  with progress_snapshot as materialized (
    select
      progress.chapter_id,
      coalesce(progress.review_completed, 0)::integer as review_completed,
      progress.review_total,
      progress.mastery,
      coalesce(progress.status, 'not_started')::text as progress_status,
      coalesce(
        progress.review_total > 0
        and progress.review_completed = progress.review_total
        and progress.mastery >= 80,
        false
      ) as is_complete
    from public.learning_progress_for(actor_id, null) progress
    where progress.scope = 'chapter'
  ), chapter_state as materialized (
    select
      chapter.*,
      public.chapter_content_is_available(chapter.id) as content_available,
      case
        when progression_mode = 'open' or chapter.sort_order = 1 then true
        else exists (
          select 1
          from public.student_chapter_unlocks unlock
          where unlock.user_id = actor_id
            and unlock.chapter_id = chapter.id
        )
      end as can_access
    from public.chapters chapter
    where chapter.course_id = course_record.id
      and chapter.status = 'published'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'chapter_id', chapter.id,
        'stable_code', chapter.stable_code,
        'sort_order', chapter.sort_order,
        'title', chapter.title,
        'description', chapter.description,
        'template_id', template.id,
        'template_question_count', template.question_count,
        'access_state', case
          when not chapter.content_available then 'content_unavailable'
          when coalesce(completion.is_complete, false) then 'completed'
          when chapter.can_access then 'available'
          else 'locked'
        end,
        'progress_status', coalesce(
          completion.progress_status,
          'not_started'
        ),
        'review_completed', coalesce(completion.review_completed, 0),
        'review_total', completion.review_total,
        'mastery', completion.mastery,
        'blockers', case
          when not chapter.content_available then jsonb_build_array(
            jsonb_build_object(
              'code', 'CONTENT_UNAVAILABLE',
              'chapter_id', chapter.id,
              'chapter_title', coalesce(chapter.title, ''),
              'current', null,
              'required', null
            )
          )
          when chapter.can_access or prerequisite.id is null then '[]'::jsonb
          else
            case
              when prerequisite_completion.review_total is null
                or prerequisite_completion.review_total = 0
                or prerequisite_completion.review_completed
                  < prerequisite_completion.review_total
              then jsonb_build_array(jsonb_build_object(
                'code', 'PREREQUISITE_REVIEW',
                'chapter_id', prerequisite.id,
                'chapter_title', prerequisite.title,
                'current', coalesce(
                  prerequisite_completion.review_completed,
                  0
                ),
                'required', prerequisite_completion.review_total
              ))
              else '[]'::jsonb
            end
            || case
              when prerequisite_completion.mastery is null
                or prerequisite_completion.mastery < 80
              then jsonb_build_array(jsonb_build_object(
                'code', 'PREREQUISITE_MASTERY',
                'chapter_id', prerequisite.id,
                'chapter_title', prerequisite.title,
                'current', prerequisite_completion.mastery,
                'required', 80
              ))
              else '[]'::jsonb
            end
        end
      )
      order by chapter.sort_order, chapter.id
    ),
    '[]'::jsonb
  ) into chapters_payload
  from chapter_state chapter
  left join lateral (
    select candidate.id, candidate.question_count
    from public.quiz_templates candidate
    where candidate.chapter_id = chapter.id
      and candidate.section_id is null
      and candidate.status = 'published'
    order by candidate.created_at, candidate.id
    limit 1
  ) template on true
  left join progress_snapshot completion
    on completion.chapter_id = chapter.id
  left join lateral (
    select previous.id, previous.title
    from chapter_state previous
    where previous.sort_order < chapter.sort_order
    order by previous.sort_order desc
    limit 1
  ) prerequisite on true
  left join progress_snapshot prerequisite_completion
    on prerequisite_completion.chapter_id = prerequisite.id;

  return jsonb_build_object(
    'mode', progression_mode,
    'rules_version', progression_rules,
    'chapters', chapters_payload
  );
end;
$$;
