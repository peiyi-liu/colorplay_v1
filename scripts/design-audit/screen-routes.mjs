// 34 個 DC 畫面的路由對應。auth: 'student' | 'teacher' | 'anon'。
// setup: 進頁前需要的互動（例如切到教師登入 tab）。
// 注意：`progress` 畫面依 owner 批示（學生端不再有此頁）已從清單移除。
export const SCREENS = [
  { id: 'login', route: '/login', auth: 'anon' },
  { id: 'tLogin', route: '/login', auth: 'anon', setup: 'switch-teacher-tab' },
  {
    id: 'tLoginError',
    route: '/login',
    auth: 'anon',
    setup: 'teacher-tab-submit-bad',
  },
  { id: 'register', route: '/register', auth: 'anon' },
  { id: 'lobby', route: '/app', auth: 'student' },
  { id: 'chapter', route: '/app/chapters/:firstChapterId', auth: 'student' },
  { id: 'missionSelect', route: '/app/missions', auth: 'student' },
  {
    id: 'mission',
    route: '/app/missions/:sessionId',
    auth: 'student',
    setup: 'start-mission',
  },
  {
    id: 'quiz',
    route: '/app/quiz/:sessionId',
    auth: 'student',
    setup: 'start-quiz',
  },
  {
    id: 'quizFeedback',
    route: '/app/quiz/:sessionId',
    auth: 'student',
    setup: 'answer-one',
  },
  {
    id: 'quizResult',
    route: '/app/quiz/:sessionId/result',
    auth: 'student',
    setup: 'finish-quiz',
  },
  { id: 'shop', route: '/app/shop', auth: 'student' },
  { id: 'achievements', route: '/app/achievements', auth: 'student' },
  // UAT 0727 R2 #1：學生端已無班級清單頁（註冊即入班、導覽直達排行榜），
  // DC classrooms 畫面不再於產品路由上——capture-screens 對此 id 記 skip。
  { id: 'classrooms', route: '/app/leaderboard', auth: 'student' },
  {
    id: 'leaderboard',
    route: '/app/leaderboard',
    auth: 'student',
  },
  { id: 'mistakes', route: '/app/mistakes', auth: 'student' },
  // progress 畫面依 owner 批示改為教師專屬，學生端不收錄（見批示紀錄 #2）
  { id: 'liveJoin', route: '/app/live/join', auth: 'student' },
  {
    id: 'liveQuestion',
    route: '/app/live/:sessionId',
    auth: 'student',
    setup: 'live-open-question',
  },
  {
    id: 'liveFeedback',
    route: '/app/live/:sessionId',
    auth: 'student',
    setup: 'live-after-answer',
  },
  {
    id: 'liveFull',
    route: '/app/live/:sessionId',
    auth: 'student',
    setup: 'live-fullscreen-result',
  },
  {
    id: 'loading',
    route: '/app',
    auth: 'student',
    setup: 'throttle-first-paint',
  },
  { id: 'unauthorized', route: '/unauthorized', auth: 'student' },
  { id: 'tDash', route: '/teacher', auth: 'teacher' },
  { id: 'tLive', route: '/teacher/live', auth: 'teacher' },
  {
    id: 'tHost',
    route: '/teacher/live/:sessionId',
    auth: 'teacher',
    setup: 'live-hosting',
  },
  {
    id: 'tPresenter',
    route: '/teacher/live/:sessionId?presenter=1',
    auth: 'teacher',
    setup: 'live-hosting',
  },
  {
    id: 'tPresenterChart',
    route: '/teacher/live/:sessionId?presenter=1',
    auth: 'teacher',
    setup: 'live-close-question',
  },
  {
    id: 'tPresenterPodium',
    route: '/teacher/live/:sessionId?presenter=1',
    auth: 'teacher',
    setup: 'live-final',
  },
  {
    id: 'tReport',
    route: '/teacher/live/:sessionId/report',
    auth: 'teacher',
    setup: 'live-final',
  },
  { id: 'tContent', route: '/teacher/content', auth: 'teacher' },
  { id: 'tAnalytics', route: '/teacher/analytics', auth: 'teacher' },
  { id: 'tClasses', route: '/teacher/classes', auth: 'teacher' },
  {
    id: 'tClassDetail',
    route: '/teacher/classes/:classroomId',
    auth: 'teacher',
  },
  {
    id: 'tStudentProgress',
    route: '/teacher/classes/:classroomId/members/:memberRef',
    auth: 'teacher',
  },
];
export const WIDTHS = [
  { name: '1280', viewport: { width: 1280, height: 900 } },
  { name: '393', viewport: { width: 393, height: 852 } },
];
