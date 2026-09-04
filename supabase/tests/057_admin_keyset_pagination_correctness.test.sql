-- supabase/tests/057_admin_keyset_pagination_correctness.test.sql
--
-- Task 13A-1 review 修正(2026-08-19,Critical／High):
--   1. Postgres 的 encode(bytea,'base64') 每 76 字元插入換行,cursor 與
--      複合主鍵 row_key 的簽發端原本沒有先移除,decode 端重算 padding
--      時把換行算進 length,padding 位數算錯導致解碼失敗 —— 任何超過
--      76 base64 字元的 payload(binding 欄位本身就是 64 hex 字元,幾乎
--      所有 cursor 都會中招)實質上完全不可用。
--   2. keyset 比較鍵原本一律 `::text`,但 ORDER BY 走排序欄原生型別:
--      對 integer 等欄位,文字序與數值序不一致,cursor 邊界會靜默漏掉
--      或重複列;對可為 NULL 的排序欄,cursor 停在 NULL 值時會被誤判成
--      毀損 cursor。
--
-- 本檔案用真實 >50 筆資料重現這兩類問題(短假值 fixture 測不到 76 字元
-- 邊界;沒有整數/NULL 排序欄的 fixture 測不到型別不一致)。
begin;
select plan(8);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── 整數排序欄跨頁:sort_order 刻意跨越個位/十位邊界 ─────────────────
-- seed 既有 chapters 用掉 sort_order 1..6(不覆寫、不刪除既有 seed 資料),
-- 本測試的 60 筆從 7 開始接續,總數跨過 50 筆分頁門檻,且集合本身跨越
-- 9→10 的個位/十位邊界。斷言不寫死「第幾筆」,只驗證「我插入的完整
-- 集合(7..66)在兩頁合併後不漏不重」,避免跟既有 seed 筆數耦合。
insert into public.courses (id, stable_code, title)
values ('0f000000-0000-0000-0000-0000000000c0', 'pagination-probe-course',
  'pagination probe course');
insert into public.chapters (course_id, stable_code, title, sort_order)
select '0f000000-0000-0000-0000-0000000000c0', 'pagination-probe-chapter-' || n,
  'chapter ' || n, n + 6
from generate_series(1, 60) n;

select (public.admin_list_resource('content', 'chapters', null, '{}',
  '{"column":"sort_order"}')) as page1 \gset
select (public.admin_list_resource('content', 'chapters',
  (:'page1'::jsonb ->> 'next_cursor'), '{}',
  '{"column":"sort_order"}')) as page2 \gset
select is(:'page2'::jsonb ->> 'outcome', 'ok',
  'the server-issued cursor for an integer sort column is accepted on the next page');
select is((
    select array_agg(v order by v) from (
      select (r ->> 'sort_order')::int as v
        from jsonb_array_elements(:'page1'::jsonb -> 'rows') r
      union all
      select (r ->> 'sort_order')::int
        from jsonb_array_elements(:'page2'::jsonb -> 'rows') r
    ) t where v between 7 and 66),
  (select array_agg(v order by v) from generate_series(7, 66) v),
  'the inserted 7..66 set round trips across both pages exactly once each, in numeric order');

-- ── NULL 排序值跨頁:completed_at,45 筆 NULL(進行中)+ 15 筆已完成 ──
insert into public.chapters (id, course_id, stable_code, title, sort_order)
values ('0f000000-0000-0000-0000-0000000000c9',
  '0f000000-0000-0000-0000-0000000000c0', 'pagination-probe-mastery-chapter',
  'mastery chapter', 0);
select array_agg(('0f100000-0000-0000-0000-0000' || lpad(n::text, 8, '0'))::uuid)
  as student_ids from generate_series(1, 60) n \gset
insert into auth.users (instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, confirmation_token,
    email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', uid, 'authenticated',
    'authenticated', 'pagination-probe-' || row_number() over () || '@colorplay.test',
    crypt('LocalOnly-Probe1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  from unnest(:'student_ids'::uuid[]) uid;
insert into public.mastery_sessions
  (user_id, chapter_id, question_ids, question_versions, position, status,
   completed_at)
select uid, '0f000000-0000-0000-0000-0000000000c9', array[]::uuid[],
  array[]::integer[], 1,
  case when ord <= 15 then 'completed' else 'in_progress' end,
  case when ord <= 15 then now() - (ord || ' days')::interval else null end
from unnest(:'student_ids'::uuid[]) with ordinality as t(uid, ord);

select (public.admin_list_resource('learning', 'mastery_sessions', null,
  '{}', '{"column":"completed_at"}')) as null_page1 \gset
select is((select count(*)::int
    from jsonb_array_elements(:'null_page1'::jsonb -> 'rows') r
    where (r ->> 'completed_at') is null), 35,
  'the first page holds all 15 non-null rows plus 35 of the 45 null-valued rows');
select isnt(:'null_page1'::jsonb ->> 'next_cursor', null,
  'a page ending inside the null tail still issues a cursor (not treated as malformed)');

select (public.admin_list_resource('learning', 'mastery_sessions',
  (:'null_page1'::jsonb ->> 'next_cursor'), '{}',
  '{"column":"completed_at"}')) as null_page2 \gset
select is(:'null_page2'::jsonb ->> 'outcome', 'ok',
  'a cursor minted from a null-valued boundary row is accepted, not denied as malformed');
select is(jsonb_array_length(:'null_page2'::jsonb -> 'rows'), 10,
  'the second page contains exactly the remaining 10 null-valued rows');
select ok((select bool_and((r ->> 'completed_at') is null)
    from jsonb_array_elements(:'null_page2'::jsonb -> 'rows') r),
  'every row on the null-tail continuation page is itself null-valued');

-- ── 複合主鍵 row token 換行:classroom_members 兩欄 uuid 主鍵 ─────────
update public.profiles set role = 'teacher'
  where id = 'bb000000-0000-0000-0000-000000000001';
insert into public.classrooms (id, owner_teacher_id, name, join_code_hash)
values ('0f000000-0000-0000-0000-0000000000cc',
  'bb000000-0000-0000-0000-000000000001', 'pagination probe classroom',
  decode(repeat('ab', 32), 'hex'));
insert into public.classroom_members
  (classroom_id, user_id, member_role, last_join_request_id)
values ('0f000000-0000-0000-0000-0000000000cc',
  'cc000000-0000-0000-0000-000000000001', 'student', gen_random_uuid());
select (public.admin_list_resource('classrooms', 'classroom_members', null,
  '{}', null)) as members_page \gset
select (public.admin_get_resource_detail('classrooms', 'classroom_members',
  (:'members_page'::jsonb -> 'rows' -> 0 ->> 'row_key'))) as members_detail \gset
select is(:'members_detail'::jsonb ->> 'outcome', 'ok',
  'a real two-column uuid row token round trips through admin_get_resource_detail');

select * from finish();
rollback;
