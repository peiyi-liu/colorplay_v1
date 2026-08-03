import { useSearchParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Card } from '../../../components/ui/card';
import { ChapterMap } from '../components/chapter-map';
import { StudentSummaryCard } from '../components/student-summary-card';
import { useStudentChapterMap } from '../hooks/use-chapter-map';

export function LobbyPage() {
  const chapterMap = useStudentChapterMap();
  const [searchParams] = useSearchParams();

  if (chapterMap.isPending) return <RouteLoading withinMain />;

  if (chapterMap.isError) {
    return (
      <section className="lobby lobby--message scene-day">
        <Card padding="lg">
          <h1>學習地圖</h1>
          <p role="alert">章節狀態暫時無法確認</p>
          <button
            className="primary-action"
            data-primary-action="true"
            onClick={() => void chapterMap.refetch()}
            type="button"
          >
            重新載入
          </button>
        </Card>
      </section>
    );
  }

  const requestedChapter = searchParams.get('chapter') ?? undefined;

  return (
    <section aria-labelledby="learning-map-title" className="lobby scene-day">
      <div className="hud-bar">
        <StudentSummaryCard />
      </div>
      <div className="lobby-panel chapter-map-shell">
        <header className="chapter-map-shell__heading">
          <p>學生端 · 森林王國村</p>
          <h1 id="learning-map-title">學習地圖</h1>
          <p>選擇一棟建築，查看章節的複習、精熟度與解鎖條件。</p>
        </header>
        <ChapterMap
          chapters={chapterMap.data.chapters}
          initialChapterId={requestedChapter}
        />
      </div>
    </section>
  );
}
