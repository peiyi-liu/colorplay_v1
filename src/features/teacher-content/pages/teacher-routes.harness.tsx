// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
// Task 5：7 個教師頁面元件各自經既有 repository? DI seam 注入 deterministic
// fixture repository，不經過 RequireAuth／RequireRole／真實 Supabase，直接
// 掛載頁面元件本身（比照 Phase 4A chapter-detail-page.harness.tsx 模式）。
// HUD scenario 獨立於 route scenarios：直接掛載 HudCommandBar，不掛完整
// AppShell（比照既有 hud-command-bar.test.tsx 只用 MemoryRouter 包裹）。
//
// 已知限制：TeacherAnalyticsPage 內部呼叫的 usePublishedChapters()
// 沒有 repository? DI seam（既有程式碼如此，非本批引入），analytics
// scenario 會在背景嘗試一次真實 fetch；不會阻塞頁面渲染或造成 console/
// page error（react-query 內部吞下該 query 的 rejection）。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { HudCommandBar } from '../../../app/shell/hud-command-bar';
import { TeacherClassroomDetailPage } from '../../classrooms/pages/teacher-classroom-detail-page';
import { TeacherClassroomsPage } from '../../classrooms/pages/teacher-classrooms-page';
import { TeacherStudentProgressPage } from '../../classrooms/pages/teacher-student-progress-page';
import type {
  ClassroomMember,
  ClassroomRepository,
  OwnedClassroom,
  StudentProgressSnapshot,
} from '../../classrooms/types';
import { TeacherLivePage } from '../../live/pages/teacher-live-page';
import { TeacherLiveReportPage } from '../../live/pages/teacher-live-report-page';
import { LivePresenterHarness } from '../../live/components/live-presenter.harness';
import type {
  LiveActivity,
  LiveRepository,
  LiveSectionOption,
  LiveSessionDetail,
} from '../../live/types';
import type { TeacherContentRepository } from '../api/teacher-content-repository';
import { TeacherAnalyticsPage } from './teacher-analytics-page';
import { TeacherDashboardPage } from './teacher-dashboard-page';

export type TeacherRoutesHarnessScenario =
  | 'dashboard'
  | 'analytics'
  | 'classes'
  | 'classroom-detail'
  | 'live'
  | 'live-report'
  | 'live-session'
  | 'student-progress'
  | 'hud';

export const TEACHER_ROUTES_HARNESS_SCENARIOS: readonly TeacherRoutesHarnessScenario[] =
  [
    'dashboard',
    'analytics',
    'classes',
    'classroom-detail',
    'live',
    'live-report',
    'live-session',
    'student-progress',
    'hud',
  ];

const CLASSROOM_ID = '18100000-0000-0000-0000-000000000001';
const MEMBER_REF = 'cb000000-0000-4000-8000-000000000001';
const SESSION_ID = '28000000-0000-0000-0000-000000000001';

const classroomFixture: OwnedClassroom = {
  classroomId: CLASSROOM_ID,
  classroomName: '色彩一班',
  classroomStatus: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  joinCode: 'ABCD-1234-EF56-7890',
  joinCodeVersion: 1,
  memberCount: 4,
};

const memberFixture: ClassroomMember = {
  activeBlookId: '50000000-0000-0000-0000-000000000001',
  displayName: '學生一',
  fullName: '陳品妍',
  joinedAt: '2026-07-17T01:00:00.000Z',
  loginAccount: 's1130201',
  memberRef: MEMBER_REF,
  membershipStatus: 'active',
};

const classroomSummaryFixture = {
  attempts: 12,
  averageAccuracy: 66.7,
  uniqueStudents: 4,
  worstSubtopicTitle: '3-1 色彩三要素與色名的表示',
};

const progressSnapshotFixture: StudentProgressSnapshot = {
  chapters: [
    {
      accuracy: 80,
      chapterId: 'c1',
      chapterTitle: '第一章 色彩三要素',
      coverage: 90,
      mastery: 75,
      reviewCompleted: 9,
      reviewTotal: 10,
      status: 'learning',
    },
  ],
  identity: {
    displayName: '學生一',
    fullName: '陳品妍',
    joinedAt: '2026-07-17T01:00:00.000Z',
    loginAccount: 's1130201',
    membershipStatus: 'active',
  },
  mistakes: [
    {
      prompt: '互補色是？',
      subtopicCode: '3-2',
      subtopicTitle: '色彩對比',
      wrongCount: 2,
    },
  ],
  stats: {
    avgAccuracy: 72.5,
    classRank: 2,
    classXp: 1280,
    openMistakeCount: 1,
  },
};

const sectionFixture: LiveSectionOption = {
  sectionId: '26000000-0000-0000-0000-000000000010',
  title: '3-1 色彩三要素',
  quizTemplateId: '26000000-0000-0000-0000-000000000003',
};

const liveActivityFixture: LiveActivity = {
  activityId: '27000000-0000-0000-0000-000000000001',
  title: sectionFixture.title,
  quizTemplateId: sectionFixture.quizTemplateId,
  questionTimeLimitSeconds: 20,
  status: 'active',
  rulesVersion: 'v1',
  questionDisplay: 'screen_only',
  sectionId: sectionFixture.sectionId,
};

