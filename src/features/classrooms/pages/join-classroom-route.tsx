import { useNavigate, useParams } from 'react-router-dom';

import { JoinClassroomForm } from '../components/join-classroom-form';
import type { ClassroomRepository } from '../types';

export function JoinClassroomRoute({
  repository,
}: Readonly<{ repository?: ClassroomRepository }>) {
  const { joinCode = '' } = useParams();
  const navigate = useNavigate();

  return (
    <section aria-labelledby="join-classroom-title" className="page-narrow">
      <p className="route-panel__eyebrow">班級邀請</p>
      <h1 id="join-classroom-title">確認加入班級</h1>
      <p>請確認老師提供的加入碼，再手動送出。開啟連結不會自動加入。</p>
      <JoinClassroomForm
        {...(repository ? { repository } : {})}
        initialJoinCode={joinCode}
        onJoined={(classroomId) => {
          void navigate(`/app/leaderboard/${classroomId}`, { replace: true });
        }}
      />
    </section>
  );
}
