import { describe, expect, it, vi } from 'vitest';

import {
  ContentMediaRepositoryError,
  createContentMediaRepository,
  type ContentMediaTransport,
} from './content-media-repository';

const requestId = '81000000-0000-4000-8000-000000000001';
const runId = '81000000-0000-4000-8000-000000000002';
const assetId = '81000000-0000-4000-8000-000000000003';

const source = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'swatch.jpg', {
    type: 'image/jpeg',
  });

const transport = () => {
  const abort = vi
    .fn<ContentMediaTransport['abort']>()
    .mockResolvedValue(undefined);
  const begin = vi.fn<ContentMediaTransport['begin']>().mockResolvedValue({
    action: 'begin',
    bucket: 'content-media-quarantine',
    expires_at: '2026-09-26T10:00:00.000Z',
    object_path:
      '81000000-0000-4000-8000-000000000004/81000000-0000-4000-8000-000000000002/source.jpg',
    outcome: 'ok',
    run_id: runId,
    token: 'signed-upload-token',
  });
  const process = vi.fn<ContentMediaTransport['process']>().mockResolvedValue({
    action: 'process',
    asset: {
      asset_id: assetId,
      has_alpha: false,
      height: 800,
      manifest_sha256: 'a'.repeat(64),
      semantic_role: 'color_critical',
      source_sha256: 'b'.repeat(64),
      variants: [
        {
          bytes: 32000,
          height: 213,
          kind: 'thumbnail',
          mime_type: 'image/webp',
          sha256: 'c'.repeat(64),
          width: 320,
        },
        {
          bytes: 90000,
          height: 533,
          kind: 'reading',
          mime_type: 'image/webp',
          sha256: 'd'.repeat(64),
          width: 800,
        },
        {
          bytes: 180000,
          height: 800,
          kind: 'color_critical',
          mime_type: 'image/webp',
          sha256: 'e'.repeat(64),
          width: 1200,
        },
      ],
      width: 1200,
    },
    outcome: 'ok',
    request_id: requestId,
    run_id: runId,
  });
  const uploadSigned = vi
    .fn<ContentMediaTransport['uploadSigned']>()
    .mockResolvedValue(undefined);
  return {
    mocks: { abort, begin, process, uploadSigned },
    value: {
      abort,
      begin,
      process,
      uploadSigned,
    } satisfies ContentMediaTransport,
  };
};

describe('ContentMedia repository', () => {
  it('uploads only to the issued run path, then returns the verified manifest identity', async () => {
    const supplied = transport();
    const file = source();
    const result = await createContentMediaRepository(
      supplied.value,
    ).uploadAndProcess({
      file,
      requestId,
      semanticRole: 'color_critical',
    });

    expect(supplied.mocks.begin).toHaveBeenCalledWith({
      requestId,
      semanticRole: 'color_critical',
      sourceBytes: 4,
      sourceFilename: 'swatch.jpg',
      sourceMimeType: 'image/jpeg',
    });
    expect(supplied.mocks.uploadSigned).toHaveBeenCalledWith({
      bucket: 'content-media-quarantine',
      file,
      objectPath: `81000000-0000-4000-8000-000000000004/${runId}/source.jpg`,
      token: 'signed-upload-token',
    });
    expect(supplied.mocks.process).toHaveBeenCalledWith({ requestId, runId });
    expect(result).toMatchObject({
      assetId,
      manifestSha256: 'a'.repeat(64),
      semanticRole: 'color_critical',
      variants: [
        { kind: 'thumbnail', width: 320 },
        { kind: 'reading', width: 800 },
        { kind: 'color_critical', width: 1200 },
      ],
    });
  });

  it('aborts only the issued run when the signed upload fails', async () => {
    const supplied = transport();
    supplied.mocks.uploadSigned.mockRejectedValueOnce(new Error('offline'));

    await expect(
      createContentMediaRepository(supplied.value).uploadAndProcess({
        file: source(),
        requestId,
        semanticRole: 'standard',
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_UNAVAILABLE' });

    expect(supplied.mocks.abort).toHaveBeenCalledWith({ requestId, runId });
    expect(supplied.mocks.process).not.toHaveBeenCalled();
  });

  it('rejects oversize or spoofable browser input before requesting a signed path', async () => {
    const supplied = transport();
    const repository = createContentMediaRepository(supplied.value);

    await expect(
      repository.uploadAndProcess({
        file: new File([new Uint8Array(2_097_153)], 'large.png', {
          type: 'image/png',
        }),
        requestId,
        semanticRole: 'standard',
      }),
    ).rejects.toBeInstanceOf(ContentMediaRepositoryError);
    await expect(
      repository.uploadAndProcess({
        file: new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' }),
        requestId,
        semanticRole: 'standard',
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_INVALID_FILE' });

    expect(supplied.mocks.begin).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed Edge response', async () => {
    const supplied = transport();
    supplied.mocks.process.mockResolvedValueOnce({
      action: 'process',
      outcome: 'ok',
      run_id: runId,
    });

    await expect(
      createContentMediaRepository(supplied.value).uploadAndProcess({
        file: source(),
        requestId,
        semanticRole: 'standard',
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_INVALID_RESPONSE' });
  });

  it('rejects a well-formed receipt from another request or semantic role', async () => {
    const supplied = transport();
    const original = await supplied.mocks.process({ requestId, runId });
    supplied.mocks.process.mockReset().mockResolvedValue({
      ...(original as Record<string, unknown>),
      request_id: '81000000-0000-4000-8000-000000000099',
    });

    await expect(
      createContentMediaRepository(supplied.value).uploadAndProcess({
        file: source(),
        requestId,
        semanticRole: 'color_critical',
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_INVALID_RESPONSE' });
  });
});
