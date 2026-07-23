import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
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

  return (
    <section
      aria-labelledby="teacher-classroom-detail-title"
      className="page-wide"
    >
      <header>
        <p className="route-panel__eyebrow">教師班級管理</p>
        <h1 id="teacher-classroom-detail-title">班級成員</h1>
        <p>成員資料由安全投影提供，不包含 Email 或使用者識別碼。</p>
      </header>
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
      {rotationError ? <p role="alert">{rotationError}</p> : null}
      {receipt ? (
        <ClassroomCodeReceiptView
          onDismiss={() => {
            setReceipt(null);
          }}
          receipt={receipt}
        />
      ) : null}
      {members.data.length === 0 ? (
        <p>目前沒有學生。</p>
      ) : (
        <table>
          <caption>班級學生</caption>
          <thead>
            <tr>
              <th scope="col">顯示名稱</th>
              <th scope="col">Blook</th>
              <th scope="col">狀態</th>
              <th scope="col">加入日期</th>
            </tr>
          </thead>
          <tbody>
            {members.data.map((member) => (
              <tr key={`${member.displayName}-${member.joinedAt}`}>
                <th scope="row">{member.displayName}</th>
                <td>{member.activeBlookId ? '已裝備 Blook' : '尚未裝備'}</td>
                <td>
                  {member.membershipStatus === 'active' ? '有效成員' : '已停用'}
                </td>
                <td>{new Date(member.joinedAt).toLocaleDateString('zh-TW')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
