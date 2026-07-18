import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { TeacherContentRepository } from '../api/teacher-content-repository';
import { TeacherContentWorkspacePage } from './teacher-content-workspace-page';

const draftQuestionId = '31500000-0000-0000-0000-000000000001';
const publishedQuestionId = '31500000-0000-0000-0000-000000000002';
const cardId = '31600000-0000-0000-0000-000000000001';
const subtopicId = '23000000-0000-0000-0000-000000000001';

const repositoryOf = (
  overrides: Readonly<Record<string, unknown>> = {},
): TeacherContentRepository =>
  ({
    archiveQuestion: vi.fn().mockResolvedValue(undefined),
    archiveReviewCard: vi.fn().mockResolvedValue(undefined),
    listCards: vi.fn().mockResolvedValue([
      {
        cardId,
        content: '色彩三要素是色相、明度、彩度。',
        groupLabel: '基礎',
        media: [
          { altText: '色相環圖', assetPath: 'https://example.com/wheel.png' },
        ],
        requiresRecompletion: false,
        stableCode: 'sheet-card-demo',
        status: 'published',
        subtopicId,
        title: '色彩三要素',
        version: 2,
      },
    ]),
    listQuestions: vi.fn().mockResolvedValue([
      {
        explanation: '草稿解析內容。',
        options: [
          { isCorrect: true, key: 'A', text: '草稿正解' },
          { isCorrect: false, key: 'B', text: '草稿誤答' },
        ],
        prompt: '草稿題目內容？',
        questionId: draftQuestionId,
        stableCode: '9-9-99',
        status: 'draft',
        subtopicId,
        version: 1,
      },
      {
        explanation: '因為互補色相對。',
        options: [
          { isCorrect: true, key: 'A', text: '綠色' },
          { isCorrect: false, key: 'B', text: '橙色' },
        ],
        prompt: '色相環上與紅色相對的顏色是？',
        questionId: publishedQuestionId,
        stableCode: '3-1-01',
        status: 'published',
        subtopicId,
        version: 3,
      },
    ]),
    listSubtopics: vi.fn().mockResolvedValue([
      {
        stableCode: 'sheet-3-1-all',
        subtopicId,
        title: '3-1 色彩三要素與色名的表示',
      },
    ]),
    publishQuestion: vi.fn().mockResolvedValue({ changed: true, version: 4 }),
    publishReviewCard: vi.fn().mockResolvedValue({ changed: true, version: 3 }),
    upsertQuestionDraft: vi.fn().mockResolvedValue(undefined),
    upsertReviewCardDraft: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as TeacherContentRepository;

const renderPage = (repository: TeacherContentRepository) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<TeacherContentWorkspacePage repository={repository} />, {
    wrapper,
  });
};

const rowOf = async (text: string) => {
  const cell = await screen.findByText(text);
  const row = cell.closest('tr');
  if (!row) throw new Error(`row not found for ${text}`);
  return within(row);
};

