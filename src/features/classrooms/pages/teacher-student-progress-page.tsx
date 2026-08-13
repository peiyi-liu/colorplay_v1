import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Chip, type ChipTone } from '../../../components/ui/chip';
import { AuthenticatedTeacherMenu } from '../../teacher-content/components/authenticated-teacher-menu';
import { TeacherWorkSurface } from '../../teacher-content/components/teacher-work-surface';
import '../../teacher-content/teacher-workspace.css';
import '../../teacher-content/teacher-workspace-mobile.css';
import './teacher-classrooms-workspace.css';
import { useStudentProgress } from '../hooks/use-classrooms';
import type { ClassroomRepository, StudentChapterProgress } from '../types';

const EM_DASH = '—';

const formatPercent = (value: number | null): string =>
  value === null ? EM_DASH : `${value.toFixed(1)}%`;

const chapterStatusLabel = (status: StudentChapterProgress['status']) => {
  if (status === 'mastered') return '已完成';
  if (status === 'not_started') return '尚未開始';
  return '進行中';
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
  menu,
  memberRef: suppliedMemberRef,
  repository,
}: Readonly<{
  classroomId?: string;
  menu?: ReactNode;
  memberRef?: string;
  repository?: ClassroomRepository;
}>) {
  const params = useParams();
  const classroomId = suppliedClassroomId ?? params.classroomId ?? '';
  const memberRef = suppliedMemberRef ?? params.memberRef ?? '';
  const progress = useStudentProgress(classroomId, memberRef, repository);

  const { chapters, identity, stats } = progress.data ?? {
    chapters: [],
    identity: {
      displayName: '',
      fullName: null,
      joinedAt: '',
      loginAccount: null,
      membershipStatus: 'active' as const,
    },
    stats: {
      avgAccuracy: null,
      classRank: null,
      classXp: 0,
      openMistakeCount: 0,
      totalMistakeCount: 0,
      unfinishedMistakeCount: 0,
    },
  };
  const studentName = identity.fullName ?? identity.displayName;
  const state = progress.isPending
    ? ({ kind: 'loading', message: '學生學習進度載入中…' } as const)
    : progress.isError
      ? ({
          kind: 'error',
          message: '無法載入學生資料，或你沒有管理權限。',
          retry: () => void progress.refetch(),
        } as const)
      : ({ kind: 'content' } as const);

  return (
    <TeacherWorkSurface
      menu={menu ?? <AuthenticatedTeacherMenu />}
      state={state}
      subtitle={`${identity.loginAccount ? `學號 ${identity.loginAccount}・` : ''}暱稱 ${identity.displayName}`}
      title={`${studentName} 的學習進度`}
      toolbar={
        <Link
          className="secondary-action"
          to={`/teacher/classes/${classroomId}`}
        >
          返回班級成員
        </Link>
      }
    >
      {identity.membershipStatus === 'inactive' ? (
        <p role="status">此成員已停用，資料為停用前的紀錄。</p>
      ) : null}
      <dl className="teacher-classroom-stats teacher-classroom-stats--four">
        <div>
          <dt>班級名次</dt>
          <dd>
            {stats.classRank === null ? EM_DASH : String(stats.classRank)}
          </dd>
        </div>
        <div>
          <dt>累計經驗 XP</dt>
          <dd>{stats.classXp.toLocaleString('zh-TW')}</dd>
        </div>
        <div>
          <dt>平均正確率</dt>
          <dd>{formatPercent(stats.avgAccuracy)}</dd>
        </div>
        <div className="teacher-summary-cards__stat--alert">
          <dt>待補救題狀態</dt>
          <dd>
            {stats.unfinishedMistakeCount}/{stats.totalMistakeCount}
          </dd>
        </div>
      </dl>
      <section
        aria-labelledby="student-chapter-progress-title"
        className="teacher-classroom-panel"
      >
        <header className="classroom-section-header">
          <h2 id="student-chapter-progress-title">各章節學習進度</h2>
        </header>
        {chapters.length === 0 ? (
          <p>目前沒有已發布的章節。</p>
        ) : (
          <div className="ui-table-scroll">
            <table className="ui-table">
              <caption className="visually-hidden">各章節學習進度</caption>
              <thead>
                <tr>
                  <th scope="col">章節</th>
                  <th scope="col">複習完成</th>
                  <th scope="col">正確率</th>
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
                    <td>
                      {formatPercent(chapter.assessmentAccuracy)}（小節{' '}
                      {formatPercent(chapter.sectionQuizAccuracy)}／章節{' '}
                      {formatPercent(chapter.chapterQuizAccuracy)}／Live{' '}
                      {formatPercent(chapter.liveAccuracy)}）
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
          </div>
        )}
      </section>
    </TeacherWorkSurface>
  );
}
