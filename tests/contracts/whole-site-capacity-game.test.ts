import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { describe, expect, it, vi } from 'vitest';
import {
  runCapacityStudentGame,
  settleCapacityGameWork,
} from '../../scripts/concurrency/capacity-game';
import {
  runCapacityLiveGame,
  type CapacityGameActor,
} from '../../scripts/concurrency/capacity-live-game';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
const measure: CapacityGameActor['measure'] = async (_op, _cache, action) => {
  await Promise.resolve();
  return action();
};
describe('capacity full-journey mutation admission', () => {
  it('actual chapter repo read followed by failed review intent never starts a mutation', async () => {
    const rpc = vi.fn(async () => {
      await Promise.resolve();
      return {
        error: null,
        status: 200,
        data: {
          mode: 'open',
          rules_version: '2026-08-sequence-1',
          chapters: Array.from({ length: 6 }, (_, index) => ({
            chapter_id: randomUUID(),
            stable_code: `chapter-${String(index + 1)}`,
            title: '合成章節',
            description: '',
            sort_order: index + 1,
            access_state: 'available',
            blockers: [],
            progress_status: 'not_started',
            mastery: null,
            review_completed: 0,
            review_total: 1,
            template_id: randomUUID(),
            template_question_count: 3,
          })),
        },
      };
    });
    const client = { rpc } as unknown as SupabaseClient<Database>,
      journal = {
        directory: 'private-synthetic',
        write: async () => {
          await Promise.resolve();
          throw Error('DISK_FAILED');
        },
      };
    await expect(
      runCapacityStudentGame(
        { client, actorIndex: 1, measure },
        randomUUID(),
        randomUUID(),
        60,
        journal,
        new AbortController().signal,
      ),
    ).rejects.toThrow('DISK_FAILED');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_student_chapter_map');
  });
  it('dynamic Live reads a legal template but failed per-run intent blocks create across N actors', async () => {
    const f = await capacityFixture(),
      scope = parseCapacityScope(f.input, f.proof),
      templateId = randomUUID(),
      sectionId = randomUUID();
    const rpc = vi.fn(async () => {
      await Promise.resolve();
      return {
        error: null,
        data: [
          {
            section_id: sectionId,
            title: '合成小節',
            quiz_template_id: templateId,
          },
        ],
      };
    });
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      retry: async () => {
        await Promise.resolve();
        return {
          error: null,
          data: [{ id: templateId, question_count: 3 }],
        };
      },
    };
    const client = {
      rpc,
      from: () => builder,
    } as unknown as SupabaseClient<Database>;
    const actors = Array.from({ length: 10 }, (_, actorIndex) => ({
        client,
        actorIndex,
        measure,
      })),
      outside = { client, actorIndex: 0, measure };
    await expect(
      runCapacityLiveGame(
        scope,
        actors,
        outside,
        randomUUID(),
        {
          directory: 'synthetic',
          write: async () => {
            await Promise.resolve();
            throw Error('WRITE_FAILED');
          },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('WRITE_FAILED');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('list_live_section_options');
  });
  it('first failed student stops new admission immediately and still settles peer work', async () => {
    let release!: () => void;
    const peer = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    const stop = vi.fn();
    const pending = settleCapacityGameWork(
      [Promise.reject(new Error('FIXED_FAILURE')), peer],
      stop,
    ).finally(() => {
      finished = true;
    });
    const assertion = expect(pending).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(finished).toBe(false);
    release();
    await assertion;
  });
});

// Fake ports exercise only lifecycle. They are never capacity evidence.
import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import { runCapacityGameLoad } from '../../scripts/concurrency/capacity-game-load';
describe('teacher concurrency window uses real student request observation', () => {
  it('does not release from Node setup or call-start; native document event opens and actor completion closes window', async () => {
    const f = await capacityFixture(),
      scope = parseCapacityScope(f.input, f.proof),
      pages = [new EventEmitter(), new EventEmitter()],
      release: (() => void)[] = [],
      deltas: number[] = [];
    const client = {} as SupabaseClient<Database>,
      actors: CapacityGameActor[] = [
        {
          actorIndex: 0,
          client,
          measure: async (_op, _cache, action) => action(),
        },
        ...pages.map((page, index) => ({
          actorIndex: index + 1,
          client,
          page: page as unknown as Page,
          measure,
          observePhysical: () => {
            throw Error('NODE_MUST_NOT_COUNT_FOR_NATIVE');
          },
        })),
      ];
    const student = vi.fn(
      (...args: Parameters<typeof runCapacityStudentGame>) => {
        void args;
        return new Promise<Awaited<ReturnType<typeof runCapacityStudentGame>>>(
          (resolve) => {
            release.push(() => {
              resolve({
                quizQuestions: 3,
                mastery: true,
                economy: true,
                ledgerReconciled: true,
              });
            });
          },
        );
      },
    );
    const teacher = vi.fn(
      async (
        _actor: CapacityGameActor,
        _classroom: string,
        active: () => boolean,
      ) => {
        await Promise.resolve();
        expect(active()).toBe(true);
      },
    );
    const work = runCapacityGameLoad(
      {
        scope,
        actors,
        identities: actors.map(() => ({ userId: randomUUID() })),
        classroomId: randomUUID(),
        journal: { directory: 'synthetic', write: () => Promise.resolve() },
        signal: new AbortController().signal,
        onActive: (delta) => {
          deltas.push(delta);
        },
        stop: () => undefined,
      },
      { student, teacher },
    );
    await Promise.resolve();
    expect(teacher).not.toHaveBeenCalled();
    pages[0]?.emit('request', {
      url: () => scope.supabaseUrl + '/rest/v1/rpc/get_student_chapter_map',
      method: () => 'POST',
      isNavigationRequest: () => false,
    });
    await Promise.resolve();
    expect(teacher).not.toHaveBeenCalled();
    pages[0]?.emit('request', {
      url: () => scope.appUrl + '/app/chapters/' + randomUUID(),
      method: () => 'GET',
      isNavigationRequest: () => true,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(teacher).toHaveBeenCalledTimes(1);
    expect(deltas).toEqual([1]);
    release[0]?.();
    release[1]?.();
    await work;
    expect(deltas).toEqual([1, -1]);
    expect(pages.every((p) => p.listenerCount('request') === 0)).toBe(true);
  });
  it('failure before first physical request aborts teacher latch and settles peer work', async () => {
    const f = await capacityFixture(),
      scope = parseCapacityScope(f.input, f.proof),
      stop = vi.fn(),
      client = {} as SupabaseClient<Database>;
    const actors: CapacityGameActor[] = Array.from(
      { length: 3 },
      (_, actorIndex) => ({
        actorIndex,
        client,
        measure,
        observePhysical: () => () => undefined,
      }),
    );
    const student = vi.fn(
      (...args: Parameters<typeof runCapacityStudentGame>) => {
        if (args[0].actorIndex === 1)
          return Promise.reject(new Error('FIXED_FAILURE'));
        return new Promise<Awaited<ReturnType<typeof runCapacityStudentGame>>>(
          (_resolve, reject) => {
            const signal = args[5];
            if (signal.aborted) reject(new Error('ABORTED'));
            else
              signal.addEventListener(
                'abort',
                () => {
                  reject(new Error('ABORTED'));
                },
                { once: true },
              );
          },
        );
      },
    );
    const teacher = vi.fn(() => Promise.resolve());
    await expect(
      runCapacityGameLoad(
        {
          scope,
          actors,
          identities: actors.map(() => ({ userId: randomUUID() })),
          classroomId: randomUUID(),
          journal: { directory: 'synthetic', write: () => Promise.resolve() },
          signal: new AbortController().signal,
          onActive: () => undefined,
          stop,
        },
        { student, teacher },
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(teacher).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});
