// DEV/TEST-ONLY. 不得被 src/main.tsx 或 production router import。
import { MemoryRouter } from 'react-router-dom';

import { ToastProvider } from '../../components/ui/toast';
import { AuthContext, type AuthContextValue } from '../../features/auth/context/auth-context';
import { LoginPage } from '../../features/auth/pages/login-page';
import type { StudentChapterMapEntry } from '../../features/learning/api/chapter-map';
import { LobbyPageView } from '../../features/learning/pages/lobby-page';
import { TitlePage } from './title-page';

export type VisibleUiHarnessScenario = 'title' | 'login' | 'learning-map';

export const VISIBLE_UI_HARNESS_SCENARIOS: readonly VisibleUiHarnessScenario[] =
  ['title', 'login', 'learning-map'];

const authFixture: AuthContextValue = {
  session: null,
  signIn: () => Promise.resolve(),
  signInWithAccount: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  status: 'anonymous',
};

const chapterTitles = [
  '色彩的來源與生活應用',
  '色彩與光的關係及混合',
  '色彩體系與數值符號的表示',
  '眼睛構造、視覺與色彩感知',
  '色彩心理、聯想與文化意象',
  '配色調和與設計實務應用',
] as const;

const chapters: readonly StudentChapterMapEntry[] = chapterTitles.map(
  (title, index) => {
    const sortOrder = index + 1;
    const accessState =
      sortOrder === 1
        ? 'completed'
        : sortOrder === 2 || sortOrder === 3
          ? 'available'
          : sortOrder === 4
            ? 'locked'
            : 'content_unavailable';
    return {
      accessState,
      blockers: [],
      chapterId: `21000000-0000-0000-0000-${String(sortOrder).padStart(12, '0')}`,
      description: `第 ${String(sortOrder)} 章完整說明文字`,
      mastery: accessState === 'completed' ? 86 : null,
      progressStatus: accessState === 'completed' ? 'mastered' : 'not_started',
      reviewCompleted: accessState === 'completed' ? 6 : 0,
      reviewTotal: 6,
      sortOrder,
      stableCode: `chapter-${String(sortOrder)}`,
      templateId: null,
      templateQuestionCount: null,
      title,
    } satisfies StudentChapterMapEntry;
  },
);

export function VisibleUiHarness({
  scenario,
}: Readonly<{ scenario: VisibleUiHarnessScenario }>) {
  return (
    <MemoryRouter>
      {scenario === 'title' ? (
        <TitlePage />
      ) : scenario === 'login' ? (
        <AuthContext.Provider value={authFixture}>
          <ToastProvider>
            <LoginPage />
          </ToastProvider>
        </AuthContext.Provider>
      ) : (
        <LobbyPageView
          chapters={chapters}
          equippedBlook={null}
          requestedChapter={chapters[2]?.chapterId}
        />
      )}
    </MemoryRouter>
  );
}
