-- supabase/tests/054_admin_contract_completion.test.sql
-- Task 13A:server-issued cursor／row key、stuck 一次性人工重試、§11 envelope。
begin;
-- 33 = 14(§11 envelope)+ 10(cursor／row key)+ 9(stuck one-shot 與其不變式)
-- 39 = 33(原有)+ 3(真實長度複合主鍵 round trip,取代原本測不到
-- 76-字元換行邊界的短假值測試)+ 3(2026-08-19 review:binding 碰撞、
-- 畸形 filter typed deny 與其 denial counter)
select plan(39);

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
-- 2026-08-19 review 修正:原斷言比對 admin_audit_events.id,把「envelope
-- 回傳的其實是稽核列主鍵,而不是獨立的 request_id 欄位」這個錯誤實作當
-- 正確在測。admin_audit_events 另有一個獨立生成的 request_id 欄位(
-- admin_query_audit 稽核頁就是靠它查詢/對帳),兩者是不同的值 —— 修正後
-- 比對真正的欄位,並額外斷言它不等於 id,防止同一個錯誤悄悄回歸。
select ok(exists(select 1 from public.admin_audit_events
    where request_id = (current_setting('pgtap.denial')::jsonb ->> 'request_id')::uuid),
  'request_id resolves to the durable denial audit event''s request_id column');
-- 若曾經回歸成回傳 id(舊 bug):envelope 的值會變成某一列的「主鍵」,
-- 但幾乎不可能同時也是任何一列獨立生成的 request_id,上面那條 exists()
-- 斷言本身就會轉紅,不需要另外斷言「不等於 id」——那條反而會因為
-- id/request_id 本來就互相獨立隨機而恆真,測不出任何東西。

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

-- 2026-08-19 review 新增:上面的 round trip 用 'u1'/'c1' 這種極短假值,
-- 編碼後遠低於 76 base64 字元,測不到 Postgres encode(...,'base64') 每
-- 76 字元插入換行的問題(admin_internal_decode_row_key 重算 padding 時
-- 會把換行算進 length,導致 padding 位數算錯而解碼失敗)。真實複合主鍵
-- 一律是兩個 36 字元 UUID,編碼後必然超過 76 字元,必須用真實長度的值
-- 測,否則這條斷言只是看起來在守門。
select ok(
  length(public.admin_internal_encode_row_key(
    jsonb_build_object(
      'classroom_id', '11111111-1111-4111-8111-111111111111',
      'user_id', '22222222-2222-4222-8222-222222222222'),
    array['classroom_id', 'user_id'])) > 76,
  'a realistic two-uuid composite key exceeds the base64 line-wrap threshold');
select is(
  public.admin_internal_decode_row_key(
    public.admin_internal_encode_row_key(
      jsonb_build_object(
        'classroom_id', '11111111-1111-4111-8111-111111111111',
        'user_id', '22222222-2222-4222-8222-222222222222'),
      array['classroom_id', 'user_id'])),
  jsonb_build_object(
    'classroom_id', '11111111-1111-4111-8111-111111111111',
    'user_id', '22222222-2222-4222-8222-222222222222'),
  'a realistic two-uuid composite key round trips past the 76-char boundary');
select ok(
  position(E'\n' in public.admin_internal_encode_row_key(
    jsonb_build_object(
      'classroom_id', '11111111-1111-4111-8111-111111111111',
      'user_id', '22222222-2222-4222-8222-222222222222'),
    array['classroom_id', 'user_id'])) = 0,
  'the encoded token never carries an embedded newline');

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

-- ── 2026-08-19 review:list binding 不得因分隔字元碰撞而跨 filter 誤用 ──
-- 兩個結構不同的 filter 物件,若序列化時用裸 `,`/`=` 串接,可能正規化成
-- 同一個字串:{group_label:foo, status:draft} 與單一 filter
-- {group_label:"foo,status=draft"}。binding 相撞代表前者簽出的 cursor
-- 能被後者接受,分頁邊界會用錯查詢條件重跑。
select isnt(
  public.admin_internal_list_binding('content', 'review_cards',
    '{"group_label": {"eq": "foo"}, "status": {"eq": "draft"}}'::jsonb,
    'created_at'),
  public.admin_internal_list_binding('content', 'review_cards',
    '{"group_label": {"eq": "foo,status=draft"}}'::jsonb, 'created_at'),
  'differently-shaped filters never collide onto the same cursor binding');

-- ── 2026-08-19 review:畸形 p_filters 必須 typed deny,不得裸例外 ──────
-- `jsonb_object_keys` 只接受 object;傳入合法但非 object 的 jsonb(如
-- `[]`)過去會讓整支函式以未捕捉例外中止,略過 denial 交易(沒有 typed
-- outcome、沒有 audit、沒有 denial counter),還把內部函式名/行號洩漏
-- 給呼叫端。
select is((public.admin_list_resource('users', 'profiles', null,
    '[]'::jsonb, null))->>'code', 'COLUMN_NOT_ALLOWED',
  'a non-object p_filters container is a typed denial, not a raw exception');
select is((select count(*)::int from public.admin_denial_counters
    where safe_reason_code = 'COLUMN_NOT_ALLOWED'
      and resource_key = 'users/profiles'), 1,
  'the malformed-filters denial is still recorded in the denial counter');

select * from finish();
rollback;
