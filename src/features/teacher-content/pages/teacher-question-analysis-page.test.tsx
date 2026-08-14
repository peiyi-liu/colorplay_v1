import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ClassroomRepository } from '../../classrooms/types';
import type { TeacherContentRepository } from '../api/teacher-content-repository';
import { TeacherQuestionAnalysisPage } from './teacher-question-analysis-page';

const classroomId = '29100000-0000-0000-0000-000000000001';
const repository = {
  getAssessmentQuestions: vi.fn().mockResolvedValue([
    {
      attempts: 10,
      chapter_id: '21000000-0000-0000-0000-000000000003',
      chapter_sort_order: 3,
      chapter_title: '色彩表示',
      correct_rate: 40,
      prompt: '題目甲',
      section_id: '22000000-0000-0000-0000-000000000001',
      section_sort_order: 1,
      section_title: '3-1 色彩三要素',
      stable_code: 'QB3101',
    },
    {
      attempts: 10,
      chapter_id: '21000000-0000-0000-0000-000000000003',
      chapter_sort_order: 3,
      chapter_title: '色彩表示',
      correct_rate: 70,
      prompt: '題目乙',
      section_id: '22000000-0000-0000-0000-000000000001',
      section_sort_order: 1,
      section_title: '3-1 色彩三要素',
      stable_code: 'QB3102',
    },
  ]),
  getQuestionDetail: vi.fn().mockResolvedValue({
    options: [{ option_key: 'A', option_text: '紅、綠、藍' }],
    prompt: '題目甲',
    stable_code: 'QB3101',
  }),
  getQuestionAnswer: vi.fn().mockResolvedValue({
    options: [
      { isCorrect: false, key: 'B', text: '紅、黃、藍' },
      { isCorrect: true, key: 'A', text: '紅、綠、藍' },
    ],
  }),
} as unknown as TeacherContentRepository;
const classrooms = {
  listOwned: vi.fn().mockResolvedValue([
    {
      classroomId,
      classroomName: '七年級 A 班',
      classroomStatus: 'active',
      createdAt: '2026-07-01T00:00:00+00:00',
      joinCode: null,
      joinCodeVersion: 1,
      memberCount: 30,
    },
  ]),
} as unknown as ClassroomRepository;

describe('TeacherQuestionAnalysisPage', () => {
  it('opens the first section, remains collapsible, and loads choices on demand', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[`/teacher/questions?classroomId=${classroomId}`]}
        >
          <TeacherQuestionAnalysisPage
            classroomRepository={classrooms}
            menu={<nav aria-label="測試教師導覽" />}
            repository={repository}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const section = await screen.findByText('3-1 色彩三要素');
    const disclosure = section.closest('details');
    expect(disclosure).toHaveAttribute('open');
    expect(repository.getQuestionDetail).not.toHaveBeenCalled();
    expect(repository.getQuestionAnswer).not.toHaveBeenCalled();
    await userEvent.click(section);
    expect(disclosure).not.toHaveAttribute('open');
    await userEvent.click(section);
    expect(disclosure).toHaveAttribute('open');
    const table = screen.getByRole('table', { name: '3-1 色彩三要素題目分析' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('題目甲');
    expect(repository.getQuestionDetail).not.toHaveBeenCalled();
    await userEvent.click(
      within(table).getByRole('button', { name: '查看 QB3101 題目內容' }),
    );
    expect(await within(table).findByText('A．紅、綠、藍')).toBeVisible();
    const correct = (await within(table).findByText(/正確答案/u)).closest('li');
    expect(correct).toHaveTextContent('A．紅、綠、藍');
    expect(repository.getQuestionAnswer).toHaveBeenCalledWith(
      classroomId,
      'QB3101',
      'section_quiz',
      null,
    );
    expect(within(table).getAllByRole('listitem')[0]).toHaveTextContent(
      'A．紅、綠、藍',
    );
  });

  it('keeps answer-free options unmarked when owner projection is denied', async () => {
    const deniedRepository = {
      ...repository,
      getQuestionAnswer: vi.fn().mockResolvedValue(null),
    } as unknown as TeacherContentRepository;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeacherQuestionAnalysisPage
            classroomRepository={classrooms}
            menu={<nav aria-label="測試教師導覽" />}
            repository={deniedRepository}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText('3-1 色彩三要素');
    const table = screen.getByRole('table', { name: '3-1 色彩三要素題目分析' });
    await userEvent.click(
      within(table).getByRole('button', { name: '查看 QB3101 題目內容' }),
    );
    expect(await within(table).findByText('A．紅、綠、藍')).toBeVisible();
    expect(within(table).queryByText(/正確答案/u)).toBeNull();
  });
});
