create type public.content_status as enum ('draft', 'published', 'archived');
create type public.question_type as enum ('single_choice');

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  stable_code text not null unique check (stable_code ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '',
  status public.content_status not null default 'draft',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  stable_code text not null,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '',
  status public.content_status not null default 'draft',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, stable_code)
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  stable_code text not null,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '',
  status public.content_status not null default 'draft',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, stable_code)
);

create table public.subtopics (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  stable_code text not null,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '',
  status public.content_status not null default 'draft',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, stable_code)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics(id) on delete cascade,
  stable_code text not null unique check (stable_code ~ '^[0-9]+-[0-9]+-[0-9]{2}$'),
  question_type public.question_type not null default 'single_choice',
  prompt text not null check (char_length(btrim(prompt)) between 1 and 1000),
  explanation text not null check (char_length(btrim(explanation)) between 1 and 2000),
  version integer not null default 1 check (version > 0),
  status public.content_status not null default 'draft',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_key text not null check (option_key ~ '^[A-D]$'),
  option_text text not null check (char_length(btrim(option_text)) between 1 and 500),
  is_correct boolean not null default false,
  sort_order integer not null check (sort_order between 1 and 4),
  unique (question_id, option_key),
  unique (question_id, sort_order)
);

create table public.quiz_templates (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  stable_code text not null,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  question_count integer not null default 10 check (question_count between 1 and 10),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, stable_code)
);

create index courses_status_sort_order_idx
  on public.courses(status, sort_order);
create index chapters_status_sort_order_idx
  on public.chapters(status, sort_order);
create index chapters_course_id_idx on public.chapters(course_id);
create index sections_status_sort_order_idx
  on public.sections(status, sort_order);
create index sections_chapter_id_idx on public.sections(chapter_id);
create index subtopics_status_sort_order_idx
  on public.subtopics(status, sort_order);
create index subtopics_section_id_idx on public.subtopics(section_id);
create index questions_status_sort_order_idx
  on public.questions(status, sort_order);
create index questions_subtopic_id_idx on public.questions(subtopic_id);
create index question_options_question_id_idx
  on public.question_options(question_id, sort_order);
create index quiz_templates_status_chapter_idx
  on public.quiz_templates(status, chapter_id);

create function public.validate_single_choice_options(target_question_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  option_count integer;
  correct_count integer;
  question_is_published boolean;
begin
  select q.status = 'published'
  into question_is_published
  from public.questions q
  where q.id = target_question_id;

  if not coalesce(question_is_published, false) then
    return;
  end if;

  select count(*)::integer, count(*) filter (where qo.is_correct)::integer
  into option_count, correct_count
  from public.question_options qo
  where qo.question_id = target_question_id;

  if option_count not between 2 and 4 or correct_count <> 1 then
    raise exception using
      errcode = '23514',
      message = 'published single-choice questions require 2-4 options and exactly one correct option';
  end if;
end;
$$;

create function public.enforce_single_choice_options()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.validate_single_choice_options(coalesce(new.question_id, old.question_id));
  if tg_op = 'UPDATE' and old.question_id is distinct from new.question_id then
    perform public.validate_single_choice_options(old.question_id);
  end if;
  return null;
end;
$$;

create function public.enforce_published_question_options()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.validate_single_choice_options(new.id);
  return null;
end;
$$;

create constraint trigger question_options_valid_single_choice
after insert or update or delete on public.question_options
deferrable initially deferred
for each row execute function public.enforce_single_choice_options();

create constraint trigger published_question_has_valid_options
after insert or update of status on public.questions
deferrable initially deferred
for each row execute function public.enforce_published_question_options();

revoke all on function public.validate_single_choice_options(uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_single_choice_options()
  from public, anon, authenticated;
revoke all on function public.enforce_published_question_options()
  from public, anon, authenticated;

alter table public.courses enable row level security;
alter table public.chapters enable row level security;
alter table public.sections enable row level security;
alter table public.subtopics enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.quiz_templates enable row level security;

revoke all on public.courses from anon, authenticated;
revoke all on public.chapters from anon, authenticated;
revoke all on public.sections from anon, authenticated;
revoke all on public.subtopics from anon, authenticated;
revoke all on public.questions from anon, authenticated;
revoke all on public.question_options from anon, authenticated;
revoke all on public.quiz_templates from anon, authenticated;

grant select on public.courses to authenticated;
grant select on public.chapters to authenticated;
grant select on public.sections to authenticated;
grant select on public.subtopics to authenticated;
grant select on public.questions to authenticated;
grant select (id, question_id, option_key, option_text, sort_order)
  on public.question_options to authenticated;
grant select on public.quiz_templates to authenticated;

create policy courses_read_published on public.courses
for select to authenticated
using (status = 'published');

create policy chapters_read_published on public.chapters
for select to authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.courses c
    where c.id = chapters.course_id and c.status = 'published'
  )
);

create policy sections_read_published on public.sections
for select to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.chapters ch
    join public.courses c on c.id = ch.course_id
    where ch.id = sections.chapter_id
      and ch.status = 'published'
      and c.status = 'published'
  )
);

create policy subtopics_read_published on public.subtopics
for select to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.sections s
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where s.id = subtopics.section_id
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
  )
);

create policy questions_read_published on public.questions
for select to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.subtopics st
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where st.id = questions.subtopic_id
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
  )
);

create policy question_options_read_published on public.question_options
for select to authenticated
using (
  exists (
    select 1
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where q.id = question_options.question_id
      and q.status = 'published'
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
  )
);

create policy quiz_templates_read_published on public.quiz_templates
for select to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.chapters ch
    join public.courses c on c.id = ch.course_id
    where ch.id = quiz_templates.chapter_id
      and ch.status = 'published'
      and c.status = 'published'
  )
);

create view public.question_options_public
with (security_invoker = true)
as
select id, question_id, option_key, option_text, sort_order
from public.question_options;

revoke all on public.question_options_public from public, anon, authenticated;
grant select on public.question_options_public to authenticated;
