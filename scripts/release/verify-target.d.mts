export type HostedMutationRecord = Readonly<{
  schema_version: 1;
  action: string;
  exact_target: string;
  frozen_git_sha: string;
  observed_current_state: string;
  proposed_change: string;
  rollback_or_recovery: string;
  owner_authorization_id: string;
  observed_at_utc: string;
}>;

export type VerifyHostedMutationOptions = Readonly<{
  expectedAction: string;
  expectedFrozenGitSha: string;
  expectedTarget: string;
  now?: Date;
}>;

export function verifyHostedMutationRecord(
  value: unknown,
  options: VerifyHostedMutationOptions,
): HostedMutationRecord;
