export declare const LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL: string;

export type LearningFixtureIdentityKind =
  'student' | 'owner-teacher' | 'non-owner-teacher';

export interface LearningFixtureCredentialPair {
  email: string;
  password: string;
}

export interface LearningFixtureCredentialBundle {
  nonOwnerTeacher: LearningFixtureCredentialPair;
  ownerTeacher: LearningFixtureCredentialPair;
  student: LearningFixtureCredentialPair;
}

export interface ProvisionerEnvironment {
  credentialFilePath: string;
  gitSha: string;
  projectRef: string;
  runAttempt: string;
  runId: string;
  secretKey: string;
  url: string;
}

export interface FixtureAppMetadata {
  colorplay_fixture_environment: string;
  colorplay_fixture_git_sha: string;
  colorplay_fixture_identity: LearningFixtureIdentityKind;
  colorplay_fixture_kind: string;
  colorplay_fixture_run_attempt: string;
  colorplay_fixture_run_id: string;
}

export interface FixtureProfileVerification {
  loginAccount: string | null;
  profiles: number;
  role: string | null;
  walletTokenBalance: number | null;
  wallets: number;
}

export interface ProvisionPorts {
  auth: {
    createIdentity(input: {
      appMetadata: FixtureAppMetadata;
      email: string;
      password: string;
    }): Promise<string>;
  };
  database: {
    provisionProfile(
      userId: string,
      input: { loginAccount: string; role: string },
    ): Promise<number>;
    verifyFixtureProfile(userId: string): Promise<FixtureProfileVerification>;
  };
  filesystem: {
    writeCredentialFile(
      path: string,
      credentials: LearningFixtureCredentialBundle,
    ): Promise<void>;
  };
}

export declare function validateProvisionerEnvironment(
  environment: NodeJS.ProcessEnv,
): ProvisionerEnvironment;

export declare function deriveRunScopedEmail(
  runId: string,
  runAttempt: string,
  kind: LearningFixtureIdentityKind,
): string;

export declare function generateSecurePassword(): string;

export declare function deriveRunScopedLoginAccount(
  runId: string,
  runAttempt: string,
  kind: LearningFixtureIdentityKind,
): string;

export declare function buildFixtureAppMetadata(input: {
  gitSha: string;
  kind: LearningFixtureIdentityKind;
  runAttempt: string;
  runId: string;
}): FixtureAppMetadata;

export declare function isLearningFixtureCredentialPair(
  value: unknown,
): value is LearningFixtureCredentialPair;

export declare function isLearningFixtureCredentialBundle(
  value: unknown,
): value is LearningFixtureCredentialBundle;

export declare function readRunScopedLearningFixtureCredentialFile(
  path: string,
  fsPort?: {
    readFile: (path: string, encoding: 'utf8') => Promise<string>;
    stat: (path: string) => Promise<{ mode: number }>;
  },
): Promise<LearningFixtureCredentialBundle>;

export declare function runProvisionWorkflow(input: {
  environment: ProvisionerEnvironment;
  ports: ProvisionPorts;
}): Promise<{
  nonOwnerTeacherEmail: string;
  ownerTeacherEmail: string;
  studentEmail: string;
}>;

export declare function sanitizeProvisionFailure(error: unknown): string;
