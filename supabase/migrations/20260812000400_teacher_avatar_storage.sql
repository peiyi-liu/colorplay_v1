-- Teacher avatars are private, server-authorized assets. Each teacher owns one
-- stable object path: <auth.uid()>/avatar. The fixed path avoids a second
-- profile/domain state and makes replacement idempotent.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'teacher-avatars',
  'teacher-avatars',
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

drop policy if exists teacher_avatar_objects_read_own on storage.objects;
drop policy if exists teacher_avatar_objects_insert_own on storage.objects;
drop policy if exists teacher_avatar_objects_update_own on storage.objects;

create policy teacher_avatar_objects_read_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'teacher-avatars'
  and name = auth.uid()::text || '/avatar'
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role = 'teacher'
  )
);

create policy teacher_avatar_objects_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'teacher-avatars'
  and name = auth.uid()::text || '/avatar'
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role = 'teacher'
  )
);

create policy teacher_avatar_objects_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'teacher-avatars'
  and name = auth.uid()::text || '/avatar'
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role = 'teacher'
  )
)
with check (
  bucket_id = 'teacher-avatars'
  and name = auth.uid()::text || '/avatar'
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role = 'teacher'
  )
);
