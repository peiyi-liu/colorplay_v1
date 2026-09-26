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
const BANK_ID = '25000000-0000-0000-0000-000000000031';
const QUESTION_ID = '26000000-0000-0000-0000-000000000311';

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
  it('opens on the content list with the approved filters and no batch selection', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: '內容工作台' }),
    ).toBeVisible();
    expect(await screen.findByRole('button', { name: '清單' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '外部匯入' })).toBeVisible();
    expect(screen.getByRole('button', { name: '發布／歷史' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '工作區' })).toBeNull();
    expect(screen.queryByText('新增類型')).toBeNull();

    const table = screen.getByRole('table', { name: '全部內容' });
    expect(within(table).getByText('RC3101')).toBeVisible();
    expect(within(table).queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: '新增' })).toBeVisible();
    expect(screen.getByLabelText('章節')).toHaveValue(CHAPTER_ID);
    expect(screen.getByLabelText('小節')).toBeVisible();
    expect(screen.getByLabelText('內容類型')).toBeVisible();
    expect(screen.getByLabelText('題庫類型')).toBeVisible();
    expect(screen.getByLabelText('狀態')).toBeVisible();
    expect(screen.getByLabelText('搜尋內容')).toBeVisible();

    await user.click(
      within(table).getByRole('button', { name: '編輯 RC3101' }),
    );
    expect(await screen.findByDisplayValue('草稿內容')).toBeVisible();
    expect(screen.queryByRole('region', { name: '內容階層' })).toBeNull();
    expect(screen.getByLabelText('穩定代碼')).toBeDisabled();
    expect(screen.getByLabelText('上層 ID')).toBeDisabled();
  });

  it('saves a persistent draft with the current revision and validates it', async () => {
    const user = userEvent.setup();
    const { saveDraft } = renderPage();

    const table = await screen.findByRole('table', { name: '全部內容' });
    await user.click(
      within(table).getByRole('button', { name: '編輯 RC3101' }),
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
    expect(await screen.findByText(/草稿驗證通過/)).toBeVisible();
  });

  it('starts creation from the list and returns to the list after a successful save', async () => {
    const user = userEvent.setup();
    const bundle = makeRepository();
    bundle.saveDraft.mockResolvedValueOnce({
      draft: {
        baseVersion: null,
        draftId: DRAFT_ID,
        entityId: null,
        entityType: 'review_card',
        payload: {},
        revision: 1,
        source: 'manual',
        stableCode: 'RC3102',
        updatedAt: '2026-09-26T09:00:00Z',
      },
      outcome: 'ok',
      replayed: false,
      requestId: REQUEST_ID,
    });
    renderPage(bundle);

    await user.click(await screen.findByRole('button', { name: '新增' }));
    expect(screen.getByLabelText('新增類型')).toBeVisible();
    expect(screen.getByRole('heading', { name: '新增複習卡' })).toBeVisible();

    await user.selectOptions(screen.getByLabelText('小節'), SECTION_ID);
    await user.selectOptions(screen.getByLabelText('子主題'), SUBTOPIC_ID);
    await user.type(screen.getByLabelText('標題'), '新複習卡');
    await user.type(screen.getByLabelText('複習卡內容'), '新內容');
    await user.click(screen.getByRole('button', { name: '新增內容' }));

    expect(
      await screen.findByText('內容已儲存，可在清單中確認。'),
    ).toBeVisible();
    expect(screen.getByRole('table', { name: '全部內容' })).toBeVisible();
  });

  it('paginates long content lists instead of rendering every row at once', async () => {
    const user = userEvent.setup();
    const bundle = makeRepository();
    const reviewCards = Array.from({ length: 15 }, (_, index) => ({
      entityId: `24000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
      sortOrder: index + 1,
      stableCode: `RC31${String(index + 1).padStart(2, '0')}`,
      status: 'published' as const,
      title: `複習卡 ${String(index + 1)}`,
      version: 1,
    }));
    const baseSubtopic = scope.sections[0]?.subtopics[0];
    if (!baseSubtopic) throw new Error('TEST_SUBTOPIC_REQUIRED');
    bundle.repository.listScope = vi.fn().mockResolvedValue({
      ...scope,
      drafts: [],
      sections: [
        {
          ...scope.sections[0],
          subtopics: [
            {
              ...baseSubtopic,
              reviewCardCount: reviewCards.length,
              reviewCards,
            },
          ],
        },
      ],
    });
    renderPage(bundle);

    const table = await screen.findByRole('table', { name: '全部內容' });
    expect(within(table).queryByText('RC3115')).toBeNull();
    await user.click(screen.getByRole('button', { name: '下一頁' }));
    expect(within(table).getByText('RC3115')).toBeVisible();
  });

  it('shows the question-specific editor without an editable timer or duplicate heading', async () => {
    const user = userEvent.setup();
    const bundle = makeRepository();
    bundle.repository.listScope = vi.fn().mockResolvedValue({
      ...scope,
      drafts: [],
      sections: [
        {
          ...scope.sections[0],
          banks: [
            {
              bankId: BANK_ID,
              kind: 'QB',
              questionCount: 1,
              questions: [
                {
                  entityId: QUESTION_ID,
                  sortOrder: 1,
                  stableCode: 'QB3101',
                  status: 'published',
                  title: '何者屬於色彩三要素？',
                  version: 1,
                },
              ],
              sortOrder: 1,
              stableCode: 'QB-section-3-1',
              status: 'published',
              title: '3-1 小節測驗',
            },
          ],
        },
      ],
    });
    bundle.repository.readEditorState = vi.fn().mockResolvedValue({
      current: {
        entityId: QUESTION_ID,
        entityType: 'question',
        payload: {
          bank_id: BANK_ID,
          duration_seconds: 20,
          explanation: '色相、明度、彩度是色彩三要素。',
          options: ['色相', '明度', '彩度', '材質'].map((text, index) => ({
            is_correct: index === 0,
            key: ['A', 'B', 'C', 'D'][index],
            sort_order: index + 1,
            text,
          })),
          prompt: '何者屬於色彩三要素？',
          question_type: 'single_choice',
          sort_order: 1,
        },
        stableCode: 'QB3101',
        status: 'published',
        version: 1,
      },
      draft: null,
      outcome: 'ok',
      requestId: REQUEST_ID,
    });
    renderPage(bundle);

    const table = await screen.findByRole('table', { name: '全部內容' });
    await user.click(
      within(table).getByRole('button', { name: '編輯 QB3101' }),
    );

    expect(
      await screen.findByRole('heading', { name: '編輯 QB3101' }),
    ).toBeVisible();
    expect(screen.getByLabelText('題庫類型')).toHaveValue('QB');
    expect(screen.getByLabelText('題型')).toHaveValue('單選題');
    expect(screen.getByLabelText('穩定代碼')).toBeDisabled();
    expect(screen.getByLabelText('上層 ID')).toBeDisabled();
    expect(screen.getByLabelText('題目')).toBeVisible();
    expect(screen.getByLabelText('選項 D')).toBeVisible();
    expect(screen.getByLabelText('正確選項')).toBeVisible();
    expect(screen.getByLabelText('解說')).toBeVisible();
    expect(screen.queryByLabelText('作答秒數')).toBeNull();
  });
});
