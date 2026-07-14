import { RouteLoading } from '../../../app/boundaries/route-loading';
import { ProfileSummary } from '../components/profile-summary';
import { useMyProfile } from '../hooks/use-my-profile';

export function ProfileFoundationPage() {
  const profile = useMyProfile();

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
    </article>
  );
}
