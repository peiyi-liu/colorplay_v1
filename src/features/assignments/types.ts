export type AssignmentStatus = 'draft' | 'published' | 'paused' | 'archived';

export type AssignmentActivityType = 'quiz_template' | 'live_activity';

export type AssignmentAttemptStatus =
  'in_progress' | 'completed' | 'expired' | 'abandoned';

export type StudentAssignment = Readonly<{
  assignmentId: string;
  classroomId: string;
  classroomName: string;
  title: string;
  status: 'published' | 'paused';
  availableFrom: string | null;
  deadlineAt: string | null;
  attemptLimit: number | null;
  passingThreshold: number;
  attemptsUsed: number;
  latestAttemptStatus: AssignmentAttemptStatus | null;
  latestPassed: boolean | null;
}>;

export type ClassroomAssignment = Readonly<{
  assignmentId: string;
  title: string;
  activityType: AssignmentActivityType;
  status: AssignmentStatus;
  availableFrom: string | null;
  deadlineAt: string | null;
  attemptLimit: number | null;
  passingThreshold: number;
  targetCount: number;
  completedCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export type CreatedAssignment = Readonly<{
  assignmentId: string;
  classroomId: string;
  title: string;
  activityType: AssignmentActivityType;
  status: 'draft';
  availableFrom: string | null;
  deadlineAt: string | null;
  attemptLimit: number | null;
  passingThreshold: number;
  createdAt: string;
  updatedAt: string;
}>;

export type AssignmentStatusUpdate = Readonly<{
  assignmentId: string;
  status: AssignmentStatus;
  updatedAt: string;
}>;

export type StartedAssignmentAttempt = Readonly<{
  attemptId: string;
  assignmentId: string;
  attemptNumber: number;
  sessionId: string;
}>;

export type CreateAssignmentInput = Readonly<{
  classroomId: string;
  title: string;
  quizTemplateId: string;
  availableFrom: string | null;
  deadlineAt: string | null;
  attemptLimit: number | null;
  passingThreshold: number;
}>;

export type AssignmentRepositoryErrorCode =
  | 'AUTH_REQUIRED'
  | 'NOT_FOUND'
  | 'NOT_PUBLISHED'
  | 'NOT_AVAILABLE_YET'
  | 'DEADLINE_PASSED'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'STATUS_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'VALIDATION'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

export class AssignmentRepositoryError extends Error {
  readonly code: AssignmentRepositoryErrorCode;

  constructor(code: AssignmentRepositoryErrorCode) {
    super(code);
    this.name = 'AssignmentRepositoryError';
    this.code = code;
  }
}

export type AssignmentRepository = Readonly<{
  listMine(): Promise<readonly StudentAssignment[]>;
  listClassroom(classroomId: string): Promise<readonly ClassroomAssignment[]>;
  createAssignment(input: CreateAssignmentInput): Promise<CreatedAssignment>;
  updateStatus(input: {
    assignmentId: string;
    status: AssignmentStatus;
    expectedUpdatedAt: string | null;
  }): Promise<AssignmentStatusUpdate>;
  startAttempt(input: {
    assignmentId: string;
    requestId: string;
  }): Promise<StartedAssignmentAttempt>;
}>;
