import { Link, useNavigate } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { JoinClassroomForm } from '../components/join-classroom-form';
import { useMyClassrooms } from '../hooks/use-classrooms';
import type { ClassroomRepository } from '../types';

export function StudentClassroomsPage({
  repository,
}: Readonly<{ repository?: ClassroomRepository }>) {
  const classrooms = useMyClassrooms(repository);
  const navigate = useNavigate();

  if (classrooms.isPending) return <RouteLoading withinMain />;
  if (classrooms.isError) {
    return (
      <section className="route-panel">
        <h1>我的班級</h1>
        <p role="alert">班級資料載入失敗，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void classrooms.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="student-classrooms-title"
      className="w-full max-w-5xl"
    >
      <header>
        <p className="route-panel__eyebrow">班級學習</p>
        <h1 id="student-classrooms-title">我的班級</h1>
        <p>加入老師建立的班級，查看由正式 XP 紀錄計算的排行榜。</p>
      </header>
      <JoinClassroomForm
        {...(repository ? { repository } : {})}
        onJoined={(classroomId) => {
          void navigate(`/app/leaderboard/${classroomId}`, { replace: true });
        }}
      />
      {classrooms.data.length === 0 ? (
        <p>你還沒有加入班級。</p>
      ) : (
        <ul aria-label="我的班級列表">
          {classrooms.data.map((classroom) => (
            <li key={classroom.classroomId}>
              <article>
                <h2>{classroom.classroomName}</h2>
                <p>
                  加入日期：
                  {new Date(classroom.joinedAt).toLocaleDateString('zh-TW')}
                </p>
                <Link
                  aria-label={`查看${classroom.classroomName}排行榜`}
                  className="primary-action"
                  to={`/app/leaderboard/${classroom.classroomId}`}
                >
                  查看排行榜
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
