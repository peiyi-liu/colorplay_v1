import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { z } from 'zod';
import { scopedFetch, type FunctionalSecrets } from './local-runtime';
import { fail, safely, type FunctionalScope } from './config';
export const adminReadNames = [
  'admin_health_summary',
  'admin_list_teachers',
  'admin_list_content_catalog',
  'admin_list_content_scope',
  'admin_read_content_editor_state',
  'admin_list_resource',
  'admin_query_audit',
  'admin_platform_health',
  'admin_list_admins',
  'admin_list_invitations',
  'admin_list_sessions',
] as const;
export type AdminReadName = (typeof adminReadNames)[number];
export const adminRead = async (
  client: SupabaseClient<Database>,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
  name: AdminReadName,
  args: Record<string, unknown> = {},
) =>
  safely(async () => {
    if (!adminReadNames.includes(name)) return fail('FUNCTIONAL_SCOPE_INVALID');
    const session = await client.auth.getSession();
    if (session.error || !session.data.session)
      return fail('FUNCTIONAL_AUTH_FAILED');
    const response = await scopedFetch(scope, signal)(
      `${scope.supabaseUrl}/rest/v1/rpc/${name}`,
      {
        method: 'POST',
        headers: {
          apikey: secrets.anonKey,
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      },
    );
    const text = await response.text();
    if (Buffer.byteLength(text) > 1_048_576)
      return fail('FUNCTIONAL_OPERATION_FAILED');
    const body: unknown = JSON.parse(text);
    return { status: response.status, body };
  });
export const assertAdminDenied = (result: {
  status: number;
  body: unknown;
}) => {
  const denied = z
    .object({
      outcome: z.literal('denied'),
      code: z.enum([
        'STALE_PRIVILEGED_SESSION',
        'INSUFFICIENT_MFA',
        'RESOURCE_NOT_ALLOWED',
      ]),
    })
    .safeParse(result.body);
  const pg = z.object({ code: z.literal('42501') }).safeParse(result.body);
  if (
    !(result.status === 200 && denied.success) &&
    !(result.status === 403 && pg.success)
  )
    return fail('FUNCTIONAL_OPERATION_FAILED');
  return {
    status: result.status,
    code: denied.success ? denied.data.code : ('42501' as const),
  };
};
export const adminSensitiveDenial = async (
  client: SupabaseClient<Database>,
  expectedId: string,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
) =>
  safely(async () => {
    const subject = await client.auth.getUser();
    if (subject.error || subject.data.user.id !== expectedId)
      return fail('FUNCTIONAL_AUTH_FAILED');
    return assertAdminDenied(
      await adminRead(client, scope, secrets, signal, 'admin_health_summary'),
    );
  });
