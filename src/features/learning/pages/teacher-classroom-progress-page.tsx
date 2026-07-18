import { Link, useParams } from 'react-router-dom';

import type { LearningRepository } from '../api/learning-repository';
import { ClassroomProgressSection } from '../components/classroom-progress-section';

export function TeacherClassroomProgressPage({
  classroomId: suppliedClassroomId,
  repository,
}: Readonly<{
  classroomId?: string;
  repository?: LearningRepository;
}>) {
  const params = useParams();
  const classroomId = suppliedClassroomId ?? params.classroomId ?? '';

  return (
    <section
      aria-labelledby="classroom-progress-title"
      className="w-full max-w-4xl"
    >
      <header>
        <p className="route-panel__eyebrow">教師班級管理</p>
        <h1 id="classroom-progress-title">班級學習進度</h1>
        <p>
          精熟度由伺服器依 2026-07-progress-1 規則計算，僅班級擁有者可讀取。
        </p>
        <Link to={`/teacher/classes/${classroomId}`}>回班級成員</Link>
      </header>
      <ClassroomProgressSection
        classroomId={classroomId}
        {...(repository ? { repository } : {})}
      />
    </section>
  );
}
