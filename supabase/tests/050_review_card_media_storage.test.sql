begin;

select plan(6);

select ok(
  exists (
    select 1 from storage.buckets where id = 'review-card-media'
  ),
  'review card media bucket exists'
);

select is(
  (select public from storage.buckets where id = 'review-card-media'),
  false,
  'review card media stays private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'review-card-media'),
  2097152::bigint,
  'review card media enforces the 2 MiB limit'
);

select results_eq(
  $$select mime from unnest(
      (select allowed_mime_types from storage.buckets
       where id = 'review-card-media')
    ) as mime
    order by mime$$,
  $$values ('image/jpeg'::text), ('image/png'::text), ('image/webp'::text)$$,
  'review card media accepts only PNG, JPEG, and WebP'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'review_card_media_objects_read_published'
      and roles = array['authenticated']::name[]
  ),
  'authenticated reads use a scoped storage object policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'review_card_media_objects_read_published'
      and cmd <> 'SELECT'
  ),
  'the migration grants no browser upload or mutation policy'
);

select * from finish();

rollback;
