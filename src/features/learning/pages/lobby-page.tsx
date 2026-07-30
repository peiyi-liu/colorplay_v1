import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Card } from '../../../components/ui/card';
import { Chip } from '../../../components/ui/chip';
import type { IconName } from '../../../components/ui/icons';
import { PageHeader } from '../../../components/ui/page-header';
import { pastelThemeForIndex } from '../../../components/ui/pastel-themes';
import { usePublishedChapters } from '../api/chapters';
import { LearningChapterCard } from '../components/learning-chapter-card';
import { StudentSummaryCard } from '../components/student-summary-card';

/** 六章節 icon(spec §五建議:色環/三屬性/表示/混合/心理感知/配色)。 */
const CHAPTER_ICONS: readonly IconName[] = [
  'palette',
  'sparkles',
  'bolt',
  'grid',
  'eye',
  'star',
];

export function LobbyPage() {
  const chapters = usePublishedChapters();

  if (chapters.isPending) return <RouteLoading withinMain />;

  if (chapters.isError) {
    return (
      <section className="lobby lobby--message">
        <Card padding="lg">
          <Chip tone="primary">學習大廳</Chip>
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
  // 進行中章節=解鎖順序的最前緣(最後一個可玩章節);僅呈現用途,
  // 解鎖與完成判斷仍完全由後端 isPlayable 決定。
  const frontierIndex = chapterList.reduce(
    (frontier, chapter, index) => (chapter.isPlayable ? index : frontier),
    -1,
  );

  return (
    <section aria-labelledby="lobby-title" className="lobby">
      {/* live-v2 設計稿:資訊卡在最上,標題與章節格包進白卡浮於暖黃頁底。 */}
      <StudentSummaryCard />
      <div className="lobby-panel">
        <PageHeader
          description="選擇下方的色彩原理核心章節，展開你的色彩知識與視覺挑戰。"
          title="色彩任務選擇大廳"
          titleId="lobby-title"
        />
        {chapterList.length === 0 ? (
          <p className="lobby__empty">課程內容準備中，請稍後再回來看看。</p>
        ) : (
          <div className="pastel-grid">
            {chapterList.map((chapter, index) => {
              const current = index === frontierIndex;
              return (
                <LearningChapterCard
                  chapterNumber={chapter.sortOrder}
                  current={current}
                  description={chapter.description}
                  icon={
                    CHAPTER_ICONS[index % CHAPTER_ICONS.length] ?? 'palette'
                  }
                  key={chapter.id}
                  status={
                    chapter.isPlayable
                      ? current
                        ? 'active'
                        : 'open'
                      : 'locked'
                  }
                  theme={pastelThemeForIndex(index)}
                  title={chapter.title}
                  {...(chapter.isPlayable
                    ? {
                        reviewHref: `/app/chapters/${chapter.id}`,
                        startHref: `/app/quiz/new?template=${chapter.template.id}`,
                      }
                    : {})}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
