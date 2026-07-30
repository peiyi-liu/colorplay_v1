import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Chip } from '../../../components/ui/chip';
import { useOwnedClassroomMembers } from '../hooks/use-classrooms';
import type { ClassroomRepository } from '../types';

export function TeacherClassroomDetailPage({
  classroomId: suppliedClassroomId,
  repository,
}: Readonly<{
  classroomId?: string;
  repository?: ClassroomRepository;
}>) {
  const params = useParams();
  const classroomId = suppliedClassroomId ?? params.classroomId ?? '';
  const members = useOwnedClassroomMembers(classroomId, repository);

  if (members.isPending) return <RouteLoading withinMain />;
  if (members.isError) {
    return (
      <section className="route-panel">
        <h1>班級成員</h1>
        <p role="alert">無法載入班級資料，或你沒有管理權限。</p>
        <button
          className="primary-action"
          onClick={() => void members.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const activeMemberCount = members.data.filter(
    (member) => member.membershipStatus === 'active',
  ).length;

  return (
    <section
      aria-labelledby="teacher-classroom-detail-title"
      className="page-wide page-stack"
    >
      <header className="teacher-dashboard-header">
        <div className="teacher-dashboard-header__intro">
          <p className="route-panel__eyebrow">教師班級管理</p>
          <h1 id="teacher-classroom-detail-title">班級成員</h1>
          <p>成員資料由安全投影提供，不包含 Email 或使用者識別碼。</p>
        </div>
      </header>
      <section aria-label="班級學生" className="ui-card ui-card--md">
        <header className="classroom-section-header">
          <h2>班級學生</h2>
          <Chip tone="success">{String(activeMemberCount)} 位有效成員</Chip>
        </header>
        {members.data.length === 0 ? (
          <p>目前沒有學生。</p>
        ) : (
          <div className="ui-table-scroll">
            <table className="ui-table">
              <caption className="visually-hidden">班級學生</caption>
              <thead>
                <tr>
                  <th scope="col">名字</th>
                  <th scope="col">學號</th>
                  <th scope="col">暱稱</th>
                  <th scope="col">Blook</th>
                  <th scope="col">狀態</th>
                  <th scope="col">加入日期</th>
                  <th scope="col">學習狀況</th>
                </tr>
              </thead>
              <tbody>
                {members.data.map((member) => (
                  <tr key={member.memberRef}>
                    <th scope="row">{member.fullName ?? '—'}</th>
                    <td>{member.loginAccount ?? '—'}</td>
                    <td>{member.displayName}</td>
                    <td>
                      {member.activeBlookId ? '已裝備 Blook' : '尚未裝備'}
                    </td>
                    <td>
                      <span
                        className={`status-inline${member.membershipStatus === 'inactive' ? ' status-inline--inactive' : ''}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`status-dot ${member.membershipStatus === 'active' ? 'status-dot--active' : 'status-dot--inactive'}`}
                        />
                        {member.membershipStatus === 'active'
                          ? '有效成員'
                          : '已停用'}
                      </span>
                    </td>
                    <td>
                      {new Date(member.joinedAt).toLocaleDateString('zh-TW')}
                    </td>
                    <td>
                      <Link
                        className="secondary-action"
                        to={`/teacher/classes/${classroomId}/members/${member.memberRef}`}
                      >
                        查看細節 ›
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
