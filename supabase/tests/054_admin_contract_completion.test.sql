-- supabase/tests/054_admin_contract_completion.test.sql
-- Task 13A:server-issued cursor／row key、stuck 一次性人工重試、§11 envelope。
begin;
-- 33 = 14(§11 envelope)+ 10(cursor／row key)+ 9(stuck one-shot 與其不變式)
select plan(33);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── 13A-3:denial envelope ────────────────────────────────────────────
select is(
  (public.admin_internal_denial_retryable('SECURITY_AUDIT_UNAVAILABLE'))::text,
  'true', 'SECURITY_AUDIT_UNAVAILABLE is retryable');
select is(
  (public.admin_internal_denial_retryable('STALE_PRIVILEGED_SESSION'))::text,
  'false', 'stale session is not an in-place retry loop');
select is((public.admin_internal_denial_retryable('COLUMN_NOT_ALLOWED'))::text,
  'false', 'validation denials are not retryable');
select is((public.admin_internal_denial_retryable('IDEMPOTENCY_CONFLICT'))::text,
  'false', 'idempotency conflict is not retryable');
select is((public.admin_internal_denial_retryable('TARGET_STATE_INVALID'))::text,
  'false', 'target-state denials are not retryable');
select is((public.admin_internal_denial_retryable('NOT_A_REAL_CODE'))::text,
  'false', 'unknown code fails closed as non-retryable');

select isnt(public.admin_internal_denial_message('COLUMN_NOT_ALLOWED'), null,
  'known code maps to a centralized safe message');
select isnt(public.admin_internal_denial_message('NOT_A_REAL_CODE'), null,
  'unknown code still gets a safe generic message');

-- 未知 resource 的 denial envelope:五個欄位齊備,request_id 對得上 durable audit
select set_config('pgtap.denial', (public.admin_list_resource(
  'users', 'not_a_real_table'))::text, true);
select is(current_setting('pgtap.denial')::jsonb ->> 'outcome', 'denied',
  'unknown resource is denied');
select is(current_setting('pgtap.denial')::jsonb ->> 'code',
  'RESOURCE_NOT_ALLOWED', 'unknown resource returns the stable code');
select isnt(current_setting('pgtap.denial')::jsonb ->> 'message', null,
  'denial envelope carries a safe message');
select is(current_setting('pgtap.denial')::jsonb ->> 'retryable', 'false',
  'denial envelope carries the retryable flag');
select isnt(current_setting('pgtap.denial')::jsonb ->> 'request_id', null,
  'denial envelope carries a request_id');
select ok(exists(select 1 from public.admin_audit_events
    where id = (current_setting('pgtap.denial')::jsonb ->> 'request_id')::uuid),
  'request_id resolves to the durable denial audit event');

-- ── 13A-1:row key round trip ─────────────────────────────────────────
select is(
  public.admin_internal_decode_row_key(
    public.admin_internal_encode_row_key(
      '{"user_id":"u1","classroom_id":"c1","other":"x"}'::jsonb,
      array['classroom_id','user_id'])),
  '{"classroom_id": "c1", "user_id": "u1"}'::jsonb,
  'composite row key round trips exactly the PK columns');
select is(public.admin_internal_decode_row_key('!!!not-base64!!!'), null,
  'malformed row key token decodes to null, never raises');
select is(public.admin_internal_decode_row_key(
    rtrim(translate(encode(convert_to('[1,2]', 'utf8'), 'base64'), '+/', '-_'), '=')),
  null, 'non-object row key token is rejected');

-- cursor binding 綁 domain/resource/filters/sort
select isnt(
  public.admin_internal_list_binding('users', 'profiles', '{}'::jsonb, 'created_at'),
  public.admin_internal_list_binding('users', 'profiles', '{}'::jsonb, 'display_name'),
  'binding changes when the sort column changes');
select isnt(
  public.admin_internal_list_binding('users', 'profiles', '{}'::jsonb, 'created_at'),
  public.admin_internal_list_binding('users', 'profiles',
    '{"role":{"eq":"teacher"}}'::jsonb, 'created_at'),
  'binding changes when filters change');
select isnt(
  public.admin_internal_list_binding('users', 'profiles', '{}'::jsonb, 'created_at'),
  public.admin_internal_list_binding('classrooms', 'classrooms', '{}'::jsonb, 'created_at'),
  'binding changes across resources');

-- list 回應形狀:每列有 server-issued row_key,未滿頁時 next_cursor 為 null
select set_config('pgtap.list', (public.admin_list_resource(
  'users', 'profiles'))::text, true);
