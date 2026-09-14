export declare const LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL: string;

export interface LearningFixtureCredentials {
  email: string;
  password: string;
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

// Mirrors the shape of a real @supabase/postgrest-js response: `error`, when
// present, always carries `message`/`details`/`hint` alongside `code` (see
// PostgrestError). Those three fields are typed here -- as optional, since a
// caller need not supply them -- purely so tests can construct a realistic,
// fully-populated error without a type-widening cast; the implementation
// never reads them.
export interface LoginAccountUpdateResult {
  data: { id: string }[] | null;
  error: {
    code: string;
    details?: string;
    hint?: string;
    message?: string;
  } | null;
  status: number;
}

export interface ProvisionPorts {
  auth: {
    createStudent(input: {
      appMetadata: FixtureAppMetadata;
      email: string;
      password: string;
    }): Promise<string>;
  };
  database: {
    setLoginAccount(userId: string, loginAccount: string): Promise<number>;
    verifyFixtureProfile(userId: string): Promise<FixtureProfileVerification>;
  };
  filesystem: {
    writeCredentialFile(
      path: string,
      credentials: LearningFixtureCredentials,
    ): Promise<void>;
  };
}

export declare function validateProvisionerEnvironment(
  environment: NodeJS.ProcessEnv,
): ProvisionerEnvironment;

export declare function deriveRunScopedEmail(
  runId: string,
  runAttempt: string,
): string;

export declare function generateSecurePassword(): string;

export declare function deriveRunScopedLoginAccount(
  runId: string,
  runAttempt: string,
): string;

export declare function buildFixtureAppMetadata(input: {
  gitSha: string;
  runAttempt: string;
  runId: string;
}): FixtureAppMetadata;

export declare function isLearningFixtureCredentials(
  value: unknown,
): value is LearningFixtureCredentials;

export declare function readRunScopedLearningFixtureCredentialFile(
  path: string,
  fsPort?: {
    readFile: (path: string, encoding: 'utf8') => Promise<string>;
    stat: (path: string) => Promise<{ mode: number }>;
  },
): Promise<LearningFixtureCredentials>;

export declare function classifyLoginAccountUpdateResult(
  result: LoginAccountUpdateResult,
): number;

export declare function runProvisionWorkflow(input: {
  environment: ProvisionerEnvironment;
  ports: ProvisionPorts;
}): Promise<{ email: string }>;

export declare function sanitizeProvisionFailure(error: unknown): string;
