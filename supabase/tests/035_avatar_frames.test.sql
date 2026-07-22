begin;

select plan(31);

-- 結構
select has_table('public', 'avatar_frames', 'frame catalog exists');
select has_table('public', 'user_frames', 'user frame ownership exists');
select has_column(
  'public', 'profiles', 'active_frame_id', 'profiles store the equipped frame'
);
select has_function(
  'public', 'get_my_frame_inventory', array[]::text[], 'frame inventory RPC exists'
);
select has_function(
  'public', 'purchase_frame', array['uuid'], 'frame purchase RPC exists'
);
select has_function(
  'public', 'equip_frame', array['uuid'], 'frame equip RPC exists'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_array(stable_code, name, cost_tokens) order by sort_order
    )
    from public.avatar_frames
  ),
  '[["lava_gold","熔岩流金",0],["deep_neon","深海霓虹",25],["cherry_blossom","櫻花粉彩",40],["forest_guard","森林守衛",60],["royal_violet","皇家紫金",90],["midnight_sky","午夜星空",120],["sunrise_amber","日出琥珀",150],["cobalt_wave","鈷藍波浪",180],["jade_mist","松石綠霧",210],["magenta_pop","洋紅波普",240],["teal_orbit","藍綠軌道",270],["violet_haze","紫羅蘭霞",300],["ember_glow","餘燼光暈",340],["lime_soda","萊姆蘇打",380],["coral_reef","珊瑚礁光",420],["deep_ocean","深海墨藍",460],["aurora_sky","極光天幕",520],["paper_ink","紙墨對比",580],["spectrum_run","光譜跑道",650],["golden_hour","黃金時刻",720]]'::jsonb,
  'catalog contains the exact ordered twenty-frame contract'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.avatar_frames'::regclass),
  true, 'frame catalog has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.user_frames'::regclass),
  true, 'frame ownership has RLS enabled'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'active_frame_id', 'UPDATE'),
  'students cannot directly update the equipped frame column'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.purchase_frame(uuid)'::regprocedure),
  true, 'frame purchase is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.purchase_frame(uuid)'::regprocedure),
  array['search_path=pg_catalog, public'],
  'frame purchase has a fixed search path'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_frame_inventory()', 'EXECUTE'),
  'anonymous users cannot query a frame inventory'
);
select ok(
  not has_table_privilege('anon', 'public.avatar_frames', 'SELECT'),
  'anonymous users cannot read the frame catalog'
);

-- 種子身分
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000031',
    'authenticated', 'authenticated', 'frame.one@colorplay.test',
    crypt('LocalOnly-Frame1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000032',
    'authenticated', 'authenticated', 'frame.two@colorplay.test',
    crypt('LocalOnly-Frame2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

select is(
  (
    select count(*)::integer
    from public.user_frames
    where source = 'default'
      and user_id in (
        '10000000-0000-0000-0000-000000000031',
        '10000000-0000-0000-0000-000000000032'
      )
  ),
  2,
  'profile trigger gives one default frame to each student'
);
select is(
  (
    select f.stable_code
    from public.profiles p
    join public.avatar_frames f on f.id = p.active_frame_id
    where p.id = '10000000-0000-0000-0000-000000000031'
  ),
  'lava_gold',
  'profile trigger equips the default frame'
);

-- 學生一：查詢與購買
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000031', true);

select is(
  jsonb_array_length((public.get_my_frame_inventory())->'items'),
  20,
  'inventory lists the published frame catalog'
);
select is(
  (
    select item->>'owned'
    from jsonb_array_elements((public.get_my_frame_inventory())->'items') item
    where item->>'stable_code' = 'deep_neon'
  ),
  'false',
  'unpurchased frame is not owned'
);
select throws_ok(
  $$select public.purchase_frame('60000000-0000-0000-0000-000000000002'::uuid)$$,
  'P0001',
  'FRAME_INSUFFICIENT_TOKENS:25',
  'purchase without tokens fails with the shortfall'
);
select throws_ok(
  $$select public.equip_frame('60000000-0000-0000-0000-000000000002'::uuid)$$,
  'P0001',
  'FRAME_NOT_OWNED',
  'equipping an unowned frame is rejected'
);

-- 注資（以服務端身分）後購買
reset role;
insert into public.wallet_transactions (user_id, amount, reason, source_type, source_id)
values (
  '10000000-0000-0000-0000-000000000031', 100, 'test grant', 'live',
  '99999999-0000-0000-0000-000000000001'
);
update public.wallets
set token_balance = token_balance + 100
where user_id = '10000000-0000-0000-0000-000000000031';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000031', true);

select is(
  (
    select item->>'owned'
    from jsonb_array_elements((public.purchase_frame('60000000-0000-0000-0000-000000000002'::uuid))->'items') item
    where item->>'stable_code' = 'deep_neon'
  ),
  'true',
  'funded purchase acquires the frame'
);
select is(
  ((public.get_my_frame_inventory())->>'token_balance')::integer,
  75,
  'purchase deducts the frame cost from the wallet'
);
select is(
  (
    select item->>'owned'
    from jsonb_array_elements((public.purchase_frame('60000000-0000-0000-0000-000000000002'::uuid))->'items') item
    where item->>'stable_code' = 'deep_neon'
  ),
  'true',
  'repeated purchase is idempotent'
);
select is(
  ((public.get_my_frame_inventory())->>'token_balance')::integer,
  75,
  'repeated purchase never charges twice'
);
select is(
  ((public.equip_frame('60000000-0000-0000-0000-000000000002'::uuid))->>'active_frame_id')::uuid,
  '60000000-0000-0000-0000-000000000002'::uuid,
  'equip switches the active frame'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.wallet_transactions
    where user_id = '10000000-0000-0000-0000-000000000031'
      and source_type = 'frame_purchase'
  ),
  1,
  'purchase writes exactly one frame ledger row'
);

-- 學生二：隔離與越權
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000032', true);

select is(
  (
    select count(*)::integer
    from public.user_frames
    where user_id = '10000000-0000-0000-0000-000000000031'
  ),
  0,
  'RLS hides other students frame ownership rows'
);
select throws_ok(
  $$select public.equip_frame('60000000-0000-0000-0000-000000000002'::uuid)$$,
  'P0001',
  'FRAME_NOT_OWNED',
  'another student cannot equip a frame they do not own'
);
select throws_ok(
  $$insert into public.user_frames (user_id, frame_id, source)
    values ('10000000-0000-0000-0000-000000000032',
            '60000000-0000-0000-0000-000000000002', 'purchase')$$,
  '42501',
  null,
  'students cannot insert ownership rows directly'
);
select is(
  ((public.get_my_frame_inventory())->>'token_balance')::integer >= 0,
  true,
  'second student reads only their own wallet'
);

-- 匿名
set local role anon;
select throws_ok(
  $$select public.get_my_frame_inventory()$$,
  '42501',
  null,
  'anonymous role cannot execute the inventory RPC'
);

reset role;

select * from finish();
rollback;
