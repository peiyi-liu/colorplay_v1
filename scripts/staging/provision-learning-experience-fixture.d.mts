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

export interface ProvisionPorts {
  auth: {
    createStudent(input: {
      appMetadata: FixtureAppMetadata;
      email: string;
      password: string;
    }): Promise<string>;
  };
  database: {
    countProfileAndWallet(userId: string): Promise<{
      profiles: number;
      walletTokenBalance: number | null;
      wallets: number;
    }>;
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

export declare function runProvisionWorkflow(input: {
  environment: ProvisionerEnvironment;
  ports: ProvisionPorts;
}): Promise<{ email: string }>;

export declare function sanitizeProvisionFailure(error: unknown): string;
