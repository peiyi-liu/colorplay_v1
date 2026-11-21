import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { createContentAuthoringRepository } from '../api/content-authoring-repository';
import {
  ContentMediaRepositoryError,
  type ContentMediaRepository,
} from '../api/content-media-repository';
import { ContentMediaWorkflow } from './content-media-workflow';

it('keeps an unknown operation locked, exposes explicit recovery and only unlocks after confirmed cancel', async () => {
  const user = userEvent.setup();
  const pending = () =>
    new ContentMediaRepositoryError('CONTENT_MEDIA_PENDING');
  const repository: ContentMediaRepository = {
    uploadAndProcess: vi.fn().mockRejectedValue(pending()),
    recover: vi.fn().mockRejectedValue(pending()),
    cancel: vi
      .fn()
      .mockRejectedValueOnce(pending())
      .mockResolvedValue(undefined),
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <ContentMediaWorkflow
        authoringRepository={createContentAuthoringRepository()}
        editorState={null}
        selected={null}
        mediaRepository={repository}
        onAttached={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const fileInput = screen.getByLabelText(/圖片（JPG/);
  await user.upload(
    fileInput,
    new File([new Uint8Array([1])], 'synthetic.png', { type: 'image/png' }),
  );
  await user.click(
    screen.getByRole('button', { name: '上傳並建立 WebP 衍生檔' }),
  );
  await screen.findByText(/處理結果尚未確認/);
  expect(fileInput).toBeDisabled();
  expect(screen.getByLabelText('用途')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: '上傳並建立 WebP 衍生檔' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '確認並恢復處理' }));
  await waitFor(() => {
    expect(repository.recover).toHaveBeenCalledOnce();
  });
  expect(repository.uploadAndProcess).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: '取消這次上傳' }));
  await waitFor(() => {
    expect(repository.cancel).toHaveBeenCalledTimes(1);
  });
  expect(fileInput).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '取消這次上傳' }));
  await waitFor(() => expect(fileInput).toBeEnabled());
  expect(
    screen.queryByRole('button', { name: '確認並恢復處理' }),
  ).not.toBeInTheDocument();
  expect(repository.uploadAndProcess).toHaveBeenCalledOnce();
});

it('publishes a recovered manifest only after the explicit recovery promise resolves', async () => {
  const user = userEvent.setup();
  let resolve!: (
    value: import('../api/content-media-contracts').ContentMediaAsset,
  ) => void;
  const recover = vi.fn<ContentMediaRepository['recover']>().mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const uploadAndProcess = vi
    .fn()
    .mockRejectedValue(
      new ContentMediaRepositoryError('CONTENT_MEDIA_PENDING'),
    );
  const onAttached = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContentMediaWorkflow
        authoringRepository={createContentAuthoringRepository()}
        editorState={null}
        selected={null}
        mediaRepository={{ uploadAndProcess, recover, cancel: vi.fn() }}
        onAttached={onAttached}
      />
    </QueryClientProvider>,
  );
  await user.upload(
    screen.getByLabelText(/圖片（JPG/),
    new File(['x'], 'synthetic.png', { type: 'image/png' }),
  );
  await user.click(
    screen.getByRole('button', { name: '上傳並建立 WebP 衍生檔' }),
  );
  const recoverButton = await screen.findByRole('button', {
    name: '確認並恢復處理',
  });
  await user.click(recoverButton);
  expect(screen.queryByText(/圖片已驗證/)).not.toBeInTheDocument();
  expect(recoverButton).toBeDisabled();
  expect(screen.getByRole('button', { name: '取消這次上傳' })).toBeDisabled();
  resolve({
    assetId: 'synthetic-asset',
    hasAlpha: false,
    height: 1,
    width: 1,
    manifestSha256: 'a'.repeat(64),
    sourceSha256: 'b'.repeat(64),
    semanticRole: 'standard',
    variants: [],
  });
  await screen.findByText(/圖片已驗證/);
  expect(uploadAndProcess).toHaveBeenCalledOnce();
  expect(recover).toHaveBeenCalledOnce();
  expect(onAttached).not.toHaveBeenCalled();
});

it('retains its default repository across pending-state rerenders', async () => {
  const module = await import('../api/content-media-repository');
  const repository: ContentMediaRepository = {
    uploadAndProcess: vi
      .fn()
      .mockRejectedValue(
        new ContentMediaRepositoryError('CONTENT_MEDIA_PENDING'),
      ),
    recover: vi
      .fn()
      .mockRejectedValue(
        new ContentMediaRepositoryError('CONTENT_MEDIA_PENDING'),
      ),
    cancel: vi.fn(),
  };
  const factory = vi
    .spyOn(module, 'createContentMediaRepository')
    .mockReturnValue(repository);
  try {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ContentMediaWorkflow
          authoringRepository={createContentAuthoringRepository()}
          editorState={null}
          selected={null}
          onAttached={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await user.upload(
      screen.getByLabelText(/圖片（JPG/),
      new File(['x'], 'synthetic.png', { type: 'image/png' }),
    );
    await user.click(
      screen.getByRole('button', { name: '上傳並建立 WebP 衍生檔' }),
    );
    await user.click(
      await screen.findByRole('button', { name: '確認並恢復處理' }),
    );
    await waitFor(() => {
      expect(repository.recover).toHaveBeenCalledOnce();
    });
    expect(factory).toHaveBeenCalledOnce();
  } finally {
    factory.mockRestore();
  }
});
