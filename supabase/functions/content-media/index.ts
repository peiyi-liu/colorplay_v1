import { createClient } from 'npm:@supabase/supabase-js@2.110.2';

import { readRuntimeSupabaseApiKeys } from '../_shared/api-keys.ts';
import {
  corsHeaders,
  jsonResponse as baseJsonResponse,
} from '../_shared/cors.ts';
import {
  ContentMediaProcessorError,
  processContentMedia,
  type ProcessedContentMedia,
} from './processor.ts';

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

const extensionFor = (mimeType: string): string =>
  mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';

const isDenied = (value: unknown): value is Record<string, unknown> =>
  asRecord(value)?.outcome === 'denied';

const safeReceipt = (
  receipt: Record<string, unknown>,
  runId: string,
  requestId: string,
): Record<string, unknown> => {
  const variants = Array.isArray(receipt.variants) ? receipt.variants : [];
  return {
    action: 'process',
    asset: {
      asset_id: receipt.asset_id,
      has_alpha: receipt.has_alpha,
      height: receipt.height,
      manifest_sha256: receipt.manifest_sha256,
      semantic_role: receipt.semantic_role,
      source_sha256: receipt.source_sha256,
      variants: variants.map((value) => {
        const variant = asRecord(value) ?? {};
        return {
          bytes: variant.bytes,
          height: variant.height,
          kind: variant.kind,
          mime_type: variant.mime_type,
          sha256: variant.sha256,
          width: variant.width,
        };
      }),
      width: receipt.width,
    },
    outcome: 'ok',
    request_id: requestId,
    run_id: runId,
  };
};

const cleanupExact = async (
  service: Readonly<{
    storage: Readonly<{
      from: (bucket: string) => Readonly<{
        remove: (paths: string[]) => PromiseLike<Readonly<{ error: unknown }>>;
      }>;
    }>;
  }>,
  bucket: string,
  paths: readonly string[],
): Promise<boolean> => {
  if (paths.length === 0) return true;
  const { error } = await service.storage.from(bucket).remove([...paths]);
  return error === null;
};

