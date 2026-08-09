import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useToast } from '../../../components/ui/toast';
import {
  extractErrorCode,
  invokeAdminCommand,
  type AdminCommandName,
  type AdminCommandResponse,
  type AdminErrorCode,
} from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminStatusBanner } from './admin-status-banner';

const strictReasonSchema = z.object({
  reason: z.string().trim().min(10, '請輸入至少 10 字的原因'),
});
const looseReasonSchema = z.object({ reason: z.string() });
type ReasonFormValues = z.infer<typeof strictReasonSchema>;

const FOCUSABLE_SELECTOR =
  'textarea, button:not(:disabled), input, [tabindex]:not([tabindex="-1"])';

export interface AdminCommandDialogProps {
  args: Record<string, unknown>;
  command: AdminCommandName;
  onCancel: () => void;
  onSettled: (result: AdminCommandResponse) => void;
  requiresReason: boolean;
  title: string;
}

/**
 * 共用命令確認框(spec §3.1、§8.2):reason 欄由這裡統一收集(server 重驗
 * ≥10 字,client Zod 只做 UX)、44px target、focus trap/restore。成功即
 * onSettled 交回呼叫端關閉;expected denial 留在框內顯示,STALE_
 * PRIVILEGED_SESSION 例外——導向 challenge 並保留 return intent
 * (spec §3.3),不當一般 denial 處理。
 */
export function AdminCommandDialog({
  args,
  command,
  onCancel,
  onSettled,
  requiresReason,
  title,
}: Readonly<AdminCommandDialogProps>) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAdminSessionState();
  const toast = useToast();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [deniedCode, setDeniedCode] = useState<AdminErrorCode | null>(null);
  const [unexpectedError, setUnexpectedError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ReasonFormValues>({
    defaultValues: { reason: '' },
    resolver: zodResolver(
      requiresReason ? strictReasonSchema : looseReasonSchema,
    ),
  });

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const first =
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // 這是 modal(aria-modal="true"):Escape 應該只關這個框,不能繼續
      // 冒泡到別的 document-level 監聽器——窄視口的 MENU drawer 不是遮擋式
      // overlay(底層內容仍可互動),使用者可能在 drawer 開著時另外開了這個
      // dialog;沒有 stopPropagation 會讓同一次 Escape 同時關掉 dialog 和
      // drawer,兩邊的 focus-restore 互搶造成焦點恢復競態(review 波 bugs
      // 軸抓到)。
      event.stopPropagation();
      if (submitting) return;
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables =
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusables || focusables.length === 0) return;
    const list = Array.from(focusables);
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = handleSubmit(async (values) => {
    setSubmitting(true);
    setDeniedCode(null);
    setUnexpectedError(false);
    try {
      const commandArgs = requiresReason
        ? { ...args, reason: values.reason }
        : args;
      const response = await invokeAdminCommand(
        command,
        idempotencyKey,
        commandArgs,
      );
      if (response.outcome === 'ok' || response.outcome === 'replayed') {
        toast({ message: '操作已完成。', tone: 'success' });
        onSettled(response);
        return;
      }
      const code = extractErrorCode(response);
      if (code === 'STALE_PRIVILEGED_SESSION') {
        await session.refetch();
        await navigate('/admin/mfa/challenge', {
          state: { returnTo: location.pathname },
        });
        return;
      }
      if (code === 'IDEMPOTENCY_CONFLICT') {
        setIdempotencyKey(crypto.randomUUID());
      }
      if (code) {
        setDeniedCode(code);
      } else {
        setUnexpectedError(true);
      }
    } catch {
      setUnexpectedError(true);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="admin-command-dialog__backdrop">
      <div
        aria-labelledby="admin-command-dialog-title"
        aria-modal="true"
        className="admin-command-dialog"
        onKeyDown={onDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id="admin-command-dialog-title">{title}</h2>
        <form onSubmit={(event) => void submit(event)}>
          {requiresReason ? (
            <div className="admin-command-dialog__field">
              <label htmlFor="admin-command-dialog-reason">原因</label>
              <textarea
                aria-describedby={
                  errors.reason
                    ? 'admin-command-dialog-reason-error'
                    : undefined
                }
                aria-invalid={errors.reason ? 'true' : 'false'}
                id="admin-command-dialog-reason"
                {...register('reason')}
              />
              {errors.reason ? (
                <p id="admin-command-dialog-reason-error" role="alert">
                  {errors.reason.message}
                </p>
              ) : null}
            </div>
          ) : null}
          {unexpectedError ? (
            <p role="alert">發生非預期的錯誤，請稍後再試或聯絡負責人。</p>
          ) : null}
          <AdminStatusBanner code={deniedCode} />
          <div className="admin-command-dialog__actions">
            <button
              className="secondary-action"
              disabled={submitting}
              onClick={onCancel}
              type="button"
            >
              取消
            </button>
            <button
              className="primary-action"
              data-primary-action="true"
              disabled={submitting}
              type="submit"
            >
              {submitting ? '處理中…' : '確認'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
