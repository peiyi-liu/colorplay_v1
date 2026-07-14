import type { SafeProfile } from '../types';

const roleLabels: Readonly<Record<SafeProfile['role'], string>> = {
  admin: '管理員',
  student: '學生',
  teacher: '教師',
};

export function ProfileSummary({
  profile,
}: Readonly<{ profile: SafeProfile }>) {
  return (
    <section aria-labelledby="profile-display-name">
      <h1 id="profile-display-name">{profile.displayName}</h1>
      <p>角色：{roleLabels[profile.role]}</p>
    </section>
  );
}
