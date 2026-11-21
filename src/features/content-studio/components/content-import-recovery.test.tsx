import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createContentMediaRepository,
  type ContentMediaTransport,
} from '../api/content-media-repository';
import { inspectContentImportMedia } from '../import/package-media';
import { ContentImportWorkflow } from './content-import-workflow';

function zipFile() {
  const bytes = zipSync({
    'csv/Media.csv': new Uint8Array(
      strToU8(
        'owner_code,path,semantic_role\nRC1,media/first.png,standard\nRC1,media/second.png,standard',
      ),
    ),
    'media/first.png': new Uint8Array([1]),
    'media/second.png': new Uint8Array([2]),
  });
  const buffer = Uint8Array.from(bytes).buffer;
  const file = new File([buffer], 'synthetic.zip', { type: 'application/zip' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(buffer),
  });
  return file;
}
afterEach(() => vi.restoreAllMocks());
function setup() {
  let keyCount = 0;
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockImplementation(
      () => `82000000-0000-4000-8000-${String(++keyCount).padStart(12, '0')}`,
    );
  const issued = new Map<string, string>();
  const begin = vi
    .fn<ContentMediaTransport['begin']>()
    .mockImplementation((input) => {
      const run = `81000000-0000-4000-8000-${String(issued.size + 1).padStart(12, '0')}`;
      issued.set(input.requestId, run);
      return Promise.resolve({
        action: 'begin',
        outcome: 'ok',
        run_id: run,
        bucket: 'content-media-quarantine',
        object_path: 'synthetic/source.png',
        token: 'SYNTHETIC_TOKEN',
        expires_at: '2026-11-15T00:00:00Z',
      });
    });
  let secondPending = true;
  const process = vi
    .fn<ContentMediaTransport['process']>()
    .mockImplementation((input) => {
      if (input.runId.endsWith('2') && secondPending)
        return Promise.reject(new Error('SYNTHETIC_REPLY_LOST'));
      return Promise.resolve({
        action: 'process',
        outcome: 'ok',
        request_id: input.requestId,
        run_id: input.runId,
        asset: {
          asset_id: input.runId,
          semantic_role: 'standard',
          has_alpha: false,
          width: 1,
          height: 1,
          manifest_sha256: 'a'.repeat(64),
          source_sha256: 'b'.repeat(64),
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
    });
  const abort = vi
    .fn<ContentMediaTransport['abort']>()
    .mockImplementation((input) =>
      Promise.resolve({
        action: 'abort',
        outcome: 'ok',
        run_id: input.runId,
        request_id: input.requestId,
      }),
    );
  const uploadSigned = vi
    .fn<ContentMediaTransport['uploadSigned']>()
    .mockResolvedValue();
  const previewPackage = vi.fn().mockResolvedValue({
    action: 'preview',
    outcome: 'ok',
    run_id: 'synthetic-preview',
    items: [],
    create_count: 0,
    error_count: 0,
    no_op_count: 0,
    update_count: 0,
    warning_count: 0,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContentImportWorkflow
        onCommitted={vi.fn()}
        repository={{ previewPackage, commitDrafts: vi.fn() }}
        mediaRepository={createContentMediaRepository({
          begin,
          process,
          abort,
          uploadSigned,
        })}
      />
    </QueryClientProvider>,
  );
  return {
    randomUUID,
    begin,
    process,
    abort,
    uploadSigned,
    previewPackage,
    release: () => {
      secondPending = false;
    },
  };
}
it('recovers a pending ZIP image without reuploading its verified predecessor or minting another image key', async () => {
  const supplied = setup();
  const user = userEvent.setup();
  const input = screen.getByLabelText('內容套件（XLSX 或 CSV＋圖片 ZIP）');
  await user.upload(input, zipFile());
  await user.click(screen.getByRole('button', { name: '上傳並預覽差異' }));
  await waitFor(() => {
    expect(supplied.begin).toHaveBeenCalledTimes(2);
  });
  await screen.findByText(/處理結果尚未確認/);
  expect(input).toBeDisabled();
  expect(supplied.previewPackage).not.toHaveBeenCalled();
  supplied.release();
  await user.click(screen.getByRole('button', { name: '確認並恢復處理' }));
  await waitFor(() => {
    expect(supplied.previewPackage).toHaveBeenCalledOnce();
  });
  expect(supplied.begin).toHaveBeenCalledTimes(2);
  expect(supplied.uploadSigned).toHaveBeenCalledTimes(2);
  expect(supplied.process).toHaveBeenCalledTimes(3);
  expect(supplied.randomUUID).toHaveBeenCalledTimes(3);
  expect(supplied.process.mock.calls[2]).toEqual(
    supplied.process.mock.calls[1],
  );
  const payload: unknown = supplied.previewPackage.mock.calls[0]?.[0];
  expect(payload).toMatchObject({
    requestId: '82000000-0000-4000-8000-000000000001',
    mediaManifestMap: {
      'media/first.png': '81000000-0000-4000-8000-000000000001',
      'media/second.png': '81000000-0000-4000-8000-000000000002',
    },
  });
});
it('keeps the ZIP locked after unknown abort, then requires a new file selection after confirmed abort', async () => {
  const supplied = setup();
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText('內容套件（XLSX 或 CSV＋圖片 ZIP）'),
    zipFile(),
  );
  await user.click(screen.getByRole('button', { name: '上傳並預覽差異' }));
  await waitFor(() => {
    expect(supplied.begin).toHaveBeenCalledTimes(2);
  });
  await screen.findByText(/處理結果尚未確認/);
  supplied.abort.mockRejectedValueOnce(new Error('SYNTHETIC_REPLY_LOST'));
  await user.click(screen.getByRole('button', { name: '取消這次上傳' }));
  await waitFor(() => {
    expect(supplied.abort).toHaveBeenCalledOnce();
  });
  expect(
    screen.getByLabelText('內容套件（XLSX 或 CSV＋圖片 ZIP）'),
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '取消這次上傳' }));
  await waitFor(() => {
    expect(
      screen.getByLabelText('內容套件（XLSX 或 CSV＋圖片 ZIP）'),
    ).toBeEnabled();
  });
  expect(screen.getByRole('button', { name: '上傳並預覽差異' })).toBeDisabled();
  expect(supplied.abort.mock.calls[1]).toEqual(supplied.abort.mock.calls[0]);
  expect(supplied.abort.mock.calls[0]?.[0]).toEqual(
    supplied.process.mock.calls[1]?.[0],
  );
  expect(supplied.begin).toHaveBeenCalledTimes(2);
  expect(supplied.previewPackage).not.toHaveBeenCalled();
  expect(supplied.randomUUID).toHaveBeenCalledTimes(3);
  await user.upload(
    screen.getByLabelText('內容套件（XLSX 或 CSV＋圖片 ZIP）'),
    zipFile(),
  );
  await user.click(screen.getByRole('button', { name: '上傳並預覽差異' }));
  await waitFor(() => {
    expect(supplied.previewPackage).toHaveBeenCalledOnce();
  });
  expect(supplied.begin).toHaveBeenCalledTimes(4);
  expect(supplied.randomUUID).toHaveBeenCalledTimes(6);
});

it('has a valid synthetic two-image ZIP fixture', async () => {
  await expect(inspectContentImportMedia(zipFile())).resolves.toHaveLength(2);
});
