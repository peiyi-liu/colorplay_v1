import { jsonResponse as baseJsonResponse } from '../_shared/cors.ts';
import type { MediaService } from './handler-ports.ts';
export const jsonResponse = (status: number, body: unknown): Response => {
  const response = baseJsonResponse(status, body);
  response.headers.set('Cache-Control', 'no-store, private');
  return response;
};

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
export const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';
export const asInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

export const decodeJwtPayload = (jwt: string): Record<string, unknown> => {
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

export const extensionFor = (mimeType: string): string =>
  mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';

export const isDenied = (value: unknown): value is Record<string, unknown> =>
  asRecord(value)?.outcome === 'denied';

export const safeReceipt = (
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

export const cleanupExact = async (
  service: MediaService,
  bucket: string,
  paths: readonly string[],
): Promise<boolean> => {
  if (paths.length === 0) return true;
  let confirmed = false;
  try {
    const { error } = await service.storage.from(bucket).remove([...paths]);
    confirmed = error === null;
  } catch {
    /* The removed count is unknown after a failed/lost reply. */
  }
  if (!confirmed)
    console.error(
      JSON.stringify({
        event: 'content_media_cleanup_unconfirmed',
        bucket: bucket === 'content-media' ? 'final' : 'quarantine',
        attempted_path_count: paths.length,
        removed_path_count: null,
      }),
    );
  return confirmed;
};

export const pendingResponse = (runId: string, requestId: string): Response =>
  jsonResponse(202, {
    action: 'process',
    outcome: 'pending',
    code: 'CONTENT_MEDIA_PENDING',
    run_id: runId,
    request_id: requestId,
  });

const positive = (value: unknown, max = 4096): boolean =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= max;
const hash = (value: unknown): boolean =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const uuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const verifiedResponse = (
  value: unknown,
  runId: string,
  requestId: string,
): Response | null => {
  const result = asRecord(value);
  const receipt = asRecord(result?.receipt);
  if (
    result?.outcome !== 'ok' ||
    result.run_id !== runId ||
    result.request_id !== requestId ||
    !receipt ||
    !uuid(receipt.asset_id) ||
    !hash(receipt.source_sha256) ||
    !hash(receipt.manifest_sha256) ||
    !positive(receipt.width) ||
    !positive(receipt.height) ||
    typeof receipt.has_alpha !== 'boolean' ||
    !['standard', 'color_critical'].includes(asString(receipt.semantic_role)) ||
    !Array.isArray(receipt.variants)
  )
    return null;
  const kinds = receipt.variants.map((value) => asRecord(value)?.kind).sort();
  const expected =
    receipt.semantic_role === 'standard'
      ? ['reading', 'thumbnail']
      : ['color_critical', 'reading', 'thumbnail'];
  if (
    JSON.stringify(kinds) !== JSON.stringify(expected) ||
    receipt.variants.some((value) => {
      const variant = asRecord(value);
      return (
        !variant ||
        !positive(variant.width) ||
        !positive(variant.height) ||
        !positive(variant.bytes, 256000) ||
        !hash(variant.sha256) ||
        variant.mime_type !== 'image/webp'
      );
    })
  )
    return null;
  return jsonResponse(200, safeReceipt(receipt, runId, requestId));
};
