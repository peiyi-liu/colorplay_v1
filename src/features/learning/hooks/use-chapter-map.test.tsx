import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { studentChapterMapKey, useStudentChapterMap } from './use-chapter-map';

const clientWith = (rpc: ReturnType<typeof vi.fn>) =>
  ({ rpc }) as unknown as SupabaseClient<Database>;

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

describe('useStudentChapterMap', () => {
  it('stores the authoritative projection under one stable query key', async () => {
    const chapters = Array.from({ length: 6 }, (_, index) => ({
      access_state: 'available',
      blockers: [],
      chapter_id: `21000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
      description: '',
      mastery: null,
      progress_status: 'not_started',
      review_completed: 0,
      review_total: 1,
      sort_order: index + 1,
      stable_code: `chapter-${String(index + 1)}`,
      template_id: `26000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
      template_question_count: 10,
      title: `第 ${String(index + 1)} 章`,
    }));
    const rpc = vi.fn().mockResolvedValue({
      data: {
        chapters,
        mode: 'open',
        rules_version: '2026-08-sequence-1',
      },
      error: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useStudentChapterMap(clientWith(rpc)), {
      wrapper: wrapper(queryClient),
    });

    expect(studentChapterMapKey).toEqual(['learning', 'chapter-map']);
    await waitFor(() => {
      expect(result.current.data).toMatchObject({
        mode: 'open',
        rulesVersion: '2026-08-sequence-1',
      });
      expect(result.current.data?.chapters).toHaveLength(6);
      expect(result.current.data?.chapters[0]).toMatchObject({
        stableCode: 'chapter-1',
      });
    });
    expect(queryClient.getQueryData(studentChapterMapKey)).toEqual(
      result.current.data,
    );
  });
});
