import { createClient } from 'npm:@supabase/supabase-js@2';

import { readRuntimeSupabaseApiKeys } from '../_shared/api-keys.ts';
import { hashClassroomJoinIp } from '../_shared/classroom-join-rate-limit.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const { publishableKey, secretKey } = readRuntimeSupabaseApiKeys((name) =>
  Deno.env.get(name),
);

const failure = (status: number, error: string) =>
  jsonResponse(status, { error });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED');

  const authorization = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userResult, error: userError } =
    await userClient.auth.getUser();
  const user = userResult?.user;
  if (userError || !user) return failure(401, 'AUTH_REQUIRED');

  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const joinCode = payload?.joinCode;
  const requestId = payload?.requestId;
  if (
    typeof joinCode !== 'string' ||
    typeof requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      requestId,
    )
  ) {
    return failure(400, 'INVALID_JOIN_REQUEST');
  }

  const service = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  });
  const ipHash = await hashClassroomJoinIp(request, secretKey);
  const { data, error } = await service.rpc('svc_join_classroom', {
    p_actor_id: user.id,
    p_ip_hash: ipHash,
    p_join_code: joinCode,
    p_request_id: requestId,
  });
  if (error || !isRecord(data)) {
    return failure(503, 'CLASSROOM_JOIN_FAILED');
  }

  if (data.outcome === 'rate_limited') {
    const retryAfterSeconds =
      typeof data.retry_after_seconds === 'number'
        ? Math.max(1, Math.ceil(data.retry_after_seconds))
        : 600;
    return new Response(
      JSON.stringify({
        error: 'CLASSROOM_JOIN_RATE_LIMITED',
        retryAfterSeconds,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSeconds),
        },
      },
    );
  }
  if (data.outcome === 'invalid') {
    return failure(400, 'INVALID_CLASSROOM_CODE');
  }
  if (data.outcome === 'denied') {
    return failure(403, String(data.error ?? 'CLASSROOM_NOT_AVAILABLE'));
  }
  if (data.outcome !== 'ok' || !Array.isArray(data.receipt)) {
    return failure(503, 'CLASSROOM_JOIN_FAILED');
  }
  return jsonResponse(200, data.receipt);
});
