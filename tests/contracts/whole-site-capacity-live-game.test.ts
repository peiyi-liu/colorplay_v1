import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapacityLiveGate } from '../../scripts/concurrency/capacity-live-game';
const state = {
  session_id: '18400000-0000-0000-0000-000000000001',
  state: 'lobby',
  state_version: 2,
  current_position: 0,
  question_count: 3,
  participant_count: 2,
  rules_version: '2026-07-live-1',
  question_display: 'device',
  server_time: '2026-07-17T15:00:00+00:00',
  is_host: false,
  mode: 'individual',
  team_count: null,
};
const fixture = () => {
  let callback: (status: string, error?: Error) => void = () => undefined;
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb: typeof callback) => {
      callback = cb;
    }),
  };
  const rpc = vi.fn(async () => {
    await Promise.resolve();
    return { data: state, error: null };
  });
  const channelMock = vi.fn(() => channel),
    removeMock = vi.fn(async () => {
      await Promise.resolve();
      return 'ok';
    });
  const client = {
    channel: channelMock,
    removeChannel: removeMock,
    rpc,
  } as unknown as SupabaseClient<Database>;
  const abort = new AbortController();
  return {
    client,
    channelMock,
    removeMock,
    rpc,
    abort,
    callback: (status: string, error?: Error) => {
      callback(status, error);
    },
  };
};
afterEach(() => vi.useRealTimers());
describe('dynamic capacity live gate keeps original 20s authoritative semantics', () => {
  it('broadcast wakes a second authoritative fetch instead of trusting payload as state', async () => {
    const f = fixture(),
      gate = createCapacityLiveGate(f.client, f.abort.signal);
    let complete = false;
    const read = gate
      .wait(state.session_id, (s) => s.stateVersion === 3)
      .then(() => {
        complete = true;
      });
    await vi.waitFor(() => {
      expect(f.rpc).toHaveBeenCalledTimes(1);
    });
    expect(complete).toBe(false);
    f.rpc.mockResolvedValue({
      data: { ...state, state_version: 3 },
      error: null,
    });
    gate.notify();
    await read;
    expect(f.rpc).toHaveBeenCalledTimes(2);
    gate.close();
  });
  it('stalled actual state read cannot exceed the existing 20s waiter budget', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.rpc.mockImplementation(() => new Promise(() => undefined));
    const gate = createCapacityLiveGate(f.client, f.abort.signal);
    const pending = gate.wait(state.session_id, () => false);
    const rejected = expect(pending).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    gate.close();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('private ACK is mandatory and explicit outsider refusal additionally requires ok removal', async () => {
    const f = fixture(),
      gate = createCapacityLiveGate(f.client, f.abort.signal);
    const subscribed = gate.subscribe(state.session_id);
    f.callback('SUBSCRIBED');
    await subscribed;
    const denied = gate.subscribe(state.session_id, true);
    f.callback(
      'CHANNEL_ERROR',
      new Error(
        'Unauthorized: You do not have permissions to read from this Channel topic: SYNTHETIC_TOPIC',
      ),
    );
    await denied;
    expect(f.removeMock).toHaveBeenCalledTimes(1);
    gate.close();
  });
  it('unknown refusal and late channel failure stay fail closed; aborted gate creates no channel', async () => {
    const f = fixture(),
      gate = createCapacityLiveGate(f.client, f.abort.signal);
    const rejected = expect(
      gate.subscribe(state.session_id, true),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    f.callback('CHANNEL_ERROR', new Error('UNKNOWN_SECRET'));
    await rejected;
    f.abort.abort();
    const count = f.channelMock.mock.calls.length;
    await expect(gate.subscribe(state.session_id)).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    expect(f.channelMock).toHaveBeenCalledTimes(count);
    gate.close();
  });
});