describe('TeacherContentWorkspacePage', () => {
  it('lists questions and cards with status and version badges', async () => {
    renderPage(repositoryOf());

    const draftRow = await rowOf('9-9-99');
    expect(draftRow.getByText('草稿')).toBeInTheDocument();
    expect(draftRow.getByText('v1')).toBeInTheDocument();
    const publishedRow = await rowOf('3-1-01');
    expect(publishedRow.getByText('已發布')).toBeInTheDocument();
    expect(publishedRow.getByText('v3')).toBeInTheDocument();
    const cardRow = await rowOf('色彩三要素');
    expect(cardRow.getByText('v2')).toBeInTheDocument();
  });

  it('creates a question draft through the trusted command', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    await userEvent.click(
      await screen.findByRole('button', { name: '新增題目' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('子題'),
      '3-1 色彩三要素與色名的表示',
    );
    await userEvent.type(screen.getByLabelText('題號'), '9-8-01');
    await userEvent.type(screen.getByLabelText('題目'), '新題目內容？');
    await userEvent.type(screen.getByLabelText('選項 A'), '第一個選項');
    await userEvent.type(screen.getByLabelText('選項 B'), '第二個選項');
    await userEvent.click(screen.getByLabelText('正解 A'));
    await userEvent.type(screen.getByLabelText('解析'), '解析內容。');
    await userEvent.click(screen.getByRole('button', { name: '儲存草稿' }));

    await waitFor(() => {
      expect(repository.upsertQuestionDraft).toHaveBeenCalledWith({
        payload: {
          explanation: '解析內容。',
          options: [
            { isCorrect: true, key: 'A', text: '第一個選項' },
            { isCorrect: false, key: 'B', text: '第二個選項' },
          ],
          prompt: '新題目內容？',
          stableCode: '9-8-01',
          subtopicId,
        },
        requestId: expect.any(String) as string,
      });
    });
  });

  it('blocks script-bearing text before it leaves the browser', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    await userEvent.click(
      await screen.findByRole('button', { name: '新增題目' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('子題'),
      '3-1 色彩三要素與色名的表示',
    );
    await userEvent.type(screen.getByLabelText('題號'), '9-8-02');
    await userEvent.type(
      screen.getByLabelText('題目'),
      '<script>window.__xss=1</script>',
    );
    await userEvent.type(screen.getByLabelText('選項 A'), '甲');
    await userEvent.type(screen.getByLabelText('選項 B'), '乙');
    await userEvent.click(screen.getByLabelText('正解 A'));
    await userEvent.type(screen.getByLabelText('解析'), '解析。');
    await userEvent.click(screen.getByRole('button', { name: '儲存草稿' }));

    expect(
      await screen.findByText('內容含不允許的 script 或事件屬性。'),
    ).toBeInTheDocument();
    expect(repository.upsertQuestionDraft).not.toHaveBeenCalled();
  });

  it('requires exactly one correct option', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    await userEvent.click(
      await screen.findByRole('button', { name: '新增題目' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('子題'),
      '3-1 色彩三要素與色名的表示',
    );
    await userEvent.type(screen.getByLabelText('題號'), '9-8-03');
    await userEvent.type(screen.getByLabelText('題目'), '題目？');
    await userEvent.type(screen.getByLabelText('選項 A'), '甲');
    await userEvent.type(screen.getByLabelText('選項 B'), '乙');
    await userEvent.type(screen.getByLabelText('解析'), '解析。');
    await userEvent.click(screen.getByRole('button', { name: '儲存草稿' }));

    expect(
      await screen.findByText('請標記剛好一個正確選項。'),
    ).toBeInTheDocument();
    expect(repository.upsertQuestionDraft).not.toHaveBeenCalled();
  });

  it('publishes a draft after confirmation and reports the version', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    const draftRow = await rowOf('9-9-99');
    await userEvent.click(draftRow.getByRole('button', { name: '發布' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: '確認發布' }),
    );

    await waitFor(() => {
      expect(repository.publishQuestion).toHaveBeenCalledWith({
        payload: null,
        questionId: draftQuestionId,
        requestId: expect.any(String) as string,
      });
    });
    expect(await screen.findByText('已發布第 4 版。')).toBeInTheDocument();
  });

  it('archives a question after confirmation', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    const publishedRow = await rowOf('3-1-01');
    await userEvent.click(publishedRow.getByRole('button', { name: '封存' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: '確認封存' }),
    );

    await waitFor(() => {
      expect(repository.archiveQuestion).toHaveBeenCalledWith(
        publishedQuestionId,
        expect.any(String),
      );
    });
  });

  it('republishes an edited published question as a new version', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    const publishedRow = await rowOf('3-1-01');
    await userEvent.click(publishedRow.getByRole('button', { name: '編輯' }));
    const prompt = screen.getByLabelText('題目');
    expect(prompt).toHaveValue('色相環上與紅色相對的顏色是？');
    await userEvent.clear(prompt);
    await userEvent.type(prompt, '與紅色互補的顏色是？');
    await userEvent.click(screen.getByRole('button', { name: '發布新版本' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: '確認發布' }),
    );

    await waitFor(() => {
      expect(repository.publishQuestion).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          prompt: '與紅色互補的顏色是？',
          stableCode: '3-1-01',
        }) as unknown,
        questionId: publishedQuestionId,
        requestId: expect.any(String) as string,
      });
    });
  });

  it('requires alt text when a review card has a media url', async () => {
    const repository = repositoryOf();
    renderPage(repository);

    await userEvent.click(
      await screen.findByRole('button', { name: '新增複習卡' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('子題'),
      '3-1 色彩三要素與色名的表示',
    );
    await userEvent.type(screen.getByLabelText('卡片代碼'), 'card-new-01');
    await userEvent.type(screen.getByLabelText('標題'), '新複習卡');
    await userEvent.type(screen.getByLabelText('內容'), '複習內容。');
    await userEvent.type(
      screen.getByLabelText('圖片網址（選填）'),
      'https://example.com/pic.png',
    );
    await userEvent.click(screen.getByRole('button', { name: '儲存草稿' }));

    expect(
      await screen.findByText('有圖片時必須填寫替代文字。'),
    ).toBeInTheDocument();
    expect(repository.upsertReviewCardDraft).not.toHaveBeenCalled();

    await userEvent.type(
      screen.getByLabelText('替代文字（圖片時必填）'),
      '示意圖',
    );
    await userEvent.click(screen.getByRole('button', { name: '儲存草稿' }));

    await waitFor(() => {
      expect(repository.upsertReviewCardDraft).toHaveBeenCalledWith({
        payload: {
          content: '複習內容。',
          groupLabel: '',
          media: [
            {
              altText: '示意圖',
              assetPath: 'https://example.com/pic.png',
            },
          ],
          requiresRecompletion: false,
          stableCode: 'card-new-01',
          subtopicId,
          title: '新複習卡',
        },
        requestId: expect.any(String) as string,
      });
    });
  });
});
