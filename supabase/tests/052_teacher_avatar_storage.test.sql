begin;

select plan(21);

select ok(
  exists (select 1 from storage.buckets where id = 'teacher-avatars'),
  'teacher avatar bucket exists'
);

select is(
  (select public from storage.buckets where id = 'teacher-avatars'),
  false,
  'teacher avatar bucket stays private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'teacher-avatars'),
  2097152::bigint,
  'teacher avatars enforce the 2 MiB limit'
);

select results_eq(
  $$select mime from unnest(
      (select allowed_mime_types from storage.buckets
       where id = 'teacher-avatars')
    ) as mime
    order by mime$$,
  $$values ('image/jpeg'::text), ('image/png'::text), ('image/webp'::text)$$,
  'teacher avatars accept only PNG, JPEG, and WebP'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'teacher_avatar_objects_read_own'
      and cmd = 'SELECT'
  ),
  'teachers can read only through the dedicated policy'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'teacher_avatar_objects_insert_own'
      and cmd = 'INSERT'
  ),
  'teachers can insert only through the dedicated policy'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'teacher_avatar_objects_update_own'
      and cmd = 'UPDATE'
  ),
  'teachers can replace only through the dedicated policy'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'teacher_avatar_objects_%'
      and roles <> array['authenticated']::name[]
  ),
  'avatar policies are never granted to anonymous users'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '2b700000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'avatar.owner@colorplay.test',
    crypt('LocalOnly-Avatar1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '2b700000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'avatar.other@colorplay.test',
    crypt('LocalOnly-Avatar2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '2b700000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'avatar.student@colorplay.test',
    crypt('LocalOnly-Avatar3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '2b700000-0000-0000-0000-000000000001',
  '2b700000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '2b700000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'teacher-avatars',
      '2b700000-0000-0000-0000-000000000001/avatar',
      '2b700000-0000-0000-0000-000000000001',
      '{"revision":1}'::jsonb
    )$$,
  'teacher inserts their fixed avatar path through storage RLS'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'teacher-avatars'
  ),
  1,
  'teacher selects their own avatar object'
);
select lives_ok(
  $$update storage.objects
    set metadata = '{"revision":2}'::jsonb
    where bucket_id = 'teacher-avatars'
      and name = '2b700000-0000-0000-0000-000000000001/avatar'$$,
  'teacher updates their own avatar object'
);

select set_config(
  'request.jwt.claim.sub',
  '2b700000-0000-0000-0000-000000000003',
  true
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'teacher-avatars',
      '2b700000-0000-0000-0000-000000000003/avatar',
      '2b700000-0000-0000-0000-000000000003'
    )$$,
  '42501',
  null,
  'student cannot insert an avatar object'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'teacher-avatars'
  ),
  0,
  'student cannot read a teacher avatar object'
);
select results_eq(
  $$with changed as (
      update storage.objects
      set metadata = '{"student":true}'::jsonb
      where bucket_id = 'teacher-avatars'
      returning 1
    )
    select count(*)::integer from changed$$,
  array[0],
  'student cannot update a teacher avatar object'
);

select set_config(
  'request.jwt.claim.sub',
  '2b700000-0000-0000-0000-000000000002',
  true
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'teacher-avatars',
      '2b700000-0000-0000-0000-000000000002/avatar',
      '2b700000-0000-0000-0000-000000000002'
    )$$,
  'second teacher inserts only their own fixed avatar path'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'teacher-avatars'
      and name = '2b700000-0000-0000-0000-000000000001/avatar'
  ),
  0,
  'other teacher cannot read the owner avatar object'
);
select results_eq(
  $$with changed as (
      update storage.objects
      set metadata = '{"other_teacher":true}'::jsonb
      where bucket_id = 'teacher-avatars'
        and name = '2b700000-0000-0000-0000-000000000001/avatar'
      returning 1
    )
    select count(*)::integer from changed$$,
  array[0],
  'other teacher cannot update the owner avatar object'
);

select set_config(
  'request.jwt.claim.sub',
  '2b700000-0000-0000-0000-000000000001',
  true
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'teacher-avatars',
      '2b700000-0000-0000-0000-000000000002/copied-avatar',
      '2b700000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'teacher cannot write into another user path'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'teacher-avatars',
      'arbitrary/path',
      '2b700000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'teacher cannot write an arbitrary object path'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'teacher-avatars'
      and name = '2b700000-0000-0000-0000-000000000002/avatar'
  ),
  0,
  'teacher cannot read another teacher object in the same bucket'
);
select results_eq(
  $$with changed as (
      update storage.objects
      set metadata = '{"owner":true}'::jsonb
      where bucket_id = 'teacher-avatars'
        and name = '2b700000-0000-0000-0000-000000000002/avatar'
      returning 1
    )
    select count(*)::integer from changed$$,
  array[0],
  'teacher cannot update another teacher object in the same bucket'
);

reset role;

select * from finish();

rollback;
