import { useRef, type ChangeEvent } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void onAvatarUpload(file);
    event.target.value = '';
  };
  const handleSignOut = () => {
    if (window.confirm('確定要登出嗎？')) onSignOut();
  };

  return (
    <aside aria-label="教師選單" className="teacher-menu">
      <div className="teacher-menu__identity">
        <label
          aria-busy={avatarPending}
          className="teacher-menu__avatar"
          htmlFor="teacher-avatar-input"
        >
          {avatarUrl ? (
            <img alt={`${displayName}的教師頭像`} src={avatarUrl} />
          ) : (
            <span>{avatarPending ? '上傳中…' : '點此上傳'}</span>
          )}
          <input
            accept="image/png,image/jpeg,image/webp"
            aria-label="上傳教師頭像"
            disabled={avatarPending}
            id="teacher-avatar-input"
            onChange={handleUpload}
            ref={inputRef}
            type="file"
          />
        </label>
        <strong>{displayName}・教師端</strong>
        {avatarError ? (
          <p className="teacher-menu__avatar-error" role="alert">
            {avatarError}
          </p>
        ) : null}
      </div>

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
