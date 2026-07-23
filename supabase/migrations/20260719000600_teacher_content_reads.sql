-- Teacher workspace reads: teachers prefill draft editors from the real rows,
-- so they need SELECT on draft question options and review card media.
-- Students keep the published-only policies from the content taxonomy.

create policy question_options_teacher_select on public.question_options
for select to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'teacher'
  )
);

create policy review_card_media_teacher_select on public.review_card_media
for select to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'teacher'
  )
);
