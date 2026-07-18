begin;

select plan(21);

select has_table('public', 'content_imports', 'import reports exist');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.content_imports'::regclass
      and conname = 'content_imports_teacher_request_unique'
  ),
  'one report exists per teacher and request'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid = 'public.content_imports'::regclass
      and relation.relrowsecurity
  ),
  1,
  'import reports enable RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.content_imports',
    'INSERT,UPDATE,DELETE'
  ),
  'reports are only written by the trusted command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.commit_content_import(jsonb, uuid, text, boolean)',
    'EXECUTE'
  ),
  'teachers may commit imports'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.commit_content_import(jsonb, uuid, text, boolean)',
    'EXECUTE'
  ),
  'anonymous cannot commit imports'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '28000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'import.teacher.a@colorplay.test',
    crypt('LocalOnly-Import1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '28000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'import.student.a@colorplay.test',
    crypt('LocalOnly-Import2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '28000000-0000-0000-0000-000000000001';

create function pg_temp.as_user(target_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select set_config('request.jwt.claim.sub', target_user::text, true);
$$;

create function pg_temp.question_row(
  code text,
  prompt text,
  answer text
)
returns jsonb
language sql
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'row', 2,
    'chapter', '3',
    'section_label', '3-1 色彩三要素與色名的表示',
    'subtopic_label', '色彩的分類',
    'code', code,
    'prompt', prompt,
    'options', jsonb_build_array(
      jsonb_build_object('key', 'A', 'text', '匯入選項甲'),
      jsonb_build_object('key', 'B', 'text', '匯入選項乙')
    ),
    'answer', answer,
    'explanation', '匯入測試解析。'
  );
$$;

select set_config(
  'test.baseline',
  (
    select count(*)::text from public.questions
    where stable_code ~ '^[34]-'
  ),
  true
);

set local role authenticated;
select pg_temp.as_user('28000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.commit_content_import(
    jsonb_build_object('questions', jsonb_build_array()),
    '28100000-0000-0000-0000-000000000001', 'x.xlsx', false
  )$$,
  'P0001',
  'CONTENT_TEACHER_ONLY',
  'students cannot commit imports'
);

select pg_temp.as_user('28000000-0000-0000-0000-000000000001');
select set_config(
  'test.commit1',
  public.commit_content_import(
    jsonb_build_object(
      'questions', jsonb_build_array(
        pg_temp.question_row('8-1-01', '匯入題目一', 'A'),
        pg_temp.question_row('8-1-02', '匯入題目二', '2')
      ),
      'review_cards', jsonb_build_array(
        jsonb_build_object(
          'row', 2,
          'chapter', '3',
          'section_label', '3-1 色彩三要素與色名的表示',
          'subtopic_label', '匯入分組',
          'title', '匯入卡片一',
          'content', '匯入卡片內容。',
          'media_url', '',
          'alt_text', ''
        )
      )
    ),
    '28100000-0000-0000-0000-000000000002', 'demo.xlsx', false
  )::text,
  true
);
select is(
  current_setting('test.commit1')::jsonb ->> 'status',
  'committed',
  'a valid import commits'
);
select is(
  (current_setting('test.commit1')::jsonb ->> 'valid_rows')::integer,
  3,
  'all rows counted valid'
);

reset role;
select is(
  (
    select status::text || ':' || version::text
    from public.questions
    where stable_code = '8-1-01'
  ),
  'draft:1',
  'imported questions land as drafts'
);
select is(
  (
    select option_key
    from public.question_options o
    join public.questions q on q.id = o.question_id
    where q.stable_code = '8-1-02' and o.is_correct
  ),
  'B',
  'digit answers resolve without defaulting to A'
);

set local role authenticated;
select pg_temp.as_user('28000000-0000-0000-0000-000000000001');
select is(
  public.commit_content_import(
    jsonb_build_object(
      'questions', jsonb_build_array(
        pg_temp.question_row('8-1-01', '匯入題目一', 'A')
      )
    ),
    '28100000-0000-0000-0000-000000000002', 'demo.xlsx', false
  ) ->> 'import_id',
  current_setting('test.commit1')::jsonb ->> 'import_id',
  'replaying the request returns the stored report untouched'
);

select set_config(
  'test.badcommit',
  public.commit_content_import(
    jsonb_build_object(
      'questions', jsonb_build_array(
        pg_temp.question_row('8-1-03', '合法列', 'A'),
        pg_temp.question_row('8-1-04', '壞正解列', 'X')
      )
    ),
    '28100000-0000-0000-0000-000000000003', 'bad.xlsx', false
  )::text,
  true
);
select is(
  current_setting('test.badcommit')::jsonb ->> 'status',
  'failed',
  'any invalid row fails the whole commit'
);
select is(
  current_setting('test.badcommit')::jsonb -> 'row_errors' -> 0 ->> 'code',
  'ANSWER_INVALID',
  'the failure names the invalid correct answer'
);

reset role;
select is(
  (
    select count(*)::integer from public.questions
    where stable_code in ('8-1-03', '8-1-04')
  ),
  0,
  'no row of a failed commit is written'
);

-- Fault injection: force a DB failure mid-apply; the command reports failed
-- without raising, and zero content rows survive.
create function pg_temp.explode()
returns trigger
language plpgsql
as $$
begin
  raise exception 'FAULT_INJECTED';
end;
$$;
create trigger content_import_fault
before insert on public.questions
for each row execute function pg_temp.explode();

set local role authenticated;
select pg_temp.as_user('28000000-0000-0000-0000-000000000001');
select is(
  public.commit_content_import(
    jsonb_build_object(
      'questions', jsonb_build_array(
        pg_temp.question_row('8-1-05', '故障注入列', 'A')
      )
    ),
    '28100000-0000-0000-0000-000000000004', 'fault.xlsx', false
  ) ->> 'status',
  'failed',
  'a mid-commit DB failure reports failed instead of success'
);

reset role;
drop trigger content_import_fault on public.questions;
select is(
  (
    select count(*)::integer from public.questions
    where stable_code = '8-1-05'
  ),
  0,
  'the failed transaction left zero content rows'
);
select is(
  (
    select count(*)::integer from public.content_imports
    where request_id = '28100000-0000-0000-0000-000000000004'
      and status = 'failed'
  ),
  1,
  'the failed report itself persists'
);

-- Dry run validates without writing.
set local role authenticated;
select pg_temp.as_user('28000000-0000-0000-0000-000000000001');
select is(
  public.commit_content_import(
    jsonb_build_object(
      'questions', jsonb_build_array(
        pg_temp.question_row('8-1-06', '演練列', 'A')
      )
    ),
    '28100000-0000-0000-0000-000000000005', 'dry.xlsx', true
  ) ->> 'status',
  'committed',
  'a dry run validates successfully'
);

reset role;
select is(
  (
    select count(*)::integer from public.questions
    where stable_code = '8-1-06'
  ),
  0,
  'dry runs write no content'
);
select is(
  (
    select count(*)::text from public.questions
    where stable_code ~ '^[34]-'
  ),
  current_setting('test.baseline'),
  'the verified baseline stable codes all survive'
);

select * from finish();
rollback;
