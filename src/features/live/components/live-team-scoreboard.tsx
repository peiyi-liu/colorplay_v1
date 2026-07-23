import { useLiveTeamTotals } from '../hooks/use-live-commands';
import type { LiveRepository, LiveSessionState } from '../types';

export function LiveTeamScoreboard({
  sessionId,
  state,
  repository,
}: Readonly<{
  sessionId: string;
  state: LiveSessionState;
  repository?: LiveRepository;
}>) {
  const totals = useLiveTeamTotals(
    sessionId,
    {
      enabled:
        state.mode === 'team' &&
        (state.state === 'question_feedback' || state.state === 'completed'),
      stateVersion: state.stateVersion,
    },
    repository,
  );
  if (state.mode !== 'team') return null;
  if (totals.isPending || totals.isError) return null;

  return (
    <section aria-label="隊伍計分板" className="live-team-scoreboard">
      <h2>隊伍計分板</h2>
      <ol>
        {totals.data.map((team) => (
          <li key={team.teamNumber}>
            第 {team.teamNumber} 隊：{team.score} 分（{team.memberCount} 人）
          </li>
        ))}
      </ol>
    </section>
  );
}
