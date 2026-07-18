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
}>;

export type LiveSessionReceipt = Readonly<{
  sessionId: string;
  state: LiveSessionStateName;
  stateVersion: number;
  joinCode: string;
  joinCodeVersion: number;
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
  }): Promise<void>;
}>;
