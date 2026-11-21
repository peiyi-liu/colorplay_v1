import { describe, it, expect, vi } from 'vitest';
import { createCapacityMailbox } from '../../scripts/concurrency/capacity-mailbox';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const setup = async (size: 40 | 60 = 60) => {
  const h = await capacityFixture(),
    scope = parseCapacityScope(h.input, h.proof),
    prefix = scope.planId + '.r60.',
    recipients = Array.from(
      { length: size },
      (_, i) => prefix + String(i) + '@colorplay.test',
    );
  return { scope, prefix, recipients };
};
describe('one cohort Mailpit coordinator matched v1.30.2 pagination and exact recipient', () => {
  it('collects all60 with bounded pages despite API default50 and keeps every secret private', async () => {
    const h = await setup();
    let sent = false;
    const calls: URL[] = [];
    const transport = vi.fn((input: URL | string) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname === '/api/v1/search') {
        const start = Number(url.searchParams.get('start'));
        return Promise.resolve(
          Response.json({
            messages_count: sent ? 60 : 0,
            start,
            messages: sent
              ? Array.from({ length: Math.min(50, 60 - start) }, (_, i) => ({
                  ID: 'PRIVATE_MAIL_' + String(start + i),
                }))
              : [],
          }),
        );
      }
      const index = Number(url.pathname.split('_').at(-1));
      return Promise.resolve(
        Response.json({
          To: [{ Address: h.recipients[index] }],
          Text: 'code 123456',
        }),
      );
    });
    const mailbox = createCapacityMailbox(
      h.scope,
      { prefix: h.prefix, recipients: h.recipients },
      new AbortController().signal,
      { transport },
    );
    await mailbox.baseline();
    sent = true;
    const codes = await mailbox.wait();
    expect(codes.size).toBe(60);
    expect(
      calls
        .filter((url) => url.pathname === '/api/v1/search')
        .map((url) => url.searchParams.get('start')),
    ).toContain('50');
    expect(calls.every((url) => url.origin === h.scope.mailpitUrl)).toBe(true);
    expect(JSON.stringify(mailbox.snapshot())).not.toMatch(
      /PRIVATE_MAIL|123456|colorplay.test/,
    );
    await mailbox.dispose();
  });
  it.each(['foreign_to', 'duplicate', 'old_only', 'two_codes'] as const)(
    'rejects %s rather than treating found code as completed registration',
    async (failure) => {
      const h = await setup();
      let sent = false;
      let tick = 0;
      const transport = vi.fn((input: URL | string) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/v1/search')
          return Promise.resolve(
            Response.json({
              messages_count: failure === 'duplicate' && sent ? 2 : 1,
              start: 0,
              messages:
                failure === 'duplicate' && sent
                  ? [{ ID: 'NEW_0' }, { ID: 'NEW_1' }]
                  : [
                      {
                        ID:
                          failure === 'old_only'
                            ? 'OLD_ID'
                            : sent
                              ? 'NEW_ID'
                              : 'OLD_ID',
                      },
                    ],
            }),
          );
        return Promise.resolve(
          Response.json({
            To: [
              {
                Address:
                  failure === 'foreign_to'
                    ? 'foreign@colorplay.test'
                    : h.recipients[0],
              },
            ],
            Text: failure === 'two_codes' ? '123456 and 654321' : '123456',
          }),
        );
      });
      const mailbox = createCapacityMailbox(
        h.scope,
        { prefix: h.prefix, recipients: h.recipients },
        new AbortController().signal,
        {
          transport,
          now: () => tick,
          sleep: () => {
            tick += 1000;
            return Promise.resolve();
          },
        },
      );
      await mailbox.baseline();
      sent = true;
      await expect(mailbox.wait()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
      await mailbox.dispose();
    },
  );
  it('restarts only read-only pagination when planned mail normally grows30→40 between pages', async () => {
    const h = await setup(40);
    let lists = 0,
      tick = 0;
    const sleep = vi.fn(() => {
      tick += 1000;
      return Promise.resolve();
    });
    const transport = vi.fn((input: URL) => {
      const url = new URL(input);
      if (url.pathname === '/api/v1/search') {
        lists++;
        const start = Number(url.searchParams.get('start'));
        if (lists === 1)
          return Promise.resolve(
            Response.json({ messages_count: 0, start: 0, messages: [] }),
          );
        const total = lists === 2 ? 30 : 40;
        return Promise.resolve(
          Response.json({
            messages_count: total,
            start,
            messages: Array.from({ length: 20 }, (_, i) => ({
              ID: 'PRIVATE_' + String(start + i),
            })),
          }),
        );
      }
      const index = Number(url.pathname.split('_').at(-1));
      return Promise.resolve(
        Response.json({
          To: [{ Address: h.recipients[index] }],
          Text: '123456',
        }),
      );
    });
    const mailbox = createCapacityMailbox(
      h.scope,
      { prefix: h.prefix, recipients: h.recipients },
      new AbortController().signal,
      { transport, now: () => tick, sleep },
    );
    await mailbox.baseline();
    const codes = await mailbox.wait();
    expect(codes.size).toBe(40);
    expect(lists).toBe(5);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000, expect.any(AbortSignal));
    await mailbox.dispose();
  });

  it.each(['deletion', 'duplicate_ids'] as const)(
    'still rejects %s during read-only pagination',
    async (bad) => {
      const h = await setup(40);
      let lists = 0;
      const transport = vi.fn((input: URL) => {
        const url = new URL(input),
          start = Number(url.searchParams.get('start'));
        lists++;
        if (lists === 1)
          return Promise.resolve(
            Response.json({ messages_count: 0, start: 0, messages: [] }),
          );
        return Promise.resolve(
          Response.json({
            messages_count: bad === 'deletion' && start > 0 ? 30 : 40,
            start,
            messages: Array.from({ length: 20 }, (_, i) => ({
              ID:
                'PRIVATE_' + String((bad === 'duplicate_ids' ? 0 : start) + i),
            })),
          }),
        );
      });
      const mailbox = createCapacityMailbox(
        h.scope,
        { prefix: h.prefix, recipients: h.recipients },
        new AbortController().signal,
        { transport },
      );
      await mailbox.baseline();
      await expect(mailbox.wait()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
      expect(lists).toBe(3);
      await mailbox.dispose();
    },
  );
  it('honors parent abort during read-only growth retry without new poll or detail reads', async () => {
    const h = await setup(40);
    let lists = 0;
    const controller = new AbortController(),
      transport = vi.fn((input: URL) => {
        const url = new URL(input),
          start = Number(url.searchParams.get('start'));
        lists++;
        return Promise.resolve(
          Response.json(
            lists === 1
              ? { messages_count: 0, start: 0, messages: [] }
              : {
                  messages_count: start === 0 ? 30 : 40,
                  start,
                  messages: Array.from({ length: 20 }, (_, i) => ({
                    ID: 'PRIVATE_' + String(start + i),
                  })),
                },
          ),
        );
      });
    const mailbox = createCapacityMailbox(
      h.scope,
      { prefix: h.prefix, recipients: h.recipients },
      controller.signal,
      {
        transport,
        sleep: () => {
          controller.abort();
          return Promise.resolve();
        },
      },
    );
    await mailbox.baseline();
    await expect(mailbox.wait()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(lists).toBe(3);
    await mailbox.dispose();
  });
});
