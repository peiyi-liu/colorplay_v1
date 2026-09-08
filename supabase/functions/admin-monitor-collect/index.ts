import { collectPlatformMonitoring } from '../_shared/platform-monitoring-collector.mjs';

// Separate scheduled service endpoint. No browser CORS, no arbitrary targets or query input.
const expectedKey = Deno.env.get('ADMIN_MONITOR_KEY') ?? '';
async function authorized(value: string) {
  if (!expectedKey || !value) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all(
    [value, expectedKey].map((v) =>
      crypto.subtle.digest('SHA-256', encoder.encode(v)),
    ),
  );
  const a = new Uint8Array(left),
    b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++)
    difference |= a[index] ^ b[index];
  return difference === 0;
}
Deno.serve(async (request) => {
  if (
    request.method !== 'POST' ||
    !(await authorized(request.headers.get('x-monitor-key') ?? ''))
  )
    return new Response(null, { status: 403 });
  try {
    const collection = await collectPlatformMonitoring({
      supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      managementToken: Deno.env.get('ADMIN_MONITOR_MANAGEMENT_TOKEN') ?? '',
    });
    if (collection.outcome === 'busy')
      return Response.json(
        {
          outcome: 'busy',
          code: 'MONITOR_COLLECTION_BUSY',
          retry_after_seconds: collection.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(collection.retryAfterSeconds) },
        },
      );
    return Response.json(collection);
  } catch {
    return Response.json(
      { outcome: 'unavailable', code: 'MONITOR_COLLECTION_FAILED' },
      { status: 503 },
    );
  }
});
