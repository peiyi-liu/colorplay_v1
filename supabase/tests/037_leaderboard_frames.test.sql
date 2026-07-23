begin;

select plan(6);

-- 種子：兩位學生＋一位教師＋班級
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', ids.id,
  'authenticated', 'authenticated', ids.email,
  crypt('LocalOnly-Board1!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('10000000-0000-0000-0000-000000000051'::uuid, 'board.teacher@colorplay.test'),
  ('10000000-0000-0000-0000-000000000052'::uuid, 'board.one@colorplay.test'),
  ('10000000-0000-0000-0000-000000000053'::uuid, 'board.two@colorplay.test')
) as ids(id, email);

update public.profiles
set role = 'teacher'
where id = '10000000-0000-0000-0000-000000000051';

insert into public.classrooms (id, owner_teacher_id, name, join_code_hash)
values (
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000051',
  '邊框測試班',
  sha256('board-test-code'::bytea)
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, last_join_request_id
)
values
  ('70000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000052', 'student',
   '70000000-0000-0000-0000-000000000011'),
  ('70000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000053', 'student',
   '70000000-0000-0000-0000-000000000012');

-- 學生一裝備深海霓虹（直接以服務端身分設定 fixture 狀態）
insert into public.user_frames (user_id, frame_id, source)
values (
  '10000000-0000-0000-0000-000000000052',
  '60000000-0000-0000-0000-000000000002', 'purchase'
);
update public.profiles
set active_frame_id = '60000000-0000-0000-0000-000000000002'
where id = '10000000-0000-0000-0000-000000000052';

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000052', true);

create temporary table board_payload on commit drop as
select public.get_classroom_leaderboard(
  '70000000-0000-0000-0000-000000000001'::uuid
) as payload;

select is(
  ((select payload from board_payload)->>'member_count')::integer,
  2,
  'payload carries the eligible member count for percentile math'
);
select is(
  (
    select entry->>'frame_gradient_start'
    from jsonb_array_elements(
      (select payload from board_payload)->'top_entries'
    ) entry
    where (entry->>'is_self')::boolean
  ),
  '#6366f1',
  'equipped frame gradient start rides each entry'
);
select is(
  (
    select entry->>'frame_gradient_end'
    from jsonb_array_elements(
      (select payload from board_payload)->'top_entries'
    ) entry
    where (entry->>'is_self')::boolean
  ),
  '#0ea5e9',
  'equipped frame gradient end rides each entry'
);
select is(
  (
    select entry->>'frame_gradient_start'
    from jsonb_array_elements(
      (select payload from board_payload)->'top_entries'
    ) entry
    where not (entry->>'is_self')::boolean
  ),
  '#f59e0b',
  'default frame gradient rides members who never purchased'
);
select is(
  ((select payload from board_payload)->'self_entry'->>'rank')::integer >= 1,
  true,
  'self entry rank survives the payload extension'
);
select is(
  (select payload from board_payload)->'self_entry' ? 'frame_gradient_start',
  true,
  'self entry carries the frame gradient too'
);

select * from finish();
rollback;
