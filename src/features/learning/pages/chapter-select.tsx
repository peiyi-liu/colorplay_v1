import { Link } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { usePublishedChapters } from '../api/chapters';

export function ChapterSelectPage() {
  const chapters = usePublishedChapters();

  if (chapters.isPending) return <RouteLoading withinMain />;

  if (chapters.isError) {
    return (
      <section className="chapter-select chapter-select--message">
        <p className="route-panel__eyebrow">章節挑戰</p>
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
      </section>
    );
  }

  if (!chapters.data || chapters.data.length === 0) {
    return (
      <section className="chapter-select chapter-select--message">
        <p className="route-panel__eyebrow">章節挑戰</p>
        <h1>目前沒有可用章節</h1>
        <p>課程內容準備中，請稍後再回來看看。</p>
      </section>
    );
  }

  return (
    <section className="chapter-select" aria-labelledby="chapter-select-title">
      <header className="chapter-select__header">
        <p className="route-panel__eyebrow">色彩原理</p>
        <h1 id="chapter-select-title">選擇章節</h1>
        <p>選擇有題目的章節，開始 10 題限時挑戰。</p>
      </header>
      <div className="chapter-grid">
        {chapters.data.map((chapter) => (
          <article className="chapter-card" key={chapter.id}>
            <p className="chapter-card__number">
              第 {String(chapter.sortOrder)} 章
            </p>
            <h2>{chapter.title}</h2>
            <p>{chapter.description}</p>
            <div className="chapter-card__action">
              {chapter.isPlayable ? (
                <Link
                  className="primary-action"
                  data-acceptance-interactive="true"
                  data-primary-action="true"
                  to={`/app/quiz/new?template=${chapter.template.id}`}
                >
                  開始挑戰
                </Link>
              ) : (
                <button
                  className="chapter-card__disabled"
                  disabled
                  type="button"
                >
                  尚無題目
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
