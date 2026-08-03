import { Link } from 'react-router-dom';

import type {
  ChapterAccessBlocker,
  ChapterAccessState,
  ChapterProgressStatus,
  StudentChapterMapEntry,
} from '../api/chapter-map';

const accessLabels: Readonly<Record<ChapterAccessState, string>> = {
  available: '可進入',
  completed: '已完成',
  content_unavailable: '內容準備中',
  locked: '尚未解鎖',
};

const progressLabels: Readonly<Record<ChapterProgressStatus, string>> = {
  developing: '持續精進',
  learning: '學習中',
  mastered: '已精熟',
  not_started: '尚未開始',
};

const progressValue = (value: number | null, suffix = ''): string =>
  value === null ? '—' : `${String(value)}${suffix}`;

function blockerText(blocker: ChapterAccessBlocker): string {
  if (blocker.code === 'CONTENT_UNAVAILABLE') return '本章內容仍在準備中';
  if (blocker.code === 'PREREQUISITE_REVIEW') {
    return `「${blocker.chapterTitle}」複習 ${progressValue(blocker.current)} / ${progressValue(blocker.required)}`;
  }
  return `「${blocker.chapterTitle}」精熟度 ${progressValue(blocker.current, '%')} / ${progressValue(blocker.required, '%')}`;
}

export function ChapterMapPanel({
  chapter,
}: Readonly<{ chapter: StudentChapterMapEntry }>) {
  const actionable =
    chapter.accessState === 'available' || chapter.accessState === 'completed';
  const titleId = `chapter-map-panel-${chapter.chapterId}`;

  return (
    <aside
      aria-labelledby={titleId}
      aria-live="polite"
      className="chapter-map__panel"
      role="region"
    >
      <div className="chapter-map__panel-heading">
        <p className="chapter-map__eyebrow">
          Chapter {chapter.sortOrder} ·{' '}
          <span>{accessLabels[chapter.accessState]}</span>
        </p>
        <h2 id={titleId}>
          Chapter {chapter.sortOrder} {chapter.title}
        </h2>
        <p>{chapter.description}</p>
      </div>

      <dl className="chapter-map__progress">
        <div>
          <dt>學習狀態</dt>
          <dd>{progressLabels[chapter.progressStatus]}</dd>
        </div>
        <div>
          <dt>複習進度</dt>
          <dd>
            複習進度 {chapter.reviewCompleted} /{' '}
            {progressValue(chapter.reviewTotal)}
          </dd>
        </div>
        <div>
          <dt>精熟門檻</dt>
          <dd>精熟度 {progressValue(chapter.mastery, '%')} / 80%</dd>
        </div>
      </dl>

      {chapter.blockers.length > 0 ? (
        <div className="chapter-map__blockers">
          <h3>解鎖條件</h3>
          <ul>
            {chapter.blockers.map((blocker) => (
              <li key={`${blocker.code}-${blocker.chapterId}`}>
                {blockerText(blocker)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {actionable ? (
        <Link
          className="chapter-map__entry-action"
          data-primary-action="true"
          to={`/app/chapters/${chapter.chapterId}`}
        >
          進入複習與進度
        </Link>
      ) : (
        <p className="chapter-map__unavailable">
          {chapter.accessState === 'locked'
            ? '完成解鎖條件後即可進入。'
            : '本章內容仍在準備中。'}
        </p>
      )}
    </aside>
  );
}
