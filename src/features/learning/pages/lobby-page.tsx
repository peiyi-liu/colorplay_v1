import { Link } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Card } from '../../../components/ui/card';
import { Chip } from '../../../components/ui/chip';
import { SectionHeader } from '../../../components/ui/section-header';
import { StatTile } from '../../../components/ui/stat-tile';
import { useMyClassrooms } from '../../classrooms/hooks/use-classrooms';
import {
  useBlookInventory,
  useFrameInventory,
} from '../../inventory/hooks/use-blook-inventory';
import { useClassroomLeaderboard } from '../../leaderboard/hooks/use-classroom-leaderboard';
import { toPercentile } from '../../leaderboard/lib/percentile';
import { useMyProfile } from '../../profile/hooks/use-my-profile';
import { useEconomySummary } from '../../rewards/hooks/use-economy-summary';
import { usePublishedChapters } from '../api/chapters';
import { useMistakes } from '../hooks/use-learning';

function ProfileCard() {
  const profile = useMyProfile();
  const economy = useEconomySummary();
  const inventory = useBlookInventory();
  const classrooms = useMyClassrooms();
  const firstClassroomId = classrooms.data?.[0]?.classroomId ?? '';
  const leaderboard = useClassroomLeaderboard(firstClassroomId);

  const frames = useFrameInventory();
  const equipped = inventory.data?.items.find((item) => item.equipped);
  const equippedFrame = frames.data?.items.find((item) => item.equipped);
  // 未加入班級時不呈現名次（也不採用任何殘留的排行榜快取）。
  const selfRank = firstClassroomId
    ? leaderboard.data?.selfEntry?.rank
    : undefined;
  const memberCount = firstClassroomId
    ? (leaderboard.data?.memberCount ?? 0)
    : 0;
  const percentile =
    selfRank !== undefined && memberCount > 0
      ? toPercentile(selfRank, memberCount)
      : undefined;

  return (
    <Card className="lobby__profile">
      <div className="lobby__identity">
        <span
          className="lobby__avatar"
          aria-hidden="true"
          style={
            equippedFrame
              ? {
                  background: `linear-gradient(to top right, ${equippedFrame.gradientStart}, ${equippedFrame.gradientEnd})`,
                }
              : undefined
          }
        >
          {equipped?.emoji ?? '🧑‍🎨'}
        </span>
        <div>
          <div className="lobby__identity-row">
            <h1 className="lobby__name">
              {profile.data?.displayName ?? '色彩學徒'}
            </h1>
            <Link
              aria-label="個人資料"
              className="lobby__edit"
              to="/app/profile"
            >
              ✏️ 修改
            </Link>
            <Chip tone="success">☁️ 雲端連線模式</Chip>
          </div>
          <p className="lobby__welcome">讓我們開始今日的色彩複習與挑戰！</p>
        </div>
      </div>
      <div className="lobby__stats">
        <StatTile label="累計積分 (XP)" value={economy.data?.totalXp ?? '—'} />
        {selfRank !== undefined ? (
          <StatTile label="全體排名" value={selfRank} />
        ) : null}
        {percentile !== undefined ? (
          <StatTile label="當前 PR" value={percentile} />
        ) : null}
        <StatTile
          label="持有代幣"
          value={economy.data?.tokenBalance ?? '—'}
          tone="token"
        />
      </div>
    </Card>
  );
}

const CHAPTER_ICONS = ['💡', '👁️', '🎨', '🧪', '🧠', '🌈'];

export function LobbyPage() {
  const chapters = usePublishedChapters();
  const mistakes = useMistakes();

  if (chapters.isPending) return <RouteLoading withinMain />;

  if (chapters.isError) {
    return (
      <section className="lobby lobby--message">
        <Card padding="lg">
          <Chip tone="primary">課後學習大廳</Chip>
          <h1>章節載入失敗</h1>
          <p role="alert">
            {chapters.error?.message ?? '目前無法載入章節，請稍後重試。'}
          </p>
          <button
            className="primary-action"
            data-primary-action="true"
            onClick={() => void chapters.refetch()}
            type="button"
          >
            重新載入
          </button>
        </Card>
      </section>
    );
  }

  const chapterList = chapters.data ?? [];
  const mistakeCount = mistakes.data?.length ?? 0;

  return (
    <section className="lobby" aria-labelledby="lobby-title">
      <h2 className="visually-hidden" id="lobby-title">
        課後學習大廳
      </h2>
      <ProfileCard />
      <Card padding="lg" className="lobby__chapters animate-fade-in">
        <SectionHeader
          title="色彩任務選擇大廳"
          description="請選取下方的色彩原理核心章節，展開您的知識關卡挑戰！"
        />
        {chapterList.length === 0 ? (
          <p>課程內容準備中，請稍後再回來看看。</p>
        ) : (
          <div className="lobby__chapter-grid">
            {chapterList.map((chapter, index) => (
              <article
                className={`lobby-chapter${chapter.isPlayable ? ' lobby-chapter--open' : ''}`}
                key={chapter.id}
              >
                <div>
                  <span className="lobby-chapter__icon" aria-hidden="true">
                    {chapter.isPlayable ? (CHAPTER_ICONS[index] ?? '🎨') : '🔒'}
                  </span>
                  <div className="lobby-chapter__title-row">
                    <h3>
                      Chapter {chapter.sortOrder}: {chapter.title}
                    </h3>
                    {chapter.isPlayable ? (
                      <Chip tone="success">已開放</Chip>
                    ) : (
                      <Chip tone="neutral">鎖定中</Chip>
                    )}
                  </div>
                  <p className="lobby-chapter__description">
                    {chapter.description}
                  </p>
                </div>
                <div className="lobby-chapter__actions">
                  {chapter.isPlayable ? (
                    <>
                      <Link
                        className="primary-action lobby-chapter__challenge"
                        data-acceptance-interactive="true"
                        data-primary-action="true"
                        to={`/app/quiz/new?template=${chapter.template.id}`}
                      >
                        開始挑戰
                      </Link>
                      <Link
                        aria-label={`${chapter.title} 複習與進度`}
                        className="lobby-chapter__review"
                        to={`/app/chapters/${chapter.id}`}
                      >
                        複習與進度 ›
                      </Link>
                    </>
                  ) : (
                    <span className="lobby-chapter__soon">敬請期待</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="lobby__entries">
          <div className="lobby-entry lobby-entry--mistakes">
            <div>
              <h3 className="lobby-entry__title">⚠️ 個人弱點錯題中心</h3>
              <p className="lobby-entry__description">
                系統已為您歸納 <strong>{mistakeCount} 題</strong> 待精熟題目。
              </p>
            </div>
            <Link className="lobby-entry__action" to="/app/mistakes">
              前往修正
            </Link>
          </div>
          <div className="lobby-entry lobby-entry--goal">
            <div>
              <h3 className="lobby-entry__title">🎓 每日自主精熟目標</h3>
              <p className="lobby-entry__description">
                通關已開放章節的所有小節，累積 XP 獎勵！
              </p>
            </div>
            <Link className="lobby-entry__action" to="/app/progress">
              查看進度
            </Link>
          </div>
        </div>
        <nav aria-label="更多功能" className="lobby__links">
          <Link className="lobby-link" to="/app/assignments">
            📬 我的作業
          </Link>
          <Link className="lobby-link" to="/app/achievements">
            🏅 成就徽章
          </Link>
          <Link className="lobby-link" to="/app/leaderboard">
            📈 班級排行榜
          </Link>
          <Link className="lobby-link" to="/app/live/join">
            ⚡ Live 課堂
          </Link>
        </nav>
      </Card>
    </section>
  );
}
