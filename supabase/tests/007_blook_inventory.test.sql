begin;

select plan(45);

select has_table('public', 'blooks', 'Blook catalog exists');
select has_table('public', 'user_blooks', 'user Blook ownership exists');
select has_column(
  'public',
  'profiles',
  'active_blook_id',
  'profiles store the equipped Blook'
);
select has_function(
  'public',
  'get_my_blook_inventory',
  array[]::text[],
  'inventory query RPC exists'
);
select has_function(
  'public',
  'purchase_blook',
  array['uuid'],
  'purchase command RPC exists'
);
select has_function(
  'public',
  'equip_blook',
  array['uuid'],
  'equip command RPC exists'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_array(stable_code, name, emoji, cost_tokens)
      order by sort_order
    )
    from public.blooks
  ),
  '[
    ["little_fox","小狐狸","🦊",0],
    ["lucky_cat","招財貓","🐱",100],
    ["travel_frog","旅行蛙","🐸",250],
    ["wise_owl","智慧鴞","🦉",500],
    ["primary_lion","原色獅","🦁",1000],
    ["rainbow_horse","彩虹馬","🦄",2000],
    ["panda_painter","熊貓畫師","🐼",150],
    ["koala_toner","無尾熊調色師","🐨",300],
    ["tiger_orange","猛虎橙","🐯",400],
    ["octo_mixer","八爪配色師","🐙",600],
    ["robo_blue","機械藍調","🤖",800],
    ["pixel_sprite","像素精靈","👾",1200],
    ["indigo_dragon","東方靛龍","🐲",1500],
    ["peacock_teal","孔雀藍綠","🦚",2500]
  ]'::jsonb,
  'catalog contains the exact ordered fourteen-Blook contract'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.blooks'::regclass),
  true,
  'catalog has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.user_blooks'::regclass),
  true,
  'ownership has RLS enabled'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'active_blook_id', 'UPDATE'),
  'students cannot directly update the equipped Blook column'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.get_my_blook_inventory()'::regprocedure),
  true,
  'inventory query is security definer'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.purchase_blook(uuid)'::regprocedure),
  true,
  'purchase command is security definer'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.equip_blook(uuid)'::regprocedure),
  true,
  'equip command is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.get_my_blook_inventory()'::regprocedure),
  array['search_path=pg_catalog, public'],
  'inventory query has a fixed search path'
);
select is(
  (select proconfig from pg_proc where oid = 'public.purchase_blook(uuid)'::regprocedure),
  array['search_path=pg_catalog, public'],
  'purchase command has a fixed search path'
);
select is(
  (select proconfig from pg_proc where oid = 'public.equip_blook(uuid)'::regprocedure),
  array['search_path=pg_catalog, public'],
  'equip command has a fixed search path'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_blook_inventory()', 'EXECUTE'),
  'authenticated users can query their inventory'
);
select ok(
  has_function_privilege('authenticated', 'public.purchase_blook(uuid)', 'EXECUTE'),
  'authenticated users can purchase a Blook'
);
select ok(
  has_function_privilege('authenticated', 'public.equip_blook(uuid)', 'EXECUTE'),
  'authenticated users can equip a Blook'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_blook_inventory()', 'EXECUTE'),
  'anonymous users cannot query an inventory'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000021',
    'authenticated', 'authenticated', 'blook.one@colorplay.test',
    crypt('LocalOnly-Blook1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000022',
    'authenticated', 'authenticated', 'blook.two@colorplay.test',
    crypt('LocalOnly-Blook2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

select is(
  (
    select count(*)::integer
    from public.profiles p
    left join public.user_blooks ub
      on ub.user_id = p.id
      and ub.blook_id = p.active_blook_id
    where p.active_blook_id is null or ub.user_id is null
  ),
  0,
  'every profile has an owned active default after trigger or backfill'
);
select is(
  (
    select count(*)::integer
    from public.wallets
    where user_id in (
      '10000000-0000-0000-0000-000000000021',
      '10000000-0000-0000-0000-000000000022'
    )
  ),
  2,
  'profile trigger still creates wallets'
);
select is(
  (
    select count(*)::integer
    from public.user_blooks
    where source = 'default'
      and user_id in (
        '10000000-0000-0000-0000-000000000021',
        '10000000-0000-0000-0000-000000000022'
      )
  ),
  2,
  'profile trigger gives one default Blook to each student'
);
select is(
  (
    select b.stable_code
    from public.profiles p
    join public.blooks b on b.id = p.active_blook_id
    where p.id = '10000000-0000-0000-0000-000000000021'
  ),
  'little_fox',
  'new profiles equip little fox by default'
);

insert into public.wallet_transactions (
  user_id, amount, reason, source_type, source_id
)
values (
  '10000000-0000-0000-0000-000000000021',
  200,
  'trusted inventory test funding',
  'quiz_finalize',
  '40000000-0000-0000-0000-000000000021'
);
update public.wallets
set token_balance = 200
where user_id = '10000000-0000-0000-0000-000000000021';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000021', true);

select is((select count(*)::integer from public.blooks), 14, 'student reads the published catalog');
select is((select count(*)::integer from public.user_blooks), 1, 'student reads only own initial ownership');
select is(
  (
    select count(*)::integer
    from public.user_blooks
    where user_id = '10000000-0000-0000-0000-000000000022'
  ),
  0,
  'student cannot read another inventory'
);
select throws_ok(
  $$insert into public.user_blooks (user_id, blook_id, source)
    select auth.uid(), id, 'purchase' from public.blooks where stable_code = 'lucky_cat'$$,
  '42501',
  null,
  'student cannot forge ownership'
);
select throws_ok(
  $$update public.profiles
    set active_blook_id = (select id from public.blooks where stable_code = 'lucky_cat')
    where id = auth.uid()$$,
  '42501',
  null,
  'student cannot directly equip a Blook'
);

select is(
  (public.purchase_blook((select id from public.blooks where stable_code = 'lucky_cat')) ->> 'token_balance')::integer,
  100,
  'purchase returns the authoritative debited balance'
);
select is((select token_balance from public.wallets), 100, 'purchase updates wallet cache once');
select is(
  (
    select count(*)::integer
    from public.wallet_transactions
    where source_type = 'blook_purchase' and amount = -100
  ),
  1,
  'purchase appends one negative Token transaction'
);
select is((select count(*)::integer from public.user_blooks), 2, 'purchase adds ownership');

select lives_ok(
  $$select public.purchase_blook((select id from public.blooks where stable_code = 'lucky_cat'))$$,
  'retrying a completed purchase is idempotent'
);
select is((select token_balance from public.wallets), 100, 'purchase retry does not debit again');
select is(
  (
    select count(*)::integer
    from public.wallet_transactions
    where source_type = 'blook_purchase'
  ),
  1,
  'purchase retry does not append another ledger row'
);

select is(
  (public.equip_blook((select id from public.blooks where stable_code = 'lucky_cat')) ->> 'active_blook_id')::uuid,
  (select id from public.blooks where stable_code = 'lucky_cat'),
  'equip returns the authoritative active Blook'
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(public.get_my_blook_inventory() -> 'items') item
    where (item ->> 'equipped')::boolean
  ),
  1,
  'inventory snapshot contains exactly one equipped Blook'
);
select throws_ok(
  $$select public.purchase_blook((select id from public.blooks where stable_code = 'travel_frog'))$$,
  'P0001',
  'BLOOK_INSUFFICIENT_TOKENS:150',
  'purchase exposes only the positive Token shortfall'
);
select throws_ok(
  $$select public.equip_blook((select id from public.blooks where stable_code = 'travel_frog'))$$,
  'P0001',
  'BLOOK_NOT_OWNED',
  'student cannot equip an unowned Blook'
);
select is((select token_balance from public.wallets), 100, 'failed commands leave the wallet unchanged');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000022', true);
select is((select count(*)::integer from public.user_blooks), 1, 'second student sees only own default Blook');
select is(
  (
    select count(*)::integer
    from public.user_blooks
    where user_id = '10000000-0000-0000-0000-000000000021'
  ),
  0,
  'second student cannot inspect first student ownership'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.get_my_blook_inventory()$$,
  '42501',
  null,
  'anonymous role cannot execute inventory RPCs'
);
select throws_ok(
  $$select * from public.blooks$$,
  '42501',
  null,
  'anonymous role cannot read the catalog'
);

select * from finish();

rollback;
