import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Chip, type ChipTone } from '../../../components/ui/chip';
import { ProgressBar } from '../../../components/ui/progress-bar';
import { useStudentProgress } from '../hooks/use-classrooms';
import type { ClassroomRepository, StudentChapterProgress } from '../types';

const EM_DASH = '—';

const formatPercent = (value: number | null): string =>
  value === null ? EM_DASH : `${value.toFixed(1)}%`;

const chapterStatusLabel = (status: StudentChapterProgress['status']) => {
  if (status === 'mastered') return '已精熟';
  if (status === 'not_started') return '尚未開始';
  return '學習中';
};

const chapterStatusTone = (
  status: StudentChapterProgress['status'],
): ChipTone => {
  if (status === 'mastered') return 'success';
  if (status === 'not_started') return 'neutral';
  return 'alert';
};

export function TeacherStudentProgressPage({
  classroomId: suppliedClassroomId,
  memberRef: suppliedMemberRef,
  repository,
}: Readonly<{
  classroomId?: string;
  memberRef?: string;
  repository?: ClassroomRepository;
}>) {
  const params = useParams();
  const classroomId = suppliedClassroomId ?? params.classroomId ?? '';
  const memberRef = suppliedMemberRef ?? params.memberRef ?? '';
  const progress = useStudentProgress(classroomId, memberRef, repository);

  if (progress.isPending) return <RouteLoading withinMain />;
  if (progress.isError) {
    return (
      <section className="route-panel">
        <h1>學生學習進度</h1>
        <p role="alert">無法載入學生資料，或你沒有管理權限。</p>
        <button
          className="primary-action"
          onClick={() => void progress.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const { chapters, identity, mistakes, stats } = progress.data;
  const studentName = identity.fullName ?? identity.displayName;

  return (
    <section
      aria-labelledby="teacher-student-progress-title"
      className="page-wide"
    >
      <header>
        <p className="route-panel__eyebrow">教師班級管理</p>
        <h1 id="teacher-student-progress-title">{studentName} 的學習進度</h1>
        <p>
          {identity.loginAccount ? `學號 ${identity.loginAccount}・` : ''}
          暱稱 {identity.displayName}
          ・數字由伺服器依權威作答紀錄計算。
        </p>
        {identity.membershipStatus === 'inactive' ? (
          <p role="status">此成員已停用，資料為停用前的紀錄。</p>
        ) : null}
        <Link
          className="secondary-action"
          to={`/teacher/classes/${classroomId}`}
        >
          ← 回班級成員
        </Link>
      </header>
      <dl className="teacher-summary-cards">
        <div>
          <dt>累計 XP</dt>
          <dd>{stats.classXp.toLocaleString('zh-TW')}</dd>
        </div>
        <div>
          <dt>班級名次</dt>
          <dd>
            {stats.classRank === null ? EM_DASH : String(stats.classRank)}
          </dd>
        </div>
        <div>
          <dt>平均正確率</dt>
          <dd>{formatPercent(stats.avgAccuracy)}</dd>
        </div>
        <div>
          <dt>待補救錯題</dt>
          <dd>{String(stats.openMistakeCount)}</dd>
        </div>
      </dl>
      <section aria-labelledby="student-chapter-progress-title">
        <h2 id="student-chapter-progress-title">各章節學習進度</h2>
        {chapters.length === 0 ? (
          <p>目前沒有已發布的章節。</p>
        ) : (
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
              {chapters.map((chapter) => (
                <tr key={chapter.chapterId}>
                  <th scope="row">{chapter.chapterTitle}</th>
                  <td>
                    {chapter.reviewTotal === null
                      ? EM_DASH
                      : `${String(chapter.reviewCompleted)} / ${String(chapter.reviewTotal)}`}
                  </td>
                  <td>{formatPercent(chapter.coverage)}</td>
                  <td>{formatPercent(chapter.accuracy)}</td>
                  <td>
                    {formatPercent(chapter.mastery)}
                    {chapter.mastery === null ? null : (
                      <ProgressBar
                        label={`${chapter.chapterTitle} 精熟度`}
                        tone="warning"
                        value={chapter.mastery}
                      />
                    )}
                  </td>
                  <td>
                    <Chip tone={chapterStatusTone(chapter.status)}>
                      {chapterStatusLabel(chapter.status)}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section aria-labelledby="student-open-mistakes-title">
        <h2 id="student-open-mistakes-title">待補救錯題</h2>
        {mistakes.length === 0 ? (
          <p>目前沒有待補救錯題。</p>
        ) : (
          <ul className="student-mistake-list">
            {mistakes.map((mistake) => (
              <li key={`${mistake.subtopicCode}-${mistake.prompt}`}>
                <p>{mistake.prompt}</p>
                <p>
                  子題 {mistake.subtopicCode} {mistake.subtopicTitle}・答錯{' '}
                  {mistake.wrongCount} 次
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
