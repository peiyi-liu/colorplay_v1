import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { NavLink } from 'react-router-dom';

import { Icon, type IconName } from '../../../components/ui/icons';

const navigation: readonly {
  end?: boolean;
  icon: IconName;
  label: string;
  to: string;
}[] = [
  { end: true, icon: 'chart-bar', label: '教學分析', to: '/teacher' },
  { icon: 'users', label: '班級管理', to: '/teacher/classes' },
  { icon: 'bolt', label: 'Live 課堂', to: '/teacher/live' },
];

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `teacher-menu__link${isActive ? ' teacher-menu__link--active' : ''}`;

export function TeacherMenu({
  avatarError,
  avatarPending,
  avatarUrl,
  displayName,
  isSigningOut,
  onAvatarUpload,
  onSignOut,
  signOutError,
}: Readonly<{
  avatarError: string | null;
  avatarPending: boolean;
  avatarUrl: string | null;
  displayName: string;
  isSigningOut: boolean;
  onAvatarUpload: (file: File) => Promise<void> | void;
  onSignOut: () => void;
  signOutError: boolean;
}>) {
  const avatarDialogTitleId = useId();
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);

  useEffect(() => {
    if (!avatarDialogOpen) return;
    const dialog = dialogRef.current;
    const returnFocus = avatarButtonRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    closeButtonRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      returnFocus?.focus();
    };
  }, [avatarDialogOpen]);

  const closeAvatarDialog = () => {
    setAvatarDialogOpen(false);
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarDialogOpen(false);
      void onAvatarUpload(file);
    }
    event.target.value = '';
  };
  const handleSignOut = () => {
    if (window.confirm('確定要登出嗎？')) onSignOut();
  };

  return (
    <aside aria-label="教師選單" className="teacher-menu">
      <div className="teacher-menu__identity">
        {avatarUrl ? (
          <button
            aria-busy={avatarPending}
            aria-label={`管理${displayName}的教師頭像`}
            className="teacher-menu__avatar"
            disabled={avatarPending}
            onClick={() => {
              setAvatarDialogOpen(true);
            }}
            ref={avatarButtonRef}
            type="button"
          >
            <img alt={`${displayName}的教師頭像`} src={avatarUrl} />
          </button>
        ) : (
          <label
            aria-busy={avatarPending}
            className="teacher-menu__avatar"
            htmlFor="teacher-avatar-input"
          >
            <span>{avatarPending ? '上傳中…' : '點此上傳'}</span>
          </label>
        )}
        {!avatarUrl ? (
          <input
            accept="image/png,image/jpeg,image/webp"
            aria-label="上傳教師頭像"
            className="teacher-menu__avatar-input"
            disabled={avatarPending}
            id="teacher-avatar-input"
            onChange={handleUpload}
            ref={inputRef}
            tabIndex={-1}
            type="file"
          />
        ) : null}
        <strong>{displayName}・教師端</strong>
        {avatarError ? (
          <p className="teacher-menu__avatar-error" role="alert">
            {avatarError}
          </p>
        ) : null}
      </div>

      {avatarUrl && avatarDialogOpen ? (
        <dialog
          aria-labelledby={avatarDialogTitleId}
          aria-modal="true"
          className="teacher-avatar-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeAvatarDialog();
          }}
          ref={dialogRef}
        >
          <header className="teacher-avatar-dialog__header">
            <h2 id={avatarDialogTitleId}>教師頭像</h2>
            <button
              aria-label="關閉"
              className="teacher-avatar-dialog__close"
              onClick={closeAvatarDialog}
              ref={closeButtonRef}
              type="button"
            >
              ×
            </button>
          </header>
          <img
            alt={`${displayName}的教師頭像預覽`}
            className="teacher-avatar-dialog__preview"
            src={avatarUrl}
          />
          <div className="teacher-avatar-dialog__actions">
            <a href={avatarUrl} rel="noreferrer" target="_blank">
              查看圖像
            </a>
            <button
              disabled={avatarPending}
              onClick={() => {
                inputRef.current?.click();
              }}
              type="button"
            >
              上傳圖像
            </button>
          </div>
          <input
            accept="image/png,image/jpeg,image/webp"
            aria-label="上傳教師頭像"
            className="teacher-menu__avatar-input"
            disabled={avatarPending}
            onChange={handleUpload}
            ref={inputRef}
            type="file"
          />
          <p>重新上傳後會取代目前的教師頭像。</p>
        </dialog>
      ) : null}

      <nav aria-label="教師導覽" className="teacher-menu__navigation">
        {navigation.map((item) => (
          <NavLink
            className={navClassName}
            key={item.to}
            to={item.to}
            {...(item.end ? { end: true } : {})}
          >
            <Icon aria-hidden="true" name={item.icon} size={23} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <button
        className="teacher-menu__logout"
        disabled={isSigningOut}
        onClick={handleSignOut}
        type="button"
      >
        <span aria-hidden="true" className="teacher-menu__logout-glyph">
          <span />
          <span />
          <span />
        </span>
        <span className="teacher-menu__logout-label">
          {isSigningOut ? '登出中…' : '登出'}
        </span>
      </button>
      {signOutError ? (
        <p className="teacher-menu__signout-error" role="alert">
          登出失敗，請稍後重試。
        </p>
      ) : null}
    </aside>
  );
}
