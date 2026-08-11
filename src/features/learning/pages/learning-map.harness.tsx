// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import { StudentHudHarness } from '../../../app/shell/student-hud.harness';
import type { StudentChapterMapEntry } from '../api/chapter-map';
import { ChapterMap } from '../components/chapter-map';

const chapterTitles = [
  '認識色彩',
  '色彩呈現',
  '色彩表示',
  '色彩感知',
  '色彩認知',
  '色彩應用',
] as const;

const chapters: readonly StudentChapterMapEntry[] = chapterTitles.map(
  (title, index) => {
    const sortOrder = index + 1;
    const completed = sortOrder <= 2;
    const available = sortOrder === 3;

    return {
      accessState: completed ? 'completed' : available ? 'available' : 'locked',
      blockers: [],
      chapterId: `21000000-0000-0000-0000-${String(sortOrder).padStart(12, '0')}`,
      description: `${title}章節`,
      mastery: completed ? 90 : available ? 42 : null,
      progressStatus: completed
        ? 'mastered'
        : available
          ? 'developing'
          : 'not_started',
      reviewCompleted: completed ? 5 : available ? 2 : 0,
      reviewTotal: 5,
      sortOrder,
      stableCode: `chapter-${String(sortOrder)}`,
      templateId: `26000000-0000-0000-0000-${String(sortOrder).padStart(12, '0')}`,
      templateQuestionCount: 10,
      title,
    };
  },
);

export function LearningMapHarness() {
  return (
    <StudentHudHarness>
      <section
        aria-labelledby="learning-map-title"
        className="lobby lobby--map-fullscreen scene-night"
      >
        <div className="lobby-panel chapter-map-shell">
          <header className="chapter-map-title">
            <h1 id="learning-map-title">學習地圖</h1>
          </header>
          <ChapterMap chapters={chapters} equippedBlook={null} />
        </div>
      </section>
    </StudentHudHarness>
  );
}