const variantRows = (
  assetId: string,
  processed: ProcessedContentMedia,
): Array<Record<string, unknown>> =>
  processed.variants.map((variant) => ({
    bytes: variant.bytes.byteLength,
    height: variant.height,
    kind: variant.kind,
    mime_type: variant.mimeType,
    object_path: `variants/${assetId}/${variant.kind}-${variant.sha256}.webp`,
    quality_mode: variant.qualityMode,
    sha256: variant.sha256,
    structural_similarity_distortion: variant.structuralSimilarityDistortion,
    width: variant.width,
  }));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (credentialsInvalid)
    return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
  if (request.method !== 'POST')
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });

  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
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
  const claims = decodeJwtPayload(jwt);
  const authSessionId = asString(claims.session_id);
  if (authSessionId === '')
    return jsonResponse(401, { error: 'STALE_PRIVILEGED_SESSION' });

  const body = asRecord(await request.json().catch(() => null));
  const action = asString(body?.action);
  const requestId = asString(body?.requestId);
  if (body === null || action === '')
    return jsonResponse(400, { error: 'INVALID_JSON' });

  if (action === 'begin') {
    const sourceBytes = asInteger(body.sourceBytes);
    const result = await user.rpc('admin_begin_content_media_upload', {
      p_request_id: requestId,
      p_semantic_role: asString(body.semanticRole),
      p_source_bytes: sourceBytes,
      p_source_filename: asString(body.sourceFilename),
      p_source_mime_type: asString(body.sourceMimeType),
    });
    if (result.error || result.data === null)
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    if (isDenied(result.data)) return jsonResponse(403, result.data);
    const begin = asRecord(result.data);
    const objectPath = asString(begin?.object_path);
    const runId = asString(begin?.run_id);
    if (begin?.outcome !== 'ok' || objectPath === '' || runId === '')
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    const signed = await service.storage
      .from('content-media-quarantine')
      .createSignedUploadUrl(objectPath, { upsert: false });
    if (signed.error || !signed.data?.token)
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    return jsonResponse(200, {
      action: 'begin',
      bucket: 'content-media-quarantine',
      expires_at: begin.expires_at,
      object_path: objectPath,
      outcome: 'ok',
      run_id: runId,
      token: signed.data.token,
    });
  }

  const runId = asString(body.runId);
  if (action !== 'resolve' && (runId === '' || requestId === ''))
    return jsonResponse(400, { error: 'INVALID_JSON' });

  if (action === 'abort') {
    const result = await user.rpc('admin_abort_content_media_upload', {
      p_request_id: requestId,
      p_run_id: runId,
    });
    if (result.error || result.data === null)
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    if (isDenied(result.data)) return jsonResponse(403, result.data);
    const aborted = asRecord(result.data);
    const path = asString(aborted?.object_path);
    if (path === '')
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    const cleaned = await cleanupExact(service, 'content-media-quarantine', [
      path,
    ]);
    if (!cleaned)
      return jsonResponse(503, { error: 'CONTENT_MEDIA_CLEANUP_FAILED' });
    return jsonResponse(200, {
      action: 'abort',
      outcome: 'ok',
      request_id: requestId,
      run_id: runId,
    });
  }

  if (action === 'resolve') {
    const rawAssetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
    const assetIds = rawAssetIds.map(asString);
    if (
      assetIds.length < 1 ||
      assetIds.length > 6 ||
      assetIds.some((value) => value === '')
    ) {
      return jsonResponse(400, { error: 'INVALID_JSON' });
    }
    const delivery = await service.rpc('svc_content_media_delivery', {
      p_actor_user_id: actorUserId,
      p_asset_ids: assetIds,
    });
    const payload = asRecord(delivery.data);
    if (delivery.error || payload === null)
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    if (payload.outcome !== 'ok')
      return jsonResponse(404, { error: 'CONTENT_MEDIA_NOT_FOUND' });
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    const expiresIn = 15 * 60;
    const resolvedAssets = [];
    for (const value of assets) {
      const asset = asRecord(value);
      const variants = Array.isArray(asset?.variants) ? asset.variants : [];
      const paths = variants.map((variant) =>
        asString(asRecord(variant)?.object_path),
      );
      if (asset === null || paths.some((path) => path === ''))
        return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
      const signed = await service.storage
        .from('content-media')
        .createSignedUrls(paths, expiresIn);
      if (signed.error || signed.data.length !== variants.length)
        return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
      resolvedAssets.push({
        asset_id: asset.asset_id,
        height: asset.height,
        variants: variants.map((variantValue, index) => {
          const variant = asRecord(variantValue) ?? {};
          const signedVariant = signed.data[index];
          return {
            height: variant.height,
            kind: variant.kind,
            mime_type: variant.mime_type,
            url: signedVariant?.error ? null : signedVariant?.signedUrl,
            width: variant.width,
          };
        }),
        width: asset.width,
      });
    }
    return jsonResponse(200, {
      action: 'resolve',
      assets: resolvedAssets,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      outcome: 'ok',
    });
  }

  if (action !== 'process') return jsonResponse(400, { error: 'INVALID_JSON' });

  const claimResult = await user.rpc('admin_claim_content_media_upload', {
    p_request_id: requestId,
    p_run_id: runId,
  });
  if (claimResult.error || claimResult.data === null)
    return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
  if (isDenied(claimResult.data)) return jsonResponse(409, claimResult.data);
  const claim = asRecord(claimResult.data);
  if (claim?.action === 'verified') {
    const receipt = asRecord(claim.receipt);
    if (receipt === null)
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    return jsonResponse(200, safeReceipt(receipt, runId, requestId));
  }
  const sourcePath = asString(claim?.object_path);
  const assetId = asString(claim?.asset_id);
  const sourceMimeType = asString(claim?.source_mime_type);
  const expectedBytes = asInteger(claim?.source_bytes);
  const semanticRole = asString(claim?.semantic_role);
  if (
    claim?.action !== 'claim' ||
    asString(claim.actor_user_id) !== actorUserId ||
    asString(claim.auth_session_id) !== authSessionId ||
    sourcePath === '' ||
    assetId === '' ||
    expectedBytes === null ||
    !['standard', 'color_critical'].includes(semanticRole)
  ) {
    return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
  }

  const downloaded = await service.storage
    .from('content-media-quarantine')
    .download(sourcePath);
  if (downloaded.error || !downloaded.data) {
    await service.rpc('svc_fail_content_media_upload', {
      p_actor_user_id: actorUserId,
      p_auth_session_id: authSessionId,
      p_failure_code: 'CONTENT_MEDIA_STORAGE_FAILED',
      p_run_id: runId,
    });
    return jsonResponse(422, { error: 'CONTENT_MEDIA_NOT_FOUND' });
  }

  const sourceBytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const finalPaths: string[] = [];
  let failureCode = 'CONTENT_MEDIA_PROCESSING_FAILED';
  try {
    if (sourceBytes.byteLength !== expectedBytes)
      throw new ContentMediaProcessorError('CONTENT_MEDIA_FILE_INVALID');
    const processed = await processContentMedia({
      bytes: sourceBytes,
      declaredMimeType: sourceMimeType,
      semanticRole: semanticRole as 'standard' | 'color_critical',
    });
    const masterPath = `masters/${assetId}/${processed.sourceSha256}.${extensionFor(sourceMimeType)}`;
    const rows = variantRows(assetId, processed);
    if (claim.replayed === true) {
      await cleanupExact(service, 'content-media', [
        masterPath,
        ...rows.map((row) => asString(row.object_path)),
      ]);
    }
    const masterUpload = await service.storage
      .from('content-media')
      .upload(masterPath, sourceBytes, {
        cacheControl: '31536000',
        contentType: sourceMimeType,
        upsert: false,
      });
    if (masterUpload.error) {
      failureCode = 'CONTENT_MEDIA_STORAGE_FAILED';
      throw masterUpload.error;
    }
    finalPaths.push(masterPath);
    for (const [index, variant] of processed.variants.entries()) {
      const path = asString(rows[index]?.object_path);
      const upload = await service.storage
        .from('content-media')
        .upload(path, variant.bytes, {
          cacheControl: '31536000',
          contentType: 'image/webp',
          upsert: false,
        });
      if (upload.error) {
        failureCode = 'CONTENT_MEDIA_STORAGE_FAILED';
        throw upload.error;
      }
      finalPaths.push(path);
    }
    const completed = await service.rpc('svc_complete_content_media_upload', {
      p_actor_user_id: actorUserId,
      p_auth_session_id: authSessionId,
      p_has_alpha: processed.hasAlpha,
      p_height: processed.height,
      p_manifest_sha256: processed.manifestSha256,
      p_master_object_path: masterPath,
      p_pixel_semantic_sha256: processed.pixelSemanticSha256,
      p_processor_version: processed.processorVersion,
      p_run_id: runId,
      p_source_sha256: processed.sourceSha256,
      p_variants: rows,
      p_width: processed.width,
    });
    const completion = asRecord(completed.data);
    if (completed.error || completion?.outcome !== 'ok') {
      failureCode = 'CONTENT_MEDIA_INTEGRITY_FAILED';
      throw completed.error ?? new Error('CONTENT_MEDIA_INTEGRITY_FAILED');
    }
    const quarantineCleaned = await cleanupExact(
      service,
      'content-media-quarantine',
      [sourcePath],
    );
    if (!quarantineCleaned) {
      console.error(
        JSON.stringify({
          event: 'content_media_cleanup_failed',
          run_id: runId,
        }),
      );
    }
    const receipt = asRecord(completion.receipt);
    if (receipt === null)
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    return jsonResponse(200, safeReceipt(receipt, runId, requestId));
  } catch (error) {
    if (error instanceof ContentMediaProcessorError) failureCode = error.code;
    await cleanupExact(service, 'content-media', finalPaths);
    await cleanupExact(service, 'content-media-quarantine', [sourcePath]);
    await service.rpc('svc_fail_content_media_upload', {
      p_actor_user_id: actorUserId,
      p_auth_session_id: authSessionId,
      p_failure_code: failureCode,
      p_run_id: runId,
    });
    return jsonResponse(422, {
      code: failureCode,
      message: '圖片未通過可信媒體處理。',
      outcome: 'denied',
      request_id: requestId,
      retryable: false,
    });
  }
});
