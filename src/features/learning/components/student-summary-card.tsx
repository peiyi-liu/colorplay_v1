import { BlookArt } from '../../../components/ui/blook-art';
import { useAchievements } from '../../achievements/hooks/use-achievements';
import { useMyClassrooms } from '../../classrooms/hooks/use-classrooms';
import {
  useBlookInventory,
  useFrameInventory,
} from '../../inventory/hooks/use-blook-inventory';
import { useClassroomLeaderboard } from '../../leaderboard/hooks/use-classroom-leaderboard';
import { useMyProfile } from '../../profile/hooks/use-my-profile';
import { useEconomySummary } from '../../rewards/hooks/use-economy-summary';

/** 頂部學生資訊橫卡(spec §九):左側頭像＋名稱＋等級,右側 XP/代幣/徽章/排名。
 *  只重用既有 hooks,不新增資料讀取方式;owner 0728 淡彩批取代 UAT 0727 #2
 *  「大廳不顯示代幣」的裁定(規格 §九明列 Token 與徽章數量)。 */
export function StudentSummaryCard() {
  const profile = useMyProfile();
  const economy = useEconomySummary();
  const inventory = useBlookInventory();
  const frames = useFrameInventory();
  const achievements = useAchievements();
  const classrooms = useMyClassrooms();
  const firstClassroomId = classrooms.data?.[0]?.classroomId ?? '';
  const leaderboard = useClassroomLeaderboard(firstClassroomId);

  const equipped = inventory.data?.items.find((item) => item.equipped);
  const equippedFrame = frames.data?.items.find((item) => item.equipped);
  // 未加入班級時不呈現名次(也不採用任何殘留的排行榜快取)。
  const selfRank = firstClassroomId
    ? leaderboard.data?.selfEntry?.rank
    : undefined;
  const level = economy.data?.level;

  return (
    <section aria-label="學生資訊" className="pastel-summary">
      <div className="pastel-summary__identity">
        <span
          aria-hidden="true"
          className="pastel-summary__avatar"
          style={
            equippedFrame
              ? {
                  background: `linear-gradient(to top right, ${equippedFrame.gradientStart}, ${equippedFrame.gradientEnd})`,
                }
              : undefined
          }
        >
          <BlookArt
            emoji={equipped?.emoji}
            size={46}
            stableCode={equipped?.stableCode ?? 'little_fox'}
          />
        </span>
        <div>
          <div className="pastel-summary__name-row">
            <h2 className="pastel-summary__name">
              {profile.data?.displayName ?? '色彩學徒'}
            </h2>
            {level !== undefined ? (
              <span className="pastel-summary__level">Lv.{level}</span>
            ) : null}
          </div>
          <p className="pastel-summary__welcome">
            讓我們開始今日的色彩複習與挑戰！
          </p>
        </div>
      </div>
      <dl className="pastel-summary__stats">
        <div className="pastel-summary__stat">
          <dt>累計積分 (XP)</dt>
          <dd>{economy.data?.totalXp ?? '—'}</dd>
        </div>
        <div className="pastel-summary__stat">
          <dt>代幣</dt>
          <dd>{economy.data?.tokenBalance ?? '—'}</dd>
        </div>
        <div className="pastel-summary__stat">
          <dt>徽章</dt>
          <dd>{achievements.data?.unlockedCount ?? '—'}</dd>
        </div>
        {selfRank !== undefined ? (
          <div className="pastel-summary__stat">
            <dt>全體排名</dt>
            <dd>{selfRank}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
