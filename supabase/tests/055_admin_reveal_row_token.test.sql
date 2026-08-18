-- supabase/tests/055_admin_reveal_row_token.test.sql
-- Task 13A-4:admin_reveal_field 的 server-issued opaque row token 形態,
-- 以及「token 形態與 jsonb 形態 hash 不互通」的 owner 裁定。
begin;
-- 14 = 4(token 正向與 audit)+ 3(跨形態不互通)+ 4(malformed／非 PK／穩定性)
--    + 3(jsonb 形態未因重構而改變契約)
select plan(14);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.profiles set full_name = '王小明'
  where id = 'cc000000-0000-0000-0000-000000000001';

-- server 簽發的 token(13A-1 的 list 會用同一函式簽發)
select public.admin_internal_encode_row_key(
  '{"id":"cc000000-0000-0000-0000-000000000001"}'::jsonb,
  array['id']) as tok \gset

-- ── token 形態正向 ───────────────────────────────────────────────────
select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'full_name', 'domain', 'users',
  'purpose', '客訴處理需要核對使用者全名', 'resource', 'profiles',
  'row_token', :'tok')) as hash_t1 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-t1',
  :'hash_t1'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_t1 \gset
select set_config('pgtap.t1', (public.admin_reveal_field(
  :'receipt_t1'::uuid, 'k-t1', 'users', 'profiles',
  p_row_token => :'tok', p_column => 'full_name',
  p_purpose => '客訴處理需要核對使用者全名'))::text, true);

select is(current_setting('pgtap.t1')::jsonb ->> 'value', '王小明',
  'opaque row token reveals plaintext only in the response');
select is((select count(*)::int from public.admin_audit_events
    where action = 'admin_reveal_field' and result = 'success'), 1,
  'token reveal is audited exactly once');
select is((select count(*)::int from public.admin_audit_events
    where action = 'admin_reveal_field'
      and coalesce(before_after_redacted::text, '') like '%王小明%'), 0,
  'token reveal audit never stores the revealed plaintext');
select is((select before_after_redacted ->> 'row_token'
    from public.admin_audit_events
    where action = 'admin_reveal_field' and result = 'success'), :'tok',
  'audit records the verbatim token the client actually sent');

-- ── 兩形態 hash 不互通(2026-08-18 owner 裁定) ───────────────────────
select isnt(
  public.admin_internal_canonical_hash(jsonb_build_object(
    'column', 'full_name', 'domain', 'users',
    'purpose', '客訴處理需要核對使用者全名', 'resource', 'profiles',
    'row_token', :'tok')),
  public.admin_internal_canonical_hash(jsonb_build_object(
    'column', 'full_name', 'domain', 'users',
    'purpose', '客訴處理需要核對使用者全名', 'resource', 'profiles',
    'row_key', '{"id":"cc000000-0000-0000-0000-000000000001"}')),
  'token form and jsonb form hash differently for the very same row');

-- 用 jsonb 形態的 hash 簽出 receipt,卻走 token overload → 必須 fail closed
select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'full_name', 'domain', 'users',
  'purpose', '客訴處理需要核對使用者全名', 'resource', 'profiles',
  'row_key', '{"id":"cc000000-0000-0000-0000-000000000001"}')) as hash_t2 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-t2',
  :'hash_t2'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_t2 \gset
select set_config('pgtap.t2', (public.admin_reveal_field(
  :'receipt_t2'::uuid, 'k-t2', 'users', 'profiles',
  p_row_token => :'tok', p_column => 'full_name',
  p_purpose => '客訴處理需要核對使用者全名'))::text, true);
select is(current_setting('pgtap.t2')::jsonb ->> 'code',
  'AUTHORIZATION_RECEIPT_INVALID',
  'a jsonb-form receipt cannot be redeemed through the token form');
select ok(not (current_setting('pgtap.t2')::jsonb ? 'value'),
  'the cross-form attempt never returns plaintext');

-- ── malformed token:pre-gate typed deny,receipt 不消耗 ──────────────
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-t3',
  :'hash_t1'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_t3 \gset
select set_config('pgtap.t3', (public.admin_reveal_field(
  :'receipt_t3'::uuid, 'k-t3', 'users', 'profiles',
  p_row_token => '!!!not-base64!!!', p_column => 'full_name',
  p_purpose => '客訴處理需要核對使用者全名'))::text, true);
select is(current_setting('pgtap.t3')::jsonb ->> 'code', 'COLUMN_NOT_ALLOWED',
  'a malformed token is a typed denial, never a raw exception');
select is((select consumed_at from public.admin_command_authorizations
    where id = :'receipt_t3'::uuid), null,
  'a malformed token is rejected before the receipt is consumed');

-- ── token 解得開但不是 PK 欄集合 → 與 jsonb 形態同碼 ─────────────────
select public.admin_internal_encode_row_key(
  '{"wrong_column":"x"}'::jsonb, array['wrong_column']) as tok_bad \gset
select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'full_name', 'domain', 'users',
  'purpose', '客訴處理需要核對使用者全名', 'resource', 'profiles',
  'row_token', :'tok_bad')) as hash_t4 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-t4',
  :'hash_t4'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_t4 \gset
select is((public.admin_reveal_field(
    :'receipt_t4'::uuid, 'k-t4', 'users', 'profiles',
    p_row_token => :'tok_bad', p_column => 'full_name',
    p_purpose => '客訴處理需要核對使用者全名'))::jsonb ->> 'code',
  'COLUMN_NOT_ALLOWED',
  'a decodable token with a non-PK key set is denied like the jsonb form');

-- token 對同一列必須逐字穩定,否則 Edge 的重試會換到不同 hash 而破壞冪等
select is(
  public.admin_internal_encode_row_key(
    '{"id":"cc000000-0000-0000-0000-000000000001"}'::jsonb, array['id']),
  :'tok',
  'the token for a given row is byte-stable across issuances');

-- ── jsonb 形態未因抽出共用實作而改變契約 ─────────────────────────────
-- purpose 與 row_key 同時無效時,仍先回 purpose 的碼(順序不得因重構而變)
select is((public.admin_reveal_field(
    '00000000-0000-0000-0000-000000000000'::uuid, 'k-t5', 'users', 'profiles',
    p_row_key => '[1,2]'::jsonb, p_column => 'full_name',
    p_purpose => '太短'))::jsonb ->> 'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'purpose is still validated before the row_key shape');
select is((public.admin_reveal_field(
    '00000000-0000-0000-0000-000000000000'::uuid, 'k-t6', 'users', 'profiles',
    p_row_key => '[1,2]'::jsonb, p_column => 'full_name',
    p_purpose => '客訴處理需要核對使用者全名'))::jsonb ->> 'code',
  'COLUMN_NOT_ALLOWED',
  'a non-object row_key is still denied before the receipt is consumed');

select public.admin_internal_canonical_hash(jsonb_build_object(
  'column', 'full_name', 'domain', 'users',
  'purpose', '客訴處理需要核對使用者全名', 'resource', 'profiles',
  'row_key', '{"id":"cc000000-0000-0000-0000-000000000001"}')) as hash_t7 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'admin_reveal_field', 'k-t7',
  :'hash_t7'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_t7 \gset
select is((public.admin_reveal_field(
    :'receipt_t7'::uuid, 'k-t7', 'users', 'profiles',
    p_row_key => '{"id":"cc000000-0000-0000-0000-000000000001"}'::jsonb,
    p_column => 'full_name',
    p_purpose => '客訴處理需要核對使用者全名'))->>'value', '王小明',
  'the jsonb form keeps working with its own unchanged hash');

select * from finish();
rollback;
