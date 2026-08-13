import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { TeacherContentRepository } from '../api/teacher-content-repository';
import {
  teacherContentKeys,
  useTeacherQuestionAnswer,
} from './use-teacher-content';

const repository = (getQuestionAnswer: ReturnType<typeof vi.fn>) =>
  ({ getQuestionAnswer }) as unknown as TeacherContentRepository;

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
    }
  >
    {children}
  </QueryClientProvider>
);

describe('useTeacherQuestionAnswer', () => {
  it('does not query until classroom and stable question identities exist', () => {
    const getQuestionAnswer = vi.fn();
    const { rerender } = renderHook(
      ({ classroomId, stableCode }) =>
        useTeacherQuestionAnswer(
          classroomId,
          stableCode,
          repository(getQuestionAnswer),
        ),
      {
        initialProps: { classroomId: '', stableCode: '' },
        wrapper,
      },
    );

    expect(getQuestionAnswer).not.toHaveBeenCalled();
    rerender({ classroomId: 'classroom-id', stableCode: '' });
    expect(getQuestionAnswer).not.toHaveBeenCalled();
  });

  it('uses a dedicated query key and preserves a denied null result', async () => {
    const getQuestionAnswer = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(
      () =>
        useTeacherQuestionAnswer(
          'classroom-id',
          'QB3101',
          repository(getQuestionAnswer),
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toBeNull();
    expect(getQuestionAnswer).toHaveBeenCalledWith('classroom-id', 'QB3101');
    expect(teacherContentKeys.questionAnswer('classroom-id', 'QB3101')).toEqual(
      ['teacher-content', 'question-answer', 'classroom-id', 'QB3101'],
    );
  });
});
