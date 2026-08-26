import { RouteLoading } from '../../../app/boundaries/route-loading';
import { GamePager, useStageWide } from '../../../components/ui/game-pager';
import { PageHeader } from '../../../components/ui/page-header';
import { AchievementCard } from '../components/achievement-card';
import { useAchievements } from '../hooks/use-achievements';
import type { AchievementRepository } from '../types';

import './achievements-page.css';

export function AchievementsPage({
  repository,
}: Readonly<{ repository?: AchievementRepository }>) {
  const achievements = useAchievements(repository);
  const stageWide = useStageWide();

  if (achievements.isPending) return <RouteLoading withinMain />;

  if (achievements.isError || achievements.data.items.length === 0) {
    return (
      <section className="page-card page-narrow" role="alert">
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
    <section
      aria-labelledby="achievements-title"
      className="achievements achievements--sanctuary-v2 scene-day hall-of-medals"
    >
      <PageHeader
        description="完成學習任務、累積挑戰紀錄，解鎖你的專屬色彩成就。"
        title="個人成就與徽章"
        titleId="achievements-title"
      />
      <GamePager
        ariaLabel="成就徽章分頁"
        items={catalog.items}
        pageSize={stageWide ? 8 : 4}
      >
        {(pageItems) => (
          <ul
            aria-label="成就徽章列表"
            className="pastel-grid achievements-grid"
          >
            {pageItems.map((item) => (
              <AchievementCard item={item} key={item.stableCode} />
            ))}
          </ul>
        )}
      </GamePager>
    </section>
  );
}
