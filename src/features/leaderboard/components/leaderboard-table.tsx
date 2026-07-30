import { BlookArt } from '../../../components/ui/blook-art';
import type { BlookInventoryItem } from '../../inventory/types';
import type { ClassroomLeaderboard, LeaderboardEntry } from '../types';

const defaultBlook = {
  emoji: '🦊',
  name: '小狐狸',
  stableCode: 'little_fox',
} as const;

const safeBlook = (
  activeBlookId: string | null,
  blooks: readonly BlookInventoryItem[],
) => {
  const selected = blooks.find((item) => item.id === activeBlookId);
  const fallback = blooks.find((item) => item.stableCode === 'little_fox');
  return selected ?? fallback ?? defaultBlook;
};

/* owner 0730 #6:頭像外框改用大廳同款呈現——圓角磚底、裝備外框時
   以漸層作為磚底色(伺服器資料)，Blook 圖示置中。 */
function FramedBlook({
  blooks,
  entry,
}: Readonly<{
  blooks: readonly BlookInventoryItem[];
  entry: LeaderboardEntry;
}>) {
  const blook = safeBlook(entry.activeBlookId, blooks);
  const hasFrame = Boolean(entry.frameGradientStart && entry.frameGradientEnd);
  return (
    <span className="leaderboard-blook" data-framed={hasFrame || undefined}>
      <span
        aria-hidden="true"
        className="pastel-summary__avatar leaderboard-blook__avatar"
        style={
          hasFrame
            ? {
                background: `linear-gradient(to top right, ${entry.frameGradientStart ?? ''}, ${entry.frameGradientEnd ?? ''})`,
              }
            : undefined
        }
      >
        <BlookArt emoji={blook.emoji} size={30} stableCode={blook.stableCode} />
      </span>
      {entry.displayName}
      {entry.isSelf ? <strong>這是你</strong> : null}
    </span>
  );
}

function SelfRankCard({
  blooks,
  entry,
}: Readonly<{
  blooks: readonly BlookInventoryItem[];
  entry: LeaderboardEntry;
}>) {
  return (
    <aside aria-label="我的班級名次" role="region">
      <strong>第 {String(entry.rank)} 名</strong>
      <FramedBlook blooks={blooks} entry={entry} />
      <span>{String(entry.totalXp)} XP</span>
    </aside>
  );
}

// 排行榜前三名列底色（DC leaderboard 1022-1035:金/銀/銅）；用明確 class 取代
// nth-child 假設(row 順序改變或插入自我列時仍準確對到 rank)。
const rankTierClass = (rank: number): string | undefined => {
  if (rank === 1) return 'leaderboard-table__row--gold';
  if (rank === 2) return 'leaderboard-table__row--silver';
  if (rank === 3) return 'leaderboard-table__row--bronze';
  return undefined;
};

export function LeaderboardTable({
  blooks,
  leaderboard,
}: Readonly<{
  blooks: readonly BlookInventoryItem[];
  leaderboard: ClassroomLeaderboard;
}>) {
  return (
    <>
      {leaderboard.topEntries.length === 0 ? (
        <p>目前還沒有可排行的學生。</p>
      ) : (
        <table
          className="ui-table leaderboard-table"
          aria-label={`${leaderboard.classroomName} Top 10`}
        >
          <thead>
            <tr>
              <th scope="col">名次</th>
              {/* UAT 0727 R2 #1：只顯示暱稱，避免學號/姓名助長比較心態。
                  owner 0730 #6：頭像與暱稱同格（大廳同款呈現）。 */}
              <th scope="col">暱稱</th>
              <th scope="col">XP</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.topEntries.map((entry) => (
              <tr
                className={rankTierClass(entry.rank)}
                key={`${String(entry.rank)}-${entry.displayName}`}
              >
                <td>第 {String(entry.rank)} 名</td>
                <td>
                  <FramedBlook blooks={blooks} entry={entry} />
                </td>
                <td>{String(entry.totalXp)} XP</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {leaderboard.selfEntry && leaderboard.selfEntry.rank > 10 ? (
        <SelfRankCard blooks={blooks} entry={leaderboard.selfEntry} />
      ) : null}
    </>
  );
}
