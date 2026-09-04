-- supabase/tests/056_admin_manual_retry_claim_token.test.sql
-- Task 13A-5:一次性人工重試憑證。claim 簽發、step 閘門兌現、成功即作廢,
-- 且排程路徑(無憑證)的語意完全不變。
begin;
-- 18 = 7(憑證閘門)+ 3(一次性與作廢)+ 3(排程路徑未因重構而改變)
--    + 2(非 reset saga 與 factor incident)+ 3(2026-08-19 review:
--    憑證不得讓 step3 跳過 step2)
select plan(18);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

-- 共用 fixture 建立器:直接寫入 stuck 作業,省去跑滿 10 次失敗迴圈
create or replace function pg_temp.seed_stuck_operation(
  p_id uuid, p_step integer,
  p_type public.admin_operation_type default 'reset_admin_mfa'
) returns void language plpgsql as $$
begin
  insert into public.admin_security_operations
    (id, operation_type, target_principal_id, state, current_step,
     attempt_count, next_retry_at)
  select p_id, p_type, audit_principal_id, 'stuck', p_step, 12, null
  from public.admin_security_identities
  where admin_user_id = 'bb000000-0000-0000-0000-000000000001';
end;
$$;

-- ── 憑證閘門:step2 ───────────────────────────────────────────────────
select pg_temp.seed_stuck_operation(
  '0db00000-0000-0000-0000-0000000000a1', 1);
update public.admin_security_operations set next_retry_at = now()
  where id = '0db00000-0000-0000-0000-0000000000a1';

select set_config('pgtap.claim', (public.svc_admin_claim_manual_retry(
  '0db00000-0000-0000-0000-0000000000a1'))::text, true);
select isnt(current_setting('pgtap.claim')::jsonb ->> 'claim_token', null,
  'a successful claim issues a one-shot token');
select is(current_setting('pgtap.claim')::jsonb ->> 'current_step', '1',
  'the claim reports where the saga has to resume from');

select is((public.svc_admin_complete_reset_step2(
    '0db00000-0000-0000-0000-0000000000a1'))::jsonb ->> 'code',
  'SECURITY_OPERATION_PENDING',
  'the scheduled path still cannot advance a stuck operation');
select is((public.svc_admin_complete_reset_step2(
    '0db00000-0000-0000-0000-0000000000a1',
    '99999999-9999-9999-9999-999999999999'::uuid))::jsonb ->> 'code',
  'SECURITY_OPERATION_PENDING',
  'a mismatched claim token is refused like no token at all');

select is((public.svc_admin_complete_reset_step2(
    '0db00000-0000-0000-0000-0000000000a1',
    (current_setting('pgtap.claim')::jsonb ->> 'claim_token')::uuid
  ))::jsonb ->> 'manual_retry', 'true',
  'the matching claim token redeems the stuck operation');
select is((select state::text from public.admin_security_operations
    where id = '0db00000-0000-0000-0000-0000000000a1'), 'step2_complete',
  'redeeming advances the saga instead of leaving it inert');
select is((select manual_retry_claim_token
    from public.admin_security_operations
    where id = '0db00000-0000-0000-0000-0000000000a1'), null,
  'the token is voided the moment it is redeemed');

-- ── 一次性:同一張憑證不得在下一次 incident 再兌現 ────────────────────
update public.admin_security_operations
  set state = 'stuck', next_retry_at = null
  where id = '0db00000-0000-0000-0000-0000000000a1';
select is((public.svc_admin_complete_reset_step2(
    '0db00000-0000-0000-0000-0000000000a1',
    (current_setting('pgtap.claim')::jsonb ->> 'claim_token')::uuid
  ))::jsonb ->> 'code', 'SECURITY_OPERATION_PENDING',
  'a redeemed token cannot be replayed against a later incident');

-- 重新標 stuck 必須作廢任何未兌現的憑證,否則舊憑證會跨 incident 存活
select pg_temp.seed_stuck_operation(
  '0db00000-0000-0000-0000-0000000000a2', 1);
update public.admin_security_operations
  set state = 'step2_complete', manual_retry_claim_token = gen_random_uuid()
  where id = '0db00000-0000-0000-0000-0000000000a2';
select public.svc_admin_mark_operation_stuck(
  '0db00000-0000-0000-0000-0000000000a2');
select is((select manual_retry_claim_token
    from public.admin_security_operations
    where id = '0db00000-0000-0000-0000-0000000000a2'), null,
  'marking an operation stuck voids any outstanding claim token');

