import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  LearningError,
  type LearningRepository,
} from '../../learning/api/learning-repository';
import { HintPanel } from './hint-panel';

const renderPanel = (repository: LearningRepository, locked = false) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    <HintPanel
      locked={locked}
      repository={repository}
      sessionQuestionId="26100000-0000-0000-0000-000000000001"
    />,
    { wrapper },
  );
};

describe('HintPanel', () => {
  it('reveals server hints strictly in order', async () => {
    const requestHint = vi
      .fn()
      .mockResolvedValueOnce({
        content: '提示一內容',
        hintLevel: 1,
        questionVersion: 1,
      })
      .mockResolvedValueOnce({
        content: '提示二內容',
        hintLevel: 2,
        questionVersion: 1,
      });
    const repository = { requestHint } as unknown as LearningRepository;
    renderPanel(repository);

    fireEvent.click(
      screen.getByRole('button', { name: '索取提示（第 1 層）' }),
    );
    await waitFor(() => {
      expect(screen.getByText(/提示一內容/u)).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('button', { name: '索取提示（第 2 層）' }),
    );
    await waitFor(() => {
      expect(screen.getByText(/提示二內容/u)).toBeInTheDocument();
    });
    expect(requestHint).toHaveBeenNthCalledWith(1, {
      hintLevel: 1,
      sessionQuestionId: '26100000-0000-0000-0000-000000000001',
    });
    expect(requestHint).toHaveBeenNthCalledWith(2, {
      hintLevel: 2,
      sessionQuestionId: '26100000-0000-0000-0000-000000000001',
    });
  });

  it('stops offering hints once the server reports unavailability', async () => {
    const requestHint = vi
      .fn()
      .mockRejectedValue(new LearningError('HINT_UNAVAILABLE'));
    const repository = { requestHint } as unknown as LearningRepository;
    renderPanel(repository);

    fireEvent.click(
      screen.getByRole('button', { name: '索取提示（第 1 層）' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '這一題沒有更多提示了。',
      );
    });
    expect(
      screen.queryByRole('button', { name: /索取提示/u }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when locked without revealed hints', () => {
    const repository = {
      requestHint: vi.fn(),
    } as unknown as LearningRepository;
    const { container } = renderPanel(repository, true);

    expect(container).toBeEmptyDOMElement();
  });
});
