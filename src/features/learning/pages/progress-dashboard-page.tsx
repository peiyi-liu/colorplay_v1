import { Link } from 'react-router-dom';

import { Chip } from '../../../components/ui/chip';
import { ProgressBar } from '../../../components/ui/progress-bar';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { usePublishedChapters } from '../api/chapters';
import type { LearningRepository } from '../api/learning-repository';
import { useLearningProgress } from '../hooks/use-learning';
import { percentText, reviewText, statusLabels } from './chapter-detail-page';

export function ProgressDashboardPage({
  repository,
}: Readonly<{ repository?: LearningRepository }>) {
  const chapters = usePublishedChapters();
  const progress = useLearningProgress(null, repository);

  if (chapters.isPending || progress.isPending) {
    return <RouteLoading withinMain />;
  }
  if (chapters.isError || progress.isError) {
    return (
      <section className="route-panel">
        <h1>學習進度</h1>
        <p role="alert">無法載入學習進度，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => {
            void chapters.refetch();
            void progress.refetch();
          }}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const chapterRows = progress.data.filter((row) => row.scope === 'chapter');
  const chapterNumerals = ['一', '二', '三', '四', '五', '六', '七', '八'];

  return (
    <section
      aria-labelledby="progress-title"
      className="page-card progress-dashboard w-full"
    >
      <header>
        <p className="route-panel__eyebrow">學習進度</p>
        <h1 id="progress-title">我的學習進度</h1>
        <nav aria-label="進度行動">
          <Link to="/app/mistakes">我的錯題</Link>
          <Link to="/app/achievements">成就進度</Link>
        </nav>
      </header>

      {chapterRows.length === 0 ? (
        <p>目前沒有已發布的章節。</p>
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <caption>各章節學習進度</caption>
            <thead>
              <tr>
                <th scope="col">章節</th>
                <th scope="col">複習完成</th>
                <th scope="col">涵蓋率</th>
                <th scope="col">正確率</th>
                <th scope="col">精熟度</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {chapterRows.map((row) => {
                const chapter = chapters.data?.find(
                  (entry) => entry.id === row.chapterId,
                );
                if (!chapter) return null;
                return (
                  <tr key={row.chapterId}>
                    <th scope="row">
                      <Link to={`/app/chapters/${row.chapterId}`}>
                        第
                        {chapterNumerals[chapter.sortOrder - 1] ??
                          String(chapter.sortOrder)}
                        章：{chapter.title}
                      </Link>
                    </th>
                    <td>{reviewText(row.reviewCompleted, row.reviewTotal)}</td>
                    <td>{percentText(row.coverage)}</td>
                    <td>{percentText(row.accuracy)}</td>
                    <td>
                      {percentText(row.mastery)}
                      {typeof row.mastery === 'number' ? (
                        <ProgressBar
                          label={`${chapter.title}精熟度`}
                          tone="primary"
                          value={row.mastery}
                        />
                      ) : null}
                    </td>
                    <td>
                      <Chip
                        tone={
                          row.status === 'mastered'
                            ? 'success'
                            : row.status === 'not_started'
                              ? 'neutral'
                              : 'primary'
                        }
                      >
                        {statusLabels[row.status]}
                      </Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
