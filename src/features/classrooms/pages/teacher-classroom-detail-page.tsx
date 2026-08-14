import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Chip } from '../../../components/ui/chip';
import { AuthenticatedTeacherMenu } from '../../teacher-content/components/authenticated-teacher-menu';
import { TeacherWorkSurface } from '../../teacher-content/components/teacher-work-surface';
import '../../teacher-content/teacher-workspace.css';
import '../../teacher-content/teacher-workspace-mobile.css';
import './teacher-classrooms-workspace.css';
import './teacher-classrooms-reimplementation.css';
import {
  useOwnedClassroomMembers,
  useOwnedClassrooms,
} from '../hooks/use-classrooms';
import type { ClassroomMember, ClassroomRepository } from '../types';

function MemberDisclosure({
  classroomId,
  member,
}: Readonly<{ classroomId: string; member: ClassroomMember }>) {
  const [open, setOpen] = useState(false);
  return (
    <details
      data-testid="member-disclosure"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary aria-expanded={open}>
        <span>
          <strong>{member.displayName}</strong>
          <small>{member.loginAccount ?? '學號未提供'}</small>
        </span>
        <span className="teacher-disclosure-summary__aside">
          {member.membershipStatus === 'inactive' ? (
            <Chip tone="neutral">已停用</Chip>
          ) : null}
          <span
            aria-hidden="true"
            className="teacher-disclosure-chevron"
            data-testid="member-disclosure-chevron"
          >
            ›
          </span>
        </span>
      </summary>
      <dl>
        <div>
          <dt>學號</dt>
          <dd>{member.loginAccount ?? '—'}</dd>
        </div>
        <div>
          <dt>姓名</dt>
          <dd>{member.fullName ?? '—'}</dd>
        </div>
        <div>
          <dt>暱稱</dt>
          <dd>{member.displayName}</dd>
        </div>
      </dl>
      <Link
        className="secondary-action"
        to={`/teacher/classes/${classroomId}/members/${member.memberRef}`}
      >
        查看細節
      </Link>
    </details>
  );
}

export function TeacherClassroomDetailPage({
  classroomId: suppliedClassroomId,
  menu,
  repository,
}: Readonly<{
  classroomId?: string;
  menu?: ReactNode;
  repository?: ClassroomRepository;
}>) {
  const params = useParams();
  const classroomId = suppliedClassroomId ?? params.classroomId ?? '';
  const members = useOwnedClassroomMembers(classroomId, repository);
  // 加入碼摘要徽章沿用既有 useOwnedClassrooms（/teacher/classes 已在用），
  // 不新增 repository method，只是這個頁面多呼叫一次既有 hook。
  const classrooms = useOwnedClassrooms(repository);
  const classroom = classrooms.data?.find(
    (candidate) => candidate.classroomId === classroomId,
  );

  const activeMemberCount = (members.data ?? []).filter(
    (member) => member.membershipStatus === 'active',
  ).length;
  const [copied, setCopied] = useState(false);
  const state = members.isPending
    ? ({ kind: 'loading', message: '班級成員載入中…' } as const)
    : members.isError
      ? ({
          kind: 'error',
          message: '無法載入班級資料，或你沒有管理權限。',
          retry: () => void members.refetch(),
        } as const)
      : ({ kind: 'content' } as const);

  return (
    <TeacherWorkSurface
      menu={menu ?? <AuthenticatedTeacherMenu />}
      state={state}
      subtitle={classroom?.classroomName ?? '查看班級成員與學習狀態'}
      title="班級成員"
      toolbar={
        <Link className="secondary-action" to="/teacher/classes">
          返回班級管理
        </Link>
      }
    >
      <section aria-label="班級學生" className="teacher-classroom-panel">
        <header className="classroom-section-header">
          <h2>{classroom?.classroomName ?? '班級學生'}</h2>
          <div className="classroom-section-header__badges">
            <Chip tone="success">學生人數 {String(activeMemberCount)}</Chip>
            {classroom?.joinCode ? (
              <div className="teacher-classroom-identity__code">
                <span className="visually-hidden">
                  班級加入代碼 {classroom.joinCode}
                </span>
                <span aria-hidden="true">班級加入代碼</span>
                <strong aria-hidden="true">{classroom.joinCode}</strong>
                <button
                  aria-label={`複製 ${classroom.classroomName} 的班級加入代碼`}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(classroom.joinCode ?? '')
                      .then(() => {
                        setCopied(true);
                        window.setTimeout(() => {
                          setCopied(false);
                        }, 2000);
                      })
                      .catch(() => undefined);
                  }}
                  type="button"
                >
                  {copied ? '已複製' : '複製'}
                </button>
              </div>
            ) : null}
          </div>
        </header>
        {(members.data?.length ?? 0) === 0 ? (
          <p>目前沒有學生。</p>
        ) : (
          <>
            <div className="ui-table-scroll">
              <table className="ui-table">
              <caption className="visually-hidden">班級學生</caption>
              <thead>
                <tr>
                  <th scope="col">學號</th>
                  <th scope="col">姓名</th>
                  <th scope="col">暱稱</th>
                  <th scope="col">成員資格</th>
                </tr>
              </thead>
              <tbody>
                {(members.data ?? []).map((member) => (
                  <tr key={member.memberRef}>
                    <th scope="row">{member.loginAccount ?? '—'}</th>
                    <td>{member.fullName ?? '—'}</td>
                    <td>{member.displayName}</td>
                    <td>
                      {member.membershipStatus === 'inactive' ? (
                        <Chip tone="neutral">已停用</Chip>
                      ) : null}{' '}
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
            <div className="teacher-roster-disclosures">
              {(members.data ?? []).map((member) => (
                <MemberDisclosure
                  classroomId={classroomId}
                  key={member.memberRef}
                  member={member}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </TeacherWorkSurface>
  );
}
