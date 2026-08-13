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
import type { TeacherContentRepository } from '../api/teacher-content-repository';
import { TeacherMenu } from '../components/teacher-menu';
import { TeacherAnalyticsPage } from './teacher-analytics-page';
import { TeacherQuestionAnalysisPage } from './teacher-question-analysis-page';
import {
  LiveLobbyHarness,
  LiveRoundHarness,
  liveRepositoryFixture,
  setTeacherHarnessJoinCode,
  TEACHER_HARNESS_SESSION_ID,
} from './teacher-routes-live.harness';

export type TeacherRoutesHarnessScenario =
  | 'analytics'
  | 'classes'
  | 'classroom-detail'
  | 'live'
  | 'live-lobby'
  | 'live-round'
  | 'live-report'
  | 'questions'
  | 'student-progress'
  | 'hud';

export const TEACHER_ROUTES_HARNESS_SCENARIOS: readonly TeacherRoutesHarnessScenario[] =
  [
    'analytics',
    'classes',
    'classroom-detail',
    'live',
    'live-lobby',
    'live-round',
    'live-report',
    'questions',
    'student-progress',
    'hud',
  ];

const CLASSROOM_ID = '18100000-0000-0000-0000-000000000001';
const MEMBER_REF = 'cb000000-0000-4000-8000-000000000001';

const routeForScenario: Readonly<
  Record<
    Exclude<TeacherRoutesHarnessScenario, 'hud' | 'live-lobby' | 'live-round'>,
    string
  >
> = {
  analytics: '/teacher',
  classes: '/teacher/classes',
  'classroom-detail': `/teacher/classes/${CLASSROOM_ID}`,
  live: '/teacher/live',
  'live-report': `/teacher/live/${TEACHER_HARNESS_SESSION_ID}/report`,
  questions: `/teacher/questions?classroomId=${CLASSROOM_ID}`,
  'student-progress': `/teacher/classes/${CLASSROOM_ID}/members/${MEMBER_REF}`,
};

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
      assessmentAccuracy: 72.5,
      chapterQuizAccuracy: 75,
      chapterId: 'c1',
      chapterTitle: '第一章 色彩三要素',
      coverage: 90,
      mastery: 75,
      liveAccuracy: 65,
      reviewCompleted: 9,
      reviewTotal: 10,
      sectionQuizAccuracy: 78,
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
  stats: {
    avgAccuracy: 72.5,
    classRank: 2,
    classXp: 1280,
    openMistakeCount: 1,
    totalMistakeCount: 7,
    unfinishedMistakeCount: 1,
  },
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
    getAssessmentQuestions: () =>
      Promise.resolve([
        {
          attempts: 8,
          chapter_id: '21000000-0000-0000-0000-000000000003',
          chapter_sort_order: 3,
          chapter_title: '色彩表示',
          correct_rate: 50,
          prompt: '色彩三要素是？',
          section_id: '22000000-0000-0000-0000-000000000001',
          section_sort_order: 1,
          section_title: '3-1 色彩三要素',
          stable_code: 'QB3101',
        },
      ]),
    getChapterCompletion: () =>
      Promise.resolve([
        {
          chapter_id: '21000000-0000-0000-0000-000000000003',
          chapter_sort_order: 3,
          chapter_title: '第 3 章 色彩表示',
          completed_students: 3,
          completion_rate: 75,
          student_statuses: [
            {
              display_name: '晨星',
              is_complete: true,
              member_ref: '29200000-0000-0000-0000-000000000001',
            },
            {
              display_name: '夜光',
              is_complete: false,
              member_ref: '29200000-0000-0000-0000-000000000002',
            },
          ],
          total_students: 4,
        },
      ]),
    getClassroomSummary: () => Promise.resolve(classroomSummaryFixture),
    getClassroomOverview: () =>
      Promise.resolve({
        averageAccuracy: 66.7,
        completedStudents: 3,
        totalStudents: 4,
        worstSubtopicCode: '3-1',
        worstSubtopicTitle: '色彩三要素與色名的表示',
      }),
    getLiveHistory: () =>
      Promise.resolve({
        rows: [
          {
            activity_title: '色彩快問快答',
            answers: 12,
            classroom_name: '色彩一班',
            completed_at: '2026-07-20T05:00:00+00:00',
            correct_rate: 66.7,
            participants: 4,
            session_id: TEACHER_HARNESS_SESSION_ID,
            total_count: 1,
          },
        ],
        total: 1,
      }),
    getLiveReport: () =>
      Promise.resolve([
        {
          activity_title: '色彩快問快答',
          answers: 12,
          completed_at: '2026-07-20T05:00:00+00:00',
          correct_rate: 66.7,
          participants: 4,
          session_id: TEACHER_HARNESS_SESSION_ID,
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
    getQuestionDetail: (_classroomId: string, stableCode: string) =>
      Promise.resolve({
        options: [
          { option_key: 'A', option_text: '色相、明度、彩度' },
          { option_key: 'B', option_text: '紅色、黃色、藍色' },
        ],
        prompt: '色彩三要素是？',
        stable_code: stableCode,
      }),
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

const teacherMenuFixture = (
  <TeacherMenu
    avatarError={null}
    avatarPending={false}
    avatarUrl={null}
    displayName="林老師"
    isSigningOut={false}
    onAvatarUpload={() => undefined}
    onSignOut={() => undefined}
    signOutError={false}
  />
);

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

  if (scenario === 'live-lobby') {
    setTeacherHarnessJoinCode();
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/teacher/live/${TEACHER_HARNESS_SESSION_ID}`]}
        >
          <LiveLobbyHarness />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  if (scenario === 'live-round') {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/teacher/live/${TEACHER_HARNESS_SESSION_ID}`]}
        >
          <LiveRoundHarness />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[routeForScenario[scenario]]}>
        {scenario === 'analytics' ? (
          <TeacherAnalyticsPage
            classroomRepository={classroomRepositoryFixture()}
            menu={teacherMenuFixture}
            repository={teacherContentRepositoryFixture()}
          />
        ) : scenario === 'classes' ? (
          <TeacherClassroomsPage
            menu={teacherMenuFixture}
            repository={classroomRepositoryFixture()}
          />
        ) : scenario === 'classroom-detail' ? (
          <TeacherClassroomDetailPage
            classroomId={CLASSROOM_ID}
            menu={teacherMenuFixture}
            repository={classroomRepositoryFixture()}
          />
        ) : scenario === 'live' ? (
          <TeacherLivePage
            classroomRepository={classroomRepositoryFixture()}
            menu={teacherMenuFixture}
            repository={liveRepositoryFixture()}
          />
        ) : scenario === 'live-report' ? (
          <TeacherLiveReportPage
            menu={teacherMenuFixture}
            repository={liveRepositoryFixture()}
            sessionId={TEACHER_HARNESS_SESSION_ID}
          />
        ) : scenario === 'questions' ? (
          <TeacherQuestionAnalysisPage
            classroomRepository={classroomRepositoryFixture()}
            menu={teacherMenuFixture}
            repository={teacherContentRepositoryFixture()}
          />
        ) : (
          <TeacherStudentProgressPage
            classroomId={CLASSROOM_ID}
            menu={teacherMenuFixture}
            memberRef={MEMBER_REF}
            repository={classroomRepositoryFixture()}
          />
        )}
      </MemoryRouter>
    </QueryClientProvider>
  );
}
