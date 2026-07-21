import { Link } from 'react-router-dom';

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
        <h1>個人成就與徽章</h1>
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
      <header className="achievements-header">
        <Link
          aria-label="回課後學習大廳"
          className="achievements-header__back"
          to="/app"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <div>
          <h1 className="achievements-header__title" id="achievements-title">
            <span aria-hidden="true">🏆 </span>個人成就與徽章
          </h1>
          <p className="achievements-header__subtitle">
            收集徽章，證明你的色彩實力
          </p>
        </div>
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
