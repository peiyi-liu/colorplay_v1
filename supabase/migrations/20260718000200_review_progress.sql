-- Review completion is an explicit student action recorded by a trusted
-- command. Completion identity is (user, card, card version): a new card
-- version with requires_recompletion keeps the old row as history while the
-- projection demands a fresh completion; recompletion-exempt cards carry any
-- prior completion forward. Rules version 2026-07-progress-1.

create table public.review_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_card_id uuid not null
    references public.review_cards(id) on delete cascade,
  card_version integer not null check (card_version > 0),
  completed_at timestamptz not null default now(),
  rules_version text not null default '2026-07-progress-1',
  request_id uuid not null,
  constraint review_progress_user_card_version_unique
    unique (user_id, review_card_id, card_version)
);

create index review_progress_card_idx
  on public.review_progress (review_card_id);

alter table public.review_progress enable row level security;

grant select on public.review_progress to authenticated;

create policy review_progress_own_select on public.review_progress
for select to authenticated
using (user_id = (select auth.uid()));

create function public.complete_review_card(
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
  card_record public.review_cards;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'REVIEW_INVALID_REQUEST';
  end if;

  select card.* into card_record
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

revoke all on function public.complete_review_card(uuid, uuid)
from public, anon;
grant execute on function public.complete_review_card(uuid, uuid)
to authenticated;

-- Per-subtopic completion counts over current published cards. A completion
-- counts when it matches the card's current version, or when the card is
-- recompletion-exempt and any prior completion exists.
create function public.get_review_completion(
  p_chapter_id uuid default null
)
returns table (
  subtopic_id uuid,
  chapter_id uuid,
  completed_count integer,
  total_count integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    st.id as subtopic_id,
    ch.id as chapter_id,
    count(card.id) filter (
      where exists (
        select 1
        from public.review_progress progress
        where progress.user_id = (select auth.uid())
          and progress.review_card_id = card.id
          and (
            progress.card_version = card.version
            or card.requires_recompletion = false
          )
      )
    )::integer as completed_count,
    count(card.id)::integer as total_count
  from public.subtopics st
  join public.sections s on s.id = st.section_id
  join public.chapters ch on ch.id = s.chapter_id
  join public.courses c on c.id = ch.course_id
  left join public.review_cards card
    on card.subtopic_id = st.id and card.status = 'published'
  where st.status = 'published'
    and s.status = 'published'
    and ch.status = 'published'
    and c.status = 'published'
    and (p_chapter_id is null or ch.id = p_chapter_id)
    and (select auth.uid()) is not null
  group by st.id, ch.id, st.sort_order
  order by st.sort_order, st.id
$$;

revoke all on function public.get_review_completion(uuid)
from public, anon;
grant execute on function public.get_review_completion(uuid)
to authenticated;