-- ── 憑證閘門:step3(卡在 step2 之後的作業) ─────────────────────────
select pg_temp.seed_stuck_operation(
  '0db00000-0000-0000-0000-0000000000a3', 2);
update public.admin_security_operations set next_retry_at = now()
  where id = '0db00000-0000-0000-0000-0000000000a3';
select set_config('pgtap.claim3', (public.svc_admin_claim_manual_retry(
  '0db00000-0000-0000-0000-0000000000a3'))::text, true);
select is((public.svc_admin_complete_reset_step3(
    '0db00000-0000-0000-0000-0000000000a3'))::jsonb ->> 'code',
  'SECURITY_OPERATION_PENDING',
  'step3 also refuses a stuck operation without a token');
select is((public.svc_admin_complete_reset_step3(
    '0db00000-0000-0000-0000-0000000000a3',
    (current_setting('pgtap.claim3')::jsonb ->> 'claim_token')::uuid
  ))::jsonb ->> 'manual_retry', 'true',
  'step3 redeems its own claim token');

-- ── 排程路徑未因抽出共用實作而改變 ───────────────────────────────────
select pg_temp.seed_stuck_operation(
  '0db00000-0000-0000-0000-0000000000a4', 1);
update public.admin_security_operations set state = 'step1_complete'
  where id = '0db00000-0000-0000-0000-0000000000a4';
select is((public.svc_admin_complete_reset_step2(
    '0db00000-0000-0000-0000-0000000000a4'))::jsonb ->> 'outcome', 'ok',
  'the scheduled path still advances a normal step1_complete operation');
select is((public.svc_admin_complete_reset_step3(
    '0db00000-0000-0000-0000-0000000000a4'))::jsonb ->> 'outcome', 'ok',
  'the scheduled path still completes a normal step2_complete operation');

-- ── factor incident:連憑證都拿不到(spec §4.2 只能走 owner OOB) ─────
select pg_temp.seed_stuck_operation(
  '0db00000-0000-0000-0000-0000000000a5', 1, 'factor_incident_isolation');
update public.admin_security_operations set next_retry_at = now()
  where id = '0db00000-0000-0000-0000-0000000000a5';
select is((public.svc_admin_claim_manual_retry(
    '0db00000-0000-0000-0000-0000000000a5'))::jsonb ->> 'outcome', 'skipped',
  'a factor incident never receives a manual retry claim token');
select is((select manual_retry_claim_token
    from public.admin_security_operations
    where id = '0db00000-0000-0000-0000-0000000000a5'), null,
  'and no token is written to it either');

-- ── 2026-08-19 review(Critical):憑證不得讓 step3 跳過 step2 ─────────
-- 憑證只證明「這次人工重試被授權」,不證明 step2(刪除舊 TOTP factor)
-- 真的跑過。stuck 時 current_step 停在上一次真正完成的進度;若 step3
-- 只看 state='stuck' + token 相符,拿到憑證的呼叫者可以直接跳過 step2、
-- 把 operation 標 completed、把 identity 推進 active_pending_mfa —— 而
-- 舊 TOTP factor 從未在 GoTrue 被刪除,等於讓已核准的 MFA 重設悄悄失效
-- (曾經用真實呼叫序列驗證過這個繞過確實會成功)。
select pg_temp.seed_stuck_operation(
  '0db00000-0000-0000-0000-0000000000a6', 1);
update public.admin_security_operations set next_retry_at = now()
  where id = '0db00000-0000-0000-0000-0000000000a6';
select (public.svc_admin_claim_manual_retry(
  '0db00000-0000-0000-0000-0000000000a6')) ->> 'claim_token' as tok_a6 \gset
select is((public.svc_admin_complete_reset_step3(
    '0db00000-0000-0000-0000-0000000000a6', :'tok_a6'::uuid))::jsonb ->> 'code',
  'SECURITY_OPERATION_PENDING',
  'a valid claim token cannot redeem step3 while current_step is still 1');
select is((select state::text from public.admin_security_operations
    where id = '0db00000-0000-0000-0000-0000000000a6'), 'stuck',
  'the operation stays stuck instead of being marked completed');
select is((select manual_retry_claim_token
    from public.admin_security_operations
    where id = '0db00000-0000-0000-0000-0000000000a6'), :'tok_a6'::uuid,
  'the rejected attempt does not burn the still-valid claim token');

select * from finish();
rollback;
