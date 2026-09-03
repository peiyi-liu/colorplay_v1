export type ReleaseRecord = Readonly<{
  schema_version: 1;
  attempt_id: string;
  git_sha: string;
  vercel_deployment_id: string;
  vercel_deployment_url: string;
  production_supabase_ref: string;
  migration_first: string;
  migration_last: string;
  staging_gate_run_url: string;
  production_gate_run_url: string;
  approval_actor: string;
  approval_at_utc: string;
  post_deploy_smoke: 'passed' | 'failed';
  previous_healthy_deployment_id: string;
  created_at_utc: string;
}>;

export function validateReleaseRecord(value: unknown): ReleaseRecord;
