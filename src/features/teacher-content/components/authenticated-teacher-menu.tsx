import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/context/auth-context';
import { useMyProfile } from '../../profile/hooks/use-my-profile';
import type { TeacherAvatarRepository } from '../api/teacher-avatar-repository';
import {
  useTeacherAvatar,
  useUploadTeacherAvatar,
} from '../hooks/use-teacher-avatar';
import { TeacherMenu } from './teacher-menu';

const avatarMessage = (code: string | undefined): string | null => {
  switch (code) {
    case 'AVATAR_SIZE':
      return '圖片不可超過 2 MiB。';
    case 'AVATAR_TYPE':
      return '請選擇 PNG、JPEG 或 WebP 圖片。';
    case 'AVATAR_AUTHORIZATION':
      return '目前帳號沒有上傳教師頭像的權限。';
    case 'AVATAR_UNAVAILABLE':
      return '頭像服務暫時無法使用，請稍後重試。';
    default:
      return null;
  }
};

export function AuthenticatedTeacherMenu({
  repository,
}: Readonly<{ repository?: TeacherAvatarRepository }>) {
  const auth = useAuth();
  const navigate = useNavigate();
  const profile = useMyProfile();
  const avatar = useTeacherAvatar(repository);
  const upload = useUploadTeacherAvatar(repository);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  const handleSignOut = () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(false);
    void auth.signOut().then(
      () => navigate('/login', { replace: true }),
      () => {
        setIsSigningOut(false);
        setSignOutError(true);
      },
    );
  };

  return (
    <TeacherMenu
      avatarError={avatarMessage(upload.error?.code ?? avatar.error?.code)}
      avatarPending={avatar.isPending || upload.isPending}
      avatarUrl={avatar.data ?? null}
      displayName={profile.data?.displayName ?? '教師'}
      isSigningOut={isSigningOut}
      onAvatarUpload={(file) => {
        upload.mutate(file);
      }}
      onSignOut={handleSignOut}
      signOutError={signOutError}
    />
  );
}