const liveSessionDetailFixture: LiveSessionDetail = {
  sessionId: SESSION_ID,
  completedAt: '2026-07-20T05:00:00+00:00',
  classroomId: CLASSROOM_ID,
  activity: {
    title: '色彩快問快答',
    quizTemplateId: sectionFixture.quizTemplateId,
  },
  questions: [
    {
      position: 1,
      prompt: '色彩三要素是？',
      answered: 3,
      correct: 2,
      correctRate: 66.7,
      averageResponseMs: 1800,
    },
  ],
  participants: [
    {
      displayName: '學生一',
      rank: 1,
      score: 300,
      answers: [{ position: 1, status: 'correct', responseMs: 900 }],
    },
  ],
  ranking: [
    { rank: 1, displayName: '學生一', score: 300 },
    { rank: 2, displayName: '學生二', score: 220 },
    { rank: 3, displayName: '學生三', score: 150 },
  ],
};

const classroomRepositoryFixture = (
  overrides: Partial<ClassroomRepository> = {},
): ClassroomRepository =>
  ({
    getOwnedMembers: () => Promise.resolve([memberFixture]),
    getStudentProgress: () => Promise.resolve(progressSnapshotFixture),
    listOwned: () => Promise.resolve([classroomFixture]),
    ...overrides,
  }) as unknown as ClassroomRepository;

const teacherContentRepositoryFixture = (
  overrides: Partial<TeacherContentRepository> = {},
): TeacherContentRepository =>
  ({
    getClassroomSummary: () => Promise.resolve(classroomSummaryFixture),
    getLiveReport: () =>
      Promise.resolve([
        {
          activity_title: '色彩快問快答',
          answers: 12,
          completed_at: '2026-07-20T05:00:00+00:00',
          correct_rate: 66.7,
          participants: 4,
          session_id: SESSION_ID,
          state: 'completed',
        },
      ]),
    getQuestionAnalysis: () =>
      Promise.resolve([
        {
          attempts: 8,
          correct_rate: 50,
          prompt: '色彩三要素是？',
          stable_code: 'q-3-1-01',
        },
      ]),
    getSubtopicMastery: () =>
      Promise.resolve([
        {
          accuracy: 72.5,
          answers: 20,
          students: 4,
          subtopic_code: '3-1',
          subtopic_title: '3-1 色彩三要素與色名的表示',
        },
      ]),
    listSubtopics: () =>
      Promise.resolve([
        { stableCode: '3-1', subtopicId: 'sub-1', title: '3-1 色彩三要素' },
      ]),
    ...overrides,
  }) as unknown as TeacherContentRepository;

const liveRepositoryFixture = (
  overrides: Partial<LiveRepository> = {},
): LiveRepository =>
  ({
    getSessionDetail: () => Promise.resolve(liveSessionDetailFixture),
    listMyActivities: () => Promise.resolve([liveActivityFixture]),
    listSectionOptions: () => Promise.resolve([sectionFixture]),
    ...overrides,
  }) as unknown as LiveRepository;

export function TeacherRoutesHarness({
  hudInitialRoute = '/teacher',
  scenario,
}: Readonly<{
  hudInitialRoute?: string;
  scenario: TeacherRoutesHarnessScenario;
}>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false },
        },
      }),
  );

  if (scenario === 'hud') {
    return (
      <MemoryRouter initialEntries={[hudInitialRoute]}>
        <HudCommandBar
          displayName="示範教師"
          isSigningOut={false}
          onSignOut={() => undefined}
          variant="teacher"
        />
      </MemoryRouter>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {scenario === 'dashboard' ? (
          <TeacherDashboardPage
            classroomRepository={classroomRepositoryFixture()}
            repository={teacherContentRepositoryFixture()}
          />
        ) : scenario === 'analytics' ? (
          <TeacherAnalyticsPage
            classroomRepository={classroomRepositoryFixture()}
            repository={teacherContentRepositoryFixture()}
          />
        ) : scenario === 'classes' ? (
          <TeacherClassroomsPage repository={classroomRepositoryFixture()} />
        ) : scenario === 'classroom-detail' ? (
          <TeacherClassroomDetailPage
            classroomId={CLASSROOM_ID}
            repository={classroomRepositoryFixture()}
          />
        ) : scenario === 'live' ? (
          <TeacherLivePage
            classroomRepository={classroomRepositoryFixture()}
            repository={liveRepositoryFixture()}
          />
        ) : scenario === 'live-report' ? (
          <TeacherLiveReportPage
            repository={liveRepositoryFixture()}
            sessionId={SESSION_ID}
          />
        ) : scenario === 'live-session' ? (
          <section
            aria-label="Live 主持工作階段"
            className="teacher-live-session-page"
          >
            <LivePresenterHarness
              optionLength={21}
              pending={false}
              promptLength={36}
              scenario="reveal-boundary"
            />
          </section>
        ) : (
          <TeacherStudentProgressPage
            classroomId={CLASSROOM_ID}
            memberRef={MEMBER_REF}
            repository={classroomRepositoryFixture()}
          />
        )}
      </MemoryRouter>
    </QueryClientProvider>
  );
}
