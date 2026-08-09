import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import {
  extractErrorCode,
  invokeAdminCommand,
  type AdminErrorCode,
} from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminStatusBanner } from './admin-status-banner';

const purposeSchema = z.object({
  purpose: z.string().trim().min(10, '請輸入至少 10 字的揭露目的'),
});
type PurposeFormValues = z.infer<typeof purposeSchema>;

const FOCUSABLE_SELECTOR =
  'textarea, button:not(:disabled), input, [tabindex]:not([tabindex="-1"])';

export interface AdminRevealDialogProps {
  column: string;
  domain: string;
  onClose: () => void;
  resource: string;
  rowId: string;
}

/**
 * 單列單欄的 personal 欄位揭露(spec §7、§10):
 * - purpose trim 後至少 10 字(client Zod 只做 UX,server 仍重驗)。
 * - 一次只揭露一列的一個欄位,args 由開啟者釘死,使用者無法在框內改目標。
 * - **明文只存在本元件的 local state**:不回傳給呼叫端、不進 TanStack Query
 *   cache、不寫 storage/URL/console/toast。dialog 關閉或 route 離開即隨元件
 *   卸載消失,重新整理自然回到遮罩(spec §7「Response 遺失必須重新核准」)。
 * - idempotency key 生命週期比照 Task 12 的 AdminCommandDialog:開啟時鑄一把、
 *   重試沿用、只有 IDEMPOTENCY_CONFLICT 才換新。
 */
export function AdminRevealDialog({
  column,
  domain,
  onClose,
  resource,
  rowId,
}: Readonly<AdminRevealDialogProps>) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAdminSessionState();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [submitting, setSubmitting] = useState(false);
  // null = 尚未揭露;{ value: null } = 已揭露且該欄本來就是空值。兩者必須
  // 分開,否則 NULL 的 personal 欄會讓使用者按下「揭露」後畫面毫無反應。
  const [revealResult, setRevealResult] = useState<{
    value: string | null;
  } | null>(null);
  // replay:server 的 redacted result receipt 依設計不含明文(只有首次
  // 'ok' 才附 value),不能假裝成功顯示空白,必須誠實要求重新核准。
  const [replayed, setReplayed] = useState(false);
  const [deniedCode, setDeniedCode] = useState<AdminErrorCode | null>(null);
  const [unexpectedError, setUnexpectedError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<PurposeFormValues>({
    defaultValues: { purpose: '' },
    resolver: zodResolver(purposeSchema),
  });

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // modal 吃下自己的 Escape,不冒泡到 document-level 監聽器(窄視口的
      // MENU drawer 不是遮擋式 overlay,兩者同時關閉會搶 focus restore)。
      event.stopPropagation();
      if (submitting) return;
      onClose();
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
    setReplayed(false);
    try {
      const response = await invokeAdminCommand(
        'admin_reveal_field',
        idempotencyKey,
        {
          column,
          domain,
          purpose: values.purpose,
          resource,
          row_id: rowId,
        },
      );
      if (response.outcome === 'ok') {
        setRevealResult({
          value: typeof response.value === 'string' ? response.value : null,
        });
        return;
      }
      if (response.outcome === 'replayed') {
        // replay 的 redacted receipt 不含明文,UI 會請使用者以新的目的重新
        // 申請 —— 新目的就是新的 canonical request hash,沿用同一把 key
        // 必然撞 IDEMPOTENCY_CONFLICT(spec §8.2),所以這裡就換新 key。
        setIdempotencyKey(crypto.randomUUID());
        setReplayed(true);
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

  const revealed = revealResult !== null;

  return (
    <div className="admin-command-dialog__backdrop">
      <div
        aria-labelledby="admin-reveal-dialog-title"
        aria-modal="true"
        className="admin-command-dialog"
        onKeyDown={onDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id="admin-reveal-dialog-title">
          揭露「{resource}」的 {column}
        </h2>

        {revealed ? (
          <div className="admin-reveal-dialog__result">
            {revealResult.value === null ? (
              <p role="status">
                已揭露 {column}：此欄位目前是空值（資料庫中沒有內容）。
              </p>
            ) : (
              <>
                <p role="status">已揭露 {column}，關閉後即不可再查看。</p>
                <code data-testid="reveal-plaintext">{revealResult.value}</code>
              </>
            )}
            <button
              className="primary-action"
              data-primary-action="true"
              onClick={onClose}
              type="button"
            >
              關閉
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <p>
              系統會完整記錄這次揭露的資源、列、欄與目的（不含明文）。明文只顯示這一次。
            </p>
            <div className="admin-command-dialog__field">
              <label htmlFor="admin-reveal-dialog-purpose">揭露目的</label>
              <textarea
                aria-describedby={
                  errors.purpose
                    ? 'admin-reveal-dialog-purpose-error'
                    : undefined
                }
                aria-invalid={errors.purpose ? 'true' : 'false'}
                id="admin-reveal-dialog-purpose"
                {...register('purpose')}
              />
              {errors.purpose ? (
                <p id="admin-reveal-dialog-purpose-error" role="alert">
                  {errors.purpose.message}
                </p>
              ) : null}
            </div>
            {replayed ? (
              <p role="alert">
                這筆揭露先前已揭露過，明文不會再次提供；如仍需要，請以新的目的重新申請。
              </p>
            ) : null}
            {unexpectedError ? (
              <p role="alert">發生非預期的錯誤，請稍後再試或聯絡負責人。</p>
            ) : null}
            <AdminStatusBanner code={deniedCode} />
            <div className="admin-command-dialog__actions">
              <button
                className="secondary-action"
                disabled={submitting}
                onClick={onClose}
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
                {submitting ? '揭露中…' : '揭露'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
