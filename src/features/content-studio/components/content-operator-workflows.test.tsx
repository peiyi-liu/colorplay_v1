import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { strToU8, zipSync } from 'fflate';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ContentAuthoringRepository } from '../api/content-authoring-repository';
import type { ContentMediaRepository } from '../api/content-media-repository';
import type { ContentPublicationRepository } from '../api/content-publication-repository';
import type { ContentEditorState } from '../api/contracts';
import type { ContentImportRepository } from '../import/content-import-repository';
import type { ContentStudioItem } from '../lib/content-studio-model';
import { ContentImportWorkflow } from './content-import-workflow';
import { ContentMediaWorkflow } from './content-media-workflow';
import { ContentPublicationWorkflow } from './content-publication-workflow';

const ENTITY_ID = '24000000-0000-0000-0000-000000000311';
const DRAFT_ID = '74000000-0000-4000-8000-000000000311';
const ASSET_ID = '76000000-0000-4000-8000-000000000311';
const REQUEST_ID = '91000000-0000-4000-8000-000000000001';

const selected: ContentStudioItem = {
  bankKind: null,
  chapterId: '21000000-0000-0000-0000-000000000003',
  draftId: DRAFT_ID,
  entityId: ENTITY_ID,
  entityType: 'review_card',
  parentId: '23000000-0000-0000-0000-000000000311',
  parentType: 'subtopic',
  sectionId: '22000000-0000-0000-0000-000000000031',
  stableCode: 'RC3101',
  status: 'published',
  subtopicId: '23000000-0000-0000-0000-000000000311',
  title: '色彩三要素',
  version: 3,
};

const editorState: ContentEditorState = {
  current: {
    entityId: ENTITY_ID,
    entityType: 'review_card',
    payload: { content: '原內容', media: [], title: '色彩三要素' },
    stableCode: 'RC3101',
    status: 'published',
    version: 3,
  },
  draft: {
    baseVersion: 3,
    draftId: DRAFT_ID,
    entityId: ENTITY_ID,
    entityType: 'review_card',
    payload: { content: '新內容', media: [], title: '色彩三要素' },
    revision: 4,
    source: 'manual',
    stableCode: 'RC3101',
    updatedAt: '2026-09-26T08:00:00Z',
  },
  outcome: 'ok',
  requestId: REQUEST_ID,
};

const asset = {
  assetId: ASSET_ID,
  hasAlpha: false,
  height: 600,
  manifestSha256: 'a'.repeat(64),
  semanticRole: 'standard' as const,
  sourceSha256: 'b'.repeat(64),
  variants: [
    {
      bytes: 12_000,
      height: 320,
      kind: 'w320' as const,
      mimeType: 'image/webp' as const,
      sha256: 'c'.repeat(64),
      width: 320,
    },
  ],
  width: 800,
};

function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            mutations: { retry: false },
            queries: { retry: false },
          },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

