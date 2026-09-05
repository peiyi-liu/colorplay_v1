import { commandOutcome, type SafeCommandOutcome } from '../api/admin-outcome';
import { AdminTrace } from './admin-trace';
import { useAdminOperations } from './admin-operation-notices';
import { useAdminWait } from '../hooks/use-admin-wait';
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
  const operations = useAdminOperations();
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const submittedArgs = useRef<Record<string, unknown> | null>(null);
  const [attemptStarted, setAttemptStarted] = useState(false);
  const [outcome, setOutcome] = useState<SafeCommandOutcome | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [deniedCode, setDeniedCode] = useState<AdminErrorCode | null>(null);
  const [unexpectedError, setUnexpectedError] = useState(false);
  const longWait = useAdminWait(submitting);
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
    mounted.current = true;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const first =
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => {
      mounted.current = false;
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
      if (submitting && !longWait) return;
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

  const submit = async (values: ReasonFormValues) => {
    if (
      inFlight.current ||
      (!attemptStarted && operations?.blocked(command)) ||
      (outcome && !outcome.retryable)
    )
      return;
    inFlight.current = true;
    setAttemptStarted(true);
    setSubmitting(true);
    operations?.begin(command, idempotencyKey, title);
    setDeniedCode(null);
    setUnexpectedError(false);
    try {
      const commandArgs =
        submittedArgs.current ??
        (requiresReason ? { ...args, reason: values.reason } : args);
      submittedArgs.current = commandArgs;
      const response = await invokeAdminCommand(
        command,
        idempotencyKey,
        commandArgs,
      );
      const safe = commandOutcome(command, response);
      operations?.settle(idempotencyKey, safe);
      if (!mounted.current) return;
      setOutcome(safe);
      if (safe.kind === 'completed' || safe.kind === 'accepted') {
        toast({
          message: safe.message,
          tone: safe.kind === 'completed' ? 'success' : 'info',
        });
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

      if (code) {
        setDeniedCode(code);
      } else {
        setUnexpectedError(true);
      }
    } catch {
      const safe = commandOutcome(command, null);
      operations?.settle(idempotencyKey, safe);
      if (mounted.current) {
        setOutcome(safe);
        setUnexpectedError(true);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

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
        <form onSubmit={(event) => void handleSubmit(submit)(event)}>
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
                disabled={submitting || attemptStarted}
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
            <p role="alert">
              尚無法確認操作結果。請先查核狀態，系統不會自動重送。
            </p>
          ) : null}
          <AdminStatusBanner code={deniedCode} />
          {outcome ? (
            <>
              <AdminTrace value={outcome.requestId} />
              <AdminTrace label="作業代碼" value={outcome.operationId} />
              {outcome.kind === 'unknown' && !unexpectedError ? (
                <p role="alert">{outcome.message}</p>
              ) : null}
            </>
          ) : null}
          {longWait ? (
            <p role="status">
              尚未收到最終結果。關閉視窗不會撤銷已送出的作業；請稍後查看操作結果。
            </p>
          ) : null}
          {operations?.blocked(command) && !attemptStarted ? (
            <p role="alert">此類操作尚有結果未確認，請先查看本次操作結果。</p>
          ) : null}
          <div className="admin-command-dialog__actions">
            <button
              className="secondary-action"
              disabled={submitting && !longWait}
              onClick={onCancel}
              type="button"
            >
              {submitting ? '關閉視窗，稍後查看' : '取消'}
            </button>
            <button
              className="primary-action"
              data-primary-action="true"
              disabled={
                submitting ||
                (outcome !== null && !outcome.retryable) ||
                (!attemptStarted && operations?.blocked(command) === true)
              }
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
