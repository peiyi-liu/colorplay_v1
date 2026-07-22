import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useMasteryHint,
  useMasteryState,
  useStartMastery,
  useSubmitMasteryAttempt,
} from '../hooks/use-mastery';
import { MissionPage } from './mission-page';

vi.mock('../hooks/use-mastery', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../hooks/use-mastery')>();
  return {
    ...original,
    useMasteryHint: vi.fn(),
    useMasteryState: vi.fn(),
    useStartMastery: vi.fn(),
    useSubmitMasteryAttempt: vi.fn(),
  };
});
vi.mock('../api/chapters', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/chapters')>();
  return { ...original, usePublishedChapters: vi.fn() };
});

const mockedState = vi.mocked(useMasteryState);
const mockedSubmit = vi.mocked(useSubmitMasteryAttempt);
const mockedHint = vi.mocked(useMasteryHint);
const mockedStart = vi.mocked(useStartMastery);

const asResult = (value: unknown) => value as never;

const baseState = {
  chapterId: '21000000-0000-0000-0000-000000000003',
  chapterTitle: '色彩表示',
  position: 2,
  question: {
    options: [
      { id: 'o1', key: 'A', locked: true, text: '橙色' },
      { id: 'o2', key: 'B', locked: false, text: '黃色' },
    ],
    prompt: 'R255 G255 B0 呈現何種色彩?',
    questionId: 'q1',
    subtopicTitle: '3-2 數位色彩',
    wrongAttempts: 1,
  },
  questionCount: 5,
  sessionId: 's1',
  stages: [
    { attempts: 2, completed: true, position: 1 },
    { attempts: 1, completed: false, position: 2 },
    { attempts: 0, completed: false, position: 3 },
    { attempts: 0, completed: false, position: 4 },
    { attempts: 0, completed: false, position: 5 },
  ],
  status: 'in_progress',
} as const;

describe('MissionPage', () => {
  beforeEach(() => {
    mockedStart.mockReturnValue(
      asResult({ isPending: false, mutate: vi.fn() }),
    );
    mockedSubmit.mockReturnValue(
      asResult({ isPending: false, mutate: vi.fn() }),
    );
    mockedHint.mockReturnValue(asResult({ isPending: false, mutate: vi.fn() }));
    mockedState.mockReturnValue(
      asResult({
        data: baseState,
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      }),
    );
  });

  it('renders the mastery map, scenario, and locks wrong options', () => {
    render(
      <MemoryRouter>
        <MissionPage sessionId="s1" />
      </MemoryRouter>,
    );
    expect(screen.getByText('R255 G255 B0 呈現何種色彩?')).toBeInTheDocument();
    const lockedOption = screen.getByRole('button', { name: '橙色' });
    expect(lockedOption).toBeDisabled();
    expect(screen.getByRole('button', { name: '黃色' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: '索取第 1 層提示' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/已完成 1 \/ 5 關/u)).toBeInTheDocument();
  });

  it('shows the victory card without fabricated rewards when completed', () => {
    mockedState.mockReturnValue(
      asResult({
        data: { ...baseState, question: null, status: 'completed' },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      }),
    );
    render(
      <MemoryRouter>
        <MissionPage sessionId="s1" />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: '階段任務挑戰完成！' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('+0 XP')).toBeNull();
  });
});
