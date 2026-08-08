// supabase/functions/admin-reconcile/index.ts
// 受保護排程 path(spec §8.3):非瀏覽器入口,以部署 secret 驗證;
// 掃描逾時 operations,依 type 重跑剩餘 idempotent steps。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const reconcileKey = Deno.env.get('ADMIN_RECONCILE_KEY') ?? '';

Deno.serve(async (request) => {
  if (request.method !== 'POST')
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  if (
    reconcileKey === '' ||
    request.headers.get('x-reconcile-key') !== reconcileKey
  ) {
    return jsonResponse(401, { error: 'UNAUTHORIZED' });
  }
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  // PostgREST 的 or-filter 不支援 now() 函式字面值,改用去毫秒的 ISO
  // timestamp(值內不得含逗號/多餘的點,避免 or 解析歧義)。掃描僅限
  // reconcile 能推進的 operation type:factor_incident_isolation 依
  // spec §4.2 只能走 owner OOB,不得佔用掃描名額。
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const due = await service
    .from('admin_security_operations')
    .select('id, operation_type, state, target_principal_id, attempt_count')
    .eq('operation_type', 'reset_admin_mfa')
    .in('state', ['pending', 'step1_complete', 'step2_complete'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .limit(20);
  if (due.error !== null) {
    return jsonResponse(503, { error: 'SECURITY_AUDIT_UNAVAILABLE' });
  }

  const asStr = (value: unknown): string =>
    typeof value === 'string' ? value : '';

  const results: Array<{ id: string; state: string }> = [];
  for (const operation of due.data ?? []) {
    // 每輪嘗試先記帳(遞增 attempt_count+5 分鐘退避):stuck 門檻在失敗
    // 迴圈下才可達,且不會無限即時重試
    const touched = await service.rpc('svc_admin_touch_security_operation', {
      p_operation_id: operation.id,
    });
    const touchData = touched.data as Record<string, unknown> | null;
    if (touched.error !== null || touchData?.outcome !== 'ok') {
      results.push({ id: operation.id, state: 'skipped' });
      continue;
    }
    const attempts =
      typeof touchData.attempt_count === 'number' ? touchData.attempt_count : 0;
    if (attempts >= 10) {
      // 卡住門檻:標 stuck + incident audit;不得放寬權限(spec §8.3)
      await service.rpc('svc_admin_mark_operation_stuck', {
        p_operation_id: operation.id,
      });
      results.push({ id: operation.id, state: 'stuck' });
      continue;
    }
    const principal = await service
      .from('admin_audit_principals')
      .select('user_id')
      .eq('id', operation.target_principal_id)
      .single();
    const targetUserId = asStr(
      (principal.data as Record<string, unknown> | null)?.user_id,
    );
    if (principal.error !== null || targetUserId === '') {
      results.push({ id: operation.id, state: 'retrying' });
      continue;
    }
    // 每一步的結果都必須確認:GoTrue 失敗或 step RPC 非 ok 一律不推進,
    // 回報 retrying(下一輪退避後重試),不得把未完成標成 advanced
    if (operation.state === 'step1_complete') {
      const factors = await service.auth.admin.mfa.listFactors({
        userId: targetUserId,
      });
      if (factors.error !== null) {
        results.push({ id: operation.id, state: 'retrying' });
        continue;
      }
      let deletionsOk = true;
      for (const factor of factors.data?.factors ?? []) {
        const removal = await service.auth.admin.mfa.deleteFactor({
          userId: targetUserId,
          id: factor.id,
        });
        if (removal.error !== null) {
          deletionsOk = false;
          break;
        }
      }
      if (!deletionsOk) {
        results.push({ id: operation.id, state: 'retrying' });
        continue;
      }
      const step2 = await service.rpc('svc_admin_complete_reset_step2', {
        p_operation_id: operation.id,
      });
      const step2Data = step2.data as Record<string, unknown> | null;
      if (step2.error !== null || step2Data?.outcome !== 'ok') {
        results.push({ id: operation.id, state: 'retrying' });
        continue;
      }
    }
    const step3 = await service.rpc('svc_admin_complete_reset_step3', {
      p_operation_id: operation.id,
    });
    const step3Data = step3.data as Record<string, unknown> | null;
    if (step3.error !== null || step3Data?.outcome !== 'ok') {
      results.push({ id: operation.id, state: 'retrying' });
      continue;
    }
    results.push({ id: operation.id, state: 'advanced' });
  }
  return jsonResponse(200, { outcome: 'ok', operations: results });
});
