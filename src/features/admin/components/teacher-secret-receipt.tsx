import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export type TeacherSecretReceiptCloseReason = 'closed' | 'password_copied';

interface TeacherSecretReceiptProps {
  loginAccount: string;
  onClose: (reason: TeacherSecretReceiptCloseReason) => void;
  password: string;
}

export function TeacherSecretReceipt({
  loginAccount,
  onClose,
  password,
}: Readonly<TeacherSecretReceiptProps>) {
  const [visiblePassword, setVisiblePassword] = useState<string | null>(
    password,
  );
  const [copyStatus, setCopyStatus] = useState('');
  const [copyFailed, setCopyFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  const copy = async (kind: 'account' | 'password') => {
    const value = kind === 'account' ? loginAccount : visiblePassword;
    if (value === null) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      if (kind === 'account') {
        setCopyStatus('登入帳號已複製。');
        return;
      }
      setVisiblePassword(null);
      setCopyStatus('一次性密碼已複製並清除。');
      onClose('password_copied');
    } catch {
      setCopyFailed(true);
      setCopyStatus('');
    }
  };

  const close = () => {
    setVisiblePassword(null);
    onClose('closed');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled)',
    );
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

  return (
    <div className="admin-command-dialog__backdrop">
      <div
        aria-labelledby="teacher-secret-receipt-title"
        aria-modal="true"
        className="admin-command-dialog teacher-secret-receipt"
        onKeyDown={onKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id="teacher-secret-receipt-title">教師帳號已完成</h2>
        <p className="teacher-secret-receipt__warning">
          以下密碼只顯示一次。關閉或複製密碼後，系統不會再次提供。
        </p>
        <dl>
          <div>
            <dt>登入帳號</dt>
            <dd>
              <code>{loginAccount}</code>
              <button
                className="secondary-action"
                onClick={() => void copy('account')}
                type="button"
              >
                複製登入帳號
              </button>
            </dd>
          </div>
          <div>
            <dt>一次性密碼</dt>
            <dd>
              {visiblePassword ? (
                <>
                  <code data-testid="teacher-password">{visiblePassword}</code>
                  <button
                    className="secondary-action"
                    onClick={() => void copy('password')}
                    type="button"
                  >
                    複製一次性密碼
                  </button>
                </>
              ) : (
                <span>已清除</span>
              )}
            </dd>
          </div>
        </dl>
        <p aria-live="polite" role="status">
          {copyStatus}
        </p>
        {copyFailed ? (
          <p role="alert">複製失敗，請確認瀏覽器權限後重試。</p>
        ) : null}
        <button
          className="primary-action"
          data-primary-action="true"
          onClick={close}
          ref={closeRef}
          type="button"
        >
          關閉並清除
        </button>
      </div>
    </div>
  );
}
