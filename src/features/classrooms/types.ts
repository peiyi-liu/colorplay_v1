export type StudentClassroom = Readonly<{
  classroomId: string;
  classroomName: string;
  joinedAt: string;
  membershipStatus: 'active';
}>;

export type OwnedClassroom = Readonly<{
  classroomId: string;
  classroomName: string;
  classroomStatus: 'active' | 'archived';
  createdAt: string;
  /** 固定班級加入碼（owner 2026-07-27 裁定常駐可見；舊測試資料可能為 null）。 */
  joinCode: string | null;
  joinCodeVersion: number;
  memberCount: number;
}>;

export type ClassroomMember = Readonly<{
  activeBlookId: string | null;
  displayName: string;
  fullName: string | null;
  joinedAt: string;
  loginAccount: string | null;
  memberRef: string;
  membershipStatus: 'active' | 'inactive';
}>;

export type StudentChapterProgress = Readonly<{
  accuracy: number | null;
  chapterId: string;
  chapterTitle: string;
  coverage: number | null;
  mastery: number | null;
  reviewCompleted: number;
  reviewTotal: number | null;
  status: 'developing' | 'learning' | 'mastered' | 'not_started';
}>;

export type StudentOpenMistake = Readonly<{
  prompt: string;
  subtopicCode: string;
  subtopicTitle: string;
  wrongCount: number;
}>;

export type StudentProgressSnapshot = Readonly<{
  chapters: readonly StudentChapterProgress[];
  identity: Readonly<{
    displayName: string;
    fullName: string | null;
    joinedAt: string;
    loginAccount: string | null;
    membershipStatus: 'active' | 'inactive';
  }>;
  mistakes: readonly StudentOpenMistake[];
  stats: Readonly<{
    avgAccuracy: number | null;
    classRank: number | null;
    classXp: number;
    openMistakeCount: number;
  }>;
}>;

export type ClassroomCodeReceipt = Readonly<{
  classroomId: string;
  classroomName: string | null;
  joinCode: string;
  joinCodeVersion: number;
}>;

export type JoinedClassroom = Readonly<{
  classroomId: string;
  classroomName: string;
  joinedAt: string;
  membershipStatus: 'active';
}>;

export type ClassroomRepository = Readonly<{
  createClassroom(input: { name: string }): Promise<ClassroomCodeReceipt>;
  getOwnedMembers(classroomId: string): Promise<readonly ClassroomMember[]>;
  getStudentProgress(
    classroomId: string,
    memberRef: string,
  ): Promise<StudentProgressSnapshot>;
  joinClassroom(input: {
    joinCode: string;
    requestId: string;
  }): Promise<JoinedClassroom>;
  listMine(): Promise<readonly StudentClassroom[]>;
  listOwned(): Promise<readonly OwnedClassroom[]>;
  rotateJoinCode(classroomId: string): Promise<ClassroomCodeReceipt>;
}>;

export type ClassroomRepositoryErrorCode =
  | 'AMBIGUOUS_WRITE'
  | 'AUTH_REQUIRED'
  | 'INVALID_CODE'
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'NOT_AVAILABLE'
  | 'UNAVAILABLE';

export class ClassroomRepositoryError extends Error {
  constructor(public readonly code: ClassroomRepositoryErrorCode) {
    super(code);
    this.name = 'ClassroomRepositoryError';
  }
}
