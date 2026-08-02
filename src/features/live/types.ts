export type LiveSessionStateName =
  | 'draft'
  | 'lobby'
  | 'question_open'
  | 'question_feedback'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type LiveQuestionDisplay = 'screen_only' | 'device';

export type LiveActivity = Readonly<{
  activityId: string;
  title: string;
  quizTemplateId: string;
  questionTimeLimitSeconds: number;
  status: 'active' | 'archived';
  rulesVersion: string;
  questionDisplay: LiveQuestionDisplay;
  sectionId: string | null;
}>;

export type LiveSectionOption = Readonly<{
  sectionId: string;
  title: string;
  quizTemplateId: string;
}>;

export type LiveSessionReceipt = Readonly<{
  sessionId: string;
  state: LiveSessionStateName;
  stateVersion: number;
  joinCode: string;
  joinCodeVersion: number;
}>;

export type LiveDistribution = Readonly<{
  answeredCount: number;
  options: readonly Readonly<{ optionId: string | null; count: number }>[];
}>;

export type LiveParticipantName = Readonly<{ displayName: string }>;

export type LiveStandingEntry = Readonly<{
  rank: number;
  displayName: string;
  score: number;
}>;

export type LiveStandings = Readonly<{
  participantCount: number;
  standings: readonly LiveStandingEntry[];
}>;

export type LiveMatrixAnswer = Readonly<{
  position: number;
  status: 'correct' | 'incorrect' | 'timeout';
  responseMs: number | null;
}>;

export type LiveSessionDetail = Readonly<{
  sessionId: string;
  completedAt: string | null;
  classroomId: string;
  activity: Readonly<{ title: string; quizTemplateId: string }>;
  questions: readonly Readonly<{
    position: number;
    prompt: string;
    answered: number;
    correct: number;
    correctRate: number | null;
    averageResponseMs: number | null;
  }>[];
  participants: readonly Readonly<{
    displayName: string;
    rank: number | null;
    score: number;
    answers: readonly LiveMatrixAnswer[];
  }>[];
  ranking: readonly Readonly<{
    rank: number;
    displayName: string;
    score: number;
  }>[];
}>;

export type LiveJoinResult = Readonly<{
  sessionId: string;
  state: LiveSessionStateName;
  stateVersion: number;
}>;

export type LiveMyStanding = Readonly<{
  rank: number;
  score: number;
  participantCount: number;
  aheadRank: number | null;
  pointsBehind: number | null;
}>;

// In screen_only sessions the server strips the prompt and option text for
// students; only the projector (host) payload carries them.
export type LiveQuestionView = Readonly<{
  questionId: string;
  position: number;
  prompt?: string;
  publicOptions: readonly Readonly<{
    id: string;
    key: string;
    text?: string;
    sortOrder: number;
  }>[];
  openedAt: string | null;
  deadlineAt: string | null;
}>;

export type LiveOptionCount = Readonly<{
  optionId: string | null;
  count: number;
}>;

export type LivePodiumEntry = Readonly<{
  rank: number;
  displayName: string;
  score: number;
}>;

export type LiveSessionState = Readonly<{
  sessionId: string;
  state: LiveSessionStateName;
  stateVersion: number;
  currentPosition: number;
  questionCount: number;
  participantCount: number;
  rulesVersion: string;
  questionDisplay: LiveQuestionDisplay;
  serverTime: string;
  isHost: boolean;
  waitingForNext?: boolean;
  participants?: readonly LiveParticipantName[];
  question?: LiveQuestionView;
  answeredCount?: number;
  myAnswer?: Readonly<{ answered: boolean }>;
  myFeedback?: Readonly<{
    answerStatus: 'correct' | 'incorrect' | 'timeout';
    selectedOptionId: string | null;
    scoreDelta: number;
  }>;
  correctOptionId?: string;
  explanation?: string | null;
  optionCounts?: readonly LiveOptionCount[];
  podium?: readonly LivePodiumEntry[];
  myResult?: Readonly<{ score: number; rank: number | null }>;
  pausedRemainingMs?: number;
}>;

export type LiveRepositoryErrorCode =
  | 'AUTH_REQUIRED'
  | 'NOT_FOUND'
  | 'STATE_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'JOIN_INVALID_CODE'
  | 'JOIN_RATE_LIMITED'
  | 'ANSWER_CLOSED'
  | 'ANSWER_ALREADY_SUBMITTED'
  | 'VALIDATION'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

export class LiveRepositoryError extends Error {
  readonly code: LiveRepositoryErrorCode;

  constructor(code: LiveRepositoryErrorCode) {
    super(code);
    this.name = 'LiveRepositoryError';
    this.code = code;
  }
}

export type LiveRepository = Readonly<{
  createActivity(input: {
    title: string;
    quizTemplateId: string;
    questionTimeLimitSeconds: number;
    questionDisplay?: LiveQuestionDisplay;
    sectionId?: string;
  }): Promise<LiveActivity>;
  listSectionOptions(): Promise<readonly LiveSectionOption[]>;
  listMyActivities(): Promise<readonly LiveActivity[]>;
  createSession(input: {
    activityId: string;
    classroomId: string;
    assignmentId: string | null;
  }): Promise<LiveSessionReceipt>;
  rotateJoinCode(sessionId: string): Promise<{
    joinCode: string;
    joinCodeVersion: number;
  }>;
  join(input: { joinCode: string; requestId: string }): Promise<LiveJoinResult>;
  getState(sessionId: string): Promise<LiveSessionState>;
  startSession(sessionId: string, expectedVersion: number): Promise<void>;
  openQuestion(sessionId: string, expectedVersion: number): Promise<void>;
  advance(sessionId: string, expectedVersion: number): Promise<void>;
  closeQuestion(sessionId: string, expectedVersion: number): Promise<void>;
  finalize(sessionId: string, expectedVersion: number): Promise<void>;
  cancel(sessionId: string, expectedVersion: number): Promise<void>;
  submitAnswer(input: {
    sessionQuestionId: string;
    selectedOptionId: string;
    idempotencyKey: string;
  }): Promise<Readonly<{ streak: number }>>;
  pauseSession(sessionId: string, expectedVersion: number): Promise<void>;
  resumeSession(sessionId: string, expectedVersion: number): Promise<void>;
  getDistribution(sessionId: string): Promise<LiveDistribution>;
  getStandings(sessionId: string): Promise<LiveStandings>;
  getMyStanding(sessionId: string): Promise<LiveMyStanding>;
  getSessionDetail(sessionId: string): Promise<LiveSessionDetail>;
}>;
