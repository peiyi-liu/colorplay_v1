import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mediaModule from '../api/content-media-repository';
import { createContentAuthoringRepository } from '../api/content-authoring-repository';
import type {
  ContentCatalog,
  ContentEditorState,
  ContentScope,
} from '../api/contracts';
import type { ContentStudioItem } from '../lib/content-studio-model';
import { ContentEditorForm } from './content-editor-form';
const originalFactory = mediaModule.createContentMediaRepository;
const id = (last: number) =>
  `11000000-0000-4000-8000-${String(last).padStart(12, '0')}`;
const item: ContentStudioItem = {
  bankKind: null,
  chapterId: id(1),
  draftId: null,
  entityId: id(4),
  entityType: 'review_card',
  parentId: id(3),
  parentType: 'subtopic',
  sectionId: id(2),
  stableCode: 'RC3101',
  status: 'published',
  subtopicId: id(3),
  title: '合成複習卡',
  version: 1,
};
const course = {
  courseId: id(10),
  sortOrder: 1,
  stableCode: 'synthetic',
  status: 'published' as const,
  title: '合成課程',
};
const chapter = {
  chapterId: id(1),
  sortOrder: 3,
  stableCode: 'chapter-3',
  status: 'published' as const,
  title: '合成章節',
};
const scope: ContentScope = {
  course,
  chapter,
  chapterBanks: [],
  drafts: [],
  outcome: 'ok',
  requestId: id(20),
  sections: [
    {
      banks: [],
      sectionId: id(2),
      sortOrder: 1,
      stableCode: 'section-3-1',
      status: 'published',
      title: '合成小節',
      subtopics: [
        {
          reviewCardCount: 1,
          reviewCards: [],
          sortOrder: 1,
          stableCode: 'topic',
          status: 'published',
          subtopicId: id(3),
          title: '合成子主題',
        },
      ],
    },
  ],
};
const catalog: ContentCatalog = {
  chapters: [{ ...chapter, courseId: course.courseId }],
  courses: [course],
  hierarchyDrafts: [],
  outcome: 'ok',
  requestId: id(20),
};
const state: ContentEditorState = {
  current: {
    entityId: id(4),
    entityType: 'review_card',
    payload: {
      content: '原內容',
      title: '合成複習卡',
      subtopic_id: id(3),
      media: [
        {
          manifest_id: id(6),
          alt_text: '原有圖片',
          semantic_role: 'standard',
          sort_order: 0,
        },
      ],
    },
    stableCode: 'RC3101',
    status: 'published',
    version: 1,
  },
  draft: null,
  outcome: 'ok',
  requestId: id(20),
};
const mount = (
  options: {
    firstLost?: boolean;
    cancelLost?: boolean;
    preSendLoss?: boolean;
    deferred?: Promise<void>;
  } = {},
) => {
  let requestId = '';
  let role: 'standard' | 'color_critical' = 'standard';
  let committed = false;
  let processorCalls = 0;
  let cancelLost = options.cancelLost ?? false;
  const begin = vi.fn(
    (input: {
      requestId: string;
      semanticRole: 'standard' | 'color_critical';
    }) => {
      requestId = input.requestId;
      role = input.semanticRole;
      return Promise.resolve({
        action: 'begin',
        outcome: 'ok',
        bucket: 'content-media-quarantine',
        expires_at: '2030-01-01T00:00:00Z',
        object_path: 'synthetic/owned.png',
        run_id: id(7),
        token: 'SYNTHETIC_SIGNED_TOKEN',
      });
    },
  );
  const uploadSigned = vi.fn(() => Promise.resolve());
  const process = vi.fn(async (input: { requestId: string; runId: string }) => {
    expect(input).toEqual({ requestId, runId: id(7) });
    if (options.deferred) await options.deferred;
    if (options.preSendLoss) throw new Error('SYNTHETIC_PRE_SEND_LOSS');
    if (!committed) {
      committed = true;
      processorCalls++;
      if (options.firstLost !== false) throw new Error('SYNTHETIC_REPLY_LOST');
    }
    return {
      action: 'process',
      outcome: 'ok',
      request_id: requestId,
      run_id: id(7),
      asset: {
        asset_id: id(8),
        has_alpha: false,
        width: 64,
        height: 64,
        manifest_sha256: 'a'.repeat(64),
        source_sha256: 'b'.repeat(64),
        semantic_role: role,
        variants: (role === 'color_critical'
          ? ['thumbnail', 'reading', 'color_critical']
          : ['thumbnail', 'reading']
        ).map((kind) => ({
          kind,
          bytes: 100,
          width: 64,
          height: 64,
          mime_type: 'image/webp',
          sha256: 'c'.repeat(64),
        })),
      },
    };
  });
  const abort = vi.fn((input: { requestId: string; runId: string }) => {
    expect(input).toEqual({ requestId, runId: id(7) });
    if (committed)
      return Promise.reject(new Error('SYNTHETIC_VERIFIED_CANNOT_ABORT'));
    if (cancelLost) return Promise.reject(new Error('SYNTHETIC_ABORT_UNKNOWN'));
    return Promise.resolve({
      action: 'abort',
      outcome: 'ok',
      request_id: requestId,
      run_id: id(7),
    });
  });
  const factory = vi
    .spyOn(mediaModule, 'createContentMediaRepository')
    .mockImplementation(() =>
      originalFactory({ begin, uploadSigned, process, abort }),
    );
  const dirty = vi.fn();
  const authoringRpc = vi.fn<
    (name: string, args: Record<string, unknown>) => Promise<unknown>
  >(() => Promise.reject(new Error('SYNTHETIC_UNEXPECTED_AUTHORING')));
  const authoring = createContentAuthoringRepository({ rpc: authoringRpc });
  const props = {
    allItems: [item],
    catalog,
    item,
    onCancel: vi.fn(),
    onChapterChange: vi.fn(),
    onCreated: vi.fn(),
    onDirtyChange: dirty,
    onNewTypeChange: vi.fn(),
    onOpenLifecycle: vi.fn(),
    onReload: () => Promise.resolve(),
    repository: authoring,
    scope,
    state,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const node = () => (
    <QueryClientProvider client={client}>
      <ContentEditorForm {...props} />
    </QueryClientProvider>
  );
  const view = render(node());
  return {
    authoringRpc,
    begin,
    uploadSigned,
    process,
    abort,
    factory,
    dirty,
    processorCalls: () => processorCalls,
    rerender: () => {
      view.rerender(node());
    },
    allowCancel: () => {
      cancelLost = false;
    },
  };
};
const choose = async () => {
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText('圖片檔案'),
    new File(['synthetic'], 'owned.png', { type: 'image/png' }),
  );
  await user.type(screen.getByLabelText('替代文字'), '新圖片');
  await user.selectOptions(screen.getByLabelText('圖片用途'), 'color_critical');
  return user;
};
afterEach(() => vi.restoreAllMocks());
describe('mounted ContentEditorForm uses a stable real fallback media checkpoint', () => {
  it('creates its real fallback repository once across ordinary form rerenders', async () => {
    const h = mount();
    await choose();
    h.rerender();
    expect(h.factory).toHaveBeenCalledTimes(1);
  });
  it('recovers a committed reply-lost result on the original request exactly once, preserving old media and role', async () => {
    const h = mount();
    const user = await choose();
    await user.click(screen.getByRole('button', { name: '插入圖片' }));
    expect(await screen.findByText(/圖片處理結果尚未確認/u)).toBeVisible();
    expect(screen.getByLabelText('圖片檔案')).toBeDisabled();
    expect(screen.getByLabelText('圖片用途')).toBeDisabled();
    expect(screen.getByLabelText('替代文字')).toBeDisabled();
    h.rerender();
    const recover = screen.getByRole('button', { name: '確認並恢復處理' });
    act(() => {
      fireEvent.click(recover);
      fireEvent.click(recover);
    });
    await waitFor(() =>
      expect(screen.getByText(`content-media:${id(8)}`)).toBeVisible(),
    );
    expect(screen.getByText(`content-media:${id(6)}`)).toBeVisible();
    expect(screen.getAllByText(/^content-media:/u)).toHaveLength(2);
    expect(h.begin).toHaveBeenCalledTimes(1);
    expect(h.uploadSigned).toHaveBeenCalledTimes(1);
    expect(h.process).toHaveBeenCalledTimes(2);
    expect(h.processorCalls()).toBe(1);
    expect(h.factory).toHaveBeenCalledTimes(1);
    expect(h.dirty).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText('圖片用途')).toHaveValue('color_critical');
    await user.click(screen.getByRole('button', { name: '儲存草稿' }));
    await waitFor(() => {
      expect(h.authoringRpc).toHaveBeenCalledTimes(1);
    });
    expect(h.authoringRpc.mock.calls[0]?.[0]).toBe('admin_save_content_draft');
    expect(h.authoringRpc.mock.calls[0]?.[1]).toMatchObject({
      p_payload: {
        media: [
          {
            manifest_id: id(6),
            alt_text: '原有圖片',
            semantic_role: 'standard',
            sort_order: 0,
          },
          {
            manifest_id: id(8),
            alt_text: '新圖片',
            semantic_role: 'color_critical',
            sort_order: 1,
          },
        ],
      },
    });
  });
  it('keeps unknown cancellation pending, then unlocks only confirmed same-request cancellation', async () => {
    const h = mount({ cancelLost: true, preSendLoss: true });
    const user = await choose();
    await user.click(screen.getByRole('button', { name: '插入圖片' }));
    await screen.findByText(/圖片處理結果尚未確認/u);
    await user.click(screen.getByRole('button', { name: '取消這次上傳' }));
    await waitFor(() => {
      expect(h.abort).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText('圖片檔案')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '確認並恢復處理' }),
    ).toBeEnabled();
    h.allowCancel();
    const cancel = screen.getByRole('button', { name: '取消這次上傳' });
    act(() => {
      fireEvent.click(cancel);
      fireEvent.click(cancel);
    });
    await waitFor(() =>
      expect(screen.getByLabelText('圖片檔案')).toBeEnabled(),
    );
    expect(screen.getByLabelText('圖片檔案')).toHaveValue('');
    expect(h.abort).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText(`content-media:${id(8)}`),
    ).not.toBeInTheDocument();
    expect(screen.getByText(`content-media:${id(6)}`)).toBeVisible();
    expect(h.begin).toHaveBeenCalledTimes(1);
  });
  it('gates same-tick upload double clicks before the network promise settles', async () => {
    let done: () => void = () => undefined;
    const deferred = new Promise<void>((resolve) => {
      done = resolve;
    });
    const h = mount({ firstLost: false, deferred });
    await choose();
    const button = screen.getByRole('button', { name: '插入圖片' });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => {
      expect(h.process).toHaveBeenCalledTimes(1);
    });
    done();
    await waitFor(() =>
      expect(screen.getByText(`content-media:${id(8)}`)).toBeVisible(),
    );
    expect(h.begin).toHaveBeenCalledTimes(1);
    expect(h.uploadSigned).toHaveBeenCalledTimes(1);
    expect(h.processorCalls()).toBe(1);
  });
});
