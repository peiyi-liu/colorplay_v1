-- supabase/tests/052_admin_lifecycle_commands.test.sql
-- reset saga 的跨系統行為由 Task 9 integration 測試覆蓋;本檔覆蓋 DB 契約。
begin;
select plan(29);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select audit_principal_id as principal_a from public.admin_security_identities
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001' \gset
select audit_principal_id as principal_b from public.admin_security_identities
  where admin_user_id = 'bb000000-0000-0000-0000-000000000001' \gset

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 1) 無效 receipt → typed denial + audit(含 actor principal)+ counter,同交易提交
select is((public.deactivate_admin(gen_random_uuid(), 'k-bad',
  :'principal_b', '這是超過十個字的正當理由文字'))->>'code',
  'AUTHORIZATION_RECEIPT_INVALID', 'missing receipt denied without exception');
select is((select count(*)::int from public.admin_audit_events
  where action = 'deactivate_admin' and result = 'AUTHORIZATION_RECEIPT_INVALID'
    and actor_principal_id = :'principal_a'), 1,
  'denial audit committed with authenticated principal evidence');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'AUTHORIZATION_RECEIPT_INVALID'), 1,
  'denial counter recorded for receipt denial');

-- 2) reason 太短 → denial 三件套,且不動任何狀態
select is((public.deactivate_admin(gen_random_uuid(), 'k-short',
  :'principal_b', '太短'))->>'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'short reason denied before any state change');
select is((select count(*)::int from public.admin_audit_events
  where action = 'deactivate_admin' and result = 'AUTHORIZATION_RECEIPT_INVALID'
    and actor_principal_id = :'principal_a'), 2,
  'short-reason denial also audited with actor evidence');
select is((select state::text from public.admin_security_identities
  where audit_principal_id = :'principal_b'), 'active',
  'short-reason denial leaves target untouched');

-- 3) mint 合法 receipt(canonical hash 由 DB helper 重算,與 Edge 相同編碼)
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '目標帳號已離職需要停用',
  'target_principal_id', :'principal_b'::text)) as hash_1 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'deactivate_admin', 'k-1',
  :'hash_1'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_1 \gset

-- 4) 他人 receipt 不可消耗(Codex 修訂 2):B 以自己的有效 session 拿 A 的 receipt
select set_config('request.jwt.claim.sub',
  'bb000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'bb000000-0000-0000-0000-0000000000e2', true);
select is((public.deactivate_admin(:'receipt_1', 'k-1', :'principal_b',
  '目標帳號已離職需要停用'))->>'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'foreign actor cannot use another admin''s receipt');
select is((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_1'), null,
  'foreign-actor attempt leaves the receipt unconsumed');

-- 5) 相同 actor、不同 request(target 改成 A)→ hash 不符,receipt 不消耗;
--    且被拒的命令不得續期 idle(Codex 修訂三-2)
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select last_activity_at as activity_a from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null \gset
select is((public.deactivate_admin(:'receipt_1', 'k-1', :'principal_a',
  '目標帳號已離職需要停用'))->>'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'mismatched request hash denied');
select is((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_1'), null,
  'mismatched request leaves the receipt unconsumed');
select is((select last_activity_at from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null), :'activity_a'::timestamptz,
  'denied command never refreshes idle activity');

-- 6) 完全相符 → 執行成功、receipt 單次消耗;replay 被拒
select is((public.deactivate_admin(:'receipt_1', 'k-1', :'principal_b',
  '目標帳號已離職需要停用'))->>'outcome', 'ok', 'valid receipt executes command');
select isnt((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_1'), null, 'receipt consumed exactly once');
select is((public.deactivate_admin(:'receipt_1', 'k-1', :'principal_b',
  '目標帳號已離職需要停用'))->>'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'consumed receipt cannot be replayed');

-- 7) last-admin 保護(B 已停用,A 停用自己)→ denial 三件套
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '嘗試停用最後一位管理員',
  'target_principal_id', :'principal_a'::text)) as hash_2 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'deactivate_admin', 'k-2',
  :'hash_2'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_2 \gset
select is((public.deactivate_admin(:'receipt_2', 'k-2', :'principal_a',
  '嘗試停用最後一位管理員'))->>'code', 'LAST_ADMIN_PROTECTED',
  'last active admin cannot be deactivated');
select is((select count(*)::int from public.admin_audit_events
  where action = 'deactivate_admin' and result = 'LAST_ADMIN_PROTECTED'
    and actor_principal_id = :'principal_a'), 1,
  'last-admin denial audited with actor evidence');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'LAST_ADMIN_PROTECTED'), 1,
  'last-admin denial counter recorded');

-- 8) 邀請:issue 只落 hash、明文只在 response;accept 錯 token → denial 三件套
select public.admin_internal_canonical_hash(jsonb_build_object(
  'invited_email', 'admin.new@colorplay.test',
  'reason', '新任管理員到職需要開通權限')) as hash_3 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'issue_admin_invitation', 'k-3',
  :'hash_3'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_3 \gset
