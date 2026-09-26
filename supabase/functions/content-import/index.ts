import { createClient } from 'npm:@supabase/supabase-js@2.110.2';

import { readRuntimeSupabaseApiKeys } from '../_shared/api-keys.ts';
import {
  corsHeaders,
  jsonResponse as baseJsonResponse,
} from '../_shared/cors.ts';
import {
  ContentImportPackageError,
  parseTrustedContentPackage,
} from './parser.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
let publishableKey = '';
let secretKey = '';
let credentialsInvalid = false;
try {
  ({ publishableKey, secretKey } = readRuntimeSupabaseApiKeys((name) =>
    Deno.env.get(name),
  ));
} catch {
  credentialsInvalid = true;
}

const jsonResponse = (status: number, body: unknown): Response => {
  const response = baseJsonResponse(status, body);
  response.headers.set('Cache-Control', 'no-store, private');
  return response;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const asInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

const decodeJwtPayload = (jwt: string): Record<string, unknown> => {
  try {
    const [, payload = ''] = jwt.split('.');
    return (
      asRecord(
        JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))),
      ) ?? {}
    );
  } catch {
    return {};
  }
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const input = Uint8Array.from(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', input.buffer),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (credentialsInvalid)
    return jsonResponse(503, { error: 'CONTENT_IMPORT_UNAVAILABLE' });
  if (request.method !== 'POST')
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });

  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/iu, '');
  if (jwt === '')
    return jsonResponse(401, { error: 'STALE_PRIVILEGED_SESSION' });
  const user = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const service = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  });
  const authResult = await user.auth.getUser(jwt);
  if (authResult.error || !authResult.data.user)
    return jsonResponse(401, { error: 'STALE_PRIVILEGED_SESSION' });
  const actorUserId = authResult.data.user.id;
  const authSessionId = asString(decodeJwtPayload(jwt).session_id);
  if (authSessionId === '')
    return jsonResponse(401, { error: 'STALE_PRIVILEGED_SESSION' });

  const body = asRecord(await request.json().catch(() => null));
  const action = asString(body?.action);
  const requestId = asString(body?.requestId);
  if (body === null || action === '' || !uuidPattern.test(requestId))
    return jsonResponse(400, { error: 'INVALID_JSON' });

  if (action === 'begin') {
    const sourceBytes = asInteger(body.sourceBytes);
    const result = await user.rpc('admin_begin_content_import_upload', {
      p_request_id: requestId,
      p_source_bytes: sourceBytes,
      p_source_filename: asString(body.sourceFilename),
      p_source_mime_type: asString(body.sourceMimeType),
    });
    const begin = asRecord(result.data);
    if (result.error || begin?.outcome !== 'ok')
      return jsonResponse(
        result.error ? 503 : 403,
        result.data ?? {
          error: 'CONTENT_IMPORT_UNAVAILABLE',
        },
      );
    const objectPath = asString(begin.object_path);
    const signed = await service.storage
      .from('content-import-quarantine')
      .createSignedUploadUrl(objectPath, { upsert: false });
    if (signed.error || !signed.data?.token)
      return jsonResponse(503, { error: 'CONTENT_IMPORT_UNAVAILABLE' });
    return jsonResponse(200, {
      action: 'begin',
      bucket: 'content-import-quarantine',
      expires_at: begin.expires_at,
      object_path: objectPath,
      outcome: 'ok',
      run_id: begin.run_id,
      token: signed.data.token,
    });
  }

  if (action === 'commit') {
    const result = await user.rpc('admin_commit_content_import_v2', {
      p_confirm_warnings: body.confirmWarnings === true,
      p_request_id: requestId,
      p_run_id: asString(body.runId),
    });
    if (result.error || result.data === null)
      return jsonResponse(503, { error: 'CONTENT_IMPORT_UNAVAILABLE' });
    const payload = asRecord(result.data);
    return jsonResponse(payload?.outcome === 'ok' ? 200 : 409, result.data);
  }

  if (action !== 'preview') return jsonResponse(400, { error: 'INVALID_JSON' });
  const runId = asString(body.runId);
  if (!uuidPattern.test(runId))
    return jsonResponse(400, { error: 'INVALID_JSON' });
  const claimResult = await user.rpc('admin_claim_content_import_upload', {
    p_request_id: requestId,
    p_run_id: runId,
  });
  const claim = asRecord(claimResult.data);
  if (claimResult.error || claim?.outcome !== 'ok')
    return jsonResponse(
      claimResult.error ? 503 : 409,
      claimResult.data ?? {
        error: 'CONTENT_IMPORT_UNAVAILABLE',
      },
    );
  if (
    asString(claim.actor_user_id) !== actorUserId ||
    asString(claim.auth_session_id) !== authSessionId
  )
    return jsonResponse(503, { error: 'CONTENT_IMPORT_UNAVAILABLE' });
  const objectPath = asString(claim.object_path);
  const downloaded = await service.storage
    .from('content-import-quarantine')
    .download(objectPath);
  let finalStatus: 'consumed' | 'failed' = 'failed';
  try {
    if (downloaded.error || !downloaded.data)
      throw new ContentImportPackageError('IMPORT_PACKAGE_NOT_FOUND');
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    if (bytes.byteLength !== asInteger(claim.source_bytes))
      throw new ContentImportPackageError('IMPORT_INTEGRITY_FAILED');
    const parsed = parseTrustedContentPackage(
      bytes,
      asString(claim.source_filename),
    );
    const manifestMap = asRecord(body.mediaManifestMap) ?? {};
    const mappings = await Promise.all(
      parsed.media.map(async (media) => {
        const assetId = asString(manifestMap[media.path]);
        if (!uuidPattern.test(assetId))
          throw new ContentImportPackageError('IMPORT_MEDIA_INVALID');
        const reference = parsed.items
          .flatMap((item) => {
            const payload = asRecord(item.payload);
            return Array.isArray(payload?.media) ? payload.media : [];
          })
          .map(asRecord)
          .find((value) => asString(value?.import_path) === media.path);
        return {
          asset_id: assetId,
          semantic_role: asString(reference?.semantic_role),
          source_sha256: await sha256Hex(media.bytes),
        };
      }),
    );
    const verified = await service.rpc('svc_verify_content_import_media', {
      p_mappings: mappings,
    });
    if (verified.error || verified.data !== true)
      throw new ContentImportPackageError('IMPORT_MEDIA_INVALID');
    const normalizedItems = parsed.items.map((item) => {
      const payload = asRecord(item.payload) ?? {};
      const media = Array.isArray(payload.media)
        ? payload.media.map((value) => {
            const reference = asRecord(value) ?? {};
            return {
              alt_text: reference.alt_text,
              manifest_id: manifestMap[asString(reference.import_path)],
              semantic_role: reference.semantic_role,
              sort_order: reference.sort_order,
            };
          })
        : undefined;
      return {
        ...item,
        payload: {
          ...payload,
          ...(media === undefined ? {} : { media }),
        },
      };
    });
    const sourceSha256 = await sha256Hex(bytes);
    const preview = await user.rpc('admin_preview_content_import_v2', {
      p_items: normalizedItems,
      p_request_id: requestId,
      p_source_filename: asString(claim.source_filename),
      p_source_sha256: sourceSha256,
    });
    const previewPayload = asRecord(preview.data);
    if (
      preview.error ||
      previewPayload === null ||
      previewPayload.outcome !== 'ok'
    )
      throw new ContentImportPackageError('IMPORT_VALIDATION_FAILED');
    finalStatus = 'consumed';
    return jsonResponse(200, previewPayload);
  } catch (error) {
    return jsonResponse(422, {
      error:
        error instanceof ContentImportPackageError
          ? error.code
          : 'CONTENT_IMPORT_UNAVAILABLE',
    });
  } finally {
    const cleanup = await service.storage
      .from('content-import-quarantine')
      .remove([objectPath]);
    if (cleanup.error) {
      console.error(
        JSON.stringify({
          event: 'content_import_cleanup_failed',
          run_id: runId,
        }),
      );
    }
    const finished = await service.rpc('svc_finish_content_import_upload', {
      p_actor_user_id: actorUserId,
      p_auth_session_id: authSessionId,
      p_run_id: runId,
      p_status: finalStatus,
    });
    if (finished.error) {
      console.error(
        JSON.stringify({
          event: 'content_import_finish_failed',
          run_id: runId,
        }),
      );
    }
  }
});
