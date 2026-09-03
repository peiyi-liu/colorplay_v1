// supabase/functions/admin-reconcile/index.ts
// 受保護排程 path(spec §8.3):非瀏覽器入口,以部署 secret 驗證;
// 掃描逾時 operations,依 type 重跑剩餘 idempotent steps。
//
// Task 13A-5:額外處理「已被 active Admin 授權一次人工重試」的 stuck 作業。
// 這條路徑不經 svc_admin_touch_security_operation(那是自動退避迴圈的記帳,
// stuck 作業已經離開該迴圈),而是以 svc_admin_claim_manual_retry 原子取得
// 一次性執行權與憑證,再拿憑證兌現 step。授權由 Admin 在
// reconcile_admin_security_operation 走完整 privileged-session／fresh-MFA
// 驗證後才會寫入,本函式不放寬任何權限。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse } from '../_shared/cors.ts';
import { auditUnavailableEnvelope } from '../_shared/denial-envelope.ts';
import {
  reconcileTeacherAccountOperation,
  type TeacherAccountCommand,
  type TeacherAccountReconciliationDependencies,
} from '../_shared/teacher-account-operation.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const reconcileKey = Deno.env.get('ADMIN_RECONCILE_KEY') ?? '';

type ServiceClient = ReturnType<typeof createClient>;

const asStr = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** principal → auth user;查不到就不推進(不得猜測目標) */
async function resolveTargetUserId(
  service: ServiceClient,
  principalId: unknown,
): Promise<string> {
  const principal = await service
    .from('admin_audit_principals')
    .select('user_id')
    .eq('id', principalId)
    .single();
  if (principal.error !== null) return '';
  return asStr(asRecord(principal.data)?.user_id);
}

/**
 * 刪光目標的全部 TOTP factor(step2 的前置)。任何一次刪除失敗都回 false ——
 * 因子還在就推進 saga 等於謊報「MFA 已重設」。
 */
async function deleteAllFactors(
  service: ServiceClient,
  targetUserId: string,
): Promise<boolean> {
  const factors = await service.auth.admin.mfa.listFactors({
    userId: targetUserId,
  });
  if (factors.error !== null) return false;
  for (const factor of factors.data?.factors ?? []) {
    const removal = await service.auth.admin.mfa.deleteFactor({
      userId: targetUserId,
      id: factor.id,
    });
    if (removal.error !== null) return false;
  }
  return true;
}

const rpcSucceeded = (result: { data: unknown; error: unknown }): boolean =>
  result.error === null && asRecord(result.data)?.outcome === 'ok';

const isTeacherReconciliationCommand = (
  value: string,
): value is TeacherAccountCommand =>
  value === 'create_teacher_account' || value === 'reset_teacher_password';

const deleteAuthUserIfPresent = async (
  service: ServiceClient,
  userId: string,
) => {
  const result = await service.auth.admin.deleteUser(userId);
  if (result.error?.status === 404) {
    return { data: {}, error: null };
  }
  return result;
};

