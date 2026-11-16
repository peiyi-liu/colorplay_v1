import type { MediaTransport } from './functional-media-transport-observation';
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
    semanticRole: z.enum(['standard', 'color_critical']),
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
  observation?: { body(bytes: number, known: boolean): void; unknown(): void },
): Promise<MediaHttpResponse> => {
  const empty: MediaHttpResponse = {
    status: response.status(),
    outcome: 'unknown',
    runId: null,
    requestId: null,
    objectPathSha256: null,
    asset: null,
  };
  const observed = (value: MediaHttpResponse, bytes: number) => {
    try {
      observation?.body(bytes, value.outcome === 'ok');
    } catch {
      try {
        observation?.unknown();
      } catch {
        /* Diagnostics never replace the operation result. */
      }
    }
    return value;
  };
  if (response.status() !== 200) return empty;
  const bytes = await response.body();
  if (bytes.length > 16_384) return observed(empty, bytes.length);
  let data: unknown;
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch {
    return observed(empty, bytes.length);
  }
  if (request.action === 'begin') {
    const parsed = contentMediaBeginWireSchema.safeParse(data);
    return observed(
      parsed.success
        ? {
            ...empty,
            outcome: 'ok',
            runId: parsed.data.run_id,
            requestId: request.requestId,
            objectPathSha256: sha256(parsed.data.object_path),
          }
        : empty,
      bytes.length,
    );
  }
  if (request.action === 'abort') {
    const parsed = contentMediaAbortWireSchema.safeParse(data);
    return observed(
      parsed.success
        ? {
            ...empty,
            outcome: 'ok',
            runId: parsed.data.run_id,
            requestId: parsed.data.request_id,
          }
        : empty,
      bytes.length,
    );
  }
  const parsed = contentMediaProcessWireSchema.safeParse(data);
  return observed(
    parsed.success
      ? {
          ...empty,
          outcome: 'ok',
          runId: parsed.data.run_id,
          requestId: parsed.data.request_id,
          asset: parsed.data.asset,
        }
      : empty,
    bytes.length,
  );
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

export const mediaResponseFraming = (response: APIResponse) => {
  const headers = response.headersArray();
  if (headers.length > 256) throw new Error('INVALID');
  const get = (name: string) => {
    const found = headers.filter((h) => h.name.toLowerCase() === name);
    if (
      found.length > 1 ||
      found.some((h) => h.value.length > 1024 || /[\r\n]/u.test(h.value))
    )
      throw new Error('INVALID');
    return found[0]?.value;
  };
  const status = z.number().int().min(100).max(599).parse(response.status());
  const type = get('content-type'),
    encoding = get('content-encoding'),
    length = get('content-length');
  const contentType =
    type === undefined
      ? 'NONE'
      : /^application\/json(?:\s*;[^\r\n]*)?$/iu.test(type)
        ? 'JSON'
        : 'OTHER';
  const encodings: Readonly<Record<string, MediaTransport['encoding']>> = {
    identity: 'IDENTITY',
    gzip: 'GZIP',
    br: 'BR',
    deflate: 'DEFLATE',
  };
  const key = encoding?.toLowerCase();
  const encodingKind =
    key === undefined
      ? 'NONE'
      : Object.hasOwn(encodings, key)
        ? (encodings[key] ?? 'OTHER')
        : 'OTHER';
  let wireLength: number | null = null;
  if (length !== undefined) {
    if (!/^(0|[1-9][0-9]{0,6})$/u.test(length)) throw new Error('INVALID');
    wireLength = z
      .number()
      .int()
      .nonnegative()
      .max(2_097_152)
      .parse(Number(length));
  }

  return { status, contentType, encoding: encodingKind, wireLength };
};
