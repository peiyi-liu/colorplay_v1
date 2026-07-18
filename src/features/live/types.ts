export type LiveSessionStateName =
  | 'draft'
  | 'lobby'
  | 'question_open'
  | 'question_feedback'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type LiveActivity = Readonly<{
  activityId: string;
  title: string;
  quizTemplateId: string;
  questionTimeLimitSeconds: number;
  status: 'active' | 'archived';
  rulesVersion: string;
  scheduledFor: string | null;
}>;

export type LiveSessionMode = 'individual' | 'team';

export type LiveSessionReceipt = Readonly<{
  sessionId: string;
  state: LiveSessionStateName;
  stateVersion: number;
  joinCode: string;
  joinCodeVersion: number;
  mode: LiveSessionMode;
  teamCount: number | null;
}>;

export type LiveDistribution = Readonly<{
  answeredCount: number;
  options: readonly Readonly<{ optionId: string | null; count: number }>[];
}>;

export type LiveTeamTotal = Readonly<{
  teamNumber: number;
  score: number;
  memberCount: number;
}>;

export type LiveSessionDetail = Readonly<{
  sessionId: string;
  mode: LiveSessionMode;
  completedAt: string | null;
  questions: readonly Readonly<{
    position: number;
    prompt: string;
    answered: number;
    correct: number;
    correctRate: number | null;
    averageResponseMs: number | null;
  }>[];
  ranking: readonly Readonly<{
    rank: number;
    displayName: string;
    score: number;
    teamNumber: number | null;
  }>[];
}>;

export type LiveJoinResult = Readonly<{
  sessionId: string;
  state: LiveSessionStateName;
  stateVersion: number;
}>;

export type LiveQuestionView = Readonly<{
  questionId: string;
  position: number;
  prompt: string;
  publicOptions: readonly Readonly<{
    id: string;
    key: string;
    text: string;
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
  serverTime: string;
  isHost: boolean;
  mode: LiveSessionMode;
  teamCount: number | null;
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
  }): Promise<LiveActivity>;
  listMyActivities(): Promise<readonly LiveActivity[]>;
  createSession(input: {
    activityId: string;
    classroomId: string;
    assignmentId: string | null;
    mode?: LiveSessionMode;
    teamCount?: number | null;
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
  getTeamTotals(sessionId: string): Promise<readonly LiveTeamTotal[]>;
  getSessionDetail(sessionId: string): Promise<LiveSessionDetail>;
  scheduleActivity(
    activityId: string,
    scheduledFor: string | null,
  ): Promise<void>;
}>;
