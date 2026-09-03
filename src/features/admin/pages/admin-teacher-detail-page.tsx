import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import type { AdminErrorCode } from '../api/admin-client';
import type {
  ResetTeacherPasswordInput,
  TeacherDeniedResult,
  TeacherOperationStatusResult,
  UpdateTeacherAccountInput,
} from '../api/teacher-account-contract';
import { createTeacherAccountRepository } from '../api/teacher-account-repository';
import { AdminRevealDialog } from '../components/admin-reveal-dialog';
import { AdminStatusBanner } from '../components/admin-status-banner';
import {
  TeacherAccountForm,
  type TeacherAccountFormValues,
} from '../components/teacher-account-form';
import { TeacherSecretReceipt } from '../components/teacher-secret-receipt';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';
import { formatAdminTimestamp } from '../lib/admin-time';

const repository = createTeacherAccountRepository();

type PendingCommand =
  | { command: 'update_teacher_account'; input: UpdateTeacherAccountInput }
  | { command: 'reset_teacher_password'; input: ResetTeacherPasswordInput };

interface SecretState {
  loginAccount: string;
  password: string;
}

const detailStateLabel = {
  operation_pending: '作業處理中',
  ready: '可操作',
  reconciliation_required: '需要對帳',
} as const;

export function AdminTeacherDetailPage() {
  const { teacherId = '' } = useParams();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [formMode, setFormMode] = useState<'update' | 'reset' | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(
    null,
  );
  const [operationStatus, setOperationStatus] =
    useState<TeacherOperationStatusResult | null>(null);
  const [commandDenied, setCommandDenied] = useState<AdminErrorCode | null>(
    null,
  );
  const [unexpectedError, setUnexpectedError] = useState(false);
  const [notice, setNotice] = useState('');
  const [secret, setSecret] = useState<SecretState | null>(null);

  const detail = useQuery({
    enabled: teacherId !== '',
    queryFn: () => repository.getTeacher(teacherId),
    queryKey: ['admin', 'teachers', 'detail', teacherId],
  });
  const denied: TeacherDeniedResult | null =
    detail.data?.outcome === 'denied' ? detail.data : null;
  const staleSession =
    denied?.code === 'STALE_PRIVILEGED_SESSION' ||
    commandDenied === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(staleSession);

  useEffect(() => {
    if (detail.data?.outcome === 'ok') headingRef.current?.focus();
  }, [detail.data]);

  const checkOperation = async (pending: PendingCommand) => {
    setFormMode(null);
    setCommandDenied(null);
    setUnexpectedError(false);
    setOperationStatus(null);
    try {
      const status = await repository.getOperation({
        command: pending.command,
        requestId: pending.input.requestId,
      });
      if (status.outcome === 'denied') {
        setCommandDenied(status.code);
        return;
      }
      setOperationStatus(status);
    } catch {
      setUnexpectedError(true);
    }
  };

  const runCommand = async (pending: PendingCommand) => {
    setSubmitting(true);
    setCommandDenied(null);
    setUnexpectedError(false);
    setOperationStatus(null);
    try {
      const result =
        pending.command === 'update_teacher_account'
          ? await repository.updateTeacher(pending.input)
          : await repository.resetTeacherPassword(pending.input);
      if (result.outcome === 'denied') {
        if (result.statusCheckRequired) await checkOperation(pending);
        else setCommandDenied(result.code);
        return;
      }
      setFormMode(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'teachers'] });
      if (
        pending.command === 'reset_teacher_password' &&
        result.outcome === 'ok' &&
        result.secretReplayable
      ) {
        setSecret({
          loginAccount: result.loginAccount,
          password: result.password,
        });
        setNotice('');
      } else if (result.outcome === 'replayed') {
        setNotice(
          pending.command === 'reset_teacher_password'
            ? '密碼重設先前已完成；一次性密碼不會再次顯示。'
            : '教師資料更新先前已完成。',
        );
        setPendingCommand(null);
      } else {
        setNotice('教師資料已更新。');
        setPendingCommand(null);
      }
    } catch {
      await checkOperation(pending);
    } finally {
      setSubmitting(false);
    }
  };

  if (detail.isPending || staleSession) return <RouteLoading withinMain />;

  if (detail.isError || detail.data.outcome === 'denied') {
    return (
      <section
        aria-labelledby="admin-teacher-detail-heading"
        className="page-wide"
      >
        <h1 id="admin-teacher-detail-heading">教師帳號詳情</h1>
        {denied ? (
          <>
            <AdminStatusBanner code={denied.code} />
            <p>追蹤代碼：{denied.requestId}</p>
          </>
        ) : (
          <p role="alert">教師資料載入失敗，請稍後重試。</p>
        )}
        {!denied || denied.retryable ? (
          <button
            className="secondary-action"
            onClick={() => void detail.refetch()}
            type="button"
          >
            重試
          </button>
        ) : null}
      </section>
    );
  }

  const teacher = detail.data.teacher;
  const canUpdate = teacher.availableCommands.includes(
    'update_teacher_account',
  );
  const canReset = teacher.availableCommands.includes('reset_teacher_password');

  return (
    <section
      aria-labelledby="admin-teacher-detail-heading"
      className="page-wide page-stack admin-teacher-detail"
    >
      <Link className="admin-teacher-detail__back-link" to="/admin/teachers">
        返回教師帳號
      </Link>
      <h1 id="admin-teacher-detail-heading" ref={headingRef} tabIndex={-1}>
        {teacher.fullName}
      </h1>
      <dl className="admin-teacher-detail__facts">
        <div>
          <dt>登入帳號</dt>
          <dd>{teacher.loginAccount}</dd>
        </div>
        <div>
          <dt>角色</dt>
          <dd>教師</dd>
        </div>
        <div>
          <dt>聯絡 Email</dt>
          <dd>{teacher.contactEmailMasked ?? '未設定'}</dd>
        </div>
        <div>
          <dt>建立時間</dt>
          <dd>{formatAdminTimestamp(teacher.createdAt)}</dd>
        </div>
        <div>
          <dt>作業狀態</dt>
          <dd>{detailStateLabel[teacher.operationState]}</dd>
        </div>
      </dl>

      <div className="admin-teacher-detail__actions">
        {teacher.contactEmailPresent ? (
          <button
            className="secondary-action"
            onClick={() => {
              setRevealOpen(true);
            }}
            type="button"
          >
            揭露聯絡 Email
          </button>
        ) : null}
        {canUpdate ? (
          <button
            className="secondary-action"
            onClick={() => {
              setFormMode('update');
            }}
            type="button"
          >
            更新教師資料
          </button>
        ) : null}
        {canReset ? (
          <button
            className="secondary-action"
            onClick={() => {
              setFormMode('reset');
            }}
            type="button"
          >
            重設密碼
          </button>
        ) : null}
      </div>
      {canUpdate ? (
        <p className="admin-teacher-detail__hint">
          更新表單不會載入完整 Email；聯絡 Email 留白會明確清除現有值。
        </p>
      ) : null}

      <p aria-live="polite" role="status">
        {notice}
      </p>
      {commandDenied && !formMode ? (
        <AdminStatusBanner code={commandDenied} />
      ) : null}
      {unexpectedError && !formMode ? (
        <p role="alert">狀態查詢失敗；系統沒有重送教師帳號操作。</p>
      ) : null}

      {operationStatus ? (
        <div aria-live="polite" className="admin-teachers__operation-status">
          {operationStatus.operationId ? (
            <p>作業代碼：{operationStatus.operationId}</p>
          ) : null}
          {operationStatus.legalFollowUp === 'retry_same_request' ? (
            <>
              <p>伺服器尚未受理這次操作，可使用原操作代碼重試。</p>
              <button
                className="secondary-action"
                onClick={() =>
                  pendingCommand && void runCommand(pendingCommand)
                }
                type="button"
              >
                以相同代碼重試
              </button>
            </>
          ) : null}
          {operationStatus.legalFollowUp === 'wait' ? (
            <>
              <p>作業仍在處理中。</p>
              <button
                className="secondary-action"
                onClick={() =>
                  pendingCommand && void checkOperation(pendingCommand)
                }
                type="button"
              >
                重新查詢狀態
              </button>
            </>
          ) : null}
          {operationStatus.legalFollowUp === 'health_reconciliation' ? (
            <p>
              作業需要受控對帳。
              <Link className="admin-teachers__health-link" to="/admin/health">
                前往健康狀態
              </Link>
            </p>
          ) : null}
          {operationStatus.legalFollowUp === 'none' ? (
            <p>操作已完成或終止，不會再次重送。</p>
          ) : null}
        </div>
      ) : null}

      {formMode ? (
        <TeacherAccountForm
          currentContactEmailPresent={teacher.contactEmailPresent}
          deniedCode={commandDenied}
          initialContactEmail={null}
          initialFullName={teacher.fullName}
          isSubmitting={submitting}
          mode={formMode}
          onCancel={() => {
            if (!submitting) setFormMode(null);
          }}
          onSubmit={(values) => {
            const requestId = crypto.randomUUID();
            const pending: PendingCommand =
              formMode === 'update'
                ? {
                    command: 'update_teacher_account',
                    input: {
                      ...(values as TeacherAccountFormValues),
                      requestId,
                      teacherId,
                    },
                  }
                : {
                    command: 'reset_teacher_password',
                    input: {
                      ...values,
                      requestId,
                      teacherId,
                    },
                  };
            setPendingCommand(pending);
            void runCommand(pending);
          }}
          targetLabel={`${teacher.fullName}（${teacher.loginAccount}）`}
          unexpectedError={unexpectedError}
        />
      ) : null}

      {revealOpen ? (
        <AdminRevealDialog
          column="contact_email"
          domain="users"
          locator={{ kind: 'row_id', value: teacher.teacherId }}
          onClose={() => {
            setRevealOpen(false);
          }}
          resource="profiles"
        />
      ) : null}

      {secret ? (
        <TeacherSecretReceipt
          loginAccount={secret.loginAccount}
          onClose={(reason) => {
            setSecret(null);
            setPendingCommand(null);
            setNotice(
              reason === 'password_copied'
                ? '一次性密碼已複製並清除。'
                : '一次性密碼已清除。',
            );
          }}
          password={secret.password}
        />
      ) : null}
    </section>
  );
}

export { AdminTeacherDetailPage as Component };
