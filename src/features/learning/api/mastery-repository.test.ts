import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { createMasteryRepository } from './mastery-repository';

describe('mastery repository access failures', () => {
  it('maps a direct locked chapter response to CHAPTER_LOCKED', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'CHAPTER_LOCKED' },
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(
      createMasteryRepository(client).startSession(
        '21000000-0000-0000-0000-000000000002',
      ),
    ).rejects.toMatchObject({
      code: 'CHAPTER_LOCKED',
      message: '請先完成上一章的複習與挑戰。',
    });
  });
});
