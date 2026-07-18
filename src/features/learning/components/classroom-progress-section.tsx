import { usePublishedChapters } from '../api/chapters';
import type { LearningRepository } from '../api/learning-repository';
import { useClassroomProgress } from '../hooks/use-learning';
import { percentText, statusLabels } from '../pages/chapter-detail-page';

/**
 * Owner-teacher classroom mastery summary. The server authorizes ownership;
 * non-owners receive zero rows, so this section simply renders what the
 * trusted projection returns.
 */
export function ClassroomProgressSection({
  classroomId,
  repository,
}: Readonly<{
  classroomId: string;
  repository?: LearningRepository;
}>) {
  const progress = useClassroomProgress(classroomId, repository);
  const chapters = usePublishedChapters();

  if (progress.isPending || chapters.isPending) {
    return <p role="status">學習進度載入中…</p>;
  }
  if (progress.isError || chapters.isError) {
    return <p role="alert">無法載入班級學習進度，請稍後重試。</p>;
  }

  const chapterTitle = (chapterId: string) =>
    chapters.data?.find((entry) => entry.id === chapterId)?.title ?? '章節';
  const students = [...new Set(progress.data.map((row) => row.userId))];

  return (
    <section aria-label="班級學習進度">
      <h2>班級學習進度</h2>
      {students.length === 0 ? (
        <p>目前沒有可顯示的學習進度。</p>
      ) : (
        <table>
          <caption>各學生章節精熟度</caption>
          <thead>
            <tr>
              <th scope="col">學生</th>
              <th scope="col">章節</th>
              <th scope="col">精熟度</th>
              <th scope="col">狀態</th>
            </tr>
          </thead>
          <tbody>
            {progress.data.map((row) => (
              <tr key={`${row.userId}-${row.chapterId}`}>
                <th scope="row">{row.displayName}</th>
                <td>{chapterTitle(row.chapterId)}</td>
                <td>{percentText(row.mastery)}</td>
                <td>{statusLabels[row.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
