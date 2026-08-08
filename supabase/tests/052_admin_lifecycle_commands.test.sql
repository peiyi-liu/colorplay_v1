-- supabase/tests/052_admin_lifecycle_commands.test.sql
-- reset saga 的跨系統行為由 Task 9 integration 測試覆蓋;本檔覆蓋 DB 契約。
begin;
select plan(47);

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
-- 先把 activity 回撥到過去,避免交易內 now() 凍結讓斷言恆真
update public.admin_sessions set last_activity_at = now() - interval '5 minutes'
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null;
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

-- 12) JWT session_id claim 與 privileged session 不符 → STALE,receipt 不消耗
--     (spec §6.1;與 admin_internal_authorize 同一檢查,命令腿不得缺席)
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '裝置不符測試理由超過十字',
  'target_principal_id', :'principal_b'::text)) as hash_5 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'deactivate_admin', 'k-5',
  :'hash_5'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_5 \gset
select set_config('request.jwt.claim.session_id',
  '99999999-9999-9999-9999-999999999999', true);
select is((public.deactivate_admin(:'receipt_5', 'k-5', :'principal_b',
  '裝置不符測試理由超過十字'))->>'code', 'STALE_PRIVILEGED_SESSION',
  'mismatched jwt session claim denied as stale like the read path');
select is((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_5'), null,
  'jwt-session mismatch leaves the receipt unconsumed');
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);

-- 13) row_key 含 JSON null 值 key → canonical 不得丟棄該 key(§1.3.5 同
--     admin_internal_canonical_hash 的 null 規則)→ hash 不符,receipt 不消耗
select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'token_balance', 'domain', 'rewards',
  'purpose', '稽核需要核對錢包餘額明細', 'resource', 'wallets',
  'row_key', '{"user_id":"cc000000-0000-0000-0000-000000000001"}')) as hash_r4 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-r4',
  :'hash_r4'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_r4 \gset
select is((public.admin_reveal_field(:'receipt_r4'::uuid, 'k-r4', 'rewards',
  'wallets',
  '{"user_id": "cc000000-0000-0000-0000-000000000001", "extra": null}'::jsonb,
  'token_balance', '稽核需要核對錢包餘額明細'))->>'code',
  'AUTHORIZATION_RECEIPT_INVALID',
  'null-valued extra key changes the canonical hash instead of vanishing');
select is((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_r4'), null,
  'null-key hash mismatch leaves the receipt unconsumed');

-- 14) personal 欄 catalog 資格必須含 surface = browser(系列雙重謂詞慣例):
--     catalog drift 成非 browser surface 後,reveal 必須拒絕
update public.admin_sensitivity_catalog set surface = 'none'
  where resource = 'profiles' and column_name = 'full_name';
select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'full_name', 'domain', 'users',
  'purpose', '客訴處理需要核對使用者全名', 'resource', 'profiles',
  'row_id', 'cc000000-0000-0000-0000-000000000001')) as hash_r5 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-r5',
  :'hash_r5'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_r5 \gset
select is((public.admin_reveal_field(:'receipt_r5'::uuid, 'k-r5', 'users',
  'profiles', 'cc000000-0000-0000-0000-000000000001'::uuid, 'full_name',
  '客訴處理需要核對使用者全名'))->>'code', 'COLUMN_NOT_ALLOWED',
  'non-browser-surface personal column cannot be revealed');
update public.admin_sensitivity_catalog set surface = 'browser'
  where resource = 'profiles' and column_name = 'full_name';

-- 15) accept 成功路徑:無 identity 的受邀者(C)建立 identity 並升 role
select public.admin_internal_canonical_hash(jsonb_build_object(
  'invited_email', 'plain.test.c@colorplay.test',
  'reason', '新任管理員到職需要開通權限')) as hash_6 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'issue_admin_invitation', 'k-6',
  :'hash_6'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_6 \gset
select public.issue_admin_invitation(:'receipt_6', 'k-6',
  'plain.test.c@colorplay.test', '新任管理員到職需要開通權限'
) ->> 'invitation_token' as token_c \gset
select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select is((public.accept_admin_invitation(:'token_c'))->>'outcome', 'ok',
  'invitee without identity accepts successfully');
select is((select state::text from public.admin_security_identities
  where admin_user_id = 'cc000000-0000-0000-0000-000000000001'),
  'active_pending_mfa', 'accept creates identity in active_pending_mfa');
