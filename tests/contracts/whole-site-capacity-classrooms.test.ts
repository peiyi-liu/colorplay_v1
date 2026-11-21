import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { describe, expect, it, vi } from 'vitest';
import { ensureCapacityClassrooms } from '../../scripts/concurrency/capacity-classrooms';
import type { CapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
const fixture = () => {
  const owner = randomUUID(),
    records = new Map<string, unknown>(),
    calls: string[] = [];
  const runtime = {
    journalRoot: 'synthetic',
    leg: { legId: 'fresh_registration-native_browser-40' },
    scope: { planId: 'wsc-abcdef-123456' },
    privatePlan: { actors: [{ userId: owner }] },
    planJournal: {
      write: async (name: string, value: unknown) => {
        await Promise.resolve();
        records.set(name, value);
      },
    },
  } as unknown as CapacityRuntime;
  const rpc = vi.fn(async (name: string) => {
    await Promise.resolve();
    calls.push(name);
    return {
      error: null,
      data: [
        {
          classroom_id: randomUUID(),
          classroom_name: '容量測試',
          join_code: '7KPM-X4TR',
          join_code_version: 1,
        },
      ],
    };
  });
  const client = { rpc } as unknown as SupabaseClient<Database>;
  return {
    runtime,
    client,
    rpc,
    records,
    calls,
    owner,
    read: async (_directory: string, name: string) => {
      await Promise.resolve();
      return records.get(name) ?? null;
    },
  };
};
describe('one-time normal teacher classroom setup', () => {
  it('write-ahead creates two exact classes then reuses confirmations without another RPC', async () => {
    const f = fixture(),
      teacher = {
        client: f.client,
        actorIndex: 0,
        measure: async <T>(
          _op: unknown,
          _cache: unknown,
          action: () => Promise<T>,
        ) => {
          await Promise.resolve();
          return action();
        },
      };
    const first = await ensureCapacityClassrooms(
      f.runtime,
      teacher,
      new AbortController().signal,
      f.read,
    );
    expect(first).toHaveLength(2);
    expect(f.calls).toHaveLength(2);
    await ensureCapacityClassrooms(
      f.runtime,
      teacher,
      new AbortController().signal,
      f.read,
    );
    expect(f.calls).toHaveLength(2);
  });
  it('does not mutate when an intent is unresolved or its write fails', async () => {
    const f = fixture(),
      teacher = {
        client: f.client,
        actorIndex: 0,
        measure: async <T>(
          _op: unknown,
          _cache: unknown,
          action: () => Promise<T>,
        ) => {
          await Promise.resolve();
          return action();
        },
      };
    f.records.set('registration-classroom-40-intent', { unknown: true });
    await expect(
      ensureCapacityClassrooms(
        f.runtime,
        teacher,
        new AbortController().signal,
        f.read,
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.calls).toHaveLength(0);
    f.records.clear();
    f.runtime.planJournal.write = async () => {
      await Promise.resolve();
      throw Error('WRITE_FAILED');
    };
    await expect(
      ensureCapacityClassrooms(
        f.runtime,
        teacher,
        new AbortController().signal,
        f.read,
      ),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
  it('retains reply-lost unknown and does not automatically retry create', async () => {
    const f = fixture();
    f.rpc.mockRejectedValue(new Error('REPLY_LOST'));
    const teacher = {
      client: f.client,
      actorIndex: 0,
      measure: async <T>(
        _op: unknown,
        _cache: unknown,
        action: () => Promise<T>,
      ) => {
        await Promise.resolve();
        return action();
      },
    };
    await expect(
      ensureCapacityClassrooms(
        f.runtime,
        teacher,
        new AbortController().signal,
        f.read,
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.records.has('registration-classroom-40-unknown')).toBe(true);
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
});
