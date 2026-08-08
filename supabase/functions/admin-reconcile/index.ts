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
  // timestamp(值內不得含逗號/多餘的點,避免 or 解析歧義)。
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const due = await service
    .from('admin_security_operations')
    .select('id, operation_type, state, target_principal_id, attempt_count')
    .in('state', ['pending', 'step1_complete', 'step2_complete'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .limit(20);
  if (due.error !== null) {
    return jsonResponse(503, { error: 'SECURITY_AUDIT_UNAVAILABLE' });
  }

  const results: Array<{ id: string; state: string }> = [];
  for (const operation of due.data ?? []) {
    if (operation.attempt_count >= 10) {
      // 卡住門檻:標 stuck + incident audit;不得放寬權限(spec §8.3)
      await service.rpc('svc_admin_mark_operation_stuck', {
        p_operation_id: operation.id,
      });
      results.push({ id: operation.id, state: 'stuck' });
      continue;
    }
    if (operation.operation_type === 'reset_admin_mfa') {
      const principal = await service
        .from('admin_audit_principals')
        .select('user_id')
        .eq('id', operation.target_principal_id)
        .single();
      if (operation.state === 'step1_complete' && principal.data?.user_id) {
        const factors = await service.auth.admin.mfa.listFactors({
          userId: principal.data.user_id,
        });
        for (const factor of factors.data?.factors ?? []) {
          await service.auth.admin.mfa.deleteFactor({
            userId: principal.data.user_id,
            id: factor.id,
          });
        }
        await service.rpc('svc_admin_complete_reset_step2', {
          p_operation_id: operation.id,
        });
      }
      await service.rpc('svc_admin_complete_reset_step3', {
        p_operation_id: operation.id,
      });
    }
    results.push({ id: operation.id, state: 'advanced' });
  }
  return jsonResponse(200, { outcome: 'ok', operations: results });
});
