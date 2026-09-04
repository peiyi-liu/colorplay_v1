import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import type { AdminErrorCode } from '../api/admin-client';
import { AdminStatusBanner } from './admin-status-banner';

const teacherFormSchema = z.object({
  confirmEmailClear: z.boolean(),
  contactEmail: z.union([z.literal(''), z.email('請輸入有效的 Email')]),
  fullName: z
    .string()
    .trim()
    .min(1, '請輸入教師姓名')
    .max(40, '教師姓名最多 40 字'),
  reason: z.string().trim().min(10, '請輸入至少 10 字的原因'),
});

const resetFormSchema = z.object({
  confirmEmailClear: z.boolean(),
  contactEmail: z.string(),
  fullName: z.string(),
  reason: z.string().trim().min(10, '請輸入至少 10 字的原因'),
});

interface FormFields {
  confirmEmailClear: boolean;
  contactEmail: string;
  fullName: string;
  reason: string;
}

export interface TeacherAccountFormValues {
  contactEmail: string | null;
  fullName: string;
  reason: string;
}

export interface TeacherResetFormValues {
  reason: string;
}

interface TeacherAccountFormProps {
  currentContactEmailPresent?: boolean;
  deniedCode?: AdminErrorCode | null;
  initialContactEmail?: string | null;
  initialFullName?: string;
  isSubmitting: boolean;
  mode: 'create' | 'update' | 'reset';
  onCancel: () => void;
  onSubmit: (values: TeacherAccountFormValues | TeacherResetFormValues) => void;
  targetLabel?: string;
  unexpectedError?: boolean;
}

const FOCUSABLE_SELECTOR =
  'textarea, button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function TeacherAccountForm({
  currentContactEmailPresent = false,
  deniedCode = null,
  initialContactEmail = '',
  initialFullName = '',
  isSubmitting,
  mode,
  onCancel,
  onSubmit,
  targetLabel,
  unexpectedError = false,
}: Readonly<TeacherAccountFormProps>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isReset = mode === 'reset';
  const title =
    mode === 'create'
      ? '新增教師帳號'
      : mode === 'update'
        ? '更新教師資料'
        : '重設教師密碼';
  const submitLabel =
    mode === 'create'
      ? '確認新增'
      : mode === 'update'
        ? '確認更新'
        : '確認重設密碼';
  const formSchema = teacherFormSchema.superRefine((values, context) => {
    if (
      mode === 'update' &&
      currentContactEmailPresent &&
      values.contactEmail.trim() === '' &&
      !values.confirmEmailClear
    ) {
      context.addIssue({
        code: 'custom',
        message: '請勾選確認清除現有聯絡 Email',
        path: ['confirmEmailClear'],
      });
    }
  });
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<FormFields>({
    defaultValues: {
      confirmEmailClear: false,
      contactEmail: initialContactEmail ?? '',
      fullName: initialFullName,
      reason: '',
    },
    resolver: zodResolver(isReset ? resetFormSchema : formSchema),
  });
  const contactEmail = useWatch({ control, name: 'contactEmail' });
  const clearsExistingEmail =
    mode === 'update' &&
    currentContactEmailPresent &&
    contactEmail.trim() === '';

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!isSubmitting) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls =
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const submit = handleSubmit((values) => {
    if (isReset) {
      onSubmit({ reason: values.reason.trim() });
      return;
    }
    onSubmit({
      contactEmail: values.contactEmail.trim().toLowerCase() || null,
      fullName: values.fullName.trim(),
      reason: values.reason.trim(),
    });
  });

  return (
    <div className="admin-command-dialog__backdrop">
      <div
        aria-labelledby="teacher-account-form-title"
        aria-modal="true"
        className="admin-command-dialog teacher-account-form"
        onKeyDown={onKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id="teacher-account-form-title">{title}</h2>
        {mode === 'reset' ? (
          <p>
            確認重設 {targetLabel ?? '這位教師'}{' '}
            的密碼。完成後舊密碼會立即失效， 新密碼只顯示一次。
          </p>
        ) : (
          <p>請確認教師姓名、聯絡資料與操作原因後送出。</p>
        )}
        <form onSubmit={(event) => void submit(event)}>
          {!isReset ? (
            <>
              <div className="admin-command-dialog__field">
                <label htmlFor="teacher-account-full-name">教師姓名</label>
                <input
                  aria-describedby={
                    errors.fullName
                      ? 'teacher-account-full-name-error'
                      : undefined
                  }
                  aria-invalid={errors.fullName ? 'true' : 'false'}
                  disabled={isSubmitting}
                  id="teacher-account-full-name"
                  {...register('fullName')}
                />
                {errors.fullName ? (
                  <p id="teacher-account-full-name-error" role="alert">
                    {errors.fullName.message}
                  </p>
                ) : null}
              </div>
              <div className="admin-command-dialog__field">
                <label htmlFor="teacher-account-contact-email">
                  聯絡 Email（選填）
                </label>
                <input
                  aria-describedby={
                    errors.contactEmail
                      ? 'teacher-account-contact-email-error'
                      : undefined
                  }
                  aria-invalid={errors.contactEmail ? 'true' : 'false'}
                  disabled={isSubmitting}
                  id="teacher-account-contact-email"
                  type="email"
                  {...register('contactEmail')}
                />
                {errors.contactEmail ? (
                  <p id="teacher-account-contact-email-error" role="alert">
                    {errors.contactEmail.message}
                  </p>
                ) : null}
              </div>
              {clearsExistingEmail ? (
                <div className="teacher-account-form__destructive-confirmation">
                  <p>
                    警告：聯絡 Email 留白送出，會清除目前已設定的聯絡 Email。
                  </p>
                  <label htmlFor="teacher-account-confirm-email-clear">
                    <input
                      aria-describedby={
                        errors.confirmEmailClear
                          ? 'teacher-account-confirm-email-clear-error'
                          : undefined
                      }
                      aria-invalid={errors.confirmEmailClear ? 'true' : 'false'}
                      disabled={isSubmitting}
                      id="teacher-account-confirm-email-clear"
                      type="checkbox"
                      {...register('confirmEmailClear')}
                    />
                    我確認要清除目前的聯絡 Email
                  </label>
                  {errors.confirmEmailClear ? (
                    <p
                      id="teacher-account-confirm-email-clear-error"
                      role="alert"
                    >
                      {errors.confirmEmailClear.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          <div className="admin-command-dialog__field">
            <label htmlFor="teacher-account-reason">操作原因</label>
            <textarea
              aria-describedby={
                errors.reason ? 'teacher-account-reason-error' : undefined
              }
              aria-invalid={errors.reason ? 'true' : 'false'}
              disabled={isSubmitting}
              id="teacher-account-reason"
              {...register('reason')}
            />
            {errors.reason ? (
              <p id="teacher-account-reason-error" role="alert">
                {errors.reason.message}
              </p>
            ) : null}
          </div>
          {unexpectedError ? (
            <p role="alert">發生非預期錯誤；系統不會自動重送操作。</p>
          ) : null}
          <AdminStatusBanner code={deniedCode} />
          <div className="admin-command-dialog__actions">
            <button
              className="secondary-action"
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
            >
              取消
            </button>
            <button
              className="primary-action"
              data-primary-action="true"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? '處理中…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
