-- Server-authoritative chapter access. The rollout starts in open mode; a
-- later explicit content gate is the only operation allowed to activate
-- sequential progression.

create table public.course_progression_settings (
  course_id uuid primary key references public.courses(id) on delete cascade,
  mode text not null default 'open' check (mode in ('open', 'sequential')),
  rules_version text not null default '2026-08-sequence-1',
  updated_at timestamptz not null default clock_timestamp()
);

create table public.student_chapter_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  source_chapter_id uuid references public.chapters(id) on delete restrict,
  unlocked_at timestamptz not null default clock_timestamp(),
  rules_version text not null default '2026-08-sequence-1',
  primary key (user_id, chapter_id)
);

create index student_chapter_unlocks_chapter_idx
on public.student_chapter_unlocks(chapter_id);

insert into public.course_progression_settings (course_id)
select course.id
from public.courses course
on conflict (course_id) do nothing;

alter table public.course_progression_settings enable row level security;
alter table public.student_chapter_unlocks enable row level security;

revoke all on public.course_progression_settings from anon, authenticated;
revoke all on public.student_chapter_unlocks from anon, authenticated;
grant select on public.course_progression_settings to authenticated;
grant select on public.student_chapter_unlocks to authenticated;

create policy course_progression_settings_authenticated_read
on public.course_progression_settings
for select to authenticated
using (true);

create policy student_chapter_unlocks_own_read
on public.student_chapter_unlocks
for select to authenticated
using (user_id = (select auth.uid()));

create function public.student_chapter_completion(
  p_user_id uuid,
  p_chapter_id uuid
)
returns table (
  review_completed integer,
  review_total integer,
  mastery numeric,
  progress_status text,
  is_complete boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    coalesce(progress.review_completed, 0)::integer,
    progress.review_total,
    progress.mastery,
    coalesce(progress.status, 'not_started')::text,
    coalesce(
      progress.review_total > 0
      and progress.review_completed = progress.review_total
      and progress.mastery >= 80,
      false
    )
  from (select 1) seed
  left join lateral (
    select snapshot.*
    from public.learning_progress_for(p_user_id, p_chapter_id) snapshot
    where snapshot.scope = 'chapter'
      and snapshot.chapter_id = p_chapter_id
    limit 1
  ) progress on true
$$;

create function public.chapter_content_is_available(p_chapter_id uuid)
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
    join public.quiz_templates template on template.chapter_id = chapter.id
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

create function public.student_can_access_chapter(p_chapter_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  chapter_record public.chapters%rowtype;
  progression_mode text;
begin
  if actor_id is null then
    return false;
  end if;

  select chapter.* into chapter_record
  from public.chapters chapter
  join public.courses course on course.id = chapter.course_id
  where chapter.id = p_chapter_id
    and chapter.status = 'published'
    and course.status = 'published';

  if chapter_record.id is null
    or not public.chapter_content_is_available(p_chapter_id) then
    return false;
  end if;

  select coalesce(setting.mode, 'open') into progression_mode
  from (select chapter_record.course_id as course_id) target
  left join public.course_progression_settings setting
    on setting.course_id = target.course_id;

  if progression_mode = 'open' or chapter_record.sort_order = 1 then
    return true;
  end if;

  return exists (
    select 1
    from public.student_chapter_unlocks unlock
    where unlock.user_id = actor_id
      and unlock.chapter_id = p_chapter_id
  );
end;
$$;

create function public.chapter_access_blockers(p_chapter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  chapter_record public.chapters%rowtype;
  prerequisite_record public.chapters%rowtype;
  completion_record record;
  blockers jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select chapter.* into chapter_record
  from public.chapters chapter
  where chapter.id = p_chapter_id
    and chapter.status = 'published';

  if chapter_record.id is null
    or not public.chapter_content_is_available(p_chapter_id) then
    return jsonb_build_array(jsonb_build_object(
      'code', 'CONTENT_UNAVAILABLE',
      'chapter_id', p_chapter_id,
      'chapter_title', coalesce(chapter_record.title, ''),
      'current', null,
      'required', null
    ));
  end if;

  if public.student_can_access_chapter(p_chapter_id) then
    return blockers;
  end if;

  select prerequisite.* into prerequisite_record
  from public.chapters prerequisite
  where prerequisite.course_id = chapter_record.course_id
    and prerequisite.status = 'published'
    and prerequisite.sort_order < chapter_record.sort_order
  order by prerequisite.sort_order desc
  limit 1;

  if prerequisite_record.id is null then
    return blockers;
  end if;

  select * into completion_record
  from public.student_chapter_completion(actor_id, prerequisite_record.id);

  if completion_record.review_total is null
    or completion_record.review_total = 0
    or completion_record.review_completed < completion_record.review_total then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PREREQUISITE_REVIEW',
      'chapter_id', prerequisite_record.id,
      'chapter_title', prerequisite_record.title,
      'current', completion_record.review_completed,
      'required', completion_record.review_total
    ));
  end if;

  if completion_record.mastery is null or completion_record.mastery < 80 then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PREREQUISITE_MASTERY',
      'chapter_id', prerequisite_record.id,
      'chapter_title', prerequisite_record.title,
      'current', completion_record.mastery,
      'required', 80
    ));
  end if;

  return blockers;
