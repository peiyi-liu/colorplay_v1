import type { BlookInventoryItem } from '../../inventory/types';
import type { ClassroomLeaderboard, LeaderboardEntry } from '../types';

const defaultBlook = { emoji: '🦊', name: '小狐狸' } as const;

const safeBlook = (
  activeBlookId: string | null,
  blooks: readonly BlookInventoryItem[],
) => {
  const selected = blooks.find((item) => item.id === activeBlookId);
  const fallback = blooks.find((item) => item.stableCode === 'little_fox');
  const presentation = selected ?? fallback ?? defaultBlook;
  return `${presentation.emoji} ${presentation.name}`;
};

function FramedBlook({
  blooks,
  entry,
}: Readonly<{
  blooks: readonly BlookInventoryItem[];
  entry: LeaderboardEntry;
}>) {
  const label = safeBlook(entry.activeBlookId, blooks);
  if (!entry.frameGradientStart || !entry.frameGradientEnd) {
    return <span>{label}</span>;
  }
  return (
    <span
      className="leaderboard-framed-blook"
      data-framed="true"
      style={{
        borderImage: `linear-gradient(to right, ${entry.frameGradientStart}, ${entry.frameGradientEnd}) 1`,
      }}
    >
      {label}
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
      <span>{entry.displayName}</span>
      <span>這是你</span>
      <FramedBlook blooks={blooks} entry={entry} />
      <span>{String(entry.totalXp)} XP</span>
    </aside>
  );
}

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
              <th scope="col">學生</th>
              <th scope="col">Blook</th>
              <th scope="col">XP</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.topEntries.map((entry) => (
              <tr key={`${String(entry.rank)}-${entry.displayName}`}>
                <td>第 {String(entry.rank)} 名</td>
                <td>
                  {entry.displayName}
                  {entry.isSelf ? (
                    <>
                      {' '}
                      <strong>這是你</strong>
                    </>
                  ) : null}
                </td>
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
