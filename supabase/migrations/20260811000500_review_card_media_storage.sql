-- Lesson illustrations stay private. Authenticated students receive short-lived
-- signed URLs only when the object is mapped to the current version of a
-- published review card. No browser upload or mutation policy is granted.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'review-card-media',
  'review-card-media',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists review_card_media_objects_read_published
on storage.objects;

create policy review_card_media_objects_read_published
on storage.objects
for select
to authenticated
using (
  bucket_id = 'review-card-media'
  and exists (
    select 1
    from public.review_card_media media
    join public.review_cards card on card.id = media.review_card_id
    join public.subtopics subtopic on subtopic.id = card.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    join public.chapters chapter on chapter.id = section.chapter_id
    join public.courses course on course.id = chapter.course_id
    where media.asset_path = storage.objects.bucket_id || '/' || storage.objects.name
      and media.card_version = card.version
      and card.status = 'published'
      and subtopic.status = 'published'
      and section.status = 'published'
      and chapter.status = 'published'
      and course.status = 'published'
  )
);
