import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext } from '../../auth/context/auth-context';
import type { TeacherContentRepository } from '../api/teacher-content-repository';
import {
  teacherContentKeys,
  useTeacherQuestionAnswer,
} from './use-teacher-content';

const repository = (getQuestionAnswer: ReturnType<typeof vi.fn>) =>
  ({ getQuestionAnswer }) as unknown as TeacherContentRepository;

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <AuthContext.Provider
    value={{
      session: { userId: 'teacher-id' },
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
      signOut: vi.fn(),
      status: 'authenticated',
    }}
  >
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      {children}
    </QueryClientProvider>
  </AuthContext.Provider>
);

describe('useTeacherQuestionAnswer', () => {
  it('does not query until classroom and stable question identities exist', () => {
    const getQuestionAnswer = vi.fn();
    const { rerender } = renderHook(
      ({ classroomId, stableCode }) =>
        useTeacherQuestionAnswer(
          classroomId,
          stableCode,
          'section_quiz',
          null,
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
          'section_quiz',
          null,
          repository(getQuestionAnswer),
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toBeNull();
    expect(getQuestionAnswer).toHaveBeenCalledWith(
      'classroom-id',
      'QB3101',
      'section_quiz',
      null,
    );
    expect(
      teacherContentKeys.questionAnswer(
        'teacher-id',
        'classroom-id',
        'QB3101',
        'section_quiz',
        null,
      ),
    ).toEqual([
      'teacher-content',
      'teacher-id',
      'question-answer',
      'classroom-id',
      'QB3101',
      'section_quiz',
      null,
    ]);
  });

  it('scopes teacher analytics cache entries to the authenticated actor', () => {
    expect(
      teacherContentKeys.classroomOverview('teacher-id', 'classroom-id', {
        chapterId: 'chapter-id',
      }),
    ).toEqual([
      'teacher-content',
      'teacher-id',
      'classroom-overview',
      'classroom-id',
      { chapterId: 'chapter-id' },
    ]);
  });
});
