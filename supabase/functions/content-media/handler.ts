import { corsHeaders } from '../_shared/cors.ts';
import type {
  MediaHandlerDependencies,
  MediaProcessed,
} from './handler-ports.ts';
import {
  asRecord,
  asString,
  asInteger,
  decodeJwtPayload,
  extensionFor,
  isDenied,
  cleanupExact,
  jsonResponse,
  pendingResponse,
  verifiedResponse,
} from './handler-support.ts';
const variantRows = (
  assetId: string,
  processed: MediaProcessed,
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

export function createContentMediaHandler(
  dependencies: MediaHandlerDependencies,
) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method === 'OPTIONS')
        return new Response('ok', { headers: corsHeaders });
      if (dependencies.credentialsInvalid)
        return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
      if (request.method !== 'POST')
        return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });

      const authorization = request.headers.get('Authorization') ?? '';
      const jwt = authorization.replace(/^Bearer\s+/i, '');
      if (jwt === '')
        return jsonResponse(401, { error: 'STALE_PRIVILEGED_SESSION' });
      const { user, service } = dependencies.clients(authorization);
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
        if (
          aborted?.outcome !== 'ok' ||
          aborted.run_id !== runId ||
          path === ''
        )
          return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
        const cleaned = await cleanupExact(
          service,
          'content-media-quarantine',
          [path],
        );
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
          if (
            signed.error ||
            !signed.data ||
            signed.data.length !== variants.length
          )
            return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
          const signedData = signed.data;
          resolvedAssets.push({
            asset_id: asset.asset_id,
            height: asset.height,
            variants: variants.map((variantValue, index) => {
              const variant = asRecord(variantValue) ?? {};
              const signedVariant = signedData[index];
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

      if (action !== 'process')
        return jsonResponse(400, { error: 'INVALID_JSON' });

      const claimResult = await user.rpc('admin_claim_content_media_upload', {
        p_request_id: requestId,
        p_run_id: runId,
      });
      if (claimResult.error || claimResult.data === null)
        return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
      if (isDenied(claimResult.data))
        return jsonResponse(409, claimResult.data);
      const claim = asRecord(claimResult.data);
      if (claim?.action === 'verified') {
        return (
          verifiedResponse(claim, runId, requestId) ??
          pendingResponse(runId, requestId)
        );
      }
      const sourcePath = asString(claim?.object_path);
      const assetId = asString(claim?.asset_id);
      const sourceMimeType = asString(claim?.source_mime_type);
      const expectedBytes = asInteger(claim?.source_bytes);
      const semanticRole = asString(claim?.semantic_role);
      if (
        claim?.outcome !== 'ok' ||
        claim.action !== 'claim' ||
        claim.run_id !== runId ||
        claim.request_id !== requestId ||
        asString(claim.actor_user_id) !== actorUserId ||
        asString(claim.auth_session_id) !== authSessionId ||
        sourcePath === '' ||
        assetId === '' ||
        expectedBytes === null ||
        !['standard', 'color_critical'].includes(semanticRole)
      ) {
        return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
      }

      // A processing replay owns no work or objects. Only the atomic first claim may process.
      if (claim.replayed !== false) return pendingResponse(runId, requestId);
      const finalPaths: string[] = [];
      let failureCode = 'CONTENT_MEDIA_PROCESSING_FAILED';
      try {
        const downloaded = await service.storage
          .from('content-media-quarantine')
          .download(sourcePath);
        if (downloaded.error || !downloaded.data) {
          failureCode = 'CONTENT_MEDIA_STORAGE_FAILED';
          throw new Error(failureCode);
        }
        const sourceBytes = new Uint8Array(await downloaded.data.arrayBuffer());
        if (sourceBytes.byteLength !== expectedBytes) {
          failureCode = 'CONTENT_MEDIA_FILE_INVALID';
          throw new Error(failureCode);
        }
        const processed = await dependencies.process({
          bytes: sourceBytes,
          declaredMimeType: sourceMimeType,
          semanticRole: semanticRole as 'standard' | 'color_critical',
        });
        const masterPath = `masters/${assetId}/${processed.sourceSha256}.${extensionFor(sourceMimeType)}`;
        const rows = variantRows(assetId, processed);
        finalPaths.push(masterPath);
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
        for (const [index, variant] of processed.variants.entries()) {
          const path = asString(rows[index]?.object_path);
          finalPaths.push(path);
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
        }
        const completed = await service.rpc(
          'svc_complete_content_media_upload',
          {
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
          },
        );
        const receiptResponse = completed.error
          ? null
          : verifiedResponse(completed.data, runId, requestId);
        const completedReceipt = asRecord(asRecord(completed.data)?.receipt);
        if (
          !receiptResponse ||
          completedReceipt?.asset_id !== assetId ||
          completedReceipt.semantic_role !== semanticRole
        ) {
          failureCode = 'CONTENT_MEDIA_INTEGRITY_FAILED';
          throw new Error(failureCode);
        }
        // A post-commit cleanup failure cannot enter rollback or invalidate this receipt.
        await cleanupExact(service, 'content-media-quarantine', [sourcePath]);
        return receiptResponse;
      } catch (error) {
        failureCode = dependencies.processorFailure(error) ?? failureCode;
        let fenced = false;
        try {
          const failed = await service.rpc('svc_fail_content_media_upload', {
            p_actor_user_id: actorUserId,
            p_auth_session_id: authSessionId,
            p_failure_code: failureCode,
            p_run_id: runId,
          });
          const result = asRecord(failed.data);
          fenced =
            !failed.error &&
            result?.outcome === 'ok' &&
            result.run_id === runId;
        } catch {
          /* An unknown fence never authorizes deletion. */
        }
        if (!fenced) {
          try {
            // This guarded RPC may update processing.updated_at; it is not a pure status read.
            const recovered = await user.rpc(
              'admin_claim_content_media_upload',
              {
                p_request_id: requestId,
                p_run_id: runId,
              },
            );
            const result = asRecord(recovered.data);
            if (!recovered.error && result?.action === 'verified') {
              const receiptResponse = verifiedResponse(
                result,
                runId,
                requestId,
              );
              if (receiptResponse) {
                // This original worker knows its exact quarantine path; initial replays do not.
                await cleanupExact(service, 'content-media-quarantine', [
                  sourcePath,
                ]);
                return receiptResponse;
              }
              return pendingResponse(runId, requestId);
            }
          } catch {
            /* Preserve uncertainty and objects. */
          }
          return pendingResponse(runId, requestId);
        }
        await cleanupExact(service, 'content-media', finalPaths);
        await cleanupExact(service, 'content-media-quarantine', [sourcePath]);
        return jsonResponse(422, {
          code: failureCode,
          message: '圖片未通過可信媒體處理。',
          outcome: 'denied',
          request_id: requestId,
          retryable: false,
        });
      }
    } catch {
      return jsonResponse(503, { error: 'CONTENT_MEDIA_UNAVAILABLE' });
    }
  };
}
