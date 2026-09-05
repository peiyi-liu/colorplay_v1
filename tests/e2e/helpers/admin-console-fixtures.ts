// Synthetic UI-only responses. Never creates identities or modifies a database.
export const ADMIN_UI_ID = '11111111-1111-4111-8111-111111111111';
export const ADMIN_UI_TIME = '2026-09-05T09:00:00Z';
export function adminUiRpc(name: string): unknown {
  const id = ADMIN_UI_ID,
    time = ADMIN_UI_TIME;
  const teacher = {
    teacher_id: id,
    login_account: 'teacher01',
    display_name: '介面測試教師',
    contact_email_masked: 't***@example.test',
    contact_email_present: true,
    created_at: time,
    operation_state: 'ready',
  };
  switch (name) {
    case 'get_admin_session_state':
      return { state: 'privileged', mfa_age_seconds: 0 };
    case 'admin_health_summary':
      return {
        outcome: 'ok',
        operations_truncated: true,
        denials_truncated: false,
        incidents: {
          stuck_operations: 1,
          locked_identities: 1,
          denial_threshold_breaches: 1,
        },
        operations: Array.from({ length: 5 }, (_, i) => ({
          id: id.replace(/1$/u, String(i)),
          operation_type: 'reset_admin_mfa',
          state: 'stuck',
          current_step: 2,
          attempt_count: 3,
          last_safe_error_code: 'SECURITY_OPERATION_PENDING',
          action_kind:
            i === 0 ? 'manual_retry' : i === 1 ? 'owner_oob' : 'pending',
          updated_at: time,
          created_at: time,
          next_retry_at: null,
          target_principal_id: id,
          correlation_id: id,
        })),
        denials: [
          {
            resource_key: 'command/reset_admin_mfa',
            safe_reason_code: 'STALE_PRIVILEGED_SESSION',
            count: 20,
            window_ends_at: time,
            window_started_at: time,
          },
        ],
      };
    case 'admin_list_teachers':
      return {
        outcome: 'ok',
        request_id: id,
        next_cursor: null,
        rows: [teacher],
      };
    case 'admin_get_teacher':
      return {
        outcome: 'ok',
        request_id: id,
        teacher: {
          ...teacher,
          full_name: '介面測試教師',
          role: 'teacher',
          available_commands: [
            'update_teacher_account',
            'reset_teacher_password',
          ],
        },
      };
    case 'admin_get_teacher_operation':
      return {
        outcome: 'ok',
        request_id: id,
        operation_id: id,
        operation_type: 'create_teacher_account',
        state: 'completed',
        legal_follow_up: 'none',
        teacher_id: id,
        login_account: 'teacher01',
      };
    case 'admin_list_admins':
      return {
        outcome: 'ok',
        next_cursor: null,
        rows: [
          {
            admin_user_id: id,
            audit_principal_id: id,
            state: 'active',
            created_at: time,
            updated_at: time,
            locked_until: null,
            activated_at: time,
            deactivated_at: null,
          },
        ],
      };
    case 'admin_list_invitations':
      return {
        outcome: 'ok',
        next_cursor: null,
        rows: [
          {
            id,
            issuer_principal_id: id,
            invited_email: 'a***@example.test',
            status: 'pending',
            created_at: time,
            expires_at: time,
            revoked_at: null,
            accepted_at: null,
          },
        ],
      };
    case 'admin_list_sessions':
      return {
        outcome: 'ok',
        next_cursor: null,
        rows: [
          {
            id,
            admin_user_id: id,
            audit_principal_id: id,
            correlation_id: id,
            device_summary: '測試裝置 · Chromium',
            created_at: time,
            absolute_expires_at: time,
            last_activity_at: time,
            last_totp_verified_at: time,
            revoked_at: null,
            revoke_reason: null,
          },
        ],
      };
    case 'admin_query_audit':
      return {
        outcome: 'ok',
        next_cursor: null,
        rows: [
          {
            id,
            occurred_at: time,
            action: 'reset_admin_mfa',
            actor_type: 'admin',
            actor_principal_id: id,
            target_principal_id: id,
            target_type: 'admin',
            result: 'ok',
            request_id: id,
            before_after_redacted: null,
            mfa_age_seconds: 1,
            reason_or_purpose_redacted: '測試操作原因已去識別',
          },
        ],
      };
    case 'admin_list_resource':
      return {
        outcome: 'ok',
        next_cursor: null,
        rows: [
          {
            row_key: id,
            id,
            full_name: '測***',
            role: 'teacher',
            created_at: time,
          },
        ],
      };
    case 'admin_get_resource_detail':
      return {
        outcome: 'ok',
        relations: [],
        row: { id, full_name: '測***', role: 'teacher', created_at: time },
      };
    default:
      return {
        outcome: 'denied',
        code: 'RESOURCE_NOT_ALLOWED',
        request_id: id,
        retryable: false,
      };
  }
}