select ok((public.issue_admin_invitation(:'receipt_3', 'k-3',
  'admin.new@colorplay.test', '新任管理員到職需要開通權限')) ? 'invitation_token',
  'plaintext invitation token appears only in the response');
select is((select count(*)::int from public.admin_invitations
  where invited_email = 'admin.new@colorplay.test' and status = 'pending'
    and token_hash is not null), 1, 'invitation stored as pending hash only');

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select is((public.accept_admin_invitation('not-the-token'))->>'code',
  'INVITATION_INVALID', 'wrong token denied without existence leak');
select is((select count(*)::int from public.admin_audit_events
  where action = 'accept_admin_invitation' and result = 'INVITATION_INVALID'), 1,
  'invitation denial audited');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'INVITATION_INVALID'), 1,
  'invitation denial counter recorded');

-- 9) 未登入的邀請接受 → INVITATION_INVALID,以 unknown actor 入帳(修訂三-1)
select set_config('request.jwt.claim.sub', '', true);
select is((public.accept_admin_invitation('token-x'))->>'code',
  'INVITATION_INVALID', 'unauthenticated accept denied');
select is((select count(*)::int from public.admin_audit_events
  where action = 'accept_admin_invitation' and result = 'INVITATION_INVALID'
    and actor_type = 'unknown'), 1,
  'unauthenticated invitation denial audited with unknown actor');

-- 10) Reveal(uuid 形態,spec §7):明文只在 response;audit 絕不落明文
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
update public.profiles set full_name = '王小明'
  where id = 'cc000000-0000-0000-0000-000000000001';
select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'full_name', 'domain', 'users',
  'purpose', '客訴處理需要核對使用者全名', 'resource', 'profiles',
  'row_id', 'cc000000-0000-0000-0000-000000000001')) as hash_r1 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-r1',
  :'hash_r1'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_r1 \gset
select is((public.admin_reveal_field(:'receipt_r1'::uuid, 'k-r1', 'users',
  'profiles', 'cc000000-0000-0000-0000-000000000001'::uuid, 'full_name',
  '客訴處理需要核對使用者全名'))->>'value', '王小明',
  'uuid reveal returns plaintext only in the response');
select is((select count(*)::int from public.admin_audit_events
  where action = 'admin_reveal_field' and result = 'success'), 1,
  'reveal success audited exactly once');
select is((select count(*)::int from public.admin_audit_events
  where action = 'admin_reveal_field'
    and (coalesce(before_after_redacted::text, '') like '%王小明%'
      or coalesce(reason_or_purpose_redacted, '') like '%王小明%'
      or coalesce(source_summary_redacted, '') like '%王小明%')), 0,
  'reveal audit never stores the revealed plaintext');

-- 11) Reveal(row_key 形態,spec §1.3):與 Task 6b detail 同一定址契約
insert into public.wallets (user_id)
  values ('cc000000-0000-0000-0000-000000000001')
  on conflict (user_id) do nothing;
update public.admin_sensitivity_catalog
  set class = 'personal', mask_strategy = 'last3_mask'
  where resource = 'wallets' and column_name = 'token_balance';
select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'token_balance', 'domain', 'rewards',
  'purpose', '稽核需要核對錢包餘額明細', 'resource', 'wallets',
  'row_key', '{"user_id":"cc000000-0000-0000-0000-000000000001"}')) as hash_r2 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-r2',
  :'hash_r2'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_r2 \gset
select is((public.admin_reveal_field(:'receipt_r2'::uuid, 'k-r2', 'rewards',
  'wallets', '{"user_id": "cc000000-0000-0000-0000-000000000001"}'::jsonb,
  'token_balance', '稽核需要核對錢包餘額明細'))->>'outcome', 'ok',
  'row_key reveal addresses composite-contract resource');
select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'token_balance', 'domain', 'rewards',
  'purpose', '稽核需要核對錢包餘額明細', 'resource', 'wallets',
  'row_key', '{"wrong_column":"x"}')) as hash_r3 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-r3',
  :'hash_r3'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_r3 \gset
select is((public.admin_reveal_field(:'receipt_r3'::uuid, 'k-r3', 'rewards',
  'wallets', '{"wrong_column": "x"}'::jsonb, 'token_balance',
  '稽核需要核對錢包餘額明細'))->>'code', 'COLUMN_NOT_ALLOWED',
  'row_key reveal rejects non-PK key shape like Task 6b detail');

select * from finish();
rollback;
