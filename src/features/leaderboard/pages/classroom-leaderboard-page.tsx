import { useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useBlookInventory } from '../../inventory/hooks/use-blook-inventory';
import type { InventoryRepository } from '../../inventory/types';
import { LeaderboardTable } from '../components/leaderboard-table';
import { useClassroomLeaderboard } from '../hooks/use-classroom-leaderboard';
import type { LeaderboardRepository } from '../types';

export function ClassroomLeaderboardPage({
  classroomId: suppliedClassroomId,
  inventoryRepository,
  leaderboardRepository,
}: Readonly<{
  classroomId?: string;
  inventoryRepository?: InventoryRepository;
  leaderboardRepository?: LeaderboardRepository;
}>) {
  const params = useParams();
  const classroomId = suppliedClassroomId ?? params.classroomId ?? '';
  const leaderboard = useClassroomLeaderboard(
    classroomId,
    leaderboardRepository,
  );
  const inventory = useBlookInventory(inventoryRepository);

  if (leaderboard.isPending || inventory.isPending) {
    return <RouteLoading withinMain />;
  }
  if (leaderboard.isError) {
    return (
      <section className="route-panel">
        <h1>班級排行榜</h1>
        <p role="alert">無法顯示排行榜，請確認班級成員資格或稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void leaderboard.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="classroom-leaderboard-title"
      className="w-full max-w-5xl"
    >
      <header>
        <p className="route-panel__eyebrow">班級 XP</p>
        <h1 id="classroom-leaderboard-title">
          {leaderboard.data.classroomName}排行榜
        </h1>
        <p>Top 10 與你的名次都由伺服器依正式 XP 紀錄計算。</p>
      </header>
      <LeaderboardTable
        blooks={inventory.isError ? [] : inventory.data.items}
        leaderboard={leaderboard.data}
      />
    </section>
  );
}