describe('Content Studio operator workflows', () => {
  it('processes ZIP images automatically before trusted preview and draft commit', async () => {
    const user = userEvent.setup();
    const mediaRepository: ContentMediaRepository = {
      uploadAndProcess: vi.fn().mockResolvedValue(asset),
    };
    const previewPackage = vi.fn().mockResolvedValue({
      action: 'preview',
      create_count: 1,
      error_count: 0,
      items: [
        {
          disposition: 'create',
          entity_type: 'review_card',
          issues: [],
          row_number: 2,
          sheet: 'RC',
          stable_code: 'RC3101',
          warnings: [{ code: 'CONTENT_UPDATE', field: 'content' }],
        },
      ],
      no_op_count: 0,
      outcome: 'ok',
      run_id: '77000000-0000-4000-8000-000000000001',
      source_sha256: 'd'.repeat(64),
      update_count: 0,
      warning_count: 1,
    });
    const commitDrafts = vi.fn().mockResolvedValue({
      action: 'commit',
      outcome: 'ok',
      replayed: false,
      request_id: REQUEST_ID,
      results: [{ stable_code: 'RC3101' }],
      run_id: '77000000-0000-4000-8000-000000000001',
    });
    const repository: ContentImportRepository = {
      commitDrafts,
      previewPackage,
    };
    const zipped = zipSync({
      'csv/Media.csv': new Uint8Array(
        strToU8(
          'owner_code,path,alt_text,semantic_role,sort_order\nRC3101,media/sample.png,色彩圖,standard,0',
        ),
      ),
      'csv/RC.csv': new Uint8Array(
        strToU8(
          'stable_code,subtopic_code,title,content\nRC3101,sheet-3-1-all,範例,內容',
        ),
      ),
      'media/sample.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    render(
      <ContentImportWorkflow
        mediaRepository={mediaRepository}
        onCommitted={vi.fn()}
        repository={repository}
      />,
      { wrapper: Wrapper },
    );
    const exactZip = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    );
    const packageFile = new File([exactZip], 'chapter-3.zip', {
      type: 'application/zip',
    });
    Object.defineProperty(packageFile, 'arrayBuffer', {
      value: () => Promise.resolve(exactZip),
    });
    await user.upload(screen.getByLabelText(/內容套件/), packageFile);
    await user.click(screen.getByRole('button', { name: '上傳並預覽差異' }));

    expect(await screen.findByText('media/sample.png：已驗證')).toBeVisible();
    expect(previewPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaManifestMap: { 'media/sample.png': ASSET_ID },
      }),
    );
    await user.click(screen.getByRole('checkbox', { name: /逐項檢查/ }));
    await user.click(screen.getByRole('button', { name: '確認並建立草稿' }));
    await waitFor(() => {
      expect(commitDrafts).toHaveBeenCalledWith(
        expect.objectContaining({ confirmWarnings: true }),
      );
    });
  });

  it('attaches a verified media manifest to the selected review-card draft', async () => {
    const user = userEvent.setup();
    const saveDraft = vi
      .fn<ContentAuthoringRepository['saveDraft']>()
      .mockResolvedValue({
        draft: {
          baseVersion: 3,
          draftId: DRAFT_ID,
          entityId: ENTITY_ID,
          entityType: 'review_card',
          payload: { content: '新內容', media: [], title: '色彩三要素' },
          revision: 5,
          source: 'manual',
          stableCode: 'RC3101',
          updatedAt: '2026-09-26T08:00:00Z',
        },
        outcome: 'ok',
        replayed: false,
        requestId: REQUEST_ID,
      });
    const authoringRepository = {
      saveDraft,
    } as unknown as ContentAuthoringRepository;
    const mediaRepository: ContentMediaRepository = {
      uploadAndProcess: vi.fn().mockResolvedValue(asset),
    };
    render(
      <ContentMediaWorkflow
        authoringRepository={authoringRepository}
        editorState={editorState}
        mediaRepository={mediaRepository}
        onAttached={vi.fn()}
        selected={selected}
      />,
      { wrapper: Wrapper },
    );

    await user.upload(
      screen.getByLabelText(/圖片（JPG/),
      new File([new Uint8Array([0x89])], 'sample.png', { type: 'image/png' }),
    );
    await user.click(
      screen.getByRole('button', { name: '上傳並建立 WebP 衍生檔' }),
    );
    await screen.findByText(/圖片已驗證/);
    await user.type(screen.getByLabelText('替代文字'), '色彩三要素示意圖');
    await user.clear(screen.getByLabelText('顯示順序'));
    await user.type(screen.getByLabelText('顯示順序'), '2');
    await user.click(
      screen.getByRole('button', { name: '加入目前複習卡草稿' }),
    );

    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalledOnce();
      expect(saveDraft.mock.calls[0]?.[0].payload).toMatchObject({
        media: [
          {
            alt_text: '色彩三要素示意圖',
            manifest_id: ASSET_ID,
            sort_order: 2,
          },
        ],
      });
    });
  });

  it('shows server-derived impact before publish and supports history rollback', async () => {
    const user = userEvent.setup();
    const publish = vi
      .fn<ContentPublicationRepository['publish']>()
      .mockResolvedValue({
        changedFields: ['content'],
        entityId: ENTITY_ID,
        entityType: 'review_card',
        eventId: '79000000-0000-4000-8000-000000000004',
        impact: 'requires_recompletion',
        outcome: 'ok',
        replayed: false,
        requestId: REQUEST_ID,
        version: 4,
      });
    const rollback = vi
      .fn<ContentPublicationRepository['rollback']>()
      .mockResolvedValue({
        changedFields: ['content'],
        entityId: ENTITY_ID,
        entityType: 'review_card',
        eventId: '79000000-0000-4000-8000-000000000005',
        impact: 'requires_recompletion',
        outcome: 'ok',
        replayed: false,
        requestId: REQUEST_ID,
        version: 5,
      });
    const repository: ContentPublicationRepository = {
      archive: vi.fn(),
      listHistory: vi.fn().mockResolvedValue({
        entries: [
          {
            actorId: 'aa000000-0000-0000-0000-000000000001',
            changedFields: ['content'],
            createdAt: '2026-09-26T08:00:00Z',
            eventId: '79000000-0000-4000-8000-000000000001',
            eventType: 'publish',
            impact: 'compatible',
            reason: '初次發布第三章內容',
            version: 1,
            versionId: '75000000-0000-4000-8000-000000000001',
          },
        ],
        entityId: ENTITY_ID,
        entityType: 'review_card',
        outcome: 'ok',
        requestId: REQUEST_ID,
      }),
      previewPublish: vi.fn().mockResolvedValue({
        changeClassification: 'semantic',
        changedFields: ['content'],
        currentVersion: 3,
        draftId: DRAFT_ID,
        entityType: 'review_card',
        impact: 'requires_recompletion',
        nextVersion: 4,
        outcome: 'ok',
        requestId: REQUEST_ID,
        stableCode: 'RC3101',
      }),
      previewArchive: vi.fn().mockResolvedValue({
        changedFields: ['status'],
        currentVersion: 3,
        entityId: ENTITY_ID,
        entityType: 'review_card',
        impact: 'requires_recompletion',
        nextVersion: 4,
        outcome: 'ok',
        requestId: REQUEST_ID,
        stableCode: 'RC3101',
      }),
      publish,
      rollback,
    };
    render(
      <ContentPublicationWorkflow
        editorState={editorState}
        onChanged={vi.fn()}
        repository={repository}
        selected={selected}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole('button', { name: '預覽發布影響' }));
    expect(await screen.findByText('需重新完成內容')).toBeVisible();
    await user.type(
      screen.getByLabelText(/操作原因/),
      '第三章教學內容語意更新',
    );
    await user.click(screen.getByRole('checkbox', { name: /核對版本差異/ }));
    await user.click(screen.getByRole('button', { name: '二次確認並發布' }));
    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({ reason: '第三章教學內容語意更新' }),
      );
    });

    await user.click(screen.getByRole('button', { name: '查看版本歷史' }));
    expect((await screen.findAllByText('v1・發布'))[0]).toBeVisible();
    await user.selectOptions(screen.getByLabelText('回復來源版本'), '1');
    await user.click(screen.getByRole('button', { name: '回復為新版本' }));
    await waitFor(() => {
      expect(rollback).toHaveBeenCalledWith(
        expect.objectContaining({ targetVersion: 1 }),
      );
    });
  });

  it('renders a revision conflict without sending a publish command', async () => {
    const user = userEvent.setup();
    const repository = {
      archive: vi.fn(),
      listHistory: vi.fn(),
      previewPublish: vi.fn().mockResolvedValue({
        code: 'CONTENT_DRAFT_CONFLICT',
        message: '草稿已被其他管理員更新，請重新載入。',
        outcome: 'denied',
        requestId: REQUEST_ID,
        retryable: false,
      }),
      previewArchive: vi.fn(),
      publish: vi.fn(),
      rollback: vi.fn(),
    } satisfies ContentPublicationRepository;
    render(
      <ContentPublicationWorkflow
        editorState={editorState}
        onChanged={vi.fn()}
        repository={repository}
        selected={selected}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole('button', { name: '預覽發布影響' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'CONTENT_DRAFT_CONFLICT',
    );
    expect(repository.publish).not.toHaveBeenCalled();
  });
});
