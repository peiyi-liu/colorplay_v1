import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useMyClassrooms } from '../../classrooms/hooks/use-classrooms';
import type { ClassroomRepository } from '../../classrooms/types';
import type { InventoryRepository } from '../../inventory/types';
import type { LeaderboardRepository } from '../types';
import { ClassroomLeaderboardPage } from './classroom-leaderboard-page';

/**
 * 直達自己班級的排行榜（UAT 0727 R2 #1）：學生註冊時已以班級序號入班，
 * 導覽點「班級排行榜」即直接看榜，不再經過班級清單或輸入加入碼。
 * 多班學生取第一個班級（與大廳全體排名同一來源順序）。
 */
export function StudentLeaderboardRoute({
  classroomRepository,
  inventoryRepository,
  leaderboardRepository,
}: Readonly<{
  classroomRepository?: ClassroomRepository;
  inventoryRepository?: InventoryRepository;
  leaderboardRepository?: LeaderboardRepository;
}>) {
  const classrooms = useMyClassrooms(classroomRepository);

  if (classrooms.isPending) return <RouteLoading withinMain />;
  if (classrooms.isError) {
    return (
      <section className="route-panel">
        <h1>班級排行榜</h1>
        <p role="alert">無法載入班級資料，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void classrooms.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const firstClassroom = classrooms.data[0];
  if (!firstClassroom) {
    return (
      <section className="route-panel">
        <h1>班級排行榜</h1>
        <p>
          尚未加入任何班級。註冊時輸入的班級序號會自動加入班級；若有疑問請
          聯絡老師。
        </p>
      </section>
    );
  }

  return (
    <ClassroomLeaderboardPage
      classroomId={firstClassroom.classroomId}
      {...(inventoryRepository ? { inventoryRepository } : {})}
      {...(leaderboardRepository ? { leaderboardRepository } : {})}
    />
  );
}

export { StudentLeaderboardRoute as Component };
