import { describe, expect, it, vi } from 'vitest';
import {
  createCapacityColdEntryDiagnostics,
  type ColdEntryActor,
} from '../../scripts/concurrency/capacity-cold-entry-diagnostics';
const fixture = (count = 1) => {
  let now = 0,
    user = 0;
  return createCapacityColdEntryDiagnostics(count, {
    now: () => ++now,
    cpu: () => ({ user: (user += 100), system: 0 }),
    elu: () => ({ active: now, idle: 0 }),
  });
};
const requirePort = (value: ColdEntryActor | undefined) => {
  if (!value) throw Error('FIXTURE_PORT');
  return value;
};
const complete = (p: ColdEntryActor, lifecycle = true) => {
  p.arm();
  p.note('GOTO_ENTER');
  if (lifecycle) {
    p.note('FRAME_COMMITTED');
    p.note('DOM_CONTENT_LOADED');
    p.note('LOAD');
  }
  p.note('DOCUMENT_REQUEST', { cdpAtMs: 9000 });
  p.note('DOCUMENT_RESPONSE', { status: 200 });
  p.note('GOTO_FULFILLED');
  p.note('HEADING_FULFILLED');
  p.note('DOCUMENT_FINISHED', { cdpAtMs: 9050 });
};
describe('bounded passive entry timeline has no navigation or capacity authority', () => {
  it('keeps Node and CDP axes separate and ends CPU at last request callback, not game shutdown', async () => {
    const owner = fixture(),
      port = requirePort(owner.register(0));
    complete(port);
    const before = owner.snapshot(false);
    expect(before).toMatchObject({
      collection: 'OBSERVED',
      resourcesClosed: false,
      navigationAck: 'UNOBSERVED',
      browserAndServerShortWindowCpu: 'UNAVAILABLE',
      cpu: { boundary: 'LAST_DOCUMENT_CALLBACK', ownUserCpuMs: 0.1 },
    });
    expect(
      before.actors[0]?.events.find((e) => e.kind === 'DOCUMENT_REQUEST'),
    ).toMatchObject({ atCdpMs: 9000 });
    port.arm();
    port.note('FRAME_COMMITTED');
    port.interrupt();
    expect(owner.snapshot(false)).toEqual(before);
    const write = vi.fn(() => Promise.resolve());
    await owner.finish({ write }, true);
    await owner.finish({ write }, false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]).toEqual([
      'cold-entry-diagnostics',
      expect.objectContaining({
        sealed: true,
        resourcesClosed: true,
        cpu: before.cpu,
      }),
    ]);
  });
  it('missing lifecycle data remains partial and later unrelated navigation cannot fill it', () => {
    const owner = fixture(),
      p = requirePort(owner.register(0));
    complete(p, false);
    expect(owner.snapshot(false).collection).toBe('PARTIAL');
    const before = owner.snapshot(false);
    p.note('FRAME_COMMITTED');
    p.note('LOAD');
    expect(owner.snapshot(false)).toEqual(before);
    expect(before.actors[0]?.lifecycle).toMatchObject({
      FRAME_COMMITTED: 'UNOBSERVED',
    });
  });
  it('bounds every actor and packet, rejecting invalid indices, duplicates and event overflow', () => {
    const owner = fixture(60);
    for (let i = 0; i < 60; i++) complete(requirePort(owner.register(i)));
    const packet = owner.snapshot(true);
    expect(packet.actors).toHaveLength(60);
    expect(packet.actors.every((r) => r.events.length <= 12)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(
      128 * 1024,
    );
    expect(owner.register(60)).toBeUndefined();
    expect(owner.register(0)).toBeUndefined();
    const other = fixture(),
      p = requirePort(other.register(0));
    p.arm();
    for (let i = 0; i < 20; i++) p.note('FRAME_COMMITTED');
    expect(other.snapshot(false)).toMatchObject({
      collection: 'PARTIAL',
      overflow: true,
    });
    expect(other.snapshot(false).actors[0]?.events).toHaveLength(12);
  });
  it('cancel before completion closes only the entry CPU window and never pretends resources closed', async () => {
    const owner = fixture(),
      p = requirePort(owner.register(0));
    p.arm();
    p.note('GOTO_ENTER');
    p.interrupt();
    const write = vi.fn(() => Promise.reject(Error('PRIVATE_WRITER')));
    await expect(owner.finish({ write }, false)).resolves.toBeUndefined();
    expect(owner.snapshot(false)).toMatchObject({
      collection: 'PARTIAL',
      resourcesClosed: false,
      cpu: { boundary: 'ENTRY_INTERRUPTED' },
    });
    expect(JSON.stringify(owner.snapshot(false))).not.toContain(
      'PRIVATE_WRITER',
    );
  });
  it('never stores unknown strings, inherited values, accessor payloads or non-finite clocks', () => {
    const owner = fixture(),
      p = requirePort(owner.register(0));
    p.arm();
    const getter = vi.fn(() => 42);
    p.note(
      'DOCUMENT_REQUEST',
      Object.defineProperty({}, 'cdpAtMs', { get: getter }),
    );
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(owner.snapshot(false))).not.toContain('getter');
    p.note('DOCUMENT_REQUEST', { cdpAtMs: Infinity });
    p.note('DOCUMENT_RESPONSE', { status: 999 });
    expect(owner.snapshot(false).collection).toBe('PARTIAL');
    const unused = fixture();
    unused.register(0);
    expect(unused.snapshot(false).collection).toBe('UNOBSERVED');
  });
});