end;
$$;

create function public.assert_student_chapter_access(p_chapter_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if not public.student_can_access_chapter(p_chapter_id) then
    raise exception using
      errcode = 'P0001',
      message = 'CHAPTER_LOCKED',
      detail = public.chapter_access_blockers(p_chapter_id)::text;
  end if;
end;
$$;

create function public.get_student_chapter_map()
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
          when not public.chapter_content_is_available(chapter.id)
            then 'content_unavailable'
          when completion.is_complete then 'completed'
          when public.student_can_access_chapter(chapter.id) then 'available'
          else 'locked'
        end,
        'progress_status', completion.progress_status,
        'review_completed', completion.review_completed,
        'review_total', completion.review_total,
        'mastery', completion.mastery,
        'blockers', case
          when not public.chapter_content_is_available(chapter.id)
            or not public.student_can_access_chapter(chapter.id)
            then public.chapter_access_blockers(chapter.id)
          else '[]'::jsonb
        end
      )
      order by chapter.sort_order, chapter.id
    ),
    '[]'::jsonb
  ) into chapters_payload
  from public.chapters chapter
  left join lateral (
    select candidate.id, candidate.question_count
    from public.quiz_templates candidate
    where candidate.chapter_id = chapter.id
      and candidate.status = 'published'
    order by candidate.created_at, candidate.id
    limit 1
  ) template on true
  left join lateral (
    select snapshot.*
    from public.student_chapter_completion(actor_id, chapter.id) snapshot
  ) completion on true
  where chapter.course_id = course_record.id
    and chapter.status = 'published';

  return jsonb_build_object(
    'mode', progression_mode,
    'rules_version', progression_rules,
    'chapters', chapters_payload
  );
end;
$$;

create function public.get_accessible_chapter_review(p_chapter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  review_payload jsonb;
begin
  perform public.assert_student_chapter_access(p_chapter_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', section.id,
        'stable_code', section.stable_code,
        'title', section.title,
        'sort_order', section.sort_order,
        'subtopics', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', subtopic.id,
                'stable_code', subtopic.stable_code,
                'title', subtopic.title,
                'sort_order', subtopic.sort_order,
                'review_cards', (
                  select coalesce(
                    jsonb_agg(
                      jsonb_build_object(
                        'id', card.id,
                        'group_label', card.group_label,
                        'title', card.title,
                        'content', card.content,
                        'version', card.version,
                        'requires_recompletion', card.requires_recompletion,
                        'sort_order', card.sort_order,
                        'review_card_media', (
                          select coalesce(
                            jsonb_agg(
                              jsonb_build_object(
                                'asset_path', media.asset_path,
                                'alt_text', media.alt_text,
                                'sort_order', media.sort_order
                              ) order by media.sort_order, media.id
                            ),
                            '[]'::jsonb
                          )
                          from public.review_card_media media
                          where media.review_card_id = card.id
                            and media.card_version = card.version
                        )
                      ) order by card.sort_order, card.id
                    ),
                    '[]'::jsonb
                  )
                  from public.review_cards card
                  where card.subtopic_id = subtopic.id
                    and card.status = 'published'
                )
              ) order by subtopic.sort_order, subtopic.id
            ),
            '[]'::jsonb
          )
          from public.subtopics subtopic
          where subtopic.section_id = section.id
            and subtopic.status = 'published'
        )
      ) order by section.sort_order, section.id
    ),
    '[]'::jsonb
  ) into review_payload
  from public.sections section
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.courses course on course.id = chapter.course_id
  where section.chapter_id = p_chapter_id
    and section.status = 'published'
    and chapter.status = 'published'
    and course.status = 'published';

  return review_payload;
end;
$$;

revoke all on function public.student_chapter_completion(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.chapter_content_is_available(uuid)
from public, anon, authenticated;
revoke all on function public.student_can_access_chapter(uuid)
from public, anon, authenticated;
revoke all on function public.chapter_access_blockers(uuid)
from public, anon, authenticated;
revoke all on function public.assert_student_chapter_access(uuid)
from public, anon, authenticated;
revoke all on function public.get_student_chapter_map()
from public, anon;
revoke all on function public.get_accessible_chapter_review(uuid)
from public, anon;

grant execute on function public.get_student_chapter_map()
to authenticated;
grant execute on function public.get_accessible_chapter_review(uuid)
to authenticated;