select is((select role::text from public.profiles
  where id = 'cc000000-0000-0000-0000-000000000001'), 'admin',
  'accept promotes profile role to admin');
select is((select status::text from public.admin_invitations
  where invited_email = 'plain.test.c@colorplay.test'), 'accepted',
  'accepted invitation marked accepted');

-- 16) 已有 identity 者(B,已停用)accept → INVITATION_INVALID;邀請不消耗、
--     identity 不動(spec §4.1:deactivated 只能走 reactivate_admin)
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select public.admin_internal_canonical_hash(jsonb_build_object(
  'invited_email', 'admin.test.b@colorplay.test',
  'reason', '誤發給既有管理員帳號的邀請')) as hash_7 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'issue_admin_invitation', 'k-7',
  :'hash_7'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_7 \gset
select public.issue_admin_invitation(:'receipt_7', 'k-7',
  'admin.test.b@colorplay.test', '誤發給既有管理員帳號的邀請'
) ->> 'invitation_token' as token_b \gset
select set_config('request.jwt.claim.sub',
  'bb000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'bb000000-0000-0000-0000-0000000000e2', true);
select is((public.accept_admin_invitation(:'token_b'))->>'code',
  'INVITATION_INVALID',
  'holder of an existing identity cannot accept an invitation');
select is((select status::text from public.admin_invitations
  where invited_email = 'admin.test.b@colorplay.test'), 'pending',
  'denied accept leaves the invitation pending');
select is((select state::text from public.admin_security_identities
  where admin_user_id = 'bb000000-0000-0000-0000-000000000001'),
  'deactivated', 'denied accept leaves the deactivated identity untouched');

-- 17) target-state denial 用專用碼 TARGET_STATE_INVALID(spec §11):
--     receipt 有效且已於 gate 消耗,但目標狀態不允許 → 不得誤用 receipt 碼;
--     且命令類 denial audit 帶 mfa_age_seconds 佐證(與 read 類對稱)
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '重複停用已停用帳號的測試',
  'target_principal_id', :'principal_b'::text)) as hash_9 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'deactivate_admin', 'k-9',
  :'hash_9'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_9 \gset
select is((public.deactivate_admin(:'receipt_9', 'k-9', :'principal_b',
  '重複停用已停用帳號的測試'))->>'code', 'TARGET_STATE_INVALID',
  'already-deactivated target denied with the dedicated state code');
select is((select count(*)::int from public.admin_audit_events
  where action = 'deactivate_admin' and result = 'TARGET_STATE_INVALID'
    and mfa_age_seconds is not null), 1,
  'target-state denial audited with mfa age evidence');

-- 18) 已撤銷 session 的 revoke → TARGET_STATE_INVALID;
--     既有 last-admin denial 的 audit 也必須帶 mfa 佐證
select id as b_session from public.admin_sessions
  where admin_user_id = 'bb000000-0000-0000-0000-000000000001' \gset
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '重複撤銷已撤銷連線的測試',
  'session_id', :'b_session'::text)) as hash_10 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'revoke_admin_session', 'k-10',
  :'hash_10'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_10 \gset
select is((public.revoke_admin_session(:'receipt_10', 'k-10',
  :'b_session'::uuid, '重複撤銷已撤銷連線的測試'))->>'code',
  'TARGET_STATE_INVALID',
  'already-revoked session denied with the dedicated state code');
select is((select count(*)::int from public.admin_audit_events
  where action = 'deactivate_admin' and result = 'LAST_ADMIN_PROTECTED'
    and mfa_age_seconds is not null), 1,
  'last-admin denial audited with mfa age evidence');

-- 19) session 已撤銷 → STALE_PRIVILEGED_SESSION(spec §5.2:撤銷與逾時同碼),
--     receipt 不消耗。本區塊撤銷 A 的 session,必須留在檔尾。
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '撤銷後嘗試執行命令的測試',
  'target_principal_id', :'principal_b'::text)) as hash_8 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'deactivate_admin', 'k-8',
  :'hash_8'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_8 \gset
update public.admin_sessions
  set revoked_at = now(), revoke_reason = 'test_revocation'
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null;
select is((public.deactivate_admin(:'receipt_8', 'k-8', :'principal_b',
  '撤銷後嘗試執行命令的測試'))->>'code', 'STALE_PRIVILEGED_SESSION',
  'revoked session denied as stale like timeout, not as receipt-invalid');
select is((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_8'), null,
  'revoked-session denial leaves the receipt unconsumed');

select * from finish();
rollback;