select is(current_setting('pgtap.list')::jsonb ->> 'outcome', 'ok',
  'profiles list succeeds for a privileged admin');
select ok(
  (current_setting('pgtap.list')::jsonb -> 'next_cursor') = 'null'::jsonb,
  'no next_cursor when the seed set is below the page limit');
select ok(
  not exists(
    select 1 from jsonb_array_elements(current_setting('pgtap.list')::jsonb -> 'rows') r
    where r.value ->> 'row_key' is null),
  'every returned row carries a server-issued row_key');

-- 竄改/跨查詢的 cursor 必須 typed deny(而非裸例外)
select is((public.admin_list_resource('users', 'profiles',
    'this-is-not-a-valid-cursor'))::jsonb ->> 'code', 'COLUMN_NOT_ALLOWED',
  'malformed cursor is a typed denial');

-- ── 13A-2:stuck 一次性人工重試 ───────────────────────────────────────
-- 準備一個 stuck operation
-- audit principal 由 svc_admin_bootstrap_identity 動態產生,不能寫死
insert into public.admin_security_operations
  (id, operation_type, target_principal_id, state, current_step,
   attempt_count, next_retry_at)
select '0da00000-0000-0000-0000-0000000000a1', 'reset_admin_mfa',
  audit_principal_id, 'stuck', 2, 12, null
from public.admin_security_identities
where admin_user_id = 'bb000000-0000-0000-0000-000000000001';

-- 未授權前 claim 不到
select is((public.svc_admin_claim_manual_retry(
    '0da00000-0000-0000-0000-0000000000a1'))::jsonb ->> 'outcome', 'skipped',
  'claim finds nothing before a manual retry is authorized');

-- 授權一次
update public.admin_security_operations set next_retry_at = now()
  where id = '0da00000-0000-0000-0000-0000000000a1';

select is((public.svc_admin_claim_manual_retry(
    '0da00000-0000-0000-0000-0000000000a1'))::jsonb ->> 'outcome', 'ok',
  'the authorized manual retry is claimed exactly once');
select is((public.svc_admin_claim_manual_retry(
    '0da00000-0000-0000-0000-0000000000a1'))::jsonb ->> 'outcome', 'skipped',
  'a second claim of the same authorization finds nothing (one-shot)');
select is((select attempt_count from public.admin_security_operations
    where id = '0da00000-0000-0000-0000-0000000000a1'), 12,
  'claiming a manual retry never resets attempt_count');
select is((select state::text from public.admin_security_operations
    where id = '0da00000-0000-0000-0000-0000000000a1'), 'stuck',
  'a claimed-but-unfinished manual retry leaves the operation stuck');
select is((select next_retry_at from public.admin_security_operations
    where id = '0da00000-0000-0000-0000-0000000000a1'), null,
  'no due marker survives, so the scheduler cannot pick it up again');

-- claim 被消耗後 Edge 若在續跑前/中失敗,下一次合法 reconcile 必須能重新授權,
-- 不得永久卡死(claim-lost recovery)
update public.admin_security_operations set next_retry_at = now()
  where id = '0da00000-0000-0000-0000-0000000000a1' and state = 'stuck';
select is((public.svc_admin_claim_manual_retry(
    '0da00000-0000-0000-0000-0000000000a1'))::jsonb ->> 'outcome', 'ok',
  'a fresh authorization after a lost claim can be claimed again');
select is((select state::text from public.admin_security_operations
    where id = '0da00000-0000-0000-0000-0000000000a1'), 'stuck',
  're-authorization never relaxes the state to active or pending');

-- 本設計的前提不變式:標 stuck 時必須清掉退避時間戳,否則殘留值會被誤判成
-- 「已授權一次人工重試」
insert into public.admin_security_operations
  (id, operation_type, target_principal_id, state, current_step,
   attempt_count, next_retry_at)
select '0da00000-0000-0000-0000-0000000000a2', 'reset_admin_mfa',
  audit_principal_id, 'step2_complete', 2, 10, now() + interval '5 minutes'
from public.admin_security_identities
where admin_user_id = 'bb000000-0000-0000-0000-000000000001';
select public.svc_admin_mark_operation_stuck(
  '0da00000-0000-0000-0000-0000000000a2');
select is((select next_retry_at from public.admin_security_operations
    where id = '0da00000-0000-0000-0000-0000000000a2'), null,
  'marking an operation stuck clears any leftover backoff marker');

select * from finish();
rollback;
