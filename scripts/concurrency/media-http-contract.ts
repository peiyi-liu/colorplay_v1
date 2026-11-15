import type { APIResponse, Request } from '@playwright/test';
import { z } from 'zod';
import {
  contentMediaBeginWireSchema,
  contentMediaProcessWireSchema,
  contentMediaAbortWireSchema,
} from '../../src/features/content-studio/api/content-media-contracts';
import { sha256 } from './local-runtime';
export const mediaRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('begin'),
    requestId: z.uuid(),
    semanticRole: z.literal('standard'),
    sourceFilename: z.string().min(1).max(180),
    sourceBytes: z.number().int().positive().max(2_097_152),
    sourceMimeType: z.literal('image/png'),
  }),
  z.strictObject({
    action: z.literal('process'),
    requestId: z.uuid(),
    runId: z.uuid(),
  }),
  z.strictObject({
    action: z.literal('abort'),
    requestId: z.uuid(),
    runId: z.uuid(),
  }),
]);
export type MediaHttpRequest = z.infer<typeof mediaRequestSchema> & {
  actorTokenSha256: string;
};
export interface MediaHttpResponse {
  status: number;
  outcome: 'unknown' | 'ok';
  runId: string | null;
  requestId: string | null;
  objectPathSha256: string | null;
  asset: z.infer<typeof contentMediaProcessWireSchema>['asset'] | null;
}
export interface FunctionalHttpHooks {
  signal: AbortSignal;
  beforeSend?: (request: MediaHttpRequest) => Promise<'send' | 'drop'>;
  afterResponse?: (
    request: MediaHttpRequest,
    response: MediaHttpResponse,
  ) => Promise<'deliver' | 'drop'>;
}
export const parseMediaHttpRequest = async (
  request: Request,
): Promise<MediaHttpRequest | null> => {
  const url = new URL(request.url());
  if (
    request.method() !== 'POST' ||
    url.pathname !== '/functions/v1/content-media'
  )
    return null;
  const raw = request.postData();
  if (!raw || Buffer.byteLength(raw) > 4096) return null;
  const parsed = mediaRequestSchema.safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) return null;
  const header = await request.headerValue('authorization');
  if (!header?.startsWith('Bearer ') || header.length > 16_384) return null;
  return { ...parsed.data, actorTokenSha256: sha256(header.slice(7)) };
};
export const parseMediaHttpResponse = async (
  request: MediaHttpRequest,
  response: APIResponse,
): Promise<MediaHttpResponse> => {
  const empty: MediaHttpResponse = {
    status: response.status(),
    outcome: 'unknown',
    runId: null,
    requestId: null,
    objectPathSha256: null,
    asset: null,
  };
  if (response.status() !== 200) return empty;
  const bytes = await response.body();
  if (bytes.length > 16_384) return empty;
  let data: unknown;
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch {
    return empty;
  }
  if (request.action === 'begin') {
    const parsed = contentMediaBeginWireSchema.safeParse(data);
    return parsed.success
      ? {
          ...empty,
          outcome: 'ok',
          runId: parsed.data.run_id,
          requestId: request.requestId,
          objectPathSha256: sha256(parsed.data.object_path),
        }
      : empty;
  }
  if (request.action === 'abort') {
    const parsed = contentMediaAbortWireSchema.safeParse(data);
    return parsed.success
      ? {
          ...empty,
          outcome: 'ok',
          runId: parsed.data.run_id,
          requestId: parsed.data.request_id,
        }
      : empty;
  }
  const parsed = contentMediaProcessWireSchema.safeParse(data);
  return parsed.success
    ? {
        ...empty,
        outcome: 'ok',
        runId: parsed.data.run_id,
        requestId: parsed.data.request_id,
        asset: parsed.data.asset,
      }
    : empty;
};
export const boundedHttpHook = async <T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  let abort: () => void = () => undefined;
  const failure = new Promise<never>((_resolve, reject) => {
    abort = () => {
      reject(new Error('FUNCTIONAL_OPERATION_FAILED'));
    };
  });
  const timer = setTimeout(abort, 15_000);
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) abort();
    return await Promise.race([
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return operation();
      }),
      failure,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
};
