import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Chip } from '../../../components/ui/chip';
import { ClassroomCodeReceiptView } from '../components/classroom-code-receipt';
import {
  useOwnedClassroomMembers,
  useRotateClassroomJoinCode,
} from '../hooks/use-classrooms';
import {
  type ClassroomCodeReceipt,
  type ClassroomRepository,
  ClassroomRepositoryError,
} from '../types';

const rotationErrorMessage = (error: unknown) =>
  error instanceof ClassroomRepositoryError && error.code === 'AMBIGUOUS_WRITE'
    ? '輪替結果不明，請重新整理後再決定是否再次輪替。'
    : '目前無法輪替加入碼，請稍後重試。';

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
  const rotate = useRotateClassroomJoinCode(repository);
  const [confirmingRotation, setConfirmingRotation] = useState(false);
  const [receipt, setReceipt] = useState<ClassroomCodeReceipt | null>(null);
  const [rotationError, setRotationError] = useState<string>();

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

  const confirmRotation = async () => {
    setRotationError(undefined);
    setReceipt(null);
    try {
      setReceipt(await rotate.mutateAsync(classroomId));
      setConfirmingRotation(false);
    } catch (error) {
      setConfirmingRotation(false);
      setRotationError(rotationErrorMessage(error));
    }
  };

  const activeMemberCount = members.data.filter(
    (member) => member.membershipStatus === 'active',
  ).length;

  return (
    <section
      aria-labelledby="teacher-classroom-detail-title"
      className="page-wide"
    >
      <header className="teacher-dashboard-header">
        <div className="teacher-dashboard-header__intro">
          <p className="route-panel__eyebrow">教師班級管理</p>
          <h1 id="teacher-classroom-detail-title">班級成員</h1>
          <p>成員資料由安全投影提供，不包含 Email 或使用者識別碼。</p>
        </div>
        <div className="classroom-header-actions">
          <Link
            className="secondary-action"
            to={`/teacher/classes/${classroomId}/assignments`}
          >
            作業管理
          </Link>
          <Link
            className="secondary-action"
            to={`/teacher/classes/${classroomId}/progress`}
          >
            學習進度
          </Link>
          <button
            className="secondary-action"
            disabled={rotate.isPending}
            onClick={() => {
              setConfirmingRotation(true);
            }}
            type="button"
          >
            輪替加入碼
          </button>
        </div>
      </header>
      {rotationError ? <p role="alert">{rotationError}</p> : null}
      {receipt ? (
        <ClassroomCodeReceiptView
          onDismiss={() => {
            setReceipt(null);
          }}
          receipt={receipt}
        />
      ) : null}
      <section aria-label="班級學生" className="ui-card ui-card--md">
        <header className="classroom-section-header">
          <h2>班級學生</h2>
          <Chip tone="success">
            {String(activeMemberCount)} 位有效成員
          </Chip>
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
      {confirmingRotation ? (
        <div
          aria-labelledby="rotate-code-title"
          aria-modal="true"
          role="dialog"
        >
          <h2 id="rotate-code-title">輪替班級加入碼？</h2>
          <p>舊加入碼會立即失效，已加入的學生不受影響。</p>
          <button
            disabled={rotate.isPending}
            onClick={() => {
              setConfirmingRotation(false);
            }}
            type="button"
          >
            取消
          </button>
          <button
            className="primary-action"
            disabled={rotate.isPending}
            onClick={() => void confirmRotation()}
            type="button"
          >
            {rotate.isPending ? '輪替中…' : '確認輪替'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
