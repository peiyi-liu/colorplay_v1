import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ContentAuthoringRepository } from '../api/content-authoring-repository';
import { AdminContentPage } from './admin-content-page';

const CHAPTER_ID = '21000000-0000-0000-0000-000000000003';
const SECTION_ID = '22000000-0000-0000-0000-000000000031';
const SUBTOPIC_ID = '23000000-0000-0000-0000-000000000311';
const CARD_ID = '24000000-0000-0000-0000-000000000311';
const DRAFT_ID = '74000000-0000-4000-8000-000000000311';
const REQUEST_ID = '91000000-0000-4000-8000-000000000001';

const scope = {
  chapter: {
    chapterId: CHAPTER_ID,
    sortOrder: 3,
    stableCode: 'chapter-3',
    status: 'published' as const,
    title: '色彩表示',
  },
  chapterBanks: [],
  drafts: [
    {
      draftId: DRAFT_ID,
      entityId: CARD_ID,
      entityType: 'review_card' as const,
      revision: 2,
      stableCode: 'RC3101',
      updatedAt: '2026-09-26T08:00:00Z',
    },
  ],
  outcome: 'ok' as const,
  requestId: REQUEST_ID,
  sections: [
    {
      banks: [],
      sectionId: SECTION_ID,
      sortOrder: 1,
      stableCode: 'section-3-1',
      status: 'published' as const,
      subtopics: [
        {
          reviewCardCount: 1,
          reviewCards: [
            {
              entityId: CARD_ID,
              sortOrder: 1,
              stableCode: 'RC3101',
              status: 'published' as const,
              title: '色彩三要素',
              version: 1,
            },
          ],
          sortOrder: 1,
          stableCode: 'subtopic-3-1-1',
          status: 'published' as const,
          subtopicId: SUBTOPIC_ID,
          title: '色彩三要素',
        },
      ],
      title: '3-1 色彩表示',
    },
  ],
};

function makeRepository(): {
  repository: ContentAuthoringRepository;
  saveDraft: ReturnType<typeof vi.fn>;
} {
  const saveDraft = vi.fn().mockResolvedValue({
    draft: {
      baseVersion: 1,
      draftId: DRAFT_ID,
      entityId: CARD_ID,
      entityType: 'review_card',
      payload: {},
      revision: 3,
      source: 'manual',
      stableCode: 'RC3101',
      updatedAt: '2026-09-26T09:00:00Z',
    },
    outcome: 'ok',
    replayed: false,
    requestId: REQUEST_ID,
  });
  return {
    repository: {
      listScope: vi.fn().mockResolvedValue(scope),
      previewDraft: vi.fn().mockResolvedValue({
        draftId: DRAFT_ID,
        outcome: 'ok',
        projection: {
          content: '明度、彩度與色相。',
          entityType: 'review_card',
          groupLabel: '3-1',
          media: [],
          stableCode: 'RC3101',
          title: '色彩三要素',
        },
        requestId: REQUEST_ID,
        revision: 3,
      }),
      readEditorState: vi.fn().mockResolvedValue({
        current: {
          entityId: CARD_ID,
          entityType: 'review_card',
          payload: {
            content: '原始內容',
            group_label: '3-1',
            sort_order: 1,
            subtopic_id: SUBTOPIC_ID,
            title: '色彩三要素',
          },
          stableCode: 'RC3101',
          status: 'published',
          version: 1,
        },
        draft: {
          baseVersion: 1,
          draftId: DRAFT_ID,
          entityId: CARD_ID,
          entityType: 'review_card',
          payload: {
            content: '草稿內容',
            group_label: '3-1',
            sort_order: 1,
            subtopic_id: SUBTOPIC_ID,
            title: '色彩三要素',
          },
          revision: 2,
          source: 'manual',
          stableCode: 'RC3101',
          updatedAt: '2026-09-26T08:00:00Z',
        },
        outcome: 'ok',
        requestId: REQUEST_ID,
      }),
      saveDraft,
      validateDraft: vi.fn().mockResolvedValue({
        draftId: DRAFT_ID,
        issues: [],
        outcome: 'ok',
        requestId: REQUEST_ID,
        revision: 3,
        valid: true,
      }),
    },
    saveDraft,
  };
}

function renderPage(bundle = makeRepository()) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  render(<AdminContentPage repository={bundle.repository} />, {
    wrapper: Wrapper,
  });
  return bundle;
}

describe('AdminContentPage', () => {
  it('shows the approved A workspace and keeps selection when switching to C list mode', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: '內容工作台' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('region', { name: '內容階層' }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: '範圍內容' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'RC3101 色彩三要素' }));
    expect(await screen.findByDisplayValue('草稿內容')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '全部內容清單' }));
    const table = screen.getByRole('table', { name: '全部內容' });
    expect(within(table).getByText('RC3101')).toBeVisible();
    expect(screen.getByText('已選取：RC3101')).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: '選取 RC3101' }));
    expect(screen.getByText(/已選取 1 項/)).toBeVisible();
  });

  it('saves a persistent draft with the current revision and validates it', async () => {
    const user = userEvent.setup();
    const { saveDraft } = renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'RC3101 色彩三要素' }),
    );
    const content = await screen.findByLabelText('複習卡內容');
    await user.clear(content);
    await user.type(content, '更新後的內容');
    await user.click(screen.getByRole('button', { name: '儲存草稿' }));

    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: DRAFT_ID,
          entityId: CARD_ID,
          entityType: 'review_card',
          expectedRevision: 2,
          source: 'manual',
          stableCode: 'RC3101',
        }),
      );
    });
    expect(await screen.findByText('草稿已儲存（修訂 3）')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '驗證草稿' }));
    expect(await screen.findByText('草稿驗證通過')).toBeVisible();
  });
});
