import { useOutletContext, useSearchParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Card } from '../../../components/ui/card';
import { ChapterMap } from '../components/chapter-map';
import type { StudentChapterMapEntry } from '../api/chapter-map';
import type { StudentMapShellContext } from '../context/student-map-shell-context';
import { useStudentChapterMap } from '../hooks/use-chapter-map';

export function LobbyPage() {
  const chapterMap = useStudentChapterMap();
  const shell = useOutletContext<StudentMapShellContext | null>();
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
    <LobbyPageView
      chapters={chapterMap.data.chapters}
      equippedBlook={shell?.equippedBlook ?? null}
      {...(requestedChapter ? { requestedChapter } : {})}
    />
  );
}

export function LobbyPageView({
  chapters,
  equippedBlook,
  requestedChapter,
}: Readonly<{
  chapters: readonly StudentChapterMapEntry[];
  equippedBlook: StudentMapShellContext['equippedBlook'];
  requestedChapter?: string;
}>) {
  return (
    <section
      aria-labelledby="learning-map-title"
      className="lobby lobby--map-fullscreen scene-day"
    >
      <div className="lobby-panel chapter-map-shell">
        <header className="chapter-map-shell__heading chapter-map-scroll">
          <span
            aria-hidden="true"
            className="chapter-map-scroll__roller chapter-map-scroll__roller--top"
          />
          <span aria-hidden="true" className="chapter-map-scroll__crest" />
          <div className="chapter-map-scroll__copy">
            <p>學生端 · 森林王國村</p>
            <h1 id="learning-map-title">學習地圖</h1>
            <p>選擇一棟建築，查看章節的複習、精熟度與解鎖條件。</p>
          </div>
          <span
            aria-hidden="true"
            className="chapter-map-scroll__roller chapter-map-scroll__roller--bottom"
          />
        </header>
        <ChapterMap
          chapters={chapters}
          equippedBlook={equippedBlook}
          {...(requestedChapter ? { initialChapterId: requestedChapter } : {})}
        />
      </div>
    </section>
  );
}
