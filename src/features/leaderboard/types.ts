export type LeaderboardEntry = Readonly<{
  activeBlookId: string | null;
  displayName: string;
  frameGradientEnd: string | null;
  frameGradientStart: string | null;
  isSelf: boolean;
  rank: number;
  totalXp: number;
}>;

export type ClassroomLeaderboard = Readonly<{
  classroomId: string;
  classroomName: string;
  generatedAt: string;
  memberCount: number;
  selfEntry: LeaderboardEntry | null;
  topEntries: readonly LeaderboardEntry[];
}>;

export type LeaderboardRepository = Readonly<{
  getClassroomLeaderboard(classroomId: string): Promise<ClassroomLeaderboard>;
}>;

export type LeaderboardRepositoryErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'NOT_AVAILABLE'
  | 'UNAVAILABLE';

export class LeaderboardRepositoryError extends Error {
  constructor(public readonly code: LeaderboardRepositoryErrorCode) {
    super(code);
    this.name = 'LeaderboardRepositoryError';
  }
}

const databaseUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const isDatabaseUuid = (value: string): boolean =>
  databaseUuidPattern.test(value);
