const LABELS: Record<string, string> = {
  factor_incident_isolation: '驗證器異常隔離',
  reset_admin_mfa: '重設管理員驗證器',
  deactivate_admin: '停用管理員',
  reactivate_admin: '恢復管理員',
  create_teacher_account: '建立教師帳號',
  update_teacher_account: '更新教師資料',
  reset_teacher_password: '重設教師密碼',
  active: '啟用',
  active_pending_mfa: '待設定雙因素驗證',
  deactivated: '已停用',
  recovery_pending: '等待安全復原',
  requested: '已受理',
  pending: '待處理',
  stuck: '處理受阻',
  completed: '已完成',
  compensated: '已補償，操作未完成',
  step1_complete: '已撤銷特權存取',
  step2_complete: '驗證器處理完成',
  operation_pending: '作業處理中',
  identity_reserved: '已保留帳號',
  auth_created_or_password_updated: '帳號驗證步驟已完成',
  profile_committed: '資料已更新，等待收尾',
  compensation_pending: '正在補償',
  reconciliation_required: '需要受控對帳',
};
export function adminStateLabel(value: string | null): string {
  return value === null ? '尚無步驟資料' : (LABELS[value] ?? '狀態尚無法辨識');
}

export function adminStepLabel(value: unknown): string {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
  )
    return '步驟 ' + String(value);
  return typeof value === 'string' || value === null
    ? adminStateLabel(value)
    : '步驟尚無法辨識';
}