const teacherReconciliationDependencies = (
  service: ServiceClient,
): TeacherAccountReconciliationDependencies => ({
  recordSafeEvent: (event) =>
    console.info(
      JSON.stringify({ event: 'teacher_account_reconciliation', ...event }),
    ),
  store: {
    claimReconciliation: ({ operationId, expectedOperationType }) =>
      service.rpc('svc_admin_claim_teacher_reconciliation', {
        p_operation_id: operationId,
        p_expected_operation_type: expectedOperationType,
      }),
    resolveReconciliation: ({
      operationId,
      expectedOperationType,
      claimToken,
    }) =>
      service.rpc('svc_admin_resolve_teacher_reconciliation', {
        p_operation_id: operationId,
        p_expected_operation_type: expectedOperationType,
        p_claim_token: claimToken,
      }),
    releaseReconciliation: ({
      operationId,
      expectedOperationType,
      claimToken,
      safeCode,
    }) =>
      service.rpc('svc_admin_release_teacher_reconciliation', {
        p_operation_id: operationId,
        p_expected_operation_type: expectedOperationType,
        p_claim_token: claimToken,
        p_safe_code: safeCode,
      }),
  },
  auth: {
    deleteUser: (userId) => deleteAuthUserIfPresent(service, userId),
  },
});

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
    return jsonResponse(503, auditUnavailableEnvelope());
  }

  const results: Array<{ id: string; state: string }> = [];
  for (const operation of due.data ?? []) {
    const operationId = asStr(operation.id);
    // 每輪嘗試先記帳(遞增 attempt_count+5 分鐘退避):stuck 門檻在失敗
    // 迴圈下才可達,且不會無限即時重試
    const touched = await service.rpc('svc_admin_touch_security_operation', {
      p_operation_id: operationId,
    });
    const touchData = asRecord(touched.data);
    if (touched.error !== null || touchData?.outcome !== 'ok') {
      results.push({ id: operationId, state: 'skipped' });
      continue;
    }
    const attempts =
      typeof touchData.attempt_count === 'number' ? touchData.attempt_count : 0;
    if (attempts >= 10) {
      // 卡住門檻:標 stuck + incident audit;不得放寬權限(spec §8.3)
      await service.rpc('svc_admin_mark_operation_stuck', {
        p_operation_id: operationId,
      });
      results.push({ id: operationId, state: 'stuck' });
      continue;
    }
    const targetUserId = await resolveTargetUserId(
      service,
      operation.target_principal_id,
    );
    if (targetUserId === '') {
      results.push({ id: operationId, state: 'retrying' });
      continue;
    }
    // 每一步的結果都必須確認:GoTrue 失敗或 step RPC 非 ok 一律不推進,
    // 回報 retrying(下一輪退避後重試),不得把未完成標成 advanced
    if (operation.state === 'step1_complete') {
      if (!(await deleteAllFactors(service, targetUserId))) {
        results.push({ id: operationId, state: 'retrying' });
        continue;
      }
      const step2 = await service.rpc('svc_admin_complete_reset_step2', {
        p_operation_id: operationId,
      });
      if (!rpcSucceeded(step2)) {
        results.push({ id: operationId, state: 'retrying' });
        continue;
      }
    }
    const step3 = await service.rpc('svc_admin_complete_reset_step3', {
      p_operation_id: operationId,
    });
    if (!rpcSucceeded(step3)) {
      results.push({ id: operationId, state: 'retrying' });
      continue;
    }
    results.push({ id: operationId, state: 'advanced' });
  }

  // ── 已授權的一次性人工重試(spec §8.3、Task 13A-5) ──────────────────
  // next_retry_at 在 stuck 狀態下只有一個意義:「Admin 授權了一次重試」。
  // 授權本身已經過 privileged session + fresh TOTP + receipt;這裡只負責
  // 取得執行權並兌現,不重新判斷授權。
  const authorized = await service
    .from('admin_security_operations')
    .select('id, operation_type, state, target_principal_id, current_step')
    .eq('operation_type', 'reset_admin_mfa')
    .eq('state', 'stuck')
    .not('next_retry_at', 'is', null)
    .limit(20);
  if (authorized.error !== null) {
    return jsonResponse(503, auditUnavailableEnvelope());
  }

  for (const operation of authorized.data ?? []) {
    const operationId = asStr(operation.id);
    // claim 是唯一的併發閘門:兩個 worker 同時掃到同一筆時,只有一個拿得到
    // 憑證,另一個得到 skipped。claim 消耗授權,所以中途失敗需要 Admin
    // 重新授權 —— 這正是一次性語意,不是可以自動重試的迴圈。
    const claim = await service.rpc('svc_admin_claim_manual_retry', {
      p_operation_id: operationId,
    });
    const claimData = asRecord(claim.data);
    if (claim.error !== null || claimData?.outcome !== 'ok') {
      results.push({ id: operationId, state: 'claim_lost' });
      continue;
    }
    const claimToken = asStr(claimData.claim_token);
    const currentStep =
      typeof claimData.current_step === 'number' ? claimData.current_step : 0;
    const targetUserId = await resolveTargetUserId(
      service,
      claimData.target_principal_id,
    );
    if (claimToken === '' || targetUserId === '') {
      results.push({ id: operationId, state: 'manual_retry_failed' });
      continue;
    }

    // current_step < 2 代表 step2 還沒完成:先確認因子真的刪光,再用憑證
    // 兌現 step2;成功後 state 已是 step2_complete,step3 走一般排程形態。
    if (currentStep < 2) {
      if (!(await deleteAllFactors(service, targetUserId))) {
        results.push({ id: operationId, state: 'manual_retry_failed' });
        continue;
      }
      const step2 = await service.rpc('svc_admin_complete_reset_step2', {
        p_operation_id: operationId,
        p_claim_token: claimToken,
      });
      if (!rpcSucceeded(step2)) {
        results.push({ id: operationId, state: 'manual_retry_failed' });
        continue;
      }
      const step3 = await service.rpc('svc_admin_complete_reset_step3', {
        p_operation_id: operationId,
      });
      results.push({
        id: operationId,
        state: rpcSucceeded(step3) ? 'manual_retry_advanced' : 'retrying',
      });
      continue;
    }

    // current_step >= 2:只差 step3,直接以憑證兌現
    const step3 = await service.rpc('svc_admin_complete_reset_step3', {
      p_operation_id: operationId,
      p_claim_token: claimToken,
    });
    results.push({
      id: operationId,
      state: rpcSucceeded(step3)
        ? 'manual_retry_advanced'
        : 'manual_retry_failed',
    });
  }

  // Teacher-account recovery uses only service RPC projections. The private
  // operation table is intentionally not readable by service_role; each worker
  // must claim an exact operation kind/ID and spend the returned lease token.
  const teacherCandidates = await service.rpc(
    'svc_admin_list_teacher_reconciliation_candidates',
    { p_limit: 20 },
  );
  const teacherList = asRecord(teacherCandidates.data);
  if (
    teacherCandidates.error !== null ||
    teacherList?.outcome !== 'ok' ||
    !Array.isArray(teacherList.operations)
  ) {
    return jsonResponse(503, auditUnavailableEnvelope());
  }
  const teacherDependencies = teacherReconciliationDependencies(service);
  for (const candidateValue of teacherList.operations) {
    const candidate = asRecord(candidateValue);
    const operationId = asStr(candidate?.operation_id);
    const command = asStr(candidate?.operation_type);
    if (operationId === '' || !isTeacherReconciliationCommand(command)) {
      results.push({ id: operationId, state: 'teacher_claim_invalid' });
      continue;
    }
    try {
      const reconciled = await reconcileTeacherAccountOperation(
        { command, operationId },
        teacherDependencies,
      );
      results.push({
        id: operationId,
        state:
          reconciled.kind === 'resolved'
            ? 'teacher_reconciliation_resolved'
            : 'teacher_reconciliation_deferred',
      });
    } catch {
      results.push({
        id: operationId,
        state: 'teacher_reconciliation_retrying',
      });
    }
  }

  return jsonResponse(200, { outcome: 'ok', operations: results });
});
