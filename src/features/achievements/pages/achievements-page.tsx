import { RouteLoading } from '../../../app/boundaries/route-loading';
import { AchievementCard } from '../components/achievement-card';
import { useAchievements } from '../hooks/use-achievements';
import type { AchievementRepository } from '../types';

export function AchievementsPage({
  repository,
}: Readonly<{ repository?: AchievementRepository }>) {
  const achievements = useAchievements(repository);

  if (achievements.isPending) return <RouteLoading withinMain />;

  if (achievements.isError || achievements.data.items.length === 0) {
    return (
      <section
        className="w-full max-w-3xl rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8"
        role="alert"
      >
        <h1>成就徽章</h1>
        <p>無法載入成就徽章，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void achievements.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const catalog = achievements.data;

  return (
    <section aria-labelledby="achievements-title" className="w-full max-w-6xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="route-panel__eyebrow">學習里程碑</p>
          <h1 className="m-0 text-4xl font-extrabold" id="achievements-title">
            成就徽章
          </h1>
          <p className="mt-3 text-[var(--color-muted)]">
            所有進度都由伺服器依正式學習紀錄計算。
          </p>
        </div>
        <strong className="rounded-full bg-[var(--color-brand-yellow)] px-4 py-2 text-[var(--color-brand-dark)]">
          已解鎖 {String(catalog.unlockedCount)} / {String(catalog.totalCount)}
        </strong>
      </header>
      <ul
        aria-label="成就徽章列表"
        className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3"
      >
        {catalog.items.map((item) => (
          <AchievementCard item={item} key={item.stableCode} />
        ))}
      </ul>
    </section>
  );
}
