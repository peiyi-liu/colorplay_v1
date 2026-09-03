import type { Page } from '@playwright/test';

export type SmokeResult = Readonly<{
  schema_version: 1;
  environment: 'staging' | 'production';
  target_origin: string;
  checked_at_utc: string;
  dns: 'passed' | 'failed';
  tls: 'passed' | 'failed';
  https_redirect: 'passed' | 'failed';
  home: 'passed' | 'failed';
  login: 'passed' | 'failed';
  assets: 'passed' | 'failed';
  marker: 'passed' | 'failed';
  console_error_count: number;
  required_network_error_count: number;
  result: 'passed' | 'failed';
}>;

export function installReadOnlyGuard(
  page: Page,
): Promise<{ writeRequestCount: number }>;

export function runReadOnlySmoke(input: {
  environment: 'staging' | 'production';
  targetOrigin: string;
  httpOrigin: string | null;
}): Promise<SmokeResult>;
