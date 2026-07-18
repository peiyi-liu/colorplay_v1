import { RouteLoading } from '../../../app/boundaries/route-loading';
import { ProfileSummary } from '../components/profile-summary';
import { useMyProfile, useSetReducedMotion } from '../hooks/use-my-profile';
import type { ProfileRepository } from '../types';

export function ProfileFoundationPage({
  repository,
}: Readonly<{ repository?: ProfileRepository }> = {}) {
  const profile = useMyProfile();
  const setReducedMotion = useSetReducedMotion(repository);

  if (profile.isPending) return <RouteLoading withinMain />;

  if (profile.isError || !profile.data) {
    return (
      <section className="route-panel">
        <p role="alert">無法載入個人資料，請稍後重試。</p>
        <div className="route-panel__action-row">
          <button
            className="primary-action"
            data-primary-action="true"
            onClick={() => void profile.refetch()}
            type="button"
          >
            重試
          </button>
        </div>
      </section>
    );
  }

  return (
    <article className="route-panel">
      <p className="route-panel__eyebrow">你的學習空間</p>
      <ProfileSummary profile={profile.data} />
      <section aria-label="顯示偏好">
        <h2>顯示偏好</h2>
        <label htmlFor="profile-reduced-motion">減少動態效果</label>
        <input
          checked={profile.data.reducedMotion}
          disabled={setReducedMotion.isPending}
          id="profile-reduced-motion"
          onChange={(event) => {
            setReducedMotion.mutate(event.target.checked);
          }}
          type="checkbox"
        />
        <p>啟用後會關閉慶祝與連擊動畫，功能不受影響。</p>
        {setReducedMotion.isError ? (
          <p role="alert">設定未儲存，請稍後重試。</p>
        ) : null}
      </section>
    </article>
  );
}
