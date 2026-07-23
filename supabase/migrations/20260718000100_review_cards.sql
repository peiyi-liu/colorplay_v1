-- Review cards are the studyable content of a subtopic. Cards are versioned
-- published content: students only ever see the published chain
-- (course→chapter→section→subtopic→card), mirroring the question policies.
-- Teacher CRUD arrives with the Phase 6 content workspace; this phase seeds
-- cards through the reviewed import pipeline only.

create table public.review_cards (
  id uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics(id) on delete cascade,
  stable_code text not null unique
    check (char_length(btrim(stable_code)) between 1 and 200),
  group_label text not null default ''
    check (char_length(group_label) <= 120),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(btrim(content)) between 1 and 8000),
  version integer not null default 1 check (version > 0),
  status public.content_status not null default 'draft',
  requires_recompletion boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_cards_subtopic_idx
  on public.review_cards (subtopic_id, sort_order);

create table public.review_card_media (
  id uuid primary key default gen_random_uuid(),
  review_card_id uuid not null
    references public.review_cards(id) on delete cascade,
  card_version integer not null check (card_version > 0),
  asset_path text not null
    check (char_length(btrim(asset_path)) between 1 and 500),
  alt_text text not null
    check (char_length(btrim(alt_text)) between 1 and 300),
  sort_order integer not null check (sort_order >= 0),
  unique (review_card_id, card_version, sort_order)
);

alter table public.review_cards enable row level security;
alter table public.review_card_media enable row level security;

grant select on public.review_cards to authenticated;
grant select on public.review_card_media to authenticated;

create policy review_cards_read_published on public.review_cards
for select to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.subtopics st
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where st.id = review_cards.subtopic_id
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
  )
);

create policy review_card_media_read_published on public.review_card_media
for select to authenticated
using (
  exists (
    select 1
    from public.review_cards card
    join public.subtopics st on st.id = card.subtopic_id
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where card.id = review_card_media.review_card_id
      and card.status = 'published'
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
  )
);
