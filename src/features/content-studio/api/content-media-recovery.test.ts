import { describe, expect, it, vi } from 'vitest';
import {
  createContentMediaRepository,
  type ContentMediaTransport,
} from './content-media-repository';

const requestId = '81000000-0000-4000-8000-000000000001';
const runId = '81000000-0000-4000-8000-000000000002';
const input = () => ({
  file: new File([new Uint8Array([1])], 'synthetic.png', { type: 'image/png' }),
  requestId,
  semanticRole: 'standard' as const,
});
const success = () => ({
  action: 'process',
  outcome: 'ok',
  run_id: runId,
  request_id: requestId,
  asset: {
    asset_id: '81000000-0000-4000-8000-000000000003',
    has_alpha: false,
    width: 1,
    height: 1,
    manifest_sha256: 'a'.repeat(64),
    source_sha256: 'b'.repeat(64),
    semantic_role: 'standard',
    variants: ['thumbnail', 'reading'].map((kind) => ({
      kind,
      bytes: 1,
      width: 1,
      height: 1,
      mime_type: 'image/webp',
      sha256: 'c'.repeat(64),
    })),
  },
});
const confirmedAbort = () => ({
  action: 'abort',
  outcome: 'ok',
  run_id: runId,
  request_id: requestId,
});
function setup() {
  const begin = vi.fn<ContentMediaTransport['begin']>().mockResolvedValue({
    action: 'begin',
    bucket: 'content-media-quarantine',
    expires_at: '2026-11-15T00:00:00Z',
    object_path: 'synthetic/source.png',
    outcome: 'ok',
    run_id: runId,
    token: 'SYNTHETIC_TOKEN',
  });
  const uploadSigned = vi
    .fn<ContentMediaTransport['uploadSigned']>()
    .mockResolvedValue();
  const process = vi
    .fn<ContentMediaTransport['process']>()
    .mockRejectedValue(new Error('SYNTHETIC_RAW_MARKER'));
  const abort = vi
    .fn<ContentMediaTransport['abort']>()
    .mockResolvedValue(confirmedAbort());
  const repository = createContentMediaRepository({
    begin,
    uploadSigned,
    process,
    abort,
  });
  return { begin, uploadSigned, process, abort, repository };
}
async function makePending(supplied: ReturnType<typeof setup>) {
  await expect(
    supplied.repository.uploadAndProcess(input()),
  ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
}
describe('same media operation recovery', () => {
  it('never begins/uploads/processes again on an ordinary retry of the same pending key', async () => {
    const supplied = setup();
    await makePending(supplied);
    await expect(
      supplied.repository.uploadAndProcess(input()),
    ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
    expect(supplied.begin).toHaveBeenCalledOnce();
    expect(supplied.uploadSigned).toHaveBeenCalledOnce();
    expect(supplied.process).toHaveBeenCalledOnce();
  });
  it('recovers only through the explicit same-run operation and authoritative verified receipt', async () => {
    const supplied = setup();
    await makePending(supplied);
    supplied.process.mockResolvedValueOnce(success());
    await expect(supplied.repository.recover(requestId)).resolves.toMatchObject(
      { assetId: success().asset.asset_id },
    );
    expect(supplied.process).toHaveBeenLastCalledWith({ requestId, runId });
    expect(supplied.begin).toHaveBeenCalledOnce();
    expect(supplied.uploadSigned).toHaveBeenCalledOnce();
  });
  it.each([
    { outcome: 'pending' },
    null,
    {},
    { ...success(), run_id: '81000000-0000-4000-8000-000000000099' },
    { ...success(), request_id: '81000000-0000-4000-8000-000000000099' },
    {
      ...success(),
      asset: { ...success().asset, semantic_role: 'color_critical' },
    },
  ])(
    'retains checkpoint after unknown or mismatched recovery receipt %#',
    async (payload) => {
      const supplied = setup();
      await makePending(supplied);
      supplied.process.mockResolvedValueOnce(payload);
      await expect(
        supplied.repository.recover(requestId),
      ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
      await expect(
        supplied.repository.uploadAndProcess(input()),
      ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
      expect(supplied.begin).toHaveBeenCalledOnce();
    },
  );
  it('allows a user-selected new operation only after confirmed cancellation', async () => {
    const supplied = setup();
    await makePending(supplied);
    await expect(
      supplied.repository.cancel(requestId),
    ).resolves.toBeUndefined();
    expect(supplied.abort).toHaveBeenCalledWith({ requestId, runId });
    await supplied.repository
      .uploadAndProcess({
        ...input(),
        requestId: '81000000-0000-4000-8000-000000000004',
      })
      .catch(() => undefined);
    expect(supplied.begin).toHaveBeenCalledTimes(2);
    expect(supplied.begin.mock.calls[1]?.[0].requestId).toBe(
      '81000000-0000-4000-8000-000000000004',
    );
  });
  it.each([
    null,
    {},
    { outcome: 'denied' },
    { ...confirmedAbort(), run_id: '81000000-0000-4000-8000-000000000099' },
    { ...confirmedAbort(), request_id: '81000000-0000-4000-8000-000000000099' },
    { error: 'CONTENT_MEDIA_CLEANUP_FAILED' },
  ])('does not unlock on unconfirmed cancellation %#', async (payload) => {
    const supplied = setup();
    await makePending(supplied);
    supplied.abort.mockResolvedValueOnce(payload);
    await expect(supplied.repository.cancel(requestId)).rejects.toMatchObject({
      code: 'CONTENT_MEDIA_PENDING',
    });
    await expect(
      supplied.repository.uploadAndProcess(input()),
    ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
    expect(supplied.begin).toHaveBeenCalledOnce();
  });
  it('keeps a lost abort reply pending and permits only a separate explicit same-key abort retry', async () => {
    const supplied = setup();
    await makePending(supplied);
    supplied.abort.mockRejectedValueOnce(new Error('SYNTHETIC_RAW_MARKER'));
    await expect(supplied.repository.cancel(requestId)).rejects.toMatchObject({
      code: 'CONTENT_MEDIA_PENDING',
    });
    expect(supplied.abort).toHaveBeenCalledOnce();
    await supplied.repository.cancel(requestId);
    expect(supplied.abort).toHaveBeenCalledTimes(2);
    expect(supplied.abort.mock.calls).toEqual([
      [{ requestId, runId }],
      [{ requestId, runId }],
    ]);
  });
  it('does not race recovery and cancel or run two simultaneous recoveries', async () => {
    const supplied = setup();
    await makePending(supplied);
    let release!: (value: unknown) => void;
    supplied.process.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const first = supplied.repository.recover(requestId);
    await expect(supplied.repository.recover(requestId)).rejects.toMatchObject({
      code: 'CONTENT_MEDIA_PENDING',
    });
    await expect(supplied.repository.cancel(requestId)).rejects.toMatchObject({
      code: 'CONTENT_MEDIA_PENDING',
    });
    expect(supplied.abort).not.toHaveBeenCalled();
    release(success());
    await first;
    expect(supplied.process).toHaveBeenCalledTimes(2);
  });
  it('does not leak provider details in safe errors or issue network calls without a checkpoint', async () => {
    const supplied = setup();
    await makePending(supplied);
    const error: unknown = await supplied.repository
      .recover(requestId)
      .catch((value: unknown) => value);
    expect(JSON.stringify(error)).not.toContain('SYNTHETIC_RAW_MARKER');
    expect(error).toMatchObject({ message: 'CONTENT_MEDIA_PENDING' });
    await expect(
      supplied.repository.cancel('not-a-checkpoint'),
    ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
    expect(supplied.abort).not.toHaveBeenCalled();
  });
});
