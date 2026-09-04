import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { StudentBackNavigationProvider } from '../../../app/shell/student-back-navigation';
import type { LearningRepository } from '../api/learning-repository';
import type { ChapterDetailCardView } from './chapter-detail-view-model';
import { ChapterReviewReader } from './chapter-review-reader';

const repository = {
  resolveReviewMedia: vi.fn().mockResolvedValue([]),
} as unknown as LearningRepository;

function renderReader(content: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const card: ChapterDetailCardView = {
    cardId: 'review-card-pagination-test',
    completed: false,
    content,
    groupLabel: '色彩的分類',
    media: [],
    title: '色彩的分類',
  };
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <StudentBackNavigationProvider>{children}</StudentBackNavigationProvider>
    </QueryClientProvider>
  );
  return render(
    <ChapterReviewReader
      card={card}
      cardPosition={1}
      cardTotal={1}
      chapterLabel="第三章"
      completeError={undefined}
      completed={false}
      onBack={vi.fn()}
      onComplete={vi.fn()}
      pending={false}
      repository={repository}
      subtopicTitle="色彩三要素"
    />,
    { wrapper },
  );
}

function mockReviewBookMeasurement(
  blockHeight: (text: string) => number,
  pageHeight = 100,
) {
  const clientHeight = vi
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockImplementation(function mockClientHeight(this: HTMLElement) {
      return this.classList.contains(
        'chapter-review-reader__pagination-measure',
      )
        ? pageHeight
        : 0;
    });
  const clientWidth = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(function mockClientWidth(this: HTMLElement) {
      return this.classList.contains(
        'chapter-review-reader__pagination-measure',
      )
        ? 320
        : 0;
    });
  const scrollHeight = vi
    .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
    .mockImplementation(function mockScrollHeight(this: HTMLElement) {
      if (
        !this.classList.contains('chapter-review-reader__pagination-measure')
      ) {
        return 0;
      }
      return Array.from(this.children).reduce((height, child) => {
        const groupedListItemCount = child.querySelectorAll(
          '.review-card-markdown > :is(ol, ul) > li',
        ).length;
        return (
          height +
          blockHeight(child.textContent ?? '') *
            Math.max(1, groupedListItemCount)
        );
      }, 0);
    });

  return () => {
    clientHeight.mockRestore();
    clientWidth.mockRestore();
    scrollHeight.mockRestore();
  };
}

describe('ChapterReviewReader Markdown pagination', () => {
  it('讓超過單頁高度的完整表格使用可操作的頁面捲動 fallback', async () => {
    const restoreMeasurement = mockReviewBookMeasurement((text) =>
      text.includes('第一個重點') ? 180 : 40,
    );

    try {
      renderReader(`| 項目 | 說明 |
| --- | --- |
| 第一個重點 | 保留完整表格 |
| 第二個重點 | 不裁切內容 |
| 第三個重點 | 可上下捲動 |`);

      const fallbackPage = await waitFor(() => {
        const page = document.querySelector(
          '.chapter-review-reader__book-page[data-overflow-fallback="true"]',
        );
        expect(page).not.toBeNull();
        return page as HTMLElement;
      });
      expect(fallbackPage).toHaveAttribute('tabindex', '0');
      expect(fallbackPage).toHaveAccessibleName('本頁內容較長，可上下捲動');
      expect(fallbackPage).toHaveTextContent('第一個重點');
      expect(fallbackPage).toHaveTextContent('第三個重點');
    } finally {
      restoreMeasurement();
    }
  });

  it('依完整清單項目分頁，同頁項目維持單一清單與格式語意', async () => {
    const restoreMeasurement = mockReviewBookMeasurement((text) => {
      if (text.includes('色彩的分類')) return 40;
      if (text.includes('完整清單')) return 30;
      return 60;
    }, 140);

    try {
      renderReader(`## 完整清單
1. **第一項**：保留粗體。
2. 第二項：維持編號。
3. 第三項：同頁同清單。
4. ==第四項==：保留標記。`);

      const reader = await screen.findByRole('region', {
        name: /複習卡閱讀：色彩的分類/u,
      });
      const nextButton = within(reader).getByRole('button', {
        name: '閱讀下一頁',
      });
      await waitFor(() => expect(nextButton).toBeEnabled());
      expect(
        reader.querySelector('[data-overflow-fallback="true"]'),
      ).toBeNull();

      const secondPage = reader.querySelector('[data-page-number="2"]');
      expect(secondPage).not.toBeNull();
      expect(secondPage?.querySelectorAll('ol')).toHaveLength(1);
      expect(secondPage?.querySelectorAll('li')).toHaveLength(2);
      expect(secondPage).toHaveTextContent('第二項');
      expect(secondPage).toHaveTextContent('第三項');

      await userEvent.click(nextButton);
      expect(
        reader.querySelector('.chapter-review-reader__viewport'),
      ).toHaveTextContent('第四項');
      expect(
        reader.querySelector('.chapter-review-reader__viewport mark'),
      ).toHaveTextContent('第四項');
    } finally {
      restoreMeasurement();
    }
  });
});
