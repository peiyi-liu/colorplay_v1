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
  joinCodeVersion: number;
  memberCount: number;
}>;

export type ClassroomMember = Readonly<{
  activeBlookId: string | null;
  displayName: string;
  joinedAt: string;
  membershipStatus: 'active' | 'inactive';
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
